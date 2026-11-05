// =============================================================
// Profil.jsx - data akun dan ganti password untuk semua peran.
// =============================================================
import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import Icon from '../ui/Icon.jsx';
import {
  Alert, Button, Card, Field, Grid, Input, PageHeader, Row,
} from '../ui/primitives.jsx';
import { formatTanggal, useAsync } from '../ui/hooks.jsx';

export default function Profil() {
  const { user, perbarui } = useSession();
  const kelas = useAsync(() => api('/api/kelas').catch(() => []), []);
  const [nama, setNama] = useState(user.nama);
  const [labelKelas, setLabelKelas] = useState(user.kelas || '');
  const [pesan, setPesan] = useState(null);
  const [sandi, setSandi] = useState({ lama: '', baru: '', ulang: '' });
  const [errSandi, setErrSandi] = useState('');
  const [okSandi, setOkSandi] = useState('');
  const [busy, setBusy] = useState('');

  const simpan = async (e) => {
    e.preventDefault();
    setBusy('profil'); setPesan(null); setErrSandi('');
    try {
      await perbarui({ nama: nama.trim(), kelas: labelKelas.trim() || undefined });
      setPesan({ tone: 'ok', text: 'Profil tersimpan.' });
    } catch (ex) {
      setPesan({ tone: 'danger', text: ex.message });
    }
    setBusy('');
  };

  const gantiSandi = async (e) => {
    e.preventDefault();
    setErrSandi(''); setOkSandi('');
    if (sandi.baru.length < 6) return setErrSandi('Password baru minimal 6 karakter.');
    if (sandi.baru !== sandi.ulang) return setErrSandi('Pengulangan password tidak sama.');
    setBusy('sandi');
    try {
      await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ password_lama: sandi.lama, password_baru: sandi.baru }) });
      setSandi({ lama: '', baru: '', ulang: '' });
      setOkSandi('Password diganti. Gunakan password baru saat login berikutnya.');
    } catch (ex) {
      setErrSandi(ex.message);
    }
    setBusy('');
  };

  const milikKelas = user.role === 'guru'
    ? (kelas.data || []).filter((k) => k.guru_id === user.id)
    : (kelas.data || []);

  return (
    <>
      <PageHeader title="Profil saya" desc="Identitas, kelas dan keamanan akun." />
      <Grid className="profil-grid" min={340}>
        <Card title="Identitas" icon="user">
          {pesan && <Alert tone={pesan.tone}>{pesan.text}</Alert>}
          <form onSubmit={simpan}>
            <Field label="Nama" required>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </Field>
            <Field label="Email" hint="Email hanya diubah administrator.">
              <Input value={user.email} disabled />
            </Field>
            {user.role === 'siswa' && (
              <Field label="Label kelas" hint="Teks yang tampil di daftar pengguna; bergabung ke rombel lewat kode di halaman Kelas saya.">
                <Input value={labelKelas} onChange={(e) => setLabelKelas(e.target.value)} placeholder="XII TPM 1" />
              </Field>
            )}
            <Row>
              <Button type="submit" icon="save" loading={busy === 'profil'}>Simpan perubahan</Button>
            </Row>
          </form>
        </Card>

        <Card title="Keamanan akun" icon="lock" subtitle="Password minimal 6 karakter, disimpan sebagai hash bcrypt.">
          <form onSubmit={gantiSandi}>
            <Field label="Password lama" required>
              <Input type="password" value={sandi.lama} onChange={(e) => setSandi({ ...sandi, lama: e.target.value })} />
            </Field>
            <Field label="Password baru" required>
              <Input type="password" value={sandi.baru} onChange={(e) => setSandi({ ...sandi, baru: e.target.value })} />
            </Field>
            <Field label="Ulangi password baru" required error={errSandi || undefined}>
              <Input type="password" value={sandi.ulang} onChange={(e) => setSandi({ ...sandi, ulang: e.target.value })} />
            </Field>
            {okSandi && <Alert tone="ok" icon="check-circle">{okSandi}</Alert>}
            <Row>
              <Button type="submit" variant="sec" icon="refresh" loading={busy === 'sandi'}>Ganti password</Button>
            </Row>
          </form>
        </Card>
      </Grid>

      <Card title="Ringkasan akun" icon="info">
        <div className="table-wrap">
          <table className="table table--tight">
            <tbody>
              <tr><td className="dim">Peran</td><td><span className={`role-tag role-tag--${user.role}`}>{user.role}</span></td></tr>
              <tr><td className="dim">Username</td><td className="mono">{user.username || '-'}</td></tr>
              <tr><td className="dim">NIS</td><td className="mono">{user.nis || '-'}</td></tr>
              <tr><td className="dim">Status</td><td>{user.status}</td></tr>
              <tr><td className="dim">Terakhir masuk</td><td>{formatTanggal(user.last_login)}</td></tr>
              <tr>
                <td className="dim">{user.role === 'guru' ? 'Rombel diampu' : 'Rombel terdaftar'}</td>
                <td>
                  {milikKelas.length === 0 && <span className="dim">Belum ada.</span>}
                  {milikKelas.map((k) => (
                    <span key={k.id} className="u-row" style={{ gap: 6 }}>
                      <Icon name="class" size={14} />
                      {k.nama}
                      {k.kode && <span className="badge badge--muted mono">{k.kode}</span>}
                    </span>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
