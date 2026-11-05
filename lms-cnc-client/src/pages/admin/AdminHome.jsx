// =============================================================
// AdminHome.jsx - rekap sekolah untuk administrator.
// =============================================================
import { api, unduhBerkas } from '../../api';
import { Link, navigate } from '../../router';
import { useSession } from '../../session';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Grid, PageHeader, ProgressBar,
  Row, Stat, Table, toast,
} from '../../ui/primitives.jsx';
import { toneNilai, useAsync } from '../../ui/hooks.jsx';

export default function AdminHome() {
  const { user } = useSession();
  const rekap = useAsync(() => api('/api/stats/sekolah'), []);
  const kelas = useAsync(() => api('/api/kelas'), []);

  if (rekap.error) return <Alert tone="danger" title="Data tidak dapat dimuat">{rekap.error}</Alert>;
  if (rekap.loading && !rekap.data) return <Card title="Memuat rekap sekolah" icon="chart"><EmptyState icon="chart" title="Menghitung statistik" desc="Menarik data pengguna, rombel, tugas dan nilai dari server." /></Card>;

  const d = rekap.data;
  const u = d.user || {};
  const perluNilai = (kelas.data || []).filter((k) => k.perlu_dinilai > 0);

  return (
    <>
      <PageHeader
        title="Rekap sekolah"
        desc={'Ringkasan seluruh rombel, akun dan hasil belajar simulator. Selamat bekerja, ' + user.nama + '.'}
        actions={<>
          <Button icon="users" variant="sec" onClick={() => navigate('/admin/pengguna')}>Kelola pengguna</Button>
          <Button icon="class" onClick={() => navigate('/admin/kelas')}>Kelola rombel</Button>
        </>}
      />

      <div className="stats">
        <Stat icon="users" label="Siswa aktif" value={u.siswa ?? 0} hint={`${u.nonaktif ?? 0} akun nonaktif`} />
        <Stat icon="graduation" label="Guru" value={u.guru ?? 0} hint={`${u.admin ?? 0} administrator`} />
        <Stat icon="class" label="Rombel" value={d.kelas ?? 0} />
        <Stat icon="assignment" label="Tugas terbit" value={d.tugas_terbit ?? 0} />
        <Stat icon="check-circle" label="Pengumpulan dinilai" value={d.pengumpulan?.dinilai ?? 0} hint={`dari ${d.pengumpulan?.total ?? 0}`} tone="ok" />
        <Stat icon="chart" label="Rata-rata sekolah" value={d.rata_nilai_sekolah ?? '-'} hint="skala 0-100" tone={toneNilai(d.rata_nilai_sekolah)} />
        <Stat icon="cube" label="Sesi simulasi" value={d.simulasi ?? 0} hint="percobaan G-Code" />
      </div>

      <Grid cols={2} min={420}>
        <Card
          title="Rombel dengan penilaian menunggu"
          icon="alert"
          subtitle="Nilai siswa yang belum diperiksa guru pengampu."
        >
          {perluNilai.length === 0 ? (
            <EmptyState icon="check-circle" title="Semua tertib" desc="Tidak ada pengumpulan yang menunggu nilai saat ini." />
          ) : (
            <div className="list">
              {perluNilai.map((k) => (
                <div className="list__item" key={k.id}>
                  <Icon name="class" size={17} />
                  <span className="list__main">
                    <b>{k.nama}</b>
                    <span className="dim">{k.guru_nama || 'tanpa pengampu'} • {k.jumlah_siswa} siswa • {k.jumlah_tugas} tugas</span>
                  </span>
                  <span className="list__side">
                    <Badge tone="warn">{k.perlu_dinilai} menunggu</Badge>
                  </span>
                  <Link className="btn-link" to={`/admin/kelas/${k.id}`}>Buka</Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Pengguna teratas" icon="spark" subtitle="Siswa dengan rata-rata nilai akhir tertinggi.">
          <Table
            columns={[
              { key: 'nama', header: 'Siswa', render: (r) => <><b>{r.nama}</b>{r.nis && <div className="dim mono">{r.nis}</div>}</> },
              { key: 'kelas', header: 'Rombel' },
              { key: 'rata_nilai', header: 'Rata', align: 'right', render: (r) => <Badge tone={toneNilai(r.rata_nilai)}>{r.rata_nilai ?? '-'}</Badge> },
            ]}
            rows={daftarTeratas(d).slice(0, 8)}
            empty="Belum ada nilai yang tersimpan."
          />
        </Card>
      </Grid>

      <Card
        title="Peringkat rombel"
        icon="chart"
        subtitle="Rata-rata nilai akhir per rombel beserta berkas CSV siap unduh."
        actions={<Button icon="download" variant="sec" size="sm" onClick={() => unduhSemua(kelas.data || [])}>Unduh semua rekap</Button>}
      >
        <Table
          columns={[
            {
              key: 'nama',
              header: 'Rombel',
              render: (r) => (
                <span className="u-row" style={{ gap: 7 }}>
                  <Link to={`/admin/kelas/${r.id}`}><b>{r.nama}</b></Link>
                  {r.kode && <span className="badge badge--muted mono">{r.kode}</span>}
                  {r.tingkat && <span className="dim">{r.tingkat}</span>}
                </span>
              ),
            },
            { key: 'guru', header: 'Pengampu', render: (r) => r.guru_nama || <span className="dim">belum ditentukan</span> },
            { key: 'siswa', header: 'Siswa', align: 'right', render: (r) => r.jumlah_siswa },
            { key: 'tugas', header: 'Tugas', align: 'right', render: (r) => r.jumlah_tugas },
            {
              key: 'progres',
              header: 'Progres penilaian',
              render: (r) => (
                <div style={{ minWidth: 130 }}>
                  <ProgressBar value={r.jumlah_tugas ? r.jumlah_tugas - r.perlu_dinilai : 0} max={r.jumlah_tugas || 1} tone={r.perlu_dinilai ? 'warn' : 'ok'} />
                  <div className="dim" style={{ fontSize: 11 }}>{r.perlu_dinilai > 0 ? `${r.perlu_dinilai} belum dinilai` : 'semua dinilai'}</div>
                </div>
              ),
            },
            {
              key: 'unduh',
              header: 'Ekspor',
              align: 'right',
              render: (r) => (
                <Row gap={4}>
                  <Button
                    size="sm"
                    variant="sec"
                    icon="download"
                    onClick={async () => {
                      try {
                        await unduhBerkas(`/api/export/nilai?kelas_id=${r.id}`, `nilai-${r.kode || r.nama}.csv`);
                        toast('Berkas CSV diunduh.');
                      } catch (e) { toast(e.message, 'danger'); }
                    }}
                  >CSV</Button>
                  <Link className="btn-link" to={`/admin/kelas/${r.id}`}><Icon name="chevron-right" size={14} />Detail</Link>
                </Row>
              ),
            },
          ]}
          rows={kelas.data || []}
          loading={kelas.loading}
          empty="Belum ada rombel. Buat lewat menu Rombel & anggota."
        />
        {(d.kelas_teratas || []).length > 0 && (
          <p className="dim" style={{ marginTop: 10 }}>
            Rombel dengan rata-rata tertinggi: <b>{d.kelas_teratas[0].nama}</b> ({d.kelas_teratas[0].rata_nilai ?? '-'} / 100).
          </p>
        )}
      </Card>
    </>
  );
}

// siswa teratas dikirim pada field siswa_teratas oleh /api/stats/sekolah.
function daftarTeratas(d) {
  return Array.isArray(d.siswa_teratas) ? d.siswa_teratas : [];
}

async function unduhSemua(rows) {
  for (const r of rows) {
    try { await unduhBerkas(`/api/export/nilai?kelas_id=${r.id}`, `nilai-${r.kode || r.nama}.csv`); } catch { /* kelas tanpa siswa dilewati */ }
  }
}
