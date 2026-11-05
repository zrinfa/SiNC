// =============================================================
// TaskBuilder.jsx - susun tugas praktik G-Code atau kuis.
// Poin tugas praktik = skala nilai guru; skor simulasi tetap 0-100.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { api, apiForm, urlBerkas } from '../../api';
import { navigate } from '../../router';
import Simulator from '../../components/Simulator.jsx';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Grid, IconButton, Input,
  Modal, PageHeader, Row, Select, Textarea, Toggle, toast,
} from '../../ui/primitives.jsx';
import { useAsync } from '../../ui/hooks.jsx';

const TARGET_KOSONG = { stock_d: 40, stock_l: 60, target_d: 20, target_z: 40 };

const KOSONG_TUGAS = {
  kelas_id: '', judul: '', instruksi: '', jenis: 'praktik', modul_id: '',
  starter_gcode: '', lkpd_url: '', poin: 100, batas_lulus: 75,
  tenggat: '', boleh_ulang: true, status: 'draf', materi_ids: [],
  target: { ...TARGET_KOSONG },
};

const KOSONG_SOAL = { tipe: 'pg', teks: '', poin: 10, opsi: ['', '', '', ''], kunci: 0, pembahasan: '', target: { ...TARGET_KOSONG } };

const TIPE_SOAL = [
  { value: 'pg', label: 'Pilihan ganda' },
  { value: 'benar_salah', label: 'Benar atau salah' },
  { value: 'isian', label: 'Isian singkat' },
  { value: 'praktik', label: 'Praktik G-Code (dinilai simulator)' },
];

// date-time lokal → format MySQL yang diterima isi_tenggat()
function keWaktuDb(v) {
  if (!v) return '';
  const s = String(v).replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 23:59:59';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return s + ':00';
  return s;
}

function dariWaktuDb(v) {
  if (!v) return '';
  const s = String(v).replace(' ', 'T');
  return s.length === 16 ? s : s.slice(0, 16);
}

