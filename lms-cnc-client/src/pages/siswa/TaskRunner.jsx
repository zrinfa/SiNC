// =============================================================
// TaskRunner.jsx - siswa mengerjakan satu tugas: praktik G-Code di
// simulator (kirim ke guru) atau kuis (pilihan ganda, benar/salah,
// isian singkat, praktik per butir). Setelah terkumpul, siswa melihat
// catatan guru dan pembahasan.
// =============================================================
import { useMemo, useState } from 'react';
import {
  api, autoScore, compareTarget, highlightGcode, parseGCode, simulate, urlBerkas,
} from '../../api';
import { Link, navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, Field, Grid, Input, PageHeader, Row, Stat, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, hariMenua, toneNilai, useAsync } from '../../ui/hooks.jsx';
import Simulator from '../../components/Simulator';

export default function TaskRunner({ id }) {
  const data = useAsync(() => api('/api/tugas/' + id), [id]);
  const t = data.data;
  const materi = useAsync(
    () => (t ? api('/api/materi?kelas_id=' + t.kelas_id) : Promise.resolve([])),
    [t?.kelas_id]
  );

  if (data.error) {
    return (
      <>
        <Alert tone="danger" title="Tugas tidak dapat dibuka">{data.error}</Alert>
        <Button variant="sec" icon="arrow-left" onClick={() => navigate('/siswa/tugas')}>Kembali ke daftar tugas</Button>
      </>
    );
  }
  if (!t) return <div className="content-loading"><Icon name="refresh" className="spin" size={20} /> Memuat tugas…</div>;

  const punya = t.punya_saya;
  const terlambat = !!t.tenggat && hariMenua(t.tenggat) === 'terlambat';
  const materiTerkait = (materi.data || []).filter((m) => (t.materi_ids || []).map(String).includes(String(m.id)));
  const nilaiAkhir = punya?.nilai_guru != null
    ? Math.round(punya.nilai_guru * 100 / Math.max(1, +t.poin))
    : null;

  return (
    <>
      <PageHeader
        title={t.judul}
        desc={`${t.kelas_nama} • ${t.jenis === 'praktik' ? 'tugas praktik simulator' : `kuis ${(t.soal || []).length} butir`}`}
        badge={<>
          <Badge tone="accent" icon="target">poin {t.poin}</Badge>
          <Badge tone="muted" icon="check-circle">batas lulus {t.batas_lulus}</Badge>
          {t.tenggat && (
            <Badge tone={terlambat ? 'danger' : 'warn'} icon="clock">
              {formatTanggal(t.tenggat)} • {hariMenua(t.tenggat) || 'mendatang'}
            </Badge>
          )}
          <Badge tone={t.boleh_ulang ? 'muted' : 'warn'} icon="refresh">
            {t.boleh_ulang ? 'boleh kirim ulang' : 'satu kali kirim'}
          </Badge>
        </>}
        actions={<Button variant="sec" icon="arrow-left" onClick={() => navigate('/siswa/tugas')}>Daftar tugas</Button>}
      />

      <div className="stats">
        <Stat icon="send" label="Percobaan terkirim" value={punya?.jumlah_percobaan ?? 0} />
        <Stat icon="cube" label="Skor simulator" value={punya?.skor_simulasi ?? '-'} tone={toneNilai(punya?.skor_simulasi, t.batas_lulus)} />
        <Stat icon="edit" label="Nilai guru" value={punya?.nilai_guru ?? '-'} hint={nilaiAkhir == null ? undefined : `setara ${nilaiAkhir}/100`} />
        <Stat icon="check-circle" label="Status saya" value={punya ? punya.status.replace('_', ' ') : 'belum dikerjakan'} tone={punya?.status === 'dinilai' ? 'ok' : undefined} />
      </div>

      {punya?.status === 'perlu_revisi' && (
        <Alert tone="warn" title="Guru meminta revisi">
          {punya.catatan_guru || 'Perbaiki program Anda lalu kirim kembali.'}
          <div className="dim">Pengiriman ulang tetap dibuka meski tenggat sudah lewat.</div>
        </Alert>
      )}
      {punya?.status === 'terkumpul' && (
        <Alert tone="info" title="Sudah terkumpul, menunggu penilaian guru">
          Skor simulator {punya.skor_simulasi ?? '-'}/100, dikirim {formatTanggal(punya.waktu_submit)}.
          {t.boleh_ulang ? ' Anda masih boleh mengirim perbaikan.' : ' Tugas ini hanya boleh dikirim satu kali.'}
        </Alert>
      )}
      {punya?.status === 'dinilai' && (
        <Alert tone="ok" title={`Dinilai guru ${punya.nilai_guru}/${t.poin}, nilai akhir ${nilaiAkhir}/100`}>
          {punya.catatan_guru || 'Tidak ada catatan tertulis dari guru.'}
        </Alert>
      )}
      {terlambat && !punya && (
        <Alert tone="danger" title="Tenggat sudah lewat">
          Batas pengumpulan adalah {formatTanggal(t.tenggat)}. Hubungi guru bila ingin diperpanjang.
        </Alert>
      )}

      <Grid cols={2} min={400}>
        <Card title="Instruksi guru" icon="assignment">
          {t.instruksi
            ? <p className="instruksi">{t.instruksi}</p>
            : <p className="dim">Tidak ada catatan tambahan di luar judul tugas.</p>}
          <div className="kv">
            <span>Bentuk</span><b>{t.jenis === 'praktik' ? 'praktik G-Code di simulator' : 'kuis'}</b>
            {t.jenis === 'praktik' && (
              <>
                <span>Stock</span><b className="mono">Ø{t.target.stock_d} x {t.target.stock_l} mm</b>
                <span>Target</span><b className="mono">Ø{t.target.target_d} x Z-{t.target.target_z} mm</b>
              </>
            )}
            <span>Bobot</span><b className="mono">{t.poin} poin, lulus pada {t.batas_lulus}</b>
          </div>
          {(t.lkpd_url || materiTerkait.length > 0) && (
            <Row className="catatan">
              {t.lkpd_url && (
                <a className="link-berkas" href={urlBerkas(t.lkpd_url)} target="_blank" rel="noreferrer">
                  <Icon name="pdf" size={15} /> LKPD tugas
                </a>
              )}
              {materiTerkait.map((m) => (
                <Link className="link-berkas" key={m.id} to={`/siswa/materi?kelas=${t.kelas_id}`} title={m.judul}>
                  <Icon name={m.tipe === 'video' ? 'video' : m.tipe === 'pdf' ? 'pdf' : m.tipe === 'tautan' ? 'link' : 'book'} size={15} />
                  {m.judul}
                </Link>
              ))}
            </Row>
          )}
        </Card>

        <Card title="Cara mengerjakan" icon="spark">
          {t.jenis === 'praktik' ? (
            <ol className="langkah">
              <li>Ikuti bentuk benda pada LKPD, lalu tulis program di editor simulator.</li>
              <li>Jalankan animasi lebih dulu; bila terjadi tabrakan, program tidak akan mencapai target.</li>
              <li>Centang Target Ø{t.target.target_d} untuk membandingkan benda kerja dengan bentuk ideal.</li>
              <li>Tekan Kirim ke guru. Skor simulator dihitung otomatis, guru menilai hasil akhirnya.</li>
            </ol>
          ) : (
            <ol className="langkah">
              <li>Jawab seluruh butir. Butir praktik memakai editor G-Code dengan perkiraan skor langsung.</li>
              <li>Nilai mengikuti bobot poin tiap butir, bukan jumlah soal.</li>
              <li>Sesudah dikirim, pembahasan dan kunci jawaban dapat dibuka untuk belajar.</li>
            </ol>
          )}
        </Card>
      </Grid>

      {t.jenis === 'praktik'
        ? <SimulatorPraktik tugas={t} onKirim={data.reload} />
        : <KuisRunner tugas={t} punyanya={punya} onSelesai={data.reload} />}
    </>
  );
}

