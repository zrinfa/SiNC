// =============================================================
// App.jsx - kerangka aplikasi LMS: layar login, kerangka berbasis peran
// (sidebar + topbar) dan rute hash tiap halaman.
// =============================================================
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Link, navigate, parse, useRoute } from './router';
import { SessionProvider, useSession } from './session';
import Icon from './ui/Icon.jsx';
import { ConfirmHost, IconButton, Spinner, Toaster } from './ui/primitives.jsx';
import { inisial, useAsync } from './ui/hooks.jsx';
import Login from './pages/Login.jsx';
import CncBotWidget from './components/CncBotWidget.jsx';
import Profil from './pages/Profil.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminClasses from './pages/admin/AdminClasses.jsx';
import GuruHome from './pages/guru/GuruHome.jsx';
import GuruTasks from './pages/guru/GuruTasks.jsx';
import TaskBuilder from './pages/guru/TaskBuilder.jsx';
import TaskDetail from './pages/guru/TaskDetail.jsx';
import MateriLibrary from './pages/guru/MateriLibrary.jsx';
import ClassDetail from './pages/shared/ClassDetail.jsx';
import Modules from './pages/shared/Modules.jsx';
import SiswaHome from './pages/siswa/SiswaHome.jsx';
import SiswaFreeSim from './pages/siswa/SiswaFreeSim.jsx';
import SiswaTasks from './pages/siswa/SiswaTasks.jsx';
import TaskRunner from './pages/siswa/TaskRunner.jsx';
import SiswaGrades from './pages/siswa/SiswaGrades.jsx';
import SiswaClass from './pages/siswa/SiswaClass.jsx';
import SiswaMateri from './pages/siswa/SiswaMateri.jsx';
import SiswaPrograms from './pages/siswa/SiswaPrograms.jsx';

// contoh 3D & simulator dimuat terpisah agar Three.js tidak membebani halaman lain
const Cnc3DExample = lazy(() => import('./examples/Cnc3DExample'));

const NAV = {
  admin: [
    { title: 'Ringkasan', items: [{ to: '/admin', label: 'Beranda sekolah', icon: 'dashboard' }] },
    {
      title: 'Tata kelola',
      items: [
        { to: '/admin/pengguna', label: 'Pengguna', icon: 'users' },
        { to: '/admin/kelas', label: 'Rombel & anggota', icon: 'class' },
        { to: '/admin/modul', label: 'Pustaka modul', icon: 'book' },
      ],
    },
    { title: 'Akun', items: [{ to: '/profil', label: 'Profil saya', icon: 'user' }] },
  ],
  guru: [
    { title: 'Ringkasan', items: [{ to: '/guru', label: 'Beranda', icon: 'dashboard' }] },
    {
      title: 'Pembelajaran',
      items: [
        { to: '/guru/kelas', label: 'Rombel saya', icon: 'class' },
        { to: '/guru/tugas', label: 'Tugas & kuis', icon: 'assignment' },
        { to: '/guru/materi', label: 'Materi ajar', icon: 'book' },
        { to: '/guru/modul', label: 'Pustaka modul', icon: 'layers' },
      ],
    },
    {
      title: 'Akun',
      items: [{ to: '/profil', label: 'Profil saya', icon: 'user' }],
    },
  ],
  siswa: [
    { title: 'Ringkasan', items: [{ to: '/siswa', label: 'Beranda', icon: 'dashboard' }] },
    {
      title: 'Belajar',
      items: [
        { to: '/siswa/tugas', label: 'Tugas & kuis', icon: 'assignment', countKey: 'perlu' },
        { to: '/siswa/latihan', label: 'Simulator bebas', icon: 'cube' },
        { to: '/siswa/program', label: 'Program saya', icon: 'code' },
        { to: '/siswa/materi', label: 'Materi ajar', icon: 'book' },
        { to: '/siswa/kelas', label: 'Kelas saya', icon: 'class' },
      ],
    },
    {
      title: 'Hasil',
      items: [
        { to: '/siswa/nilai', label: 'Nilai saya', icon: 'chart' },
        { to: '/profil', label: 'Profil saya', icon: 'user' },
      ],
    },
  ],
};

const HOME = { admin: '/admin', guru: '/guru', siswa: '/siswa' };

function titleFor(role, segments) {
  const flat = NAV[role].flatMap((g) => g.items);
  const path = '/' + segments.join('/');
  const hit = flat.find((i) => i.to === path);
  if (hit) return hit.label;
  if (segments[1] === 'kelas') return 'Detail rombel';
  if (segments[1] === 'tugas') return segments[2] === 'baru' || segments[3] === 'sunting' ? 'Susun tugas' : 'Detail tugas';
  return 'LMS Simulator Bubut CNC';
}

function Outlet({ segments, role, queryParams }) {
  const [a, b, c, d] = segments;
  if (a === 'profil') return <Profil />;

  if (a === 'admin') {
    if (!b) return <AdminHome />;
    if (b === 'pengguna') return <AdminUsers />;
    if (b === 'kelas') return c ? <ClassDetail id={c} /> : <AdminClasses />;
    if (b === 'modul') return <Modules />;
    return <AdminHome />;
  }

  if (a === 'guru') {
    if (!b) return <GuruHome />;
    if (b === 'kelas') return c ? <ClassDetail id={c} /> : <AdminClasses guruOnly />;
    if (b === 'materi') return <MateriLibrary kelasId={queryParams.kelas} />;
    if (b === 'modul') return <Modules />;
    if (b === 'tugas') {
      if (c === 'baru') return <TaskBuilder kelasId={queryParams.kelas} />;
      if (c && d === 'sunting') return <TaskBuilder id={c} />;
      if (c) return <TaskDetail id={c} />;
      return <GuruTasks />;
    }
    return <GuruHome />;
  }

  if (a === 'siswa') {
    if (!b) return <SiswaHome />;
    if (b === 'tugas') return c ? <TaskRunner id={c} /> : <SiswaTasks />;
    if (b === 'latihan') return <SiswaFreeSim programId={queryParams.program} />;
    if (b === 'nilai') return <SiswaGrades />;
    if (b === 'materi') return <SiswaMateri kelasId={queryParams.kelas} />;
    if (b === 'kelas') return <SiswaClass />;
    if (b === 'program') return <SiswaPrograms />;
    return <SiswaHome />;
  }
  return null;
}

