// =============================================================
// AdminUsers.jsx - pengelolaan akun (admin). Filter, tambah manual,
// impor massal, reset password, nonaktifkan, hapus.
// =============================================================
import { useMemo, useState } from 'react';
import { api } from '../../api';
import {
  Alert, Badge, Button, Card, Field, Grid, IconButton, Input, Modal,
  PageHeader, Row, SearchInput, Select, Table, Textarea, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, useAsync } from '../../ui/hooks.jsx';

const PERAN = [
  { value: '', label: 'Semua peran' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'guru', label: 'Guru' },
  { value: 'admin', label: 'Administrator' },
];

const KOSONG = { nama: '', email: '', username: '', nis: '', kelas: '', role: 'siswa', status: 'aktif', password: '' };

export default function AdminUsers() {
  const [filter, setFilter] = useState({ role: '', status: '', q: '', kelas_id: '' });
  const [edit, setEdit] = useState(null);       // objek user | 'baru'
  const [form, setForm] = useState(KOSONG);
  const [err, setErr] = useState('');
  const [bulk, setBulk] = useState(false);
  const [bulkForm, setBulkForm] = useState({ role: 'siswa', teks: '', password_sementara: '' });
  const [hasilImpor, setHasilImpor] = useState(null);
  const [kataSandi, setKataSandi] = useState(null);

  const daftar = useAsync(() => {
    const p = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    return api('/api/users?' + p.toString());
  }, [filter.role, filter.status, filter.q, filter.kelas_id]);

  const kelas = useAsync(() => api('/api/kelas'), []);
  const rows = daftar.data || [];

  const ringkas = useMemo(() => ({
    siswa: rows.filter((r) => r.role === 'siswa').length,
    guru: rows.filter((r) => r.role === 'guru').length,
    admin: rows.filter((r) => r.role === 'admin').length,
    nonaktif: rows.filter((r) => r.status === 'nonaktif').length,
  }), [rows]);

  const bukaBaru = () => { setForm(KOSONG); setErr(''); setEdit('baru'); };
  const bukaEdit = (u) => { setForm({ ...KOSONG, ...u, password: '' }); setErr(''); setEdit(u); };

  const simpan = async () => {
    setErr('');
    const body = {
      nama: form.nama.trim(),
      email: form.email.trim(),
      username: form.username.trim() || null,
      nis: form.nis.trim() || null,
      kelas: form.kelas.trim() || null,
      role: form.role,
    };
    try {
      if (edit === 'baru') {
        const r = await api('/api/users', { method: 'POST', body: JSON.stringify({ ...body, password: form.password }) });
        if (r.password_sementara) setKataSandi({ nama: r.nama, password: r.password_sementara });
        toast(`Akun ${r.nama} dibuat.`);
      } else {
        await api('/api/users/' + edit.id, { method: 'PUT', body: JSON.stringify({ ...body, status: form.status }) });
        toast('Perubahan tersimpan.');
      }
      setEdit(null);
      daftar.reload();
    } catch (e) { setErr(e.message); }
  };

  const resetSandi = async (u) => {
    const ok = await askConfirm({
      title: 'Reset password',
      message: `Buat password baru untuk ${u.nama}. Password lama tidak berlaku dan password baru hanya tampil sekali.`,
      confirmLabel: 'Buat password',
      tone: 'warn',
    });
    if (!ok) return;
    try {
      const r = await api(`/api/users/${u.id}/reset-password`, { method: 'POST' });
      setKataSandi({ nama: u.nama, password: r.password_sementara });
    } catch (e) { toast(e.message, 'danger'); }
  };

  const toggleStatus = async (u) => {
    const status = u.status === 'aktif' ? 'nonaktif' : 'aktif';
    try {
      await api('/api/users/' + u.id, { method: 'PUT', body: JSON.stringify({ status }) });
      toast(`${u.nama} ${status === 'aktif' ? 'diaktifkan' : 'dinonaktifkan'}.`);
      daftar.reload();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const hapus = async (u) => {
    const ok = await askConfirm({
      title: 'Hapus akun',
      message: `Akun ${u.nama} (${u.email}) akan dihapus permanen beserta riwayat simulasi yang tidak terhubung tugas.`,
      confirmLabel: 'Hapus akun',
    });
    if (!ok) return;
    try {
      await api('/api/users/' + u.id, { method: 'DELETE' });
      toast('Akun dihapus.');
      daftar.reload();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const impor = async () => {
    if (!bulkForm.teks.trim()) return setHasilImpor({ error: 'Isi minimal satu baris data.' });
    try {
      const r = await api('/api/users/bulk', {
        method: 'POST',
        body: JSON.stringify({
          role: bulkForm.role,
          teks: bulkForm.teks,
          password_sementara: bulkForm.password_sementara || undefined,
        }),
      });
      setHasilImpor(r);
      toast(`${r.dibuat.length} akun dibuat, ${r.lewat ?? 0} baris dilewati.`);
      daftar.reload();
    } catch (e) { setHasilImpor({ error: e.message }); }
  };

  return (
    <>
      <PageHeader
        title="Pengguna"
        desc="Semua akun admin, guru dan siswa di sekolah."
        actions={<>
          <Button icon="upload" variant="sec" onClick={() => { setBulk(true); setHasilImpor(null); }}>Impor massal</Button>
          <Button icon="plus" onClick={bukaBaru}>Tambah pengguna</Button>
        </>}
      />

      <div className="stats">
        <Badge tone="info">{rows.length} akun tampil</Badge>
        <Badge tone="accent">{ringkas.siswa} siswa</Badge>
        <Badge tone="ok">{ringkas.guru} guru</Badge>
        <Badge>{ringkas.admin} admin</Badge>
        <Badge tone={ringkas.nonaktif ? 'danger' : 'muted'}>{ringkas.nonaktif} nonaktif</Badge>
      </div>

      <Card
        title="Daftar akun"
        icon="users"
        bodyClass="u-row"
        actions={<>
          <SearchInput value={filter.q} onChange={(q) => setFilter({ ...filter, q })} placeholder="nama, email, NIS" />
          <Select className="input" style={{ width: 150 }} value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value })}>
            {PERAN.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          <Select className="input" style={{ width: 140 }} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </Select>
          <Select className="input" style={{ width: 170 }} value={filter.kelas_id} onChange={(e) => setFilter({ ...filter, kelas_id: e.target.value })}>
            <option value="">Semua rombel</option>
            {(kelas.data || []).map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </Select>
        </>}
      >
        {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}
        <Table
          loading={daftar.loading && !daftar.data}
          rows={rows}
          empty="Tidak ada akun yang cocok dengan filter."
          columns={[
            {
              key: 'nama',
              header: 'Nama',
              render: (u) => (
                <div>
                  <b>{u.nama}</b>
                  <div className="dim mono" style={{ fontSize: 11.5 }}>
                    {[u.nis && 'NIS ' + u.nis, u.username && '@' + u.username].filter(Boolean).join('  ') || u.email}
                  </div>
                </div>
              ),
            },
            { key: 'email', header: 'Email', render: (u) => <span className="mono" style={{ fontSize: 12 }}>{u.email}</span> },
            {
              key: 'role',
              header: 'Peran',
              render: (u) => <span className={`role-tag role-tag--${u.role}`}>{u.role}</span>,
            },
            { key: 'kelas', header: 'Kelas', render: (u) => u.kelas || <span className="dim">-</span> },
            { key: 'status', header: 'Status', render: (u) => <Badge tone={u.status === 'aktif' ? 'ok' : 'danger'}>{u.status}</Badge> },
            { key: 'last_login', header: 'Terakhir masuk', render: (u) => <span className="dim">{formatTanggal(u.last_login)}</span> },
            {
              key: 'aksi',
              header: 'Aksi',
              align: 'right',
              render: (u) => (
                <Row gap={3}>
                  <IconButton name="edit" title="Sunting" size="sm" variant="sec" onClick={() => bukaEdit(u)} />
                  <IconButton name="lock" title="Reset password" size="sm" variant="sec" onClick={() => resetSandi(u)} />
                  <IconButton name={u.status === 'aktif' ? 'eye-off' : 'eye'} title={u.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'} size="sm" variant="sec" onClick={() => toggleStatus(u)} />
                  <IconButton name="trash" title="Hapus" size="sm" variant="danger" onClick={() => hapus(u)} />
                </Row>
              ),
            },
          ]}
        />
      </Card>

      {/* ---------------- modal tambah / sunting ---------------- */}
      <Modal
        open={!!edit}
        title={edit === 'baru' ? 'Tambah pengguna' : 'Sunting ' + (edit?.nama || '')}
        icon="user"
        onClose={() => setEdit(null)}
        footer={<>
          <Button variant="sec" onClick={() => setEdit(null)}>Batal</Button>
          <Button icon="save" onClick={simpan}>Simpan</Button>
        </>}
      >
        {err && <Alert tone="danger" title="Periksa isian">{err}</Alert>}
        <Grid cols={2} min={220}>
          <Field label="Nama lengkap" required><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Username" hint="Opsional, untuk login singkat."><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="NIS / NIP" hint="Kosong bila tidak ada."><Input value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} /></Field>
          <Field label="Peran">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="siswa">Siswa</option>
              <option value="guru">Guru</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
          <Field label="Label kelas" hint="Hanya teks penanda; keanggotaan rombel diatur di halaman rombel.">
            <Input value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} placeholder="XII TPM 1" />
          </Field>
          {edit === 'baru' && (
            <Field label="Password" hint="Kosongkan agar sistem membuat password sementara.">
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          {edit !== 'baru' && (
            <Field label="Status akun">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </Select>
            </Field>
          )}
        </Grid>
      </Modal>

      {/* ---------------- modal impor massal ---------------- */}
      <Modal
        open={bulk}
        title="Impor massal akun"
        icon="upload"
        width={640}
        onClose={() => setBulk(false)}
        footer={<>
          <Button variant="sec" onClick={() => setBulk(false)}>Tutup</Button>
          <Button icon="users" onClick={impor}>Proses impor</Button>
        </>}
      >
        <Alert tone="info" title="Format baris">
          <span className="mono">NIS;Nama;Email</span> per baris. Email boleh dikosongkan, sistem membuat
          <span className="mono"> nis@sekolah.id</span>. Pemisah <span className="mono">;</span>, <span className="mono">,</span> atau tab dikenali otomatis.
          Untuk peran guru tulis <span className="mono">Nama;Email</span>.
        </Alert>
        <Grid cols={2} min={220}>
          <Field label="Peran hasil impor">
            <Select value={bulkForm.role} onChange={(e) => setBulkForm({ ...bulkForm, role: e.target.value })}>
              <option value="siswa">Siswa</option>
              <option value="guru">Guru</option>
            </Select>
          </Field>
          <Field label="Password bersama" hint="Kosongkan agar sistem memilih password acak.">
            <Input value={bulkForm.password_sementara} onChange={(e) => setBulkForm({ ...bulkForm, password_sementara: e.target.value })} placeholder="mis. smk2026" />
          </Field>
        </Grid>
        <Field label="Daftar peserta" required>
          <Textarea
            rows={9}
            value={bulkForm.teks}
            onChange={(e) => setBulkForm({ ...bulkForm, teks: e.target.value })}
            placeholder={'1001;Andi Siswa;andi@murid.sch.id\n1002;Sinta Siswi\n1003;Budi Pratama'}
          />
        </Field>

        {hasilImpor?.error && <Alert tone="danger" title="Impor gagal">{hasilImpor.error}</Alert>}
        {hasilImpor?.dibuat && (
          <>
            <Alert tone="ok" title={`${hasilImpor.dibuat.length} akun dibuat${hasilImpor.lewat ? `, ${hasilImpor.lewat} baris dilewati` : ''}`}>
              Bagikan password sementara ini kepada peserta; password hanya ditampilkan satu kali.
            </Alert>
            <PasswordBox password={hasilImpor.password_sementara} />
          </>
        )}
      </Modal>

      {/* ---------------- hasil password sementara ---------------- */}
      <Modal
        open={!!kataSandi}
        title="Password sementara"
        icon="lock"
        width={420}
        onClose={() => setKataSandi(null)}
        footer={<Button onClick={() => setKataSandi(null)}>Selesai</Button>}
      >
        <p className="dim">Sampaikan kepada <b>{kataSandi?.nama}</b>. Password ini tidak dapat dilihat ulang.</p>
        <PasswordBox password={kataSandi?.password} />
      </Modal>
    </>
  );
}

export function PasswordBox({ password }) {
  if (!password) return null;
  return (
    <div className="pw-box">
      <code>{password}</code>
      <Button
        size="sm"
        variant="sec"
        icon="copy"
        onClick={async () => {
          try { await navigator.clipboard.writeText(password); toast('Password disalin.'); }
          catch { toast('Salin manual karena browser menolak akses papan klip.', 'warn'); }
        }}
      >Salin</Button>
    </div>
  );
}
