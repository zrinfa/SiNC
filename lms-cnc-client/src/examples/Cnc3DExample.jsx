// =============================================================
// Cnc3DExample.jsx — halaman contoh simulator bubut CNC 3D.
// Dibuka tanpa login di /?demo=3d. Tujuannya: memperlihatkan mesin,
// pahat, dan benda kerja yang benar-benar terpotong secara 3D.
// Data simulasi tetap memakai engine yang sama dengan simulator 2D.
// =============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoScore, compareTarget, highlightGcode, parseGCode, simulate } from '../api';
import Simulator3D from '../components/Simulator3D';
import Icon from '../ui/Icon.jsx';
import { Button } from '../ui/primitives.jsx';
import { toolAt } from '../three/playback';

const TARGET = Object.freeze({ stock_d: 40, stock_l: 60, target_d: 20, target_z: 40 });
const TARGET_3D = Object.freeze({ d: TARGET.target_d, z: TARGET.target_z });

const EXAMPLES = [
  {
    id: 'dasar',
    name: '1. Facing + bubut lurus',
    code: 'G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50\nG00 Z5',
  },
  {
    id: 'radius',
    name: '2. Bubut radius (G03)',
    code: 'G90\nG00 X40 Z0\nG01 X30 Z-8 F80\nG03 X20 Z-18 R10 F80\nG01 X20 Z-40\nG00 X50\nG00 Z5',
  },
  {
    id: 'passes',
    name: '3. Beberapa pass',
    code: 'G90\nG00 X40 Z2\nG01 X36 Z0 F90\nG01 X36 Z-30\nG01 X30 Z-38\nG01 X20 Z-40\nG00 X50\nG00 Z5',
  },
  {
    id: 'tabrakan',
    name: '4. Demonstrasi tabrakan G00',
    code: 'G90\nG00 X40 Z5\nG00 X10 Z-30',
  },
];

const hudAt = (moves, ph, stockD) => {
  const p = toolAt(moves || [], ph, stockD);
  const step = Math.max(0, Math.min(Math.floor(ph), moves?.length || 0));
  return { x: p.x, z: p.z, step };
};