function Shell() {
  const { user, keluar } = useSession();
  const route = useRoute();
  const { segments, query } = useMemo(() => parse(route), [route]);
  const [drawer, setDrawer] = useState(false);
  const [min, setMin] = useState(() => localStorage.getItem('sidebar-min') === '1');

  const role = user.role;
  const stats = useAsync(
    () => (role === 'siswa' ? api('/api/stats/siswa') : role === 'guru' ? api('/api/stats/guru') : Promise.resolve(null)),
    [role]
  );
  const counts = role === 'siswa'
    ? { perlu: stats.data?.perlu_dikerjakan }
    : { menunggu: stats.data?.menunggu_dinilai };

  // rute kosong → beranda peran
  useEffect(() => {
    if (segments.length === 0 && HOME[role]) navigate(HOME[role], { replace: true });
  }, [segments.length, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setDrawer(false); }, [route]);
  useEffect(() => { localStorage.setItem('sidebar-min', min ? '1' : '0'); }, [min]);

  const nav = NAV[role];
  const active = '/' + segments.join('/');
  const title = segments.length ? titleFor(role, segments) : 'Beranda';

  const sidebar = (
    <aside className={`sidebar${min ? ' sidebar--min' : ''}${drawer ? ' sidebar--open' : ''}`}>
      <div className="brand">
        <span className="brand__mark"><Icon name="cube" size={19} /></span>
        <span className="brand__text">
          <b>LMS Bubut CNC</b>
          <span>SMK {role}</span>
        </span>
      </div>

      <nav className="nav">
        {nav.map((g) => (
          <div key={g.title}>
            <div className="nav__title">{g.title}</div>
            {g.items.map((it) => (
              <Link key={it.to} to={it.to} className={`nav__item${active === it.to ? ' is-active' : ''}`} title={it.label}>
                <Icon name={it.icon} size={17} />
                <span className="nav__label">{it.label}</span>
                {it.countKey && counts[it.countKey] ? <em className="nav__count">{counts[it.countKey]}</em> : null}
              </Link>
            ))}
          </div>
        ))}
        {role !== 'siswa' && (
          <>
            <div className="nav__title">Simulasi</div>
            <a className="nav__item" href="?demo=3d" target="_blank" rel="noreferrer" title="Contoh mesin 3D">
              <Icon name="spark" size={17} />
              <span className="nav__label">Demo mesin 3D</span>
            </a>
          </>
        )}
      </nav>

      <div className="sidebar__foot">
        <div className="user-chip">
          <span className="user-chip__ava">{inisial(user.nama)}</span>
          <span className="user-chip__text">
            <b>{user.nama}</b>
            <span>{user.kelas || role}</span>
          </span>
        </div>
        <div className="u-row">
          <IconButton name="settings" title="Profil saya" variant="sec" size="sm" onClick={() => navigate('/profil')} />
          <IconButton name="logout" title="Keluar" variant="sec" size="sm" onClick={keluar} />
          <span className="spacer" />
          <IconButton name={min ? 'chevron-right' : 'chevron-left'} title={min ? 'Buka menu' : 'Ringkas menu'} size="sm" onClick={() => setMin(!min)} />
        </div>
      </div>
    </aside>
  );

  return (
    <div className="shell">
      {sidebar}
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <div className={`main${min ? ' main--min' : ''}`}>
        <header className="topbar">
          <IconButton name="menu" title="Menu" variant="ghost" className="only-mobile" onClick={() => setDrawer(true)} />
          <div className="topbar__title">
            <b>{title}</b>
            <span>{user.kelas ? user.kelas + ' • ' : ''}{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="topbar__actions">
            {role === 'siswa' && counts.perlu > 0 && (
              <Link className="chip chip--warn" to="/siswa/tugas">{counts.perlu} tugas menunggu</Link>
            )}
            {role === 'guru' && counts.menunggu > 0 && (
              <Link className="chip chip--accent" to="/guru/tugas">{counts.menunggu} perlu dinilai</Link>
            )}
            <span className={`role-tag role-tag--${role}`}>{role}</span>
          </div>
        </header>
        <main className="content">
          {stats.loading && !stats.data ? (
            <div className="demo-load"><Spinner size={18} /> Memuat data…</div>
          ) : (
            <Outlet segments={segments.length ? segments : [HOME[role].slice(1)]} role={role} queryParams={query} />
          )}
        </main>
      </div>
      <Toaster />
      <ConfirmHost />
      <CncBotWidget />
    </div>
  );
}

function Gate() {
  const { user, checking } = useSession();
  if (checking) return <div className="demo-load"><Spinner size={20} /> Memuat sesi…</div>;
  if (!user) return <Login />;
  return <Shell key={user.id} />;
}

export default function App() {
  // halaman demo 3D tanpa login: /?demo=3d
  const demo = new URLSearchParams(window.location.search).get('demo');
  if (demo === '3d') {
    return (
      <Suspense fallback={<div className="demo-load"><Spinner size={18} /> Memuat simulator 3D…</div>}>
        <Cnc3DExample />
      </Suspense>
    );
  }
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}
