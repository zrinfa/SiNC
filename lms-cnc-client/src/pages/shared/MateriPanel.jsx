// =============================================================
// MateriPanel.jsx - kelola materi ajar satu rombel (guru/admin) dan
// daftar bacaan untuk siswa. Dipakai tab Materi pada detail rombel,
// halaman Materi ajar, dan halaman Materi siswa.
// =============================================================
import { useState } from 'react';
import { api, apiForm, urlBerkas } from '../../api';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, EmptyState, Field, Grid, IconButton, Input,
  Modal, Row, Select, Textarea, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, useAsync } from '../../ui/hooks.jsx';

const TIPE = [
  { value: 'teks', label: 'Teks / catatan', icon: 'book' },
  { value: 'pdf', label: 'Berkas PDF', icon: 'pdf' },
  { value: 'video', label: 'Video', icon: 'video' },
  { value: 'tautan', label: 'Tautan luar', icon: 'link' },
];

const KOSONG = { judul: '', tipe: 'teks', url: '', isi: '', urutan: '' };

export default function MateriPanel({ kelasId, bolehTulis, ringkas = false }) {
  const daftar = useAsync(() => (kelasId ? api('/api/materi?kelas_id=' + kelasId) : Promise.resolve([])), [kelasId]);
  const [edit, setEdit] = useState(null);      // 'baru' | objek materi
  const [form, setForm] = useState(KOSONG);
  const [berkas, setBerkas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = daftar.data || [];

  const bukaBaru = () => { setForm(KOSONG); setBerkas(null); setErr(''); setEdit('baru'); };
  const bukaEdit = (m) => {
    setForm({ judul: m.judul, tipe: m.tipe, url: m.url || '', isi: m.isi || '', urutan: m.urutan ?? '' });
    setBerkas(null); setErr(''); setEdit(m);
  };

  const simpan = async () => {
    setErr('');
    if (!form.judul.trim()) return setErr('Judul materi wajib diisi.');
    if (form.tipe === 'tautan' && !/^https?:\/\//i.test(form.url.trim())) return setErr('Tautan harus diawali http:// atau https://');
    if (form.tipe === 'pdf' && edit === 'baru' && !berkas) return setErr('Pilih berkas PDF terlebih dahulu.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('kelas_id', kelasId);
      fd.append('judul', form.judul.trim());
      fd.append('tipe', form.tipe);
      fd.append('url', form.url.trim());
      fd.append('isi', form.isi);
      fd.append('urutan', form.urutan === '' ? '0' : form.urutan);
      if (berkas) fd.append('berkas', berkas);
      if (edit === 'baru') await apiForm('/api/materi', fd);
      else await apiForm('/api/materi/' + edit.id, fd, 'PUT');
      toast('Materi tersimpan.');
      setEdit(null);
      daftar.reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const hapus = async (m) => {
    const ok = await askConfirm({ title: 'Hapus materi', message: `Materi "${m.judul}" dan berkasnya dihapus permanen.`, confirmLabel: 'Hapus materi' });
    if (!ok) return;
    try { await api('/api/materi/' + m.id, { method: 'DELETE' }); toast('Materi dihapus.'); daftar.reload(); }
    catch (e) { toast(e.message, 'danger'); }
  };

  if (!kelasId) return <Alert tone="warn" title="Pilih rombel">Materi selalu menempel pada satu rombel.</Alert>;

  return (
    <>
      {bolehTulis && (
        <Row className="u-row--between" style={{ marginBottom: 10 }}>
          <span className="dim">{rows.length} materi pada rombel ini, tampil berurutan kepada siswa.</span>
          <Button icon="plus" size="sm" onClick={bukaBaru}>Tambah materi</Button>
        </Row>
      )}

      {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}
      {rows.length === 0 && !daftar.loading && (
        <EmptyState
          icon="book"
          title="Belum ada materi"
          desc={bolehTulis ? 'Unggah PDF, sematkan video, atau tulis rangkuman agar siswa bisa membaca sebelum mengerjakan tugas.' : 'Guru belum menambahkan materi untuk rombel ini.'}
          action={bolehTulis && <Button icon="plus" onClick={bukaBaru}>Tambah materi</Button>}
        />
      )}

      <div className="list">
        {rows.map((m) => {
          const t = TIPE.find((x) => x.value === m.tipe) || TIPE[0];
          return (
            <article className="list__item materi" key={m.id}>
              <span className="materi__icon"><Icon name={t.icon} size={18} /></span>
              <div className="list__main">
                <b>{m.judul}</b>
                <div className="dim" style={{ fontSize: 12 }}>
                  <Badge tone="muted">{t.label}</Badge>
                  {m.berkas && <a className="link-berkas" href={urlBerkas(m.berkas)} target="_blank" rel="noreferrer"><Icon name="download" size={13} /> Buka berkas</a>}
                  {m.url && !m.berkas && <a className="link-berkas" href={m.url} target="_blank" rel="noreferrer"><Icon name="link" size={13} /> {m.url.replace(/^https?:\/\//, '').slice(0, 42)}</a>}
                  <span>{formatTanggal(m.created_at, { waktu: false })}</span>
                </div>
                {!ringkas && m.isi && <p className="materi__isi">{m.isi}</p>}
                {m.tipe === 'video' && m.url && (
                  <iframe
                    className="materi__video"
                    title={m.judul}
                    src={m.url}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
              {bolehTulis && (
                <Row gap={3}>
                  <IconButton name="edit" title="Sunting materi" size="sm" variant="sec" onClick={() => bukaEdit(m)} />
                  <IconButton name="trash" title="Hapus materi" size="sm" variant="danger" onClick={() => hapus(m)} />
                </Row>
              )}
            </article>
          );
        })}
      </div>

      <Modal
        open={!!edit}
        title={edit === 'baru' ? 'Tambah materi' : 'Sunting materi'}
        icon="book"
        width={600}
        onClose={() => setEdit(null)}
        footer={<>
          <Button variant="sec" onClick={() => setEdit(null)}>Batal</Button>
          <Button icon="save" onClick={simpan} loading={busy}>Simpan materi</Button>
        </>}
      >
        {err && <Alert tone="danger" title="Periksa isian">{err}</Alert>}
        <Field label="Judul" required><Input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} placeholder="mis. Dasar penyayatan & parameter potong" /></Field>
        <Grid cols={2} min={200}>
          <Field label="Jenis">
            <Select value={form.tipe} onChange={(e) => setForm({ ...form, tipe: e.target.value })}>
              {TIPE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Urutan tampil" hint="Angka kecil tampil lebih dulu.">
            <Input type="number" min="0" value={form.urutan} onChange={(e) => setForm({ ...form, urutan: e.target.value })} />
          </Field>
        </Grid>
        {(form.tipe === 'tautan' || form.tipe === 'video') && (
          <Field
            label={form.tipe === 'video' ? 'URL video (embed)' : 'URL tautan'}
            required
            hint={form.tipe === 'video' ? 'Salin alamat halaman YouTube; ditampilkan sebagai pemutar video di daftar materi.' : undefined}
          >
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
          </Field>
        )}
        {form.tipe === 'pdf' && (
          <Field label="Berkas PDF" hint={edit !== 'baru' ? 'Kosongkan untuk mempertahankan berkas lama. Maksimal 20 MB.' : 'Maksimal 20 MB.'}>
            <input type="file" accept=".pdf,application/pdf" onChange={(e) => setBerkas(e.target.files[0] || null)} />
            {berkas && <span className="dim"><Icon name="file" size={13} /> {berkas.name} ({Math.round(berkas.size / 1024)} KB)</span>}
            {edit?.berkas && <span className="dim"><Icon name="file" size={13} /> berkas tersimpan: {edit.berkas.split('/').pop()}</span>}
          </Field>
        )}
        <Field label="Isi / ringkasan" hint="Teks penjelasan yang dibaca siswa pada kartu materi.">
          <Textarea rows={6} value={form.isi} onChange={(e) => setForm({ ...form, isi: e.target.value })} />
        </Field>
      </Modal>
    </>
  );
}

export function MateriReadonly({ kelasId }) {
  return <MateriPanel kelasId={kelasId} bolehTulis={false} />;
}

export { TIPE as TIPE_MATERI };

export function MateriCardList({ rows }) {
  if (!rows?.length) return <EmptyState icon="book" title="Belum ada materi" />;
  return (
    <div className="list">
      {rows.map((m) => (
        <div className="list__item" key={m.id}>
          <Icon name={(TIPE.find((t) => t.value === m.tipe) || TIPE[0]).icon} size={17} />
          <div className="list__main"><b>{m.judul}</b><div className="dim">{m.isi || m.url || ''}</div></div>
        </div>
      ))}
    </div>
  );
}