export default function Cnc3DExample() {
  const [exampleId, setExampleId] = useState(EXAMPLES[0].id);
  const [gcode, setGcode] = useState(EXAMPLES[0].code);
  const [stockD, setStockD] = useState(30);
  const [stockL, setStockL] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hud, setHud] = useState({ x: 30, z: 0, step: 0 });
  const [finished, setFinished] = useState(null);
  const [showToolpath, setShowToolpath] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const [targetVisible, setTargetVisible] = useState(true);

  const target3D = useMemo(() => ({ d: Math.round(stockD / 2), z: Math.round(stockL * 0.6) }), [stockD, stockL]);

  const playheadRef = useRef(0);
  const speedRef = useRef(1);
  speedRef.current = speed;

  const sim = useMemo(() => {
    try {
      const r = simulate(parseGCode(gcode), stockD, stockL);
      const cmp = compareTarget(r.profile, target3D.d, target3D.z);
      const { skor, ada_error } = autoScore(r.events, cmp);
      return { ...r, cmp, skor, ada_error, match: !ada_error && cmp.match };
    } catch {
      return null;
    }
  }, [gcode, stockD, stockL, target3D]);

  const moves = sim?.moves || [];
  const errIdx = sim?.events.find((e) => e.type === 'err' && e.moveIndex !== undefined)?.moveIndex ?? -1;
  const limit = errIdx >= 0 ? Math.min(moves.length, errIdx + 1) : moves.length;
  const crashed = errIdx >= 0 && hud.step >= errIdx + 1;
  const hl = useMemo(() => highlightGcode(gcode), [gcode]);

  // edit program / stock -> kembali ke awal
  useEffect(() => {
    setPlaying(false);
    playheadRef.current = 0;
    setHud(hudAt(sim?.moves, 0, stockD));
    setFinished(null);
  }, [gcode, stockD, stockL]); // eslint-disable-line react-hooks/exhaustive-deps

  // loop playback
  useEffect(() => {
    if (!playing || !sim || limit === 0) return;
    let last = performance.now();
    let lastHud = 0;
    let raf = 0;

    const complete = () => {
      playheadRef.current = limit;
      setHud(hudAt(sim.moves, limit));
      setPlaying(false);
      setFinished({ cmp: sim.cmp, skor: sim.skor, match: sim.match });
    };

    const loop = (now) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      let ph = Math.max(0, playheadRef.current);
      if (ph >= limit - 1e-9) { complete(); return; }

      const i = Math.min(Math.floor(ph), moves.length - 1);
      const m = moves[i];
      const len = Math.hypot(m.x2 - m.x1, m.z2 - m.z1);
      const dur = Math.max(0.09, Math.min(1.1, len / 30)) * (m.rapid ? 0.55 : 1);
      ph = Math.min(limit, ph + (dt / dur) * speedRef.current);
      playheadRef.current = ph;

      if (now - lastHud > 80 || ph >= limit - 1e-9) {
        lastHud = now;
        setHud(hudAt(moves, ph));
      }
      if (ph >= limit - 1e-9) { complete(); return; }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, sim, limit, moves]);

  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (!sim || limit === 0) return;
    if (playheadRef.current >= limit - 1e-6) {
      playheadRef.current = 0;
      setFinished(null);
      setHud(hudAt(moves, 0));
    }
    setPlaying(true);
  };

  const seek = (n) => {
    if (!sim) return;
    setPlaying(false);
    const ph = Math.max(0, Math.min(limit, n));
    playheadRef.current = ph;
    setHud(hudAt(moves, ph));
    setFinished(ph >= limit - 1e-9 && limit > 0
      ? { cmp: sim.cmp, skor: sim.skor, match: sim.match }
      : null);
  };

  const reset = () => {
    setPlaying(false);
    playheadRef.current = 0;
    setHud(hudAt(moves, 0));
    setFinished(null);
  };

  return (
    <div className="demo3d">
      <div className="demo3d-head">
        <div>
          <h1>Simulator Bubut CNC: Visualisasi 3D</h1>
          <div className="sub">Contoh mesin utuh: chuck, pahat, dan benda kerja yang terpotong mengikuti G-Code.</div>
        </div>
        <div className="row" style={{ margin: 0 }}>
          <span className="chip">Demo tanpa login</span>
          <a className="btn-link" href="./"><Icon name="arrow-left" size={14} /> Kembali ke LMS</a>
        </div>
      </div>

      <div className="sim-grid demo">
        {/* ---------------- kiri: program & kontrol ---------------- */}
        <div className="card">
          <h3>Program G-Code</h3>
          <label>Contoh program</label>
          <select
            value={exampleId}
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              setExampleId(e.target.value);
              if (ex) setGcode(ex.code);
            }}
          >
            {EXAMPLES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>

          <div className="editor" style={{ marginTop: 8 }}>
            <pre className="hl" dangerouslySetInnerHTML={{ __html: hl + '\n' }} />
            <textarea
              value={gcode}
              spellCheck={false}
              rows={12}
              onChange={(e) => setGcode(e.target.value)}
              onScroll={(e) => { e.target.previousSibling.scrollTop = e.target.scrollTop; }}
            />
          </div>

          <div className="row wrap">
            <Button icon={playing ? 'pause' : 'play'} onClick={togglePlay}>{playing ? 'Jeda' : 'Putar'}</Button>
            <Button variant="sec" icon="maximize" onClick={() => seek(limit)} disabled={!limit}>Jalankan penuh</Button>
            <Button variant="sec" icon="restart" onClick={reset}>Reset</Button>
          </div>

          <div className="row wrap">
            <Button variant="sec" size="sm" icon="step-back" onClick={() => seek(playheadRef.current - 1)} disabled={hud.step === 0}>Mundur</Button>
            <span className="dim step-info">Langkah {hud.step}/{moves.length}</span>
            <Button variant="sec" size="sm" iconRight="step-forward" onClick={() => seek(playheadRef.current + 1)} disabled={hud.step >= limit}>Maju</Button>
            <select
              style={{ width: 'auto', margin: 0 }}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              title="Kecepatan animasi"
            >
              <option value={0.5}>0,5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>

          <div className="row wrap toggles3d">
            <label><input type="checkbox" checked={showToolpath} onChange={(e) => setShowToolpath(e.target.checked)} /> Toolpath</label>
            <label><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Benda transparan</label>
            <label><input type="checkbox" checked={targetVisible} onChange={(e) => setTargetVisible(e.target.checked)} /> Target Ø{target3D.d}</label>
          </div>

          <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(255,255,255,.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)' }}>
            <b style={{ fontSize: 12, display: 'block', marginBottom: 6, color: 'var(--text-strong)' }}>
              Pengaturan Dimensi Benda Kerja (Stock):
            </b>
            <div className="u-row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                <span>Diameter (Ø):</span>
                <select
                  value={stockD}
                  onChange={(e) => setStockD(Number(e.target.value))}
                  style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(18,25,38,.85)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', fontSize: 12 }}
                >
                  <option value={20}>Ø 20 mm</option>
                  <option value={25}>Ø 25 mm</option>
                  <option value={30}>Ø 30 mm (Proporsional)</option>
                  <option value={32}>Ø 32 mm</option>
                  <option value={40}>Ø 40 mm</option>
                  <option value={50}>Ø 50 mm</option>
                </select>
              </label>

              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                <span>Panjang (L):</span>
                <select
                  value={stockL}
                  onChange={(e) => setStockL(Number(e.target.value))}
                  style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(18,25,38,.85)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', fontSize: 12 }}
                >
                  <option value={40}>40 mm</option>
                  <option value={50}>50 mm</option>
                  <option value={60}>60 mm (Standar)</option>
                  <option value={80}>80 mm</option>
                  <option value={100}>100 mm</option>
                </select>
              </label>
            </div>
          </div>

          <div className="target-box" style={{ marginTop: 8 }}>
            Benda kerja Ø{stockD} x {stockL} mm, target Ø{target3D.d} mm di Z-{target3D.z}.
          </div>

          <div className="log">
            {(sim?.events || []).map((e, i) => <div key={i} className={e.type}>{e.msg}</div>)}
          </div>

          {finished && (
            <div className={`score ${finished.match ? 'match' : 'nomatch'}`}>
              Skor {finished.skor}/100 {finished.match ? 'sesuai target' : 'belum sesuai target'}
              <div className="dim">{finished.cmp?.detail}</div>
            </div>
          )}
        </div>

        {/* ---------------- kanan: viewport 3D ---------------- */}
        <div className="card">
          <Simulator3D
            key={`${stockD}-${stockL}`}
            sim={sim}
            stockD={stockD}
            stockL={stockL}
            playheadRef={playheadRef}
            crashed={crashed}
            target={target3D}
            showToolpath={showToolpath}
            transparent={transparent}
            targetVisible={targetVisible}
            height={580}
            status={crashed ? 'ALARM' : playing ? 'AUTO' : finished ? 'SELESAI' : 'EDIT'}
            doorClosed={playing}
          >
            <div className="hud3d">
              <div><span>X</span><b>{hud.x.toFixed(2)}</b><em>mm</em></div>
              <div><span>Z</span><b>{hud.z.toFixed(2)}</b><em>mm</em></div>
              <div><span>Langkah</span><b>{hud.step}/{moves.length}</b></div>
            </div>

            {crashed && (
              <div className="vp3d-alert"><Icon name="alert" size={14} /> TABRAKAN, simulasi dihentikan</div>
            )}
          </Simulator3D>

          <p className="dim" style={{ marginTop: 8 }}>
            Bentuk benda kerja dihitung dari <code>profile[]</code> engine yang sama dengan mode 2D,
            jadi skor dan hasil latihan tetap konsisten. Warna hijau = feeding, oranye = gerak cepat.
          </p>
        </div>
      </div>
    </div>
  );
}
