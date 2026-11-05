// =============================================================
// ClassDetail.jsx - satu rombel: anggota, materi, tugas dan rekap nilai.
// Dipakai guru pengampu dan administrator.
// =============================================================
import { useMemo, useState } from 'react';
import { api, unduhBerkas } from '../../api';
import { navigate } from '../../router';
import { useSession } from '../../session';
import Icon from '../../ui/Icon.jsx';
import MateriPanel from './MateriPanel.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input,
  Modal, PageHeader, ProgressBar, SearchInput, Stat, Table,
  Tabs, Textarea, Toggle, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, inisial, toneNilai, useAsync } from '../../ui/hooks.jsx';
import { PasswordBox } from '../admin/AdminUsers.jsx';

export default function ClassDetail({ id }) {
  const { user } = useSession();
  const bolehTulis = user.role === 'guru' || user.role === 'admin';
  const [tab, setTab] = useState('anggota');
  const kelas = useAsync(() => api('/api/kelas/' + id), [id]);

  if (kelas.error) {
    return (
      <>
        <PageHeader title="Rombel tidak ditemukan" />
        <Alert tone="danger" title="Akses ditolak">{kelas.error}</Alert>
        <Button icon="arrow-left" variant="sec" onClick={() => navigate(user.role === 'admin' ? '/admin/kelas' : '/guru/kelas')}>Kembali ke daftar rombel</Button>
      </>
    );
  }
  if (kelas.loading && !kelas.data) return <Card title="Memuat rombel" icon="class"><EmptyState icon="class" title="Mengambil data kelas" desc="Anggota, materi dan tugas sedang dimuat." /></Card>;

  const k = kelas.data;
  const base = user.role === 'admin' ? '/admin' : '/guru';
  const ganti = async () => {
    if (!await askConfirm({ title: 'Acak kode gabung', message: 'Kode lama berhenti berlaku dan siswa harus memakai kode baru.', confirmLabel: 'Acak kode', tone: 'warn' })) return;
    try { const r = await api(`/api/kelas/${id}/kode`, { method: 'PUT' }); toast(`Kode baru: ${r.kode}`); kelas.reload(); }
    catch (e) { toast(e.message, 'danger'); }
  };

  return (
    <>
      <PageHeader
        title={k.nama}
        desc={[k.tingkat, k.kompetensi, k.tahun_ajaran].filter(Boolean).join(' • ') || 'Rombel simulator bubut CNC'}
        badge={<>
          <span className="badge badge--info mono" title="Kode gabung kelas">kode {k.kode || '-'}</span>
          <span className="badge badge--muted">{k.guru_nama ? 'pengampu ' + k.guru_nama : 'tanpa pengampu'}</span>
          {k.jumlah_siswa} siswa • {k.jumlah_tugas} tugas
        </>}
        actions={<>
          <Button icon="download" variant="sec" onClick={() => unduhCSV(k)}>Unduh rekap CSV</Button>
          {bolehTulis && <Button icon="refresh" variant="sec" onClick={ganti}>Acak kode</Button>}
          <Button icon="plus" onClick={() => navigate(`${base}/tugas/baru?kelas=${k.id}`)}>Tugas baru</Button>
        </>}
      />

      <div className="stats">
        <Stat icon="users" label="Siswa" value={k.jumlah_siswa} />
        <Stat icon="assignment" label="Tugas" value={k.jumlah_tugas} />
        <Stat icon="check-circle" label="Perlu dinilai" value={k.perlu_dinilai} tone={k.perlu_dinilai ? 'warn' : 'ok'} />
      </div>

      {k.deskripsi && <Alert tone="info" title="Deskripsi rombel">{k.deskripsi}</Alert>}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'anggota', label: 'Anggota', icon: 'users', count: k.jumlah_siswa },
          { value: 'materi', label: 'Materi ajar', icon: 'book' },
          { value: 'tugas', label: 'Tugas & kuis', icon: 'assignment', count: k.jumlah_tugas },
          { value: 'rekap', label: 'Rekap nilai', icon: 'chart' },
        ]}
      />

      {tab === 'anggota' && <TabAnggota kelas={k} reload={kelas.reload} bolehTulis={bolehTulis} />}
      {tab === 'materi' && (
        <Card title="Materi ajar" icon="book" subtitle="Bahan bacaan, berkas dan video untuk rombel ini.">
          <MateriPanel kelasId={k.id} bolehTulis={bolehTulis} />
        </Card>
      )}
      {tab === 'tugas' && <TabTugas kelas={k} reload={kelas.reload} bolehTulis={bolehTulis} base={base} />}
      {tab === 'rekap' && <TabRekap id={k.id} kelas={k} />}
    </>
  );
}