/* ------------------------------ praktik ------------------------------ */
function SimulatorPraktik({ tugas, onKirim }) {
  const modul = useMemo(() => ({
    id: tugas.id,
    judul: tugas.judul,
    level: '',
    deskripsi: tugas.instruksi || '',
    target: tugas.target,
    starter_gcode: tugas.starter_gcode || '',
  }), [tugas]);

  return (
    <Simulator
      key={modul.id}
      modul={modul}
      submitTo={tugas.id}
      onSubmit={onKirim}
      bolehSimpan={false}
    />
  );
}

/* -------------------------------- kuis -------------------------------- */
function KuisRunner({ tugas, punyanya, onSelesai }) {
  const soalList = tugas.soal || [];
  const [jawab, setJawab] = useState({});
  const [hasil, setHasil] = useState(null);
  const [pembahasan, setPembahasan] = useState(null);
  const [busy, setBusy] = useState(false);

  const terisi = soalList.filter((s) => terjawab(s, jawab[s.id])).length;
  const totalPoin = soalList.reduce((a, s) => a + s.poin, 0);
  const terkunci = !!punyanya && !tugas.boleh_ulang && punyanya.status !== 'perlu_revisi';

  const bukaPembahasan = async () => {
    try {
      setPembahasan(await api(`/api/tugas/${tugas.id}/hasil`));
    } catch (e) { toast(e.message, 'danger'); }
  };

  const kirim = async () => {
    if (!soalList.length) return toast('Kuis ini belum punya butir soal.', 'warn');
    if (terisi < soalList.length) {
      const ok = await askConfirm({
        title: 'Ada butir yang kosong',
        message: `${soalList.length - terisi} butir belum dijawab. Butir kosong dinilai salah. Lanjutkan pengiriman?`,
        confirmLabel: 'Kirim sekarang',
        tone: 'info',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api(`/api/tugas/${tugas.id}/kuis`, {
        method: 'POST',
        body: JSON.stringify({
          jawaban: soalList.map((s) => ({
            soal_id: s.id,
            jawaban: jawab[s.id]?.jawaban ?? null,
            gcode: jawab[s.id]?.gcode ?? '',
          })),
        }),
      });
      setHasil(r);
      setJawab({});
      onSelesai?.();
      toast(`Kuis terkumpul. Skor ${r.skor}/100, ${r.benar} benar dari ${r.total} butir.`);
    } catch (e) { toast(e.message, 'danger'); }
    setBusy(false);
  };

  if (hasil) {
    return (
      <Card
        title={`Hasil kuis: skor ${hasil.skor}/100`}
        subtitle={`${hasil.benar} jawaban benar dari ${hasil.total} butir. Guru masih dapat menyesuaikan nilai akhir.`}
        icon="quiz"
        actions={<Button variant="sec" icon="close" onClick={() => setHasil(null)}>Tutup hasil</Button>}
      >
        <div className="stats">
          <Stat icon="check-circle" label="Benar" value={hasil.benar} tone="ok" />
          <Stat icon="x-circle" label="Belum tepat" value={hasil.total - hasil.benar} tone={hasil.total - hasil.benar ? 'danger' : 'ok'} />
          <Stat icon="target" label="Skor" value={`${hasil.skor}/100`} tone={toneNilai(hasil.skor, tugas.batas_lulus)} />
        </div>
        <div className="soal-daftar">
          {hasil.jawaban.map((j) => <ButirHasil key={j.soal_id} butir={j} />)}
        </div>
      </Card>
    );
  }

  if (pembahasan) {
    return (
      <Card
        title="Pembahasan kuis"
        subtitle={`Rekaman jawaban Anda • skor tersimpan ${pembahasan.pengumpulan?.skor_simulasi ?? '-'}/100`}
        icon="book"
        actions={<Button variant="sec" icon="close" onClick={() => setPembahasan(null)}>Kembali</Button>}
      >
        <div className="soal-daftar">
          {(pembahasan.jawaban || []).map((j) => (
            <div className={`soal-kartu${j.benar ? ' is-benar' : ' is-salah'}`} key={j.id || j.soal_id}>
              <div className="soal-kartu__head">
                <span className="soal-nomor">{j.urutan}</span>
                <div className="soal-kartu__teks">
                  <b>{j.teks}</b>
                  <span className="dim">{j.tipe} • {j.poin}/{j.soal_poin} poin</span>
                </div>
                <Badge tone={j.benar ? 'ok' : 'danger'} icon={j.benar ? 'check' : 'close'}>{j.benar ? 'benar' : 'kurang tepat'}</Badge>
              </div>
              <p className="dim">Jawaban Anda: {teksJawaban(j)}</p>
              <p className="kunci"><b>Kunci:</b> {kunciTeks(j)}</p>
              {j.pembahasan && <p className="pembahasan">{j.pembahasan}</p>}
            </div>
          ))}
        </div>
        {terkunci || <Row style={{ marginTop: 10 }}><Button icon="edit" onClick={() => setPembahasan(null)}>Perbaiki jawaban</Button></Row>}
      </Card>
    );
  }

  if (terkunci) {
    return (
      <Card title="Kuis sudah dikumpulkan" icon="check-circle">
        <Alert tone="info" title={`Terkumpul ${formatTanggal(punyanya.waktu_submit)} dengan skor ${punyanya.skor_simulasi ?? '-'}/100.`}>
          Guru tidak mengizinkan pengiriman ulang pada kuis ini.
          {punyanya.catatan_guru && ` Catatan guru: ${punyanya.catatan_guru}`}
        </Alert>
        <Row style={{ marginTop: 10 }}>
          <Button icon="book" onClick={bukaPembahasan}>Lihat pembahasan</Button>
        </Row>
      </Card>
    );
  }

  return (
    <Card
      title="Jawab kuis"
      icon="quiz"
      subtitle={`${terisi}/${soalList.length} butir terisi • total bobot ${totalPoin} poin`}
      actions={<>
        {punyanya && <Button variant="ghost" icon="book" onClick={bukaPembahasan}>Pembahasan</Button>}
        <Button icon="send" loading={busy} onClick={kirim}>
          {punyanya ? 'Kirim ulang' : 'Kirim jawaban'}
        </Button>
      </>}
    >
      {soalList.length === 0 ? (
        <Alert tone="warn" title="Kuis ini belum punya butir soal">Guru dapat menambah soal pada halaman penyusun tugas.</Alert>
      ) : (
        <div className="soal-daftar">
          {soalList.map((s, i) => (
            <div className="soal-kartu" key={s.id}>
              <div className="soal-kartu__head">
                <span className="soal-nomor">{i + 1}</span>
                <div className="soal-kartu__teks">
                  <b>{s.teks}</b>
                  <span className="dim">
                    {s.tipe === 'pg' ? 'pilih satu'
                      : s.tipe === 'isian' ? 'jawaban singkat'
                        : s.tipe === 'praktik' ? 'tulis program G-Code'
                          : 'tentukan benar atau salah'}
                    {' • '}{s.poin} poin
                  </span>
                </div>
              </div>

              {s.tipe === 'pg' && (
                <div className="opsi">
                  {(s.opsi || []).map((o, idx) => (
                    <label className={`opsi__pilih${jawab[s.id]?.jawaban === idx ? ' is-active' : ''}`} key={idx}>
                      <input
                        type="radio"
                        name={`soal-${s.id}`}
                        checked={jawab[s.id]?.jawaban === idx}
                        onChange={() => setJawab({ ...jawab, [s.id]: { jawaban: idx } })}
                      />
                      <span className="opsi__huruf">{String.fromCharCode(65 + idx)}</span>
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              )}

              {s.tipe === 'benar_salah' && (
                <div className="opsi opsi--2">
                  {[['Benar', 'true'], ['Salah', 'false']].map(([l, v]) => (
                    <label className={`opsi__pilih${jawab[s.id]?.jawaban === v ? ' is-active' : ''}`} key={v}>
                      <input
                        type="radio"
                        name={`soal-${s.id}`}
                        checked={jawab[s.id]?.jawaban === v}
                        onChange={() => setJawab({ ...jawab, [s.id]: { jawaban: v } })}
                      />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
              )}

              {s.tipe === 'isian' && (
                <Field label="Jawaban singkat" hint="Huruf besar/kecil dan spasi berlebih diabaikan saat dinilai.">
                  <Input
                    value={jawab[s.id]?.jawaban || ''}
                    onChange={(e) => setJawab({ ...jawab, [s.id]: { jawaban: e.target.value } })}
                    placeholder="mis. 1.5 mm/putaran"
                  />
                </Field>
              )}

              {s.tipe === 'praktik' && (
                <SoalPraktik
                  target={s.target}
                  nilai={jawab[s.id]?.gcode || ''}
                  onChange={(g) => setJawab({ ...jawab, [s.id]: { ...jawab[s.id], gcode: g } })}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SoalPraktik({ target, nilai, onChange }) {
  const t = target || { stock_d: 40, stock_l: 60, target_d: 20, target_z: 40 };
  const hitung = useMemo(() => {
    try {
      const r = simulate(parseGCode(nilai || ''), +t.stock_d, +t.stock_l);
      const cmp = compareTarget(r.profile, +t.target_d, +t.target_z);
      const { skor, ada_error } = autoScore(r.events, cmp);
      return { skor, ada_error, langkah: r.moves.length, detail: cmp.detail, rusak: false };
    } catch {
      return { skor: null, ada_error: false, langkah: 0, rusak: true };
    }
  }, [nilai, t.stock_d, t.stock_l, t.target_d, t.target_z]);

  return (
    <div className="soal-praktik">
      <div className="soal-praktik__info">
        <Badge tone="accent" icon="cube">stock Ø{t.stock_d} x {t.stock_l}</Badge>
        <Badge tone="muted" icon="target">target Ø{t.target_d} x Z-{t.target_z}</Badge>
        {nilai && !hitung.rusak ? (
          <Badge tone={hitung.skor >= 70 && !hitung.ada_error ? 'ok' : 'warn'} icon="speed">skor langsung {hitung.skor}/100</Badge>
        ) : (
          <Badge tone="muted">belum ada program</Badge>
        )}
        {hitung.ada_error && <Badge tone="danger" icon="alert">tabrakan</Badge>}
      </div>
      <div className="editor editor--mini">
        <pre className="hl" dangerouslySetInnerHTML={{ __html: highlightGcode(nilai || '') + '\n' }} />
        <textarea
          className="textarea mono"
          rows={7}
          spellCheck={false}
          value={nilai || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'G90\nG00 X40 Z0\nG01 X20 Z-40 F100'}
        />
      </div>
      <p className="dim" style={{ marginTop: 4 }}>
        {hitung.rusak
          ? 'Program tidak dapat dibaca, periksa sintaksnya.'
          : `${hitung.langkah} langkah gerakan. ${hitung.detail || ''}`}
      </p>
    </div>
  );
}

function ButirHasil({ butir }) {
  return (
    <div className={`soal-kartu${butir.benar ? ' is-benar' : ' is-salah'}`}>
      <div className="soal-kartu__head">
        <span className="soal-nomor">{butir.urutan}</span>
        <div className="soal-kartu__teks">
          <b>{butir.teks}</b>
          <span className="dim">{butir.tipe} • {butir.poin}/{butir.soal_poin} poin</span>
        </div>
        <Badge tone={butir.benar ? 'ok' : 'danger'} icon={butir.benar ? 'check' : 'close'}>{butir.benar ? 'benar' : 'kurang tepat'}</Badge>
      </div>
      <p className="dim">Jawaban Anda: {teksJawaban(butir)}</p>
      {butir.tipe === 'praktik' && butir.gcode && (
        <pre className="gcode-view gcode-view--hl" dangerouslySetInnerHTML={{ __html: highlightGcode(butir.gcode) }} />
      )}
      {butir.tipe === 'praktik' && butir.skor_simulasi != null && (
        <p className="dim">Skor simulator butir ini: {butir.skor_simulasi}/100.</p>
      )}
      {butir.kunci != null && <p className="kunci"><b>Kunci:</b> {kunciTeks(butir)}</p>}
      {butir.pembahasan && <p className="pembahasan">{butir.pembahasan}</p>}
    </div>
  );
}

/* ------------------------------ bantuan ------------------------------ */
const terjawab = (s, j) => {
  if (!j) return false;
  if (s.tipe === 'praktik') return !!(j.gcode && j.gcode.trim());
  return j.jawaban !== undefined && j.jawaban !== null && j.jawaban !== '';
};

function kunciTeks(b) {
  if (b.kunci == null) return 'dinilai otomatis oleh simulator';
  if (b.tipe === 'pg') {
    const idx = Number(b.kunci);
    return Number.isNaN(idx) ? String(b.kunci) : `opsi ${String.fromCharCode(65 + idx)}`;
  }
  if (b.tipe === 'benar_salah') return b.kunci ? 'Benar' : 'Salah';
  if (Array.isArray(b.kunci)) return b.kunci.join(' / ');
  return String(b.kunci);
}

function teksJawaban(b) {
  if (b.tipe === 'praktik') return b.gcode ? `${String(b.gcode).split('\n').length} baris program` : 'kosong';
  if (b.jawaban == null || b.jawaban === '') return 'tidak dijawab';
  if (b.tipe === 'pg') return `opsi ${String.fromCharCode(65 + Number(b.jawaban))}`;
  if (b.tipe === 'benar_salah') return b.jawaban === 'true' ? 'Benar' : 'Salah';
  return b.jawaban;
}
