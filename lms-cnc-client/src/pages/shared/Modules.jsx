// =============================================================
// Modules.jsx - pustaka modul latihan G-Code (dipakai guru & admin).
// Modul menjadi acuan target tugas praktik; di sini guru menyusun modul
// bertingkat dan mengujinya langsung pada simulator.
// =============================================================
import { useMemo, useState } from 'react';
import { api, apiForm, urlBerkas } from '../../api';
import Simulator from '../../components/Simulator.jsx';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Grid, IconButton, Input,
  Modal, PageHeader, Row, SearchInput, Select, Table, Textarea, toast,
} from '../../ui/primitives.jsx';
import { useAsync } from '../../ui/hooks.jsx';

const KOSONG = { judul: '', level: 1, deskripsi: '', stock_d: 40, stock_l: 60, target_d: 20, target_z: 40, starter_gcode: '' };

export default function Modules() {
  const daftar = useAsync(() => api('/api/modules'), []);
  const rows = daftar.data || [];
  const [form, setForm] = useState(KOSONG);
  const [lkpd, setLkpd] = useState(null);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [ujiId, setUjiId] = useState('');
  const [hapus, setHapus] = useState(null);

  const tersaring = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? rows.filter((m) => [m.judul, m.deskripsi, m.dibuat_nama].filter(Boolean).join(' ').toLowerCase().includes(t)) : rows;
    return [...list].sort((a, b) => (a.level - b.level) || a.judul.localeCompare(b.judul));
  }, [rows, q]);

  const modulUji = rows.find((m) => m.id === ujiId) || tersaring[0];
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const simpan = async () => {
    setErr('');
    if (!form.judul.trim()) return setErr('Judul modul wajib diisi.');
    try {
      if (editing) {
        await api('/api/modules/' + editing, {
          method: 'PUT',
          body: JSON.stringify({
            judul: form.judul.trim(), level: +form.level, deskripsi: form.deskripsi,
            starter_gcode: form.starter_gcode, stock_d: +form.stock_d, stock_l: +form.stock_l,
            target_d: +form.target_d, target_z: +form.target_z,
          }),
        });
        toast('Modul diperbarui.');
      } else {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        if (lkpd) fd.append('lkpd', lkpd);
        await apiForm('/api/modules', fd);
        toast('Modul latihan dibuat.');
      }
      setForm(KOSONG); setLkpd(null); setEditing(null);
      daftar.reload();
    } catch (e) { setErr(e.message); }
  };

  const hapusModul = async () => {
    try {
      await api('/api/modules/' + hapus.id, { method: 'DELETE' });
      toast('Modul dihapus.');
      if (ujiId === hapus.id) setUjiId('');
      setHapus(null);
      daftar.reload();
    } catch (e) { toast(e.message, 'danger'); setHapus(null); }
  };

  return (
    <>
      <PageHeader
        title="Pustaka modul latihan"
        desc="Modul bertingkat menjadi acuan target tugas praktik. Uji dulu di simulator agar siswa tidak menerima target yang mustahil."
        actions={<SearchInput value={q} onChange={setQ} placeholder="cari modul" />}
      />

      {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}

      <Grid cols={2} min={420}>
        <Card
          title={editing ? 'Sunting modul' : 'Susun modul baru'}
          icon={editing ? 'edit' : 'plus'}
          subtitle="Level rendah dikerjakan lebih dulu; AI Tutor menyarankan level berikutnya."
        >
          {err && <Alert tone="danger" title="Periksa isian">{err}</Alert>}
          <Field label="Judul modul" required><Input value={form.judul} onChange={set('judul')} placeholder="mis. Rata permukaan & chamfer" /></Field>
          <Grid cols={2} min={150}>
            <Field label="Level" hint="Angka makin tinggi makin sulit.">
              <Input type="number" min="1" value={form.level} onChange={set('level')} />
            </Field>
            <Field label="Berkas LKPD" hint={editing ? 'Ubah level atau isi saja; PDF diganti lewat tombol Simpan. Unggah berkas baru pada mode tambah.' : 'PDF, maksimal 20 MB.'}>
              <input type="file" accept=".pdf,application/pdf" disabled={!!editing} onChange={(e) => setLkpd(e.target.files[0] || null)} />
            </Field>
          </Grid>
          <Field label="Deskripsi"><Textarea rows={3} value={form.deskripsi} onChange={set('deskripsi')} placeholder="Kompetensi yang dilatih pada modul ini." /></Field>
          <div className="card__subhead">Geometri benda kerja (mm)</div>
          <Grid cols={4} min={110}>
            <Field label="Stock Ø"><Input type="number" min="1" value={form.stock_d} onChange={set('stock_d')} /></Field>
            <Field label="Stock L"><Input type="number" min="1" value={form.stock_l} onChange={set('stock_l')} /></Field>
            <Field label="Target Ø"><Input type="number" min="0" value={form.target_d} onChange={set('target_d')} /></Field>
            <Field label="Target Z"><Input type="number" min="0" value={form.target_z} onChange={set('target_z')} /></Field>
          </Grid>
          <Field label="Starter G-Code" hint="Blok awal yang otomatis tampil pada editor siswa.">
            <Textarea rows={5} value={form.starter_gcode} onChange={set('starter_gcode')} placeholder={'G90\nG00 X40 Z0\nG01 X20 Z-40 F100'} />
          </Field>
          <Row>
            <Button icon="save" onClick={simpan}>{editing ? 'Simpan perubahan' : 'Simpan modul'}</Button>
            {editing && <Button variant="sec" onClick={() => { setEditing(null); setForm(KOSONG); setLkpd(null); }}>Batal</Button>}
          </Row>
        </Card>

        <Card
          title="Uji modul pada simulator"
          icon="cube"
          subtitle="Jalankan siklus untuk memastikan target dapat dicapai tanpa tabrakan."
          bodyClass="u-row"
          actions={
            <Select className="input" style={{ width: 240 }} value={modulUji?.id || ''} onChange={(e) => setUjiId(e.target.value)}>
              {tersaring.map((m) => <option key={m.id} value={m.id}>Lv.{m.level} {m.judul}</option>)}
            </Select>
          }
        >
          {tersaring.length === 0 ? <EmptyState icon="layers" title="Belum ada modul" desc="Buat modul pertama di panel kiri." />
            : modulUji && <Simulator key={modulUji.id} modul={modulUji} idModul={modulUji.id} />}
        </Card>
      </Grid>

      <Card
        title={`${tersaring.length} modul latihan`}
        icon="layers"
        subtitle="Modul yang sudah terbit dapat dijadikan acuan tugas praktik di rombel mana pun."
        bodyClass="u-row"
      >
        <Table
          loading={daftar.loading && !daftar.data}
          rows={tersaring}
          empty="Belum ada modul. Susun modul pertama memakai formulir di atas."
          columns={[
            { key: 'level', header: 'Level', align: 'center', render: (m) => <Badge tone="accent">Lv.{m.level}</Badge> },
            {
              key: 'judul',
              header: 'Modul',
              render: (m) => (
                <div>
                  <b>{m.judul}</b>
                  <div className="dim" style={{ fontSize: 11.5 }}>{m.deskripsi || 'tanpa deskripsi'}</div>
                </div>
              ),
            },
            {
              key: 'target',
              header: 'Target',
              render: (m) => (
                <span className="mono" style={{ fontSize: 12 }}>
                  <Icon name="ruler" size={13} /> Ø{m.target.stock_d}/{m.target.target_d} • L{m.target.stock_l}/Z-{m.target.target_z}
                </span>
              ),
            },
            { key: 'dibuat_nama', header: 'Penyusun', render: (m) => m.dibuat_nama || <span className="dim">-</span> },
            { key: 'jumlah_tugas', header: 'Pakai di tugas', align: 'center', render: (m) => <Badge tone={m.jumlah_tugas ? 'ok' : 'muted'}>{m.jumlah_tugas}</Badge> },
            {
              key: 'lkpd',
              header: 'LKPD',
              align: 'center',
              render: (m) => (m.lkpd_url
                ? <a className="btn-link" href={urlBerkas(m.lkpd_url)} target="_blank" rel="noreferrer"><Icon name="pdf" size={14} /> buka</a>
                : <span className="dim">-</span>),
            },
            {
              key: 'aksi',
              header: 'Aksi',
              align: 'right',
              render: (m) => (
                <Row gap={3}>
                  <IconButton name="cube" title="Uji di simulator" size="sm" variant="sec" onClick={() => setUjiId(m.id)} />
                  <IconButton
                    name="edit"
                    title="Sunting"
                    size="sm"
                    variant="sec"
                    onClick={() => {
                      setEditing(m.id);
                      setForm({
                        judul: m.judul, level: m.level, deskripsi: m.deskripsi || '',
                        stock_d: m.target.stock_d, stock_l: m.target.stock_l,
                        target_d: m.target.target_d, target_z: m.target.target_z,
                        starter_gcode: m.starter_gcode || '',
                      });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                  <IconButton name="trash" title="Hapus modul" size="sm" variant="danger" onClick={() => setHapus(m)} />
                </Row>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!hapus}
        title="Hapus modul latihan"
        icon="trash"
        width={440}
        onClose={() => setHapus(null)}
        footer={<>
          <Button variant="sec" onClick={() => setHapus(null)}>Batal</Button>
          <Button variant="danger" icon="trash" onClick={hapusModul}>Hapus modul</Button>
        </>}
      >
        <p className="confirm-msg">
          Modul <b>{hapus?.judul}</b> dihapus. Tugas yang memakai modul ini kehilangan pengaitnya, tetapi
          nilai dan riwayat simulasi siswa tetap tersimpan.
        </p>
      </Modal>
    </>
  );
}
