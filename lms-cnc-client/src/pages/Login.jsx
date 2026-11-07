// =============================================================
// Login.jsx - layar masuk & daftar. Panel kiri menjelaskan isi LMS,
// panel kanan berisi formulir. Tanpa emoji, tanpa em dash.
// =============================================================
import { useState } from 'react';
import { navigate } from '../router';
import { useSession } from '../session';
import Icon from '../ui/Icon.jsx';
import { Alert, Button, Field, Input } from '../ui/primitives.jsx';

const DEMO = [
  ['Administrator', 'admin@smk.sch.id'],
  ['Guru', 'guru@smk.sch.id'],
  ['Siswa', 'andi@murid.sch.id'],
];

const VALUE = [
  ['class', 'Rombel terstruktur', 'Guru membuat rombel, mengisi anggota lewat impor NIS massal atau kode gabung kelas.'],
  ['assignment', 'Tugas praktik & kuis', 'Tugas G-Code dinilai otomatis oleh mesin simulasi; kuis pilihan ganda, benar/salah, dan isian dinilai seketika.'],
  ['cube', 'Simulator 3D', 'Siswa merancang G-Code, menjalankannya pada mesin bubut 3D, lalu mengumpulkan hasil simulasi.'],
  ['chart', 'Penilaian & rekap', 'Guru memberi nilai dan catatan, rekap per rombel dan sekap sekolah siap diunduh sebagai CSV.'],
];

export default function Login() {
  const { login, loginGoogle, daftar } = useSession();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ nama: '', email: '', password: '', kelas: '', kode: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const kirim = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(form.email.trim(), form.password);
      else await daftar({
        nama: form.nama.trim(),
        email: form.email.trim(),
        password: form.password,
        kelas: form.kelas.trim() || undefined,
        kode: form.kode.trim() || undefined,
      });
      navigate('/');
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  const isiDemo = (email) => { setMode('login'); setForm((f) => ({ ...f, email, password: 'password123' })); };

  return (
    <div className="auth">
      <section className="auth__aside">
        <div className="auth__brand">
          <span className="auth__mark"><Icon name="cube" size={24} /></span>
          <div>
            <b style={{ fontSize: 16 }}>LMS Simulator Bubut CNC</b>
            <div className="dim">SMK Teknik Mesin</div>
          </div>
        </div>

        <h2>Belajar pemrograman bubut CNC sampai benar-benar terampil</h2>
        <p className="dim" style={{ maxWidth: 520 }}>
          Satu ruang belajar untuk admin, guru, dan siswa: materi, tugas praktik G-Code,
          simulator mesin 3D, kuis otomatis, dan rekap nilai dalam satu aplikasi.
        </p>

        <div className="auth__list">
          {VALUE.map(([icon, judul, teks]) => (
            <div className="auth__li" key={judul}>
              <Icon name={icon} size={18} />
              <span><b style={{ display: 'block', color: '#eaf1f7' }}>{judul}</b>{teks}</span>
            </div>
          ))}
        </div>

        <div className="auth__foot">
          <a className="demo-link" href="?demo=3d">Lihat demo mesin 3D tanpa login</a>
        </div>
      </section>

      <section className="auth__panel">
        <form className="auth-card" onSubmit={kirim}>
          <h1>{mode === 'login' ? 'Masuk ke akun' : 'Daftar sebagai siswa'}</h1>
          <p className="dim">{mode === 'login'
            ? 'Gunakan email sekolah yang dibuatkan admin atau guru.'
            : 'Akun baru selalu berperan siswa. Isi kode rombel untuk langsung bergabung.'}</p>

          <div className="auth-switch">
            <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setErr(''); }}>Login</button>
            <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setErr(''); }}>Daftar</button>
          </div>

          {mode === 'register' && (
            <Field label="Nama lengkap" required>
              <Input className="input" value={form.nama} onChange={set('nama')} placeholder="Nama sesuai rapor" autoComplete="name" />
            </Field>
          )}

          <Field label="Email" required>
            <Input className="input" type="email" value={form.email} onChange={set('email')} placeholder="nama@smk.sch.id" autoComplete="email" required />
          </Field>

          <Field label="Password" required hint={mode === 'register' ? 'Minimal 6 karakter.' : undefined}>
            <Input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </Field>

          {mode === 'register' && (
            <div className="form-grid">
              <Field label="Kelas (opsional)">
                <Input className="input" value={form.kelas} onChange={set('kelas')} placeholder="XII TPM 1" />
              </Field>
              <Field label="Kode rombel (opsional)">
                <Input className="input" value={form.kode} onChange={set('kode')} placeholder="mis. K8X2QA" style={{ textTransform: 'uppercase' }} />
              </Field>
            </div>
          )}

          {err && <Alert tone="danger" title="Gagal masuk">{err}</Alert>}

          <Button type="submit" size="lg" icon={mode === 'login' ? 'login' : 'plus'} loading={busy} className="btn--block">
            {mode === 'login' ? 'Masuk' : 'Buat akun'}
          </Button>

          <div style={{ marginTop: 10 }}>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="btn--block"
              loading={busy}
              onClick={async () => {
                setErr('');
                setBusy(true);
                try {
                  await loginGoogle();
                  navigate('/');
                } catch (ex) {
                  setErr(ex.message);
                }
                setBusy(false);
              }}
            >
              Masuk dengan Google
            </Button>
          </div>

          <div className="auth-demo">
            <b className="dim">Akun demo</b>
            <div className="u-row" style={{ marginTop: 6 }}>
              {DEMO.map(([label, email]) => (
                <button key={email} type="button" className="mini" onClick={() => isiDemo(email)}>{label}</button>
              ))}
            </div>
            <div className="dim" style={{ marginTop: 6 }}>Semua akun demo memakai password <code>password123</code>.</div>
          </div>
        </form>
      </section>
    </div>
  );
}

export { DEMO };
