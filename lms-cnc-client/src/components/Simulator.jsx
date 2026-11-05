// =============================================================
// Simulator.jsx - simulator utama: editor G-Code, skor, AI Tutor,
// dan alur sinematik: panel 2D saat mengedit -> mesin 3D layar penuh
// saat siklus dijalankan.  Tanpa tombol switch 3D/2D, otomatis.
// Props: modul (latihan pustaka), submitTo (id tugas, kirim ke guru),
// idModul (id modul asli untuk API; jangan diisi id sintetis).
// =============================================================
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { api, autoScore, compareTarget, highlightGcode, parseGCode, simulate } from '../api';
import ControlPanel2D from './ControlPanel2D';
import Simulator2D from './Simulator2D';
import Icon from '../ui/Icon.jsx';
import { Alert, Button, Field, Input, Modal, toast } from '../ui/primitives.jsx';

// Three.js dimuat terpisah: pengguna mode 2D tidak mengunduh chunk 3D.
const Simulator3D = lazy(() => import('./Simulator3D'));

function makeStarter(stockD = 30, stockL = 60) {
  const d = Math.round(stockD);
  const l = Math.round(stockL);
  const cutD = Math.max(10, Math.round(d * 0.6));
  const cutZ = Math.max(15, Math.round(l * 0.7));
  return `G90\nG00 X${d} Z0\nG01 X${cutD} Z-${cutZ} F100\nG00 X${d + 10}\nG00 Z5`;
}

const STARTER = makeStarter(30, 60);

class ViewportBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function jam(waktu) {
  if (!waktu) return null;
  const d = new Date(String(waktu).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(waktu)
    : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Simulator({
  modul, submitTo, bolehSimpan = true, idModul = null, programId = null, programNama = '',
  onSaved, onSubmit, onRekomendasi, initialStockD, initialStockL, onStockChange,
}) {
  const target = modul?.target || {
    stock_d: initialStockD || 32,
    stock_l: initialStockL || 60,
    target_d: 20,
    target_z: 40,
  };
  const [customStockD, setCustomStockD] = useState(target.stock_d);
  const [customStockL, setCustomStockL] = useState(target.stock_l);

  useEffect(() => {
    if (modul?.target?.stock_d) setCustomStockD(+modul.target.stock_d);
    else if (initialStockD) setCustomStockD(+initialStockD);
    if (modul?.target?.stock_l) setCustomStockL(+modul.target.stock_l);
    else if (initialStockL) setCustomStockL(+initialStockL);
  }, [modul, initialStockD, initialStockL]);

  const stockD = +customStockD;
  const stockL = +customStockL;

  const [gcode, setGcode] = useState(modul?.starter_gcode || makeStarter(target.stock_d, target.stock_l));
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [kirim, setKirim] = useState(null);
  const [simpanForm, setSimpanForm] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [busy, setBusy] = useState('');

  const [fallback, setFallback] = useState(false);
  const [fallbackNote, setFallbackNote] = useState('');
  const [showToolpath, setShowToolpath] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const [targetVisible, setTargetVisible] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [shot, setShot] = useState('panel');
  const [doorClosed, setDoorClosed] = useState(false);
  const [theater, setTheater] = useState(false);

  const playheadRef = useRef(0);
  const speedRef = useRef(1);
  const doorTimerRef = useRef(0);
  speedRef.current = speed;

  // apakah sedang dalam mode 3D fullscreen (mesin tampil layar penuh)
  const isRunView = shot === 'machine' && !fallback;

  useEffect(() => () => {
    clearTimeout(doorTimerRef.current);
    clearTimeout(panelDelayRef.current);
  }, []);

  // ganti modul → isi starter_gcode otomatis, reset
  useEffect(() => {
    setGcode(modul?.starter_gcode || makeStarter(target.stock_d, target.stock_l));
    setPlaying(false);
    playheadRef.current = 0;
    setStep(0);
    setResult(null);
    setSaved(null);
    setKirim(null);
    setTutor(null);
    setFallbackNote('');
    setShot('panel');
    setTheater(false);
    setDoorClosed(false);
    setPanelReady(true);
    clearTimeout(doorTimerRef.current);
    clearTimeout(panelDelayRef.current);
  }, [modul?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sim = useMemo(() => {
    try {
      const r = simulate(parseGCode(gcode), stockD, stockL);
      const cmp = compareTarget(r.profile, +target.target_d, +target.target_z);
      const { skor, ada_error } = autoScore(r.events, cmp);
      return { ...r, cmp, skor, ada_error, match: !ada_error && cmp.match };
    } catch {
      return null;
    }
  }, [gcode, stockD, stockL, target.target_d, target.target_z]);

  const moves = sim?.moves || [];
  const errIdx = sim?.events.find((e) => e.type === 'err' && e.moveIndex !== undefined)?.moveIndex ?? -1;
  const stopAt = errIdx >= 0 ? Math.min(moves.length, errIdx + 1) : moves.length;
  const crashed = errIdx >= 0 && step >= errIdx + 1;

  const target3d = useMemo(
    () => ({ d: +target.target_d, z: +target.target_z }),
    [target.target_d, target.target_z]
  );

  const paused = !playing && !crashed && !!result && step < stopAt && doorClosed;
  const stopped = !playing && !crashed && !!result && step < stopAt && !doorClosed;
  const status = crashed ? 'ALARM' : playing ? 'AUTO' : paused ? 'PAUSE' : stopped ? 'STOP' : result ? 'SELESAI' : 'EDIT';

  // loop playback memakai playhead pecahan → gerak pahat halus di 2D & 3D
  useEffect(() => {
    if (!playing || !sim || stopAt === 0) return;
    let last = performance.now();
    let raf = 0;

    function finish() {
      playheadRef.current = stopAt;
      setStep(stopAt);
      setPlaying(false);
      setResult({ events: sim.events, cmp: sim.cmp, skor: sim.skor, match: sim.match });
      clearTimeout(doorTimerRef.current);
      if (errIdx < 0) {
        doorTimerRef.current = setTimeout(() => setDoorClosed(false), 900);
      }
    }

    const loop = (now) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      let ph = Math.max(0, playheadRef.current);
      if (ph >= stopAt - 1e-9) { finish(); return; }

      const i = Math.min(Math.floor(ph), moves.length - 1);
      const m = moves[i];
      const len = Math.hypot(m.x2 - m.x1, m.z2 - m.z1);
      // Durasi per gerakan (detik): diperlambat agar gerakan pemakanan pahat,
      // percikan geram, dan semprotan coolant terlihat jelas & realistis
      const baseSpeed = m.rapid ? 30 : 12; // mm/detik
      const dur = Math.max(m.rapid ? 0.6 : 1.4, Math.min(m.rapid ? 2.0 : 4.8, len / baseSpeed));

      ph = Math.min(stopAt, ph + (dt / dur) * speedRef.current);
      playheadRef.current = ph;
      const idx = Math.min(Math.floor(ph), moves.length);
      setStep((s) => (s === idx ? s : idx));

      if (ph >= stopAt - 1e-9) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, sim, stopAt, moves, errIdx]);

  const stop = () => {
    setPlaying(false);
    setDoorClosed(false);
  };

  const play = () => {
    if (!sim || stopAt === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (playheadRef.current >= stopAt - 1e-6) {
      playheadRef.current = 0;
      setStep(0);
    }
    clearTimeout(doorTimerRef.current);
    clearTimeout(panelDelayRef.current);
    setSaved(null);
    if (!fallback) {
      setTheater(true);
      setShot('machine');
      setDoorClosed(true);
    }
    setResult({ events: sim.events, cmp: sim.cmp, skor: sim.skor, match: sim.match });
    setPlaying(true);
  };

  // full = tampilkan mesin 3D layar penuh (untuk "Jalankan penuh")
  const seek = (n, full = false) => {
    if (!sim) return;
    setPlaying(false);
    setDoorClosed(false);
    if (full && !fallback) {
      setTheater(true);
      setShot('machine');
    } else {
      setTheater(false);
      setShot('panel');
      setPanelReady(true);
      clearTimeout(panelDelayRef.current);
    }
    const ph = Math.max(0, Math.min(stopAt, n));
    playheadRef.current = ph;
    setStep(Math.floor(ph));
    setResult(ph >= stopAt - 1e-9 && stopAt > 0
      ? { events: sim.events, cmp: sim.cmp, skor: sim.skor, match: sim.match }
      : null);
  };

  const stepBy = (dir) => {
    const base = dir > 0
      ? Math.floor(playheadRef.current) + 1
      : Math.ceil(playheadRef.current) - 1;
    seek(base);
  };

  // kembali ke mode edit: kamera zoom-in ke panel kontrol, lalu overlay panel 2D muncul mulus
  const panelDelayRef = useRef(0);
  const [panelReady, setPanelReady] = useState(true);

  const returnToEdit = () => {
    setPlaying(false);
    setDoorClosed(false);
    clearTimeout(doorTimerRef.current);
    clearTimeout(panelDelayRef.current);

    // Tahap 1: Gerakkan kamera 3D zoom in ke arah kontrol panel fisik
    // Tetap di theater view selama 900ms agar animasi kamera zoom-in terlihat jelas
    setPanelReady(false);
    setShot('panel');

    // Tahap 2: Tepat saat kamera tiba di panel, kembalikan ke layout editor
    panelDelayRef.current = setTimeout(() => {
      setTheater(false);
      setPanelReady(true);
    }, 900);
  };

  const reset = () => {
    setPlaying(false);
    playheadRef.current = 0;
    setStep(0);
    setResult(null);
    setShot('panel');
    setTheater(false);
    setDoorClosed(false);
    setPanelReady(true);
    clearTimeout(doorTimerRef.current);
    clearTimeout(panelDelayRef.current);
  };

  const changeGcode = (v) => {
    setGcode(v);
    setPlaying(false);
    playheadRef.current = 0;
    setStep(0);
    setResult(null);
    setSaved(null);
    setKirim(null);
    setTutor(null);
    setShot('panel');
    setDoorClosed(false);
    setPanelReady(true);
    clearTimeout(doorTimerRef.current);
    clearTimeout(panelDelayRef.current);
  };

  const on3DFail = (e) => {
    console.warn('3D tidak tersedia:', e?.message || e);
    setFallback(true);
    setShot('panel');
    setFallbackNote('Visualisasi 3D tidak dapat dimuat di perangkat ini, tampilan 2D dipakai otomatis.');
  };

  // kunci scroll + tombol Esc saat mesin tampil layar penuh
  useEffect(() => {
    if (!isRunView) return undefined;
    document.body.classList.add('sim-theater');
    const onKey = (e) => {
      if (e.key === 'Escape') returnToEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sim-theater');
      window.removeEventListener('keydown', onKey);
    };
  }, [isRunView]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAttempt = async () => {
    if (!idModul) return toast('Pilih modul latihan dulu.', 'warn');
    setBusy('save');
    try {
      const r = await api('/api/attempts', { method: 'POST', body: JSON.stringify({ modul_id: idModul, gcode }) });
      setSaved(r);
      onSaved?.();
      toast('Percobaan tersimpan di portofolio.');
    } catch (e) { toast(e.message, 'danger'); }
    setBusy('');
  };

  const kirimTugas = async () => {
    if (!sim) return toast('Program G-Code tidak valid.', 'danger');
    setBusy('kirim');
    try {
      const r = await api(`/api/tugas/${submitTo}/submit`, { method: 'POST', body: JSON.stringify({ gcode }) });
      setKirim(r);
      setResult({ events: r.events, cmp: r.compare, skor: r.skor, match: r.match });
      onSubmit?.(r);
      toast(`Terkumpul. Skor simulator ${r.skor}/100.`);
    } catch (e) { toast(e.message, 'danger'); }
    setBusy('');
  };

  const bukaSimpanProgram = () => {
    setSimpanForm({ nama: programNama || (modul?.judul ? String(modul.judul).slice(0, 60) : ''), err: '' });
  };

  const simpanProgram = async () => {
    const nama = (simpanForm?.nama || '').trim();
    if (!nama) { setSimpanForm({ ...simpanForm, nama, err: 'Nama program wajib diisi.' }); return; }
    setBusy('prog');
    try {
      await api(programId ? '/api/programs/' + programId : '/api/programs', {
        method: programId ? 'PUT' : 'POST',
        body: JSON.stringify({
          nama,
          gcode,
          stock_diameter: stockD,
          stock_panjang: stockL,
          target_diameter: +target.target_d,
          target_panjang: +target.target_z,
        }),
      });
      setSimpanForm(null);
      toast(programId ? 'Program di lemari Anda diperbarui.' : 'Program tersimpan di lemari Anda.');
    } catch (e) {
      setSimpanForm({ nama, err: e.message });
    }
    setBusy('');
  };

  const askTutor = async () => {
    setBusy('tutor');
    try {
      const r = await api('/api/ai-tutor', {
        method: 'POST',
        body: JSON.stringify({
          gcode,
          tugas_id: submitTo || null,
          modul_id: submitTo ? null : (idModul || null),
        }),
      });
      setTutor(r);
    } catch (e) {
      setTutor({ source: 'error', feedback: [e.message] });
    }
    setBusy('');
  };

  const evs = kirim?.events || saved?.events || result?.events || [];
  const hl = useMemo(() => highlightGcode(gcode), [gcode]);
  const shownScore = kirim?.skor ?? saved?.skor ?? result?.skor;
  const shownMatch = kirim?.match ?? saved?.match ?? result?.match;
  const shownDetail = (kirim?.compare ?? saved?.compare ?? result?.cmp)?.detail;

  const runTitle = status === 'AUTO' ? 'SIKLUS BERJALAN'
    : status === 'PAUSE' ? 'SIKLUS DIJEDA'
      : status === 'STOP' ? 'SIKLUS DIHENTIKAN'
        : status === 'ALARM' ? 'ALARM, SIKLUS DIHENTIKAN'
          : status === 'SELESAI' ? 'SIKLUS SELESAI' : 'PRATINJAU MESIN';
  const runSub = status === 'AUTO' ? 'Pintu kaca tertutup • coolant menyemprot'
    : status === 'PAUSE' ? 'Siklus dijeda • pintu tetap tertutup'
      : status === 'STOP' ? 'Pintu kaca dibuka • tekan Lanjutkan untuk melanjutkan'
        : status === 'ALARM' ? 'Tabrakan terdeteksi • periksa program G-Code'
          : status === 'SELESAI' ? 'Pintu kaca terbuka • benda kerja selesai'
            : 'Mesin CNC tampil layar penuh';
  const progressPct = Math.min(100, (step / Math.max(1, moves.length)) * 100);

  return (
    <div className={`card simulator-card${theater ? ' simulator-card--running' : ''}`}>
      {/* Judul & deskripsi hanya saat bukan layar penuh / theater */}
      {!theater && (
        <>
          <h3>
            Simulator Bubut CNC{' '}
            <span className="sim-of">
              {modul ? `${modul.title || modul.judul}${modul.level ? ` (Lv.${modul.level})` : ''}` : 'mode bebas'}
            </span>
          </h3>
          {modul && (
            <p className="dim">
              {modul.description || modul.deskripsi} Target: Ø{target.target_d} / Z-{target.target_z}mm
              dari stock Ø{target.stock_d} L{target.stock_l} mm.
            </p>
          )}
        </>
      )}

      <div className={`sim-grid${theater ? ' sim-grid--run' : ''}`}>
        {/* ---------------- editor & kontrol (tetap stabil di kiri) ---------------- */}
        {!theater && (
          <div>
            <label>Editor G-Code (G00/G01/G02/G03/G90/G91)</label>
            <div className="editor">
              <pre className="hl" dangerouslySetInnerHTML={{ __html: hl + '\n' }} />
              <textarea
                value={gcode}
                spellCheck={false}
                onChange={(e) => changeGcode(e.target.value)}
                onScroll={(e) => { e.target.previousSibling.scrollTop = e.target.scrollTop; }}
                rows={13}
              />
            </div>

            <div className="row wrap">
              <Button icon={playing ? 'pause' : 'play'} onClick={play}>{playing ? 'Jeda' : 'Animasi'}</Button>
              <Button variant="sec" icon="stop" onClick={stop} disabled={!playing && !paused && status !== 'ALARM'}>Stop</Button>
              <Button variant="sec" icon="maximize" onClick={() => seek(stopAt, true)} disabled={!stopAt}>Jalankan penuh</Button>
              <Button variant="sec" icon="restart" onClick={reset}>Reset</Button>
            </div>

            <div className="row wrap">
              <Button variant="sec" size="sm" icon="step-back" onClick={() => stepBy(-1)} disabled={step === 0}>Mundur</Button>
              <span className="dim step-info">Langkah {step}/{moves.length}</span>
              <Button variant="sec" size="sm" iconRight="step-forward" onClick={() => stepBy(1)} disabled={step >= stopAt}>Maju</Button>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                style={{ width: 'auto', margin: 0 }}
                title="Kecepatan animasi"
              >
                <option value={0.5}>0,5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </div>

            <div className="log">
              {evs.map((e, i) => <div key={i} className={e.type}>{e.msg}</div>)}
            </div>

            {(result || saved || kirim) && (
              <div className={`score ${shownMatch ? 'match' : 'nomatch'}`}>
                Skor {shownScore}/100 {shownMatch ? 'sesuai target' : 'belum sesuai target'}
                <div className="dim">{shownDetail}</div>
              </div>
            )}
          </div>
        )}

        {/* ---------------- panel kontrol / mesin 3D ---------------- */}
        <div>
          {/* Header */}
          {!theater && (
            <div className="view-head">
              <div>
                <b>Panel Kontrol & Mesin 3D</b>{' '}
                <span className="dim">
                  {fallback
                    ? 'Tampilan 2D otomatis, visualisasi 3D tidak tersedia di perangkat ini.'
                    : shot === 'machine'
                      ? 'Kamera mengamati siklus mesin 3D. Klik "Kembali ke mode edit" untuk mengedit G-Code.'
                      : 'Mode edit: panel kontrol aktif. Tekan "Animasi" untuk melihat pahat dan coolant memotong material.'}
                </span>
              </div>
            </div>
          )}

          {fallback ? (
            <>
              <Simulator2D
                sim={sim}
                stockD={stockD}
                stockL={stockL}
                playheadRef={playheadRef}
                crashed={crashed}
              />
              <div className="viewport-tools">
                <span className="dim">Tampilan 2D: potongan melintang, X = diameter.</span>
              </div>
            </>
          ) : (
            <>
              <div className={`view-stage${theater ? ' view-stage--full' : ''}`}>
                <ViewportBoundary onError={on3DFail}>
                  <Suspense
                    fallback={(
                      <div className="vp3d-loading" style={{ height: 520 }}>
                        Menyiapkan mesin 3D…
                      </div>
                    )}
                  >
                    <Simulator3D
                      key={`${stockD}-${stockL}`}
                      sim={sim}
                      stockD={stockD}
                      stockL={stockL}
                      playheadRef={playheadRef}
                      crashed={crashed}
                      target={target3d}
                      showToolpath={showToolpath}
                      transparent={transparent}
                      targetVisible={targetVisible}
                      height={520}
                      shot={shot}
                      doorClosed={doorClosed}
                      status={status}
                      onError={on3DFail}
                    />
                  </Suspense>
                </ViewportBoundary>

                <ControlPanel2D
                  sim={sim}
                  stockD={stockD}
                  stockL={stockL}
                  target={target3d}
                  playheadRef={playheadRef}
                  visible={shot === 'panel' && panelReady}
                  status={status}
                  crashed={crashed}
                />

                {shot === 'machine' && !fallback && (
                  <div className="run-hud">
                    <div className="run-progress"><i style={{ width: `${progressPct}%` }} /></div>

                    <div className="run-top">
                      <div className={`run-status run-status--${status.toLowerCase()}`}>
                        <i />
                        <div>
                          <b>{runTitle}</b>
                          <span>{runSub}</span>
                        </div>
                      </div>

                      <div className="u-row" style={{ gap: 8 }}>
                        {result && (status === 'SELESAI' || status === 'ALARM') && (
                          <div className={`run-score ${shownMatch ? 'match' : 'nomatch'}`}>
                            <b>{shownScore}<em>/100</em></b>
                            <span>{shownMatch ? 'sesuai target' : 'belum sesuai target'}</span>
                          </div>
                        )}
                        <button
                          className="run-btn run-btn--primary"
                          onClick={returnToEdit}
                          title="Kembali ke mode edit panel"
                        >
                          <Icon name="edit" size={14} />
                          <span>Kembali ke Mode Edit</span>
                        </button>
                      </div>
                    </div>

                    <div className="run-controls">
                      <span className="run-step">Langkah {step}/{moves.length}</span>
                      <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="run-btn"
                        style={{ padding: '5px 8px', width: 'auto' }}
                        title="Kecepatan animasi"
                      >
                        <option value={0.5}>0,5×</option>
                        <option value={1}>1×</option>
                        <option value={2}>2×</option>
                        <option value={4}>4×</option>
                      </select>
                      <button className="run-btn run-btn--primary" onClick={play}>
                        <Icon name={status === 'AUTO' ? 'pause' : status === 'ALARM' ? 'restart' : 'play'} size={14} />
                        <span>{status === 'AUTO' ? 'Jeda'
                          : status === 'PAUSE' || status === 'STOP' ? 'Lanjutkan'
                            : status === 'ALARM' ? 'Ulangi'
                              : status === 'SELESAI' ? 'Putar ulang' : 'Jalankan'}</span>
                      </button>
                      {(playing || paused) && (
                        <button className="run-btn" onClick={stop}><Icon name="stop" size={14} /><span>Stop</span></button>
                      )}
                      <button className="run-btn" onClick={returnToEdit}><Icon name="edit" size={14} /><span>Kembali edit</span></button>
                    </div>
                  </div>
                )}
              </div>

              {!theater && (
                <div className="viewport-tools">
                  <label><input type="checkbox" checked={showToolpath} onChange={(e) => setShowToolpath(e.target.checked)} /> Toolpath</label>
                  <label><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Benda transparan</label>
                  <label><input type="checkbox" checked={targetVisible} onChange={(e) => setTargetVisible(e.target.checked)} /> Target Ø{target.target_d}</label>
                  {shot === 'machine' && (
                    <button
                      className="run-btn run-btn--primary"
                      onClick={returnToEdit}
                      style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
                    >
                      <Icon name="edit" size={13} />
                      <span>Kembali ke Panel</span>
                    </button>
                  )}
                  {!submitTo && !modul?.id && (
                    <div className="u-row" style={{ gap: 6, marginLeft: 'auto' }}>
                      <span className="dim">Ukuran stock:</span>
                      <select
                        className="run-btn"
                        style={{ padding: '3px 8px', fontSize: 12, height: 28, background: 'rgba(255,255,255,.08)' }}
                        value={stockD}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCustomStockD(v);
                          onStockChange?.(v, stockL);
                        }}
                        title="Pilih diameter benda kerja"
                      >
                        <option value={20}>Ø 20 mm</option>
                        <option value={25}>Ø 25 mm</option>
                        <option value={30}>Ø 30 mm</option>
                        <option value={32}>Ø 32 mm</option>
                        <option value={40}>Ø 40 mm</option>
                        <option value={50}>Ø 50 mm</option>
                      </select>
                      <select
                        className="run-btn"
                        style={{ padding: '3px 8px', fontSize: 12, height: 28, background: 'rgba(255,255,255,.08)' }}
                        value={stockL}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCustomStockL(v);
                          onStockChange?.(stockD, v);
                        }}
                        title="Pilih panjang benda kerja"
                      >
                        <option value={40}>P 40 mm</option>
                        <option value={50}>P 50 mm</option>
                        <option value={60}>P 60 mm</option>
                        <option value={80}>P 80 mm</option>
                        <option value={100}>P 100 mm</option>
                      </select>
                    </div>
                  )}
                  <span className="dim" style={{ marginLeft: submitTo || modul?.id ? 'auto' : 8 }}>Drag = putar • scroll = zoom</span>
                </div>
              )}
            </>
          )}

          {fallbackNote && <p className="fallback-note">{fallbackNote}</p>}

          {!isRunView && (
            <div className="row wrap" style={{ marginTop: 8 }}>
              {submitTo ? (
                <Button icon="send" loading={busy === 'kirim'} onClick={kirimTugas} disabled={!sim}>
                  {kirim ? 'Kirim ulang ke guru' : 'Kirim ke guru'}
                </Button>
              ) : (
                <>
                  <Button variant="sec" icon="save" onClick={bukaSimpanProgram}>
                    {programId ? 'Perbarui program' : 'Simpan ke program saya'}
                  </Button>
                  {idModul && bolehSimpan && (
                    <Button variant="sec" icon="layers" loading={busy === 'save'} onClick={saveAttempt}>
                      Simpan sebagai percobaan
                    </Button>
                  )}
                </>
              )}
              <Button variant="sec" icon="robot" loading={busy === 'tutor'} onClick={askTutor}>
                Tanya CNC-Bot
              </Button>
            </div>
          )}

          {!isRunView && kirim && (
            <div className={`score ${kirim.match ? 'match' : 'nomatch'}`}>
              Dikirim {jam(kirim.pengumpulan?.waktu_submit) || 'baru saja'} • skor simulator {kirim.skor}/100
              {' '}{kirim.match ? 'sesuai target' : 'belum sesuai target'}
              {kirim.ada_error ? ' • program memicu tabrakan' : ''}
              <div className="dim">{kirim.compare?.detail}</div>
              <div className="dim">
                Nilai akhir menunggu penilaian guru ({kirim.pengumpulan?.jumlah_percobaan ?? 1} percobaan terkirim).
              </div>
            </div>
          )}

          {!isRunView && tutor && (
            <div className="tutor">
              <b>CNC-Bot <span className="dim">({tutor.source}) • skor {tutor.skor ?? shownScore}/100</span></b>
              <ul>{tutor.feedback.map((t, i) => <li key={i} style={{ whiteSpace: 'pre-line' }}>{t}</li>)}</ul>
              {tutor.rekomendasi && (
                <button className="sec" onClick={() => onRekomendasi?.(tutor.rekomendasi.modul_id)}>
                  Modul berikutnya: Lv.{tutor.rekomendasi.level} {tutor.rekomendasi.judul}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!simpanForm}
        title={programId ? 'Perbarui program di lemari' : 'Simpan ke lemari program'}
        icon="code"
        width={480}
        onClose={() => setSimpanForm(null)}
        footer={<>
          <Button variant="sec" onClick={() => setSimpanForm(null)}>Batal</Button>
          <Button icon="save" loading={busy === 'prog'} onClick={simpanProgram}>Simpan program</Button>
        </>}
      >
        {simpanForm?.err && <Alert tone="danger" title="Gagal menyimpan">{simpanForm.err}</Alert>}
        <Field label="Nama program" required hint="Nama ini muncul di halaman Program saya.">
          <Input
            value={simpanForm?.nama || ''}
            maxLength={80}
            placeholder="mis. O0001 Tirus luar"
            onChange={(e) => setSimpanForm({ ...simpanForm, nama: e.target.value, err: '' })}
            onKeyDown={(e) => e.key === 'Enter' && simpanProgram()}
          />
        </Field>
        <div className="kv">
          <span>Ukuran stock</span><b className="mono">Ø{stockD} x {stockL} mm</b>
          <span>Target</span><b className="mono">Ø{target.target_d} x Z-{target.target_z} mm</b>
          <span>Baris kode</span><b className="mono">{gcode.split('\n').filter((l) => l.trim()).length} baris</b>
        </div>
        <p className="dim">
          {sim ? `Skor simulasi saat ini ${sim.skor}/100${sim.ada_error ? ', ada tabrakan pada program' : ''}.` : 'Program belum dapat dibaca; periksa sintaks G-Code.'}
        </p>
      </Modal>
    </div>
  );
}