export default function TaskBuilder({ id, kelasId }) {
  const menyusun = !id;
  const [form, setForm] = useState({ ...KOSONG_TUGAS, kelas_id: kelasId || '' });
  const [soal, setSoal] = useState([]);
  const [lkpd, setLkpd] = useState(null);
  const [err, setErr] = useState('');
  const [pratinjau, setPratinjau] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tersimpan, setTersimpan] = useState(null);

  const kelas = useAsync(() => api('/api/kelas'), []);
  const modul = useAsync(() => api('/api/modules'), []);
  const materi = useAsync(() => (form.kelas_id ? api('/api/materi?kelas_id=' + form.kelas_id) : Promise.resolve([])), [form.kelas_id]);
  const asli = useAsync(() => (id ? api('/api/tugas/' + id) : Promise.resolve(null)), [id]);

  // isi formulir ketika data tugas lama tiba
  useEffect(() => {
    if (!asli.data) return;
    const t = asli.data;
    setForm({
      kelas_id: t.kelas_id,
      judul: t.judul,
      instruksi: t.instruksi || '',
      jenis: t.jenis,
      modul_id: t.modul_id || '',
      starter_gcode: t.starter_gcode || '',
      lkpd_url: t.lkpd_url || '',
      poin: t.poin,
      batas_lulus: t.batas_lulus,
      tenggat: dariWaktuDb(t.tenggat),
      boleh_ulang: !!t.boleh_ulang,
      status: t.status,
      materi_ids: t.materi_ids || [],
      target: { ...TARGET_KOSONG, ...(t.target || {}) },
    });
    setSoal((t.soal || []).map((s) => ({
      tipe: s.tipe, teks: s.teks, poin: s.poin ?? 10,
      opsi: s.opsi && s.opsi.length ? s.opsi : ['', '', '', ''],
      kunci: s.tipe === 'isian' ? (Array.isArray(s.kunci) ? s.kunci.join(', ') : String(s.kunci ?? ''))
        : s.tipe === 'benar_salah' ? (s.kunci ? 1 : 0)
          : Number(s.kunci ?? 0),
      pembahasan: s.pembahasan || '',
      target: { ...TARGET_KOSONG, ...(s.target || {}) },
      id: s.id,
    })));
  }, [asli.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setTarget = (k) => (e) => setForm({ ...form, target: { ...form.target, [k]: e.target.value } });
  const rombelTerpilih = (kelas.data || []).find((k) => k.id === form.kelas_id);
  const materiList = materi.data || [];

  const pilihModul = (mid) => {
    const m = (modul.data || []).find((x) => x.id === mid);
    if (!m) return setForm({ ...form, modul_id: '' });
    setForm({
      ...form,
      modul_id: m.id,
      judul: form.judul || m.judul,
      instruksi: form.instruksi || m.deskripsi || '',
      starter_gcode: form.starter_gcode || m.starter_gcode || '',
      lkpd_url: form.lkpd_url || m.lkpd_url || '',
      target: { ...m.target },
    });
    toast(`Target diambil dari modul Lv.${m.level} ${m.judul}.`);
  };

  const tambahSoal = (tipe = 'pg') => setSoal([...soal, { ...KOSONG_SOAL, tipe, target: { ...TARGET_KOSONG } }]);
  const ubahSoal = (i, patch) => setSoal(soal.map((s, j) => (i === j ? { ...s, ...patch } : s)));
  const ubahOpsi = (i, j, nilai) => setSoal(soal.map((s, k) => (k === i ? { ...s, opsi: s.opsi.map((o, l) => (l === j ? nilai : o)) } : s)));

  const body = () => {
    const daftarSoal = form.jenis === 'kuis' ? soal.map((s) => ({
      tipe: s.tipe,
      teks: s.teks,
      poin: Number(s.poin) || 10,
      opsi: s.tipe === 'pg' ? s.opsi.filter((o) => String(o).trim() !== '') : undefined,
      kunci: s.tipe === 'pg' ? Number(s.kunci)
        : s.tipe === 'benar_salah' ? Number(s.kunci) === 1
          : s.tipe === 'isian' ? String(s.kunci).split(',').map((x) => x.trim()).filter(Boolean)
            : undefined,
      pembahasan: s.pembahasan || undefined,
      target: s.tipe === 'praktik' ? {
        stock_d: Number(s.target.stock_d), stock_l: Number(s.target.stock_l),
        target_d: Number(s.target.target_d), target_z: Number(s.target.target_z),
      } : undefined,
    })) : undefined;

    return {
      kelas_id: form.kelas_id,
      judul: form.judul.trim(),
      instruksi: form.instruksi.trim() || null,
      jenis: form.jenis,
      modul_id: form.modul_id || null,
      starter_gcode: form.starter_gcode || null,
      lkpd_url: form.lkpd_url || null,
      materi_ids: form.materi_ids,
      poin: Number(form.poin) || 100,
      batas_lulus: Number(form.batas_lulus) || 0,
      tenggat: keWaktuDb(form.tenggat) || null,
      boleh_ulang: form.boleh_ulang ? 1 : 0,
      status: form.status,
      target_profil: form.jenis === 'praktik' ? {
        stock_d: Number(form.target.stock_d), stock_l: Number(form.target.stock_l),
        target_d: Number(form.target.target_d), target_z: Number(form.target.target_z),
      } : null,
      soal: daftarSoal,
    };
  };

  const validasi = () => {
    if (!form.kelas_id) return 'Pilih rombel lebih dulu.';
    if (!form.judul.trim()) return 'Judul penugasan wajib diisi.';
    if (!Number(form.poin)) return 'Poin tugas harus lebih dari nol.';
    if (Number(form.batas_lulus) > Number(form.poin)) return 'Batas lulus tidak boleh melebihi poin tugas.';
    if (form.jenis === 'kuis') {
      if (!soal.length) return 'Kuis memerlukan minimal satu butir soal.';
      const kosong = soal.findIndex((s) => !String(s.teks).trim());
      if (kosong >= 0) return `Soal nomor ${kosong + 1} belum ada pertanyaannya.`;
      const pg = soal.findIndex((s) => s.tipe === 'pg' && s.opsi.filter((o) => String(o).trim()).length < 2);
      if (pg >= 0) return `Soal nomor ${pg + 1} (pilihan ganda) butuh minimal dua pilihan terisi.`;
      const isian = soal.findIndex((s) => s.tipe === 'isian' && !String(s.kunci).trim());
      if (isian >= 0) return `Soal nomor ${isian + 1} (isian singkat) belum punya jawaban kunci.`;
    }
    return '';
  };

  const simpan = async (terbitkan) => {
    setErr('');
    const salah = validasi();
    if (salah) return setErr(salah);
    setBusy(true);
    try {
      const payload = { ...body(), status: terbitkan ? 'terbit' : form.status };
      let hasil;
      if (lkpd) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (v == null) return;
          if (k === 'materi_ids') v.forEach((m) => fd.append('materi_ids[]', m));
          else if (k === 'target_profil') Object.entries(v).forEach(([tk, tv]) => fd.append(tk, tv));
          else if (k === 'soal') fd.append('soal', JSON.stringify(v));
          else fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
        });
        fd.append('lkpd', lkpd);
        hasil = menyusun ? await apiForm('/api/tugas', fd) : await apiForm('/api/tugas/' + id, fd, 'PUT');
      } else {
        hasil = menyusun
          ? await api('/api/tugas', { method: 'POST', body: JSON.stringify(payload) })
          : await api('/api/tugas/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      }
      setTersimpan(hasil);
      toast(terbitkan ? `Tugas ${hasil.judul} diterbitkan kepada ${hasil.kelas_nama}.` : 'Draf tersimpan.');
      if (menyusun || terbitkan) navigate('/guru/tugas/' + hasil.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const totalPoinSoal = useMemo(() => soal.reduce((a, s) => a + (Number(s.poin) || 0), 0), [soal]);
  const modulDummy = {
    id: 'pratinjau',
    judul: form.judul || 'Pratinjau tugas',
    level: '',
    deskripsi: form.instruksi,
    target: { ...form.target },
    starter_gcode: form.starter_gcode,
  };

  if (id && asli.loading && !asli.data) return <Card title="Memuat tugas" icon="assignment"><EmptyState icon="assignment" title="Mengambil data penugasan" /></Card>;
  if (id && asli.error) return <Alert tone="danger" title="Tugas tidak dapat dibuka">{asli.error}</Alert>;

  return (
    <>
      <PageHeader
        title={menyusun ? 'Susun penugasan baru' : 'Sunting penugasan'}
        desc="Tugas praktik dinilai mesin simulasi dan dapat diperiksa ulang oleh guru; kuis dinilai otomatis seketika."
        actions={<>
          <Button variant="sec" icon="arrow-left" onClick={() => navigate(id ? '/guru/tugas/' + id : '/guru/tugas')}>Kembali</Button>
          <Button variant="sec" icon="file" loading={busy} onClick={() => simpan(false)}>{menyusun ? 'Simpan draf' : 'Simpan perubahan'}</Button>
          <Button icon="flag" loading={busy} onClick={() => simpan(true)}>Simpan &amp; terbitkan</Button>
        </>}
      />

      {err && <Alert tone="danger" title="Belum dapat disimpan">{err}</Alert>}
      {!menyusun && form.status === 'terbit' && (
        <Alert tone="warn" title="Tugas sudah terbit">
          Perubahan akan langsung terlihat siswa. Nilai yang sudah diberikan tidak hilang, tetapi pengubahan soal kuis
          membuat jawaban lama dibandingkan dengan kunci baru saat dinilai ulang.
        </Alert>
      )}

      <Grid cols={2} min={430}>
        <Card title="Identitas penugasan" icon="assignment">
          <Grid cols={2} min={180}>
            <Field label="Rombel" required hint={rombelTerpilih ? `${rombelTerpilih.jumlah_siswa} siswa terdaftar` : undefined}>
              <Select value={form.kelas_id} onChange={set('kelas_id')} disabled={!menyusun}>
                <option value="">Pilih rombel</option>
                {(kelas.data || []).map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </Select>
            </Field>
            <Field label="Jenis penugasan" hint={!menyusun ? 'Ubah jenis melalui tugas baru agar soal lama tidak tertukar.' : undefined}>
              <Select value={form.jenis} onChange={set('jenis')} disabled={!menyusun}>
                <option value="praktik">Praktik G-Code (simulator)</option>
                <option value="kuis">Kuis otomatis</option>
              </Select>
            </Field>
          </Grid>

          <Field label="Judul" required>
            <Input value={form.judul} onChange={set('judul')} placeholder="mis. Membubut tirus dua tahap" maxLength={140} />
          </Field>

          <Field label="Instruksi untuk siswa" hint="Tuliskan langkah kerja, parameter potong, dan hal yang dinilai.">
            <Textarea rows={5} value={form.instruksi} onChange={set('instruksi')} placeholder="Gunakan G90, roughing 1 mm per lewat, finishing 0,2 mm..." />
          </Field>

          <Grid cols={3} min={130}>
            <Field label="Poin tugas" hint="Skala nilai guru.">
              <Input type="number" min="1" max="100" value={form.poin} onChange={set('poin')} />
            </Field>
            <Field label="Batas lulus" hint="Ambang tuntas.">
              <Input type="number" min="0" value={form.batas_lulus} onChange={set('batas_lulus')} />
            </Field>
            <Field label="Tenggat" hint="Kosong = tanpa batas.">
              <Input type="datetime-local" value={form.tenggat} onChange={set('tenggat')} />
            </Field>
          </Grid>

          <Row gap={16}>
            <Toggle checked={form.boleh_ulang} onChange={(v) => setForm({ ...form, boleh_ulang: v })} label="Siswa boleh mengumpulkan berulang" />
          </Row>

          {form.jenis === 'praktik' && (
            <Field label="Acuan modul latihan" hint="Memilih modul mengisi target, instruksi dan starter G-Code.">
              <Select value={form.modul_id} onChange={(e) => pilihModul(e.target.value)}>
                <option value="">Tanpa modul (target manual)</option>
                {(modul.data || []).map((m) => <option key={m.id} value={m.id}>Lv.{m.level} {m.judul}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Berkas LKPD" hint="URL PDF yang sudah ada, atau unggah berkas baru.">
            <Input value={form.lkpd_url} onChange={set('lkpd_url')} placeholder="/uploads/xxx.pdf atau https://" />
            <input type="file" accept=".pdf,application/pdf" onChange={(e) => setLkpd(e.target.files[0] || null)} />
            {form.lkpd_url && !lkpd && (
              <a className="btn-link" href={urlBerkas(form.lkpd_url) || form.lkpd_url} target="_blank" rel="noreferrer">
                <Icon name="pdf" size={14} /> Pratinjau berkas terpasang
              </a>
            )}
            {lkpd && <span className="dim"><Icon name="file" size={13} /> {lkpd.name} akan diunggah.</span>}
          </Field>

          {form.kelas_id && materiList.length > 0 && (
            <Field label="Materi terkait" hint="Siswa mendapat tautan bacaan ini pada kartu tugas.">
              <div className="pilih-siswa">
                {materiList.map((m) => (
                  <Toggle
                    key={m.id}
                    label={m.judul}
                    checked={form.materi_ids.includes(m.id)}
                    onChange={(on) => setForm({ ...form, materi_ids: on ? [...form.materi_ids, m.id] : form.materi_ids.filter((x) => x !== m.id) })}
                  />
                ))}
              </div>
            </Field>
          )}
        </Card>

        {form.jenis === 'praktik' ? (
          <Card
            title="Benda kerja & starter"
            icon="cube"
            subtitle="Target inilah yang dibandingkan mesin G-Code saat siswa mengumpulkan."
            actions={<Button size="sm" variant="sec" icon="play" onClick={() => setPratinjau(true)}>Uji di simulator</Button>}
          >
            <Grid cols={4} min={110}>
              <Field label="Stock Ø (mm)"><Input type="number" min="1" value={form.target.stock_d} onChange={setTarget('stock_d')} /></Field>
              <Field label="Stock L (mm)"><Input type="number" min="1" value={form.target.stock_l} onChange={setTarget('stock_l')} /></Field>
              <Field label="Target Ø (mm)"><Input type="number" min="0" value={form.target.target_d} onChange={setTarget('target_d')} /></Field>
              <Field label="Target Z (mm)"><Input type="number" min="0" value={form.target.target_z} onChange={setTarget('target_z')} /></Field>
            </Grid>
            <Alert tone="info" title="Cara membaca target">
              Mesin memotong silinder Ø{form.target.stock_d} sepanjang {form.target.stock_l} mm sampai radius
              Ø{form.target.target_d} tercapai di posisi Z-{form.target.target_z} mm, toleransi 0,5 mm.
            </Alert>
            <Field label="Starter G-Code" hint="Blok awal pada editor siswa; boleh dikosongkan.">
              <Textarea rows={7} value={form.starter_gcode} onChange={set('starter_gcode')} placeholder={'G90\nG00 X' + form.target.stock_d + ' Z0\nG01 X' + form.target.target_d + ' Z-' + form.target.target_z + ' F100'} />
            </Field>
          </Card>
        ) : (
          <Card
            title={`Butir soal (${soal.length})`}
            icon="quiz"
            subtitle={'Total poin soal ' + totalPoinSoal + '. Sistem membagi bobot skor menurut poin tiap butir.'}
            actions={<>
              <Button size="sm" variant="sec" icon="plus" onClick={() => tambahSoal('pg')}>Pilihan ganda</Button>
              <Button size="sm" variant="sec" icon="plus" onClick={() => tambahSoal('isian')}>Isian</Button>
              <Button size="sm" icon="plus" onClick={() => tambahSoal('praktik')}>Praktik</Button>
            </>}
          >
            <Row gap={6} style={{ marginBottom: 10 }}>
              <Button size="sm" variant="ghost" icon="plus" onClick={() => tambahSoal('benar_salah')}>Tambah benar/salah</Button>
            </Row>
            {soal.length === 0 && <EmptyState icon="quiz" title="Belum ada butir" desc="Tambahkan soal pilihan ganda, benar/salah, isian singkat, atau praktik G-Code." />}
            {soal.map((s, i) => (
              <div className="sub soal-kartu" key={s.id ?? i}>
                <Row className="u-row--between">
                  <b className="soal-nomor"><Icon name="quiz" size={15} /> Nomor {i + 1}</b>
                  <Row gap={5}>
                    <Select className="input" style={{ width: 210 }} value={s.tipe} onChange={(e) => ubahSoal(i, { tipe: e.target.value, kunci: e.target.value === 'pg' ? 0 : e.target.value === 'isian' ? '' : 0 })}>
                      {TIPE_SOAL.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                    <Input
                      className="input"
                      style={{ width: 84 }}
                      type="number"
                      min="1"
                      value={s.poin}
                      title="Poin butir"
                      onChange={(e) => ubahSoal(i, { poin: e.target.value })}
                    />
                    <IconButton
                      name="trash"
                      title={`Hapus nomor ${i + 1}`}
                      size="sm"
                      variant="danger"
                      onClick={() => setSoal(soal.filter((_, j) => j !== i).map((x, j) => ({ ...x, urutan: j })))}
                    />
                  </Row>
                </Row>

                <Field label="Pertanyaan" required>
                  <Textarea rows={2} value={s.teks} onChange={(e) => ubahSoal(i, { teks: e.target.value })} placeholder="Tuliskan soal..." />
                </Field>

                {s.tipe === 'pg' && (
                  <Grid cols={2} min={220}>
                    {s.opsi.map((o, j) => (
                      <Field key={j} label={`Pilihan ${String.fromCharCode(65 + j)}`}>
                        <Row gap={5}>
                          <input
                            type="radio"
                            name={`kunci-${i}`}
                            checked={Number(s.kunci) === j}
                            onChange={() => ubahSoal(i, { kunci: j })}
                            title="Tandai sebagai kunci"
                          />
                          <Input value={o} onChange={(e) => ubahOpsi(i, j, e.target.value)} placeholder={'Isi pilihan atau kosongkan bila tidak dipakai'} />
                        </Row>
                      </Field>
                    ))}
                  </Grid>
                )}

                {s.tipe === 'benar_salah' && (
                  <Field label="Kunci jawaban">
                    <Select value={Number(s.kunci)} onChange={(e) => ubahSoal(i, { kunci: e.target.value })}>
                      <option value={1}>Benar</option>
                      <option value={0}>Salah</option>
                    </Select>
                  </Field>
                )}

                {s.tipe === 'isian' && (
                  <Field label="Jawaban yang diterima" hint="Pisahkan beberapa alternatif dengan koma. Pencocokan mengabaikan huruf besar dan spasi.">
                    <Input value={s.kunci} onChange={(e) => ubahSoal(i, { kunci: e.target.value })} placeholder="mis. G01, G1" />
                  </Field>
                )}

                {s.tipe === 'praktik' && (
                  <>
                    <Grid cols={4} min={110}>
                      {['stock_d', 'stock_l', 'target_d', 'target_z'].map((k) => (
                        <Field key={k} label={k.replace('_', ' ').toUpperCase()}>
                          <Input
                            type="number"
                            min="0"
                            value={s.target[k]}
                            onChange={(e) => ubahSoal(i, { target: { ...s.target, [k]: e.target.value } })}
                          />
                        </Field>
                      ))}
                    </Grid>
                    <Alert tone="info" title="Penilaian otomatis">
                      Skor siswa pada butir ini diambil dari mesin G-Code (0-100) lalu dikalikan poin butir.
                      Butir dianggap benar bila skor minimal 70 dan tanpa tabrakan.
                    </Alert>
                  </>
                )}

                <Field label="Pembahasan untuk siswa" hint="Opsional, tampil setelah kuis dinilai.">
                  <Input value={s.pembahasan} onChange={(e) => ubahSoal(i, { pembahasan: e.target.value })} />
                </Field>
              </div>
            ))}
            {soal.length > 0 && totalPoinSoal !== Number(form.poin) && (
              <Alert tone="warn" title="Poin tugas dan total poin soal berbeda">
                Sistem menormalkan skor kuis ke skala 100, jadi perbedaan ini tidak merusak nilai.
                Namun menyamakan keduanya membuat rekap lebih mudah dibaca guru.
                <Button size="sm" variant="sec" icon="check" onClick={() => setForm({ ...form, poin: totalPoinSoal })}>Samakan poin tugas = {totalPoinSoal}</Button>
              </Alert>
            )}
          </Card>
        )}
      </Grid>

      <Card title="Pratinjau kartu tugas" icon="eye" subtitle="Inilah ringkasan yang dilihat siswa pada daftar tugas mereka.">
        <div className="sub sub--list">
          <Icon name={form.jenis === 'praktik' ? 'cube' : 'quiz'} size={20} />
          <div className="list__main">
            <b>{form.judul || 'Judul penugasan'}</b>
            <div className="dim">{form.instruksi || 'Instruksi belum ditulis.'}</div>
            <div className="dim" style={{ fontSize: 12 }}>
              {rombelTerpilih ? rombelTerpilih.nama : 'rombel belum dipilih'} •
              {form.jenis === 'praktik'
                ? ` target Ø${form.target.target_d} mm di Z-${form.target.target_z} mm dari stock Ø${form.target.stock_d} mm`
                : ` ${soal.length} butir, total poin ${totalPoinSoal}`}
            </div>
          </div>
          <div className="list__side">
            <Badge tone="accent">{form.poin} poin</Badge>
            <div className="dim" style={{ fontSize: 11.5 }}>lulus di {form.batas_lulus}</div>
            {form.tenggat && <div className="dim" style={{ fontSize: 11.5 }}>{form.tenggat.replace('T', ' ')}</div>}
          </div>
        </div>
      </Card>

      <Modal open={pratinjau} title="Uji target pada simulator" icon="cube" width={1000} onClose={() => setPratinjau(false)}>
        <Simulator key={pratinjau ? 'uji' : 'tutup'} modul={modulDummy} bolehSimpan={false} />
      </Modal>

      {tersimpan && !menyusun && <p className="dim">Terakhir disimpan: {tersimpan.judul} ({tersimpan.status}).</p>}
    </>
  );
}