async function unduhCSV(k) {
  try {
    await unduhBerkas(`/api/export/nilai?kelas_id=${k.id}`, `nilai-${k.kode || k.nama}.csv`);
    toast('Berkas CSV diunduh.');
  } catch (e) { toast(e.message, 'danger'); }
}

/* ------------------------------- anggota ------------------------------- */
function TabAnggota({ kelas, reload, bolehTulis }) {
  const [cari, setCari] = useState(false);
  const [impor, setImpor] = useState(false);
  const [teks, setTeks] = useState('');
  const [sandi, setSandi] = useState('');
  const [hasil, setHasil] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [dipilih, setDipilih] = useState([]);
  const anggota = kelas.anggota || [];

  const calon = useAsync(
    () => (cari ? api('/api/users?role=siswa&bukan_di_kelas=' + kelas.id + (q ? '&q=' + encodeURIComponent(q) : '')) : Promise.resolve([])),
    [cari, q]
  );

  const tambah = async () => {
    if (!dipilih.length) return toast('Centang minimal satu siswa.', 'warn');
    try {
      const r = await api(`/api/kelas/${kelas.id}/anggota`, { method: 'POST', body: JSON.stringify({ user_ids: dipilih }) });
      toast(`${r.ditambah} siswa bergabung.`);
      setDipilih([]); setCari(false); setQ('');
      reload();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const prosesImpor = async () => {
    setErr(''); setHasil(null);
    if (!teks.trim()) return setErr('Tempel daftar NIS dan nama terlebih dahulu.');
    try {
      const r = await api(`/api/kelas/${kelas.id}/import`, {
        method: 'POST',
        body: JSON.stringify({ teks, password_sementara: sandi || undefined }),
      });
      setHasil(r);
      toast(`${r.dibuat.length} akun dibuat, ${r.sudah_ada} sudah terdaftar.`);
      reload();
    } catch (e) { setErr(e.message); }
  };

  const keluarkan = async (a) => {
    const ok = await askConfirm({
      title: 'Keluarkan siswa',
      message: `${a.nama} tidak lagi menjadi anggota rombel ini. Nilai yang sudah diperoleh tetap tersimpan pada akunnya.`,
      confirmLabel: 'Keluarkan',
    });
    if (!ok) return;
    try { await api(`/api/kelas/${kelas.id}/anggota/${a.user_id}`, { method: 'DELETE' }); toast('Siswa dikeluarkan.'); reload(); }
    catch (e) { toast(e.message, 'danger'); }
  };

  const salinKode = async () => {
    try { await navigator.clipboard.writeText(kelas.kode || ''); toast('Kode gabung disalin.'); }
    catch { toast('Salin kode manual: ' + kelas.kode, 'warn'); }
  };

  return (
    <>
      <Card
        title="Anggota rombel"
        icon="users"
        subtitle={`${anggota.length} siswa terdaftar. Siswa juga dapat masuk sendiri memakai kode ${kelas.kode || '-'}.`}
        bodyClass="u-row"
        actions={bolehTulis && <>
          <Button size="sm" variant="sec" icon="copy" onClick={salinKode}>Salin kode gabung</Button>
          <Button size="sm" variant="sec" icon="upload" onClick={() => { setImpor(true); setHasil(null); setErr(''); }}>Impor NIS</Button>
          <Button size="sm" icon="plus" onClick={() => setCari(true)}>Tambah siswa</Button>
        </>}
      >
        {anggota.length === 0 ? (
          <EmptyState
            icon="users"
            title="Belum ada anggota"
            desc={`Impor daftar NIS kelas atau bagikan kode ${kelas.kode || '-'} agar siswa bergabung lewat halaman Kelas saya.`}
            action={bolehTulis && <Button icon="upload" onClick={() => setImpor(true)}>Impor NIS massal</Button>}
          />
        ) : (
          <Table
            rows={anggota}
            rowKey="user_id"
            columns={[
              {
                key: 'nama',
                header: 'Siswa',
                render: (a) => (
                  <span className="u-row" style={{ gap: 8 }}>
                    <span className="user-chip__ava" style={{ width: 26, height: 26, fontSize: 11 }}>{inisial(a.nama)}</span>
                    <span><b>{a.nama}</b><div className="dim mono" style={{ fontSize: 11 }}>{a.nis || 'tanpa NIS'}</div></span>
                  </span>
                ),
              },
              bolehTulis && { key: 'email', header: 'Email', render: (a) => <span className="mono" style={{ fontSize: 12 }}>{a.email || '-'}</span> },
              bolehTulis && { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'aktif' ? 'ok' : 'danger'}>{a.status || 'aktif'}</Badge> },
              {
                key: 'terkumpul',
                header: 'Pengumpulan',
                align: 'center',
                render: (a) => (
                  <span className="u-row" style={{ gap: 6, justifyContent: 'center' }}>
                    <b className="mono">{a.terkumpul}</b>
                    <span className="dim">/ {a.jumlah_tugas} tugas</span>
                  </span>
                ),
              },
              bolehTulis && { key: 'dinilai', header: 'Dinilai', align: 'center', render: (a) => `${a.dinilai ?? 0}/${a.terkumpul ?? 0}` },
              {
                key: 'rata_nilai',
                header: 'Rata-rata',
                align: 'center',
                render: (a) => <Badge tone={toneNilai(a.rata_nilai)}>{a.rata_nilai ?? '-'}</Badge>,
              },
              bolehTulis && {
                key: 'aksi',
                header: '',
                align: 'right',
                render: (a) => <IconButton name="trash" title={`Keluarkan ${a.nama}`} size="sm" variant="danger" onClick={() => keluarkan(a)} />,
              },
            ].filter(Boolean)}
          />
        )}
      </Card>

      {/* ------- modal tambah manual ------- */}
      <Modal
        open={cari}
        title="Tambah siswa ke rombel"
        icon="plus"
        width={620}
        onClose={() => setCari(false)}
        footer={<>
          <Button variant="sec" onClick={() => setCari(false)}>Batal</Button>
          <Button icon="check" onClick={tambah}>Masukkan {dipilih.length ? `(${dipilih.length})` : ''}</Button>
        </>}
      >
        <SearchInput value={q} onChange={setQ} placeholder="cari nama, NIS atau email" className="cari-siswa" />
        {calon.error && <Alert tone="danger">{calon.error}</Alert>}
        {calon.loading && !calon.data ? <div className="demo-load"><Icon name="refresh" size={16} /> Memuat calon siswa…</div>
          : (calon.data || []).length === 0 ? <EmptyState icon="users" title="Tidak ada akun siswa di luar rombel ini" desc="Buat akun baru lewat menu Pengguna atau impor NIS." /> : (
            <div className="pilih-siswa">
              {(calon.data || []).map((s) => (
                <Toggle
                  key={s.id}
                  label={<span><b>{s.nama}</b> <span className="dim mono">{s.nis || s.email}</span></span>}
                  checked={dipilih.includes(s.id)}
                  onChange={(on) => setDipilih((prev) => (on ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                />
              ))}
            </div>
          )}
      </Modal>

      {/* ------- modal impor NIS ------- */}
      <Modal
        open={impor}
        title="Impor anggota dari daftar NIS"
        icon="upload"
        width={640}
        onClose={() => setImpor(false)}
        footer={<>
          <Button variant="sec" onClick={() => setImpor(false)}>Tutup</Button>
          <Button icon="check" onClick={prosesImpor}>Proses & tambahkan</Button>
        </>}
      >
        <Alert tone="info" title="Cara menulis baris">
          Satu siswa per baris: <span className="mono">NIS;Nama;Email</span>. Email boleh dikosongkan, sistem membuat
          <span className="mono"> nis@sekolah.id</span>. Siswa yang NIS-nya sudah punya akun langsung dimasukkan ke rombel tanpa membuat akun baru.
        </Alert>
        {!hasil && (
          <>
            <Field label="Daftar siswa" required>
              <Textarea
                rows={10}
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                placeholder={'1001;Andi Siswa;andi@murid.sch.id\n1002;Sinta Siswi\n1003;Budi Pratama'}
              />
            </Field>
            <Field label="Password bersama" hint="Kosongkan agar sistem membuat password acak untuk seluruh akun baru.">
              <Input value={sandi} onChange={(e) => setSandi(e.target.value)} placeholder="mis. smk2026" />
            </Field>
            {err && <Alert tone="danger" title="Impor gagal">{err}</Alert>}
          </>
        )}
        {hasil && (
          <>
            <Alert tone="ok" title={`${hasil.dibuat.length} akun baru dibuat, ${hasil.sudah_ada} akun lama langsung bergabung`}>
              Semua akun memakai satu password bersama. Sampaikan lalu suruh mereka menggantinya sendiri di menu Profil.
            </Alert>
            <PasswordBox password={hasil.password_sementara} />
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <Table
                rows={hasil.dibuat}
                columns={[
                  { key: 'nama', header: 'Nama' },
                  { key: 'nis', header: 'NIS', render: (u) => <span className="mono">{u.nis || '-'}</span> },
                  { key: 'email', header: 'Email', render: (u) => <span className="mono" style={{ fontSize: 12 }}>{u.email}</span> },
                ]}
              />
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/* -------------------------------- tugas -------------------------------- */
function TabTugas({ kelas, reload, bolehTulis, base }) {
  const rows = (kelas.tugas || []).filter(Boolean);
  const status = (t) => t.status === 'terbit'
    ? <Badge tone="ok">terbit</Badge>
    : <Badge tone="muted">draf</Badge>;

  return (
    <Card
      title="Tugas & kuis rombel"
      icon="assignment"
      subtitle="Tugas praktik dinilai mesin simulasi; kuis dinilai otomatis saat siswa mengirim jawaban."
      bodyClass="u-row"
      actions={bolehTulis && <>
        <Button size="sm" variant="sec" icon="quiz" onClick={() => navigate(`${base}/tugas/baru?kelas=${kelas.id}&jenis=kuis`)}>Kuis baru</Button>
        <Button size="sm" icon="plus" onClick={() => navigate(`${base}/tugas/baru?kelas=${kelas.id}`)}>Tugas praktik</Button>
      </>}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="assignment"
          title="Belum ada tugas"
          desc="Mulai dengan tugas praktik G-Code: tentukan stock, target diameter dan panjang, lalu siswa mengumpulkannya dari simulator."
          action={bolehTulis && <Button icon="plus" onClick={() => navigate(`${base}/tugas/baru?kelas=${kelas.id}`)}>Buat tugas pertama</Button>}
        />
      ) : (
        <Table
          rows={rows}
          onRow={bolehTulis ? (t) => navigate(`${base}/tugas/${t.id}`) : undefined}
          columns={[
            {
              key: 'judul',
              header: 'Judul',
              render: (t) => (
                <div>
                  <b>{t.judul}</b>
                  <div className="dim" style={{ fontSize: 11.5 }}>
                    {t.jenis === 'praktik'
                      ? `stock Ø${t.target.stock_d} L${t.target.stock_l} mm • target Ø${t.target.target_d} Z-${t.target.target_z} mm`
                      : `${(t.soal || []).length} butir soal`}
                  </div>
                </div>
              ),
            },
            { key: 'jenis', header: 'Jenis', render: (t) => <Badge tone={t.jenis === 'praktik' ? 'accent' : 'info'}>{t.jenis}</Badge> },
            { key: 'status', header: 'Status', render: status },
            { key: 'poin', header: 'Poin', align: 'center', render: (t) => `${t.poin} (lulus ${t.batas_lulus})` },
            { key: 'tenggat', header: 'Tenggat', render: (t) => (t.tenggat ? <span className="dim">{formatTanggal(t.tenggat)}</span> : <span className="dim">tanpa batas</span>) },
            bolehTulis && {
              key: 'kumpul',
              header: 'Pengumpulan',
              render: (t) => (
                <div style={{ minWidth: 120 }}>
                  <ProgressBar value={t.jumlah_kumpul} max={t.jumlah_siswa || 1} tone={t.jumlah_kumpul >= (t.jumlah_siswa || 0) ? 'ok' : 'warn'} />
                  <div className="dim" style={{ fontSize: 11 }}>{t.jumlah_kumpul}/{t.jumlah_siswa} kumpul • {t.jumlah_dinilai} dinilai</div>
                </div>
              ),
            },
            bolehTulis && { key: 'skor', header: 'Rata skor', align: 'center', render: (t) => <Badge tone={toneNilai(t.skor_rata, t.batas_lulus)}>{t.skor_rata ?? '-'}</Badge> },
            bolehTulis && {
              key: 'aksi',
              header: '',
              align: 'right',
              render: (t) => <IconButton name="chevron-right" title="Buka tugas" size="sm" variant="sec" onClick={(e) => { e.stopPropagation(); navigate(`${base}/tugas/${t.id}`); }} />,
            },
          ].filter(Boolean)}
        />
      )}
      {rows.length > 0 && !bolehTulis && (
        <p className="dim" style={{ marginTop: 10 }}>Siswa mengerjakan tugas dari menu Tugas &amp; kuis pada bilah kiri.</p>
      )}
    </Card>
  );
}

/* -------------------------------- rekap -------------------------------- */
function TabRekap({ id, kelas }) {
  const rekap = useAsync(() => api(`/api/kelas/${id}/rekap`), [id]);
  const rows = rekap.data?.baris || [];
  const tugas = rekap.data?.tugas || [];

  const isi = useMemo(() => {
    const terisi = rows.filter((r) => r.rata_nilai != null).length;
    return { terisi, rata: rows.length ? Math.round(rows.reduce((a, r) => a + (r.rata_nilai || 0), 0) / rows.length) : null };
  }, [rows]);

  return (
    <Card
      title="Rekap nilai rombel"
      icon="chart"
      subtitle="Nilia akhir tiap tugas pada skala 100. Nilai guru dinormalkan dari skala poin tugas."
      bodyClass="u-row"
      actions={<Button size="sm" variant="sec" icon="download" onClick={() => unduhCSV(kelas)}>Unduh CSV</Button>}
    >
      {rekap.error && <Alert tone="danger" title="Gagal memuat rekap">{rekap.error}</Alert>}
      {rekap.loading && !rekap.data ? <EmptyState icon="chart" title="Menghitung rekap" /> : rows.length === 0 ? (
        <EmptyState icon="users" title="Belum ada siswa" desc="Tambahkan anggota terlebih dahulu." />
      ) : (
        <>
          <div className="stats">
            <Stat icon="users" label="Siswa dinilai" value={`${isi.terisi}/${rows.length}`} />
            <Stat icon="chart" label="Rata-rata rombel" value={isi.rata ?? '-'} tone={toneNilai(isi.rata)} />
            <Stat icon="assignment" label="Tugas" value={tugas.length} />
          </div>
          <div className="table-wrap rekap-scroll">
            <table className="table table--tight">
              <thead>
                <tr>
                  <th className="rekap-sticky">Siswa</th>
                  {tugas.map((t) => (
                    <th key={t.id} title={`${t.judul} • ${t.jenis}`} className="rekap-kol">
                      <span>{t.judul}</span>
                      <em className="dim">poin {t.poin}</em>
                    </th>
                  ))}
                  <th className="ta-c">Rata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.siswa.id}>
                    <td className="rekap-sticky">
                      <b>{r.siswa.nama}</b>
                      <div className="dim mono" style={{ fontSize: 11 }}>{r.siswa.nis || '-'}</div>
                    </td>
                    {tugas.map((t) => {
                      const v = r.nilai?.[t.id];
                      return (
                        <td key={t.id} className="ta-c">
                          {v == null ? <span className="dim">-</span> : <Badge tone={toneNilai(v, t.batas_lulus)}>{v}</Badge>}
                        </td>
                      );
                    })}
                    <td className="ta-c"><b className="mono">{r.rata_nilai ?? '-'}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim" style={{ marginTop: 10 }}>
            <Icon name="info" size={13} /> Tanda hubung berarti siswa belum mengumpulkan atau nilai belum diberikan.
            Kolom mengikuti urutan tugas pada rombel.
          </p>
        </>
      )}
    </Card>
  );
}

export { TabRekap };
