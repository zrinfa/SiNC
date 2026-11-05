// =============================================================
// AdminClasses.jsx - daftar rombel. Versi admin menampilkan seluruh
// kelas beserta pengampu; versi guru hanya kelas miliknya.
// =============================================================
import { useState } from 'react';
import { api, unduhBerkas } from '../../api';
import { Link, navigate } from '../../router';
import { useSession } from '../../session';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Grid, IconButton, Input,
  Modal, PageHeader, Row, SearchInput, Select, Table, Textarea, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { useAsync } from '../../ui/hooks.jsx';

const KOSONG = { nama: '', kode: '', tingkat: '', kompetensi: '', tahun_ajaran: '', deskripsi: '', guru_id: '' };

export default function AdminClasses({ guruOnly = false }) {
  const { user } = useSession();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);   // 'baru' | objek kelas
  const [form, setForm] = useState(KOSONG);
  const [err, setErr] = useState('');
  const guru = useAsync(() => (user.role === 'admin' ? api('/api/users?role=guru') : Promise.resolve([])), [user.role]);
  const daftar = useAsync(() => api('/api/kelas'), []);

  const rows = (daftar.data || []).filter((k) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [k.nama, k.kode, k.tingkat, k.kompetensi, k.guru_nama].filter(Boolean).join(' ').toLowerCase().includes(t);
  });

  const bukaBaru = () => { setForm(KOSONG); setErr(''); setEdit('baru'); };
  const bukaEdit = (k) => {
    setForm({
      nama: k.nama, kode: k.kode || '', tingkat: k.tingkat || '', kompetensi: k.kompetensi || '',
      tahun_ajaran: k.tahun_ajaran || '', deskripsi: k.deskripsi || '', guru_id: k.guru_id || '',
    });
    setErr(''); setEdit(k);
  };

  const simpan = async () => {
    setErr('');
    if (!form.nama.trim()) return setErr('Nama rombel wajib diisi.');
    const body = {
      nama: form.nama.trim(),
      tingkat: form.tingkat.trim() || null,
      kompetensi: form.kompetensi.trim() || null,
      tahun_ajaran: form.tahun_ajaran.trim() || null,
      deskripsi: form.deskripsi.trim() || null,
    };
    if (!guruOnly && form.guru_id) body.guru_id = form.guru_id;
    try {
      if (edit === 'baru') {
        const k = await api('/api/kelas', { method: 'POST', body: JSON.stringify(body) });
        toast(`Rombel ${k.nama} dibuat. Kode gabung ${k.kode}.`);
        setEdit(null);
        daftar.reload();
        navigate(`${base}/${k.id}`);
      } else {
        await api('/api/kelas/' + edit.id, { method: 'PUT', body: JSON.stringify(body) });
        toast('Perubahan tersimpan.');
        setEdit(null);
        daftar.reload();
      }
    } catch (e) { setErr(e.message); }
  };

  const acakKode = async (k) => {
    try {
      const baru = await api(`/api/kelas/${k.id}/kode`, { method: 'PUT' });
      toast(`Kode gabung baru: ${baru.kode}`);
      daftar.reload();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const hapus = async (k) => {
    const ok = await askConfirm({
      title: 'Hapus rombel',
      message: `Seluruh anggota lepas dari ${k.nama}, dan semua materi, tugas serta nilai di dalamnya dihapus.`,
      confirmLabel: 'Hapus rombel',
    });
    if (!ok) return;
    try {
      await api('/api/kelas/' + k.id, { method: 'DELETE' });
      toast('Rombel dihapus.');
      daftar.reload();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const base = user.role === 'admin' ? '/admin/kelas' : '/guru/kelas';

  return (
    <>
      <PageHeader
        title={guruOnly ? 'Rombel saya' : 'Rombel & anggota'}
        desc={guruOnly
          ? 'Kelas yang Anda ampu. Buka satu kelas untuk menambah anggota, materi, dan tugas.'
          : 'Seluruh kelas yang terdaftar di sekolah.'}
        actions={<Button icon="plus" onClick={bukaBaru}>Buat rombel</Button>}
      />

      {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}

      <Card
        title={`${rows.length} rombel`}
        icon="class"
        bodyClass="u-row"
        actions={<SearchInput value={q} onChange={setQ} placeholder="cari nama, kode, tingkat" />}
      >
        {daftar.loading && !daftar.data ? <EmptyState icon="class" title="Memuat daftar rombel" /> : rows.length === 0 ? (
          <EmptyState
            icon="class"
            title={q ? 'Tidak ada rombel yang cocok.' : 'Belum ada rombel.'}
            desc={q ? 'Ubah kata kunci pencarian.' : 'Buat rombel pertama, lalu impor daftar NIS siswa.'}
            action={!q && <Button icon="plus" onClick={bukaBaru}>Buat rombel</Button>}
          />
        ) : (
          <Table
            rows={rows}
            columns={[
              {
                key: 'nama',
                header: 'Rombel',
                render: (k) => (
                  <div>
                    <Link to={`${base}/${k.id}`}><b>{k.nama}</b></Link>
                    <div className="dim" style={{ fontSize: 11.5 }}>
                      {[k.tingkat, k.kompetensi].filter(Boolean).join(' • ') || 'tanpa keterangan tingkat'}
                    </div>
                  </div>
                ),
              },
              {
                key: 'kode',
                header: 'Kode gabung',
                render: (k) => (
                  <Row gap={5}>
                    <span className="badge badge--info mono">{k.kode || '-'}</span>
                    <IconButton name="refresh" title="Acak kode baru" size="sm" variant="ghost" onClick={() => acakKode(k)} />
                  </Row>
                ),
              },
              !guruOnly && {
                key: 'guru',
                header: 'Pengampu',
                render: (k) => k.guru_nama || <span className="dim">belum ditentukan</span>,
              },
              { key: 'siswa', header: 'Siswa', align: 'center', render: (k) => <Badge tone={k.jumlah_siswa ? 'accent' : 'muted'}>{k.jumlah_siswa}</Badge> },
              { key: 'tugas', header: 'Tugas', align: 'center', render: (k) => k.jumlah_tugas },
              {
                key: 'perlu',
                header: 'Perlu dinilai',
                align: 'center',
                render: (k) => <Badge tone={k.perlu_dinilai ? 'warn' : 'ok'}>{k.perlu_dinilai || 0}</Badge>,
              },
              { key: 'ta', header: 'Tahun ajaran', render: (k) => <span className="dim">{k.tahun_ajaran || '-'}</span> },
              {
                key: 'aksi',
                header: 'Aksi',
                align: 'right',
                render: (k) => (
                  <Row gap={3}>
                    <IconButton name="chevron-right" title="Buka rombel" size="sm" variant="sec" onClick={() => navigate(`${base}/${k.id}`)} />
                    <IconButton name="edit" title="Sunting" size="sm" variant="sec" onClick={() => bukaEdit(k)} />
                    <IconButton
                      name="download"
                      title="Unduh rekap CSV"
                      size="sm"
                      variant="sec"
                      onClick={async () => {
                        try { await unduhBerkas(`/api/export/nilai?kelas_id=${k.id}`, `nilai-${k.kode || k.nama}.csv`); toast('CSV diunduh.'); }
                        catch (e) { toast(e.message, 'danger'); }
                      }}
                    />
                    <IconButton name="trash" title="Hapus rombel" size="sm" variant="danger" onClick={() => hapus(k)} />
                  </Row>
                ),
              },
            ].filter(Boolean)}
          />
        )}
        {user.role === 'siswa' && (
          <p className="dim" style={{ marginTop: 10 }}>
            <Icon name="info" size={14} /> Siswa hanya melihat rombel tempat dirinya terdaftar.
          </p>
        )}
      </Card>

      <Modal
        open={!!edit}
        title={edit === 'baru' ? 'Buat rombel baru' : 'Sunting ' + (edit?.nama || '')}
        icon="class"
        onClose={() => setEdit(null)}
        footer={<>
          <Button variant="sec" onClick={() => setEdit(null)}>Batal</Button>
          <Button icon="save" onClick={simpan}>Simpan</Button>
        </>}
      >
        {err && <Alert tone="danger" title="Periksa isian">{err}</Alert>}
        <Field label="Nama rombel" required hint="Misalnya XII TPM 1. Panjang maksimal 60 karakter.">
          <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} maxLength={60} />
        </Field>
        <Grid cols={2} min={200}>
          <Field label="Tingkat"><Input value={form.tingkat} onChange={(e) => setForm({ ...form, tingkat: e.target.value })} placeholder="Kelas XII" /></Field>
          <Field label="Kompetensi"><Input value={form.kompetensi} onChange={(e) => setForm({ ...form, kompetensi: e.target.value })} placeholder="TPM - Bubut CNC" /></Field>
          <Field label="Tahun ajaran"><Input value={form.tahun_ajaran} onChange={(e) => setForm({ ...form, tahun_ajaran: e.target.value })} placeholder="2026/2027" /></Field>
          {!guruOnly && (
            <Field label="Guru pengampu" hint="Administrator dapat memindahkan kelas antar guru.">
              <Select value={form.guru_id} onChange={(e) => setForm({ ...form, guru_id: e.target.value })}>
                <option value="">Pertahankan</option>
                {(guru.data || []).map((g) => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </Select>
            </Field>
          )}
        </Grid>
        <Field label="Deskripsi"><Textarea rows={3} value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} /></Field>
        {edit === 'baru' && (
          <Alert tone="info" title="Kode gabung">Kode rombel dibuat otomatis oleh sistem. Bagikan kepada siswa agar mereka dapat bergabung sendiri dari halaman Kelas saya.</Alert>
        )}
      </Modal>
    </>
  );
}
