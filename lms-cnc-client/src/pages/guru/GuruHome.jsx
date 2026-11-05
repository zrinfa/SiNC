// =============================================================
// GuruHome.jsx - beranda guru: antrian penilaian, rombel binaan,
// siswa terbaik dan jalan pintas membuat tugas.
// =============================================================
import { api } from '../../api';
import { Link, navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Grid, PageHeader, ProgressBar,
  Row, Stat, Table,
} from '../../ui/primitives.jsx';
import { hariMenua, toneNilai, useAsync } from '../../ui/hooks.jsx';

export default function GuruHome() {
  const s = useAsync(() => api('/api/stats/guru'), []);
  const tugas = useAsync(() => api('/api/tugas'), []);

  if (s.error) return <Alert tone="danger" title="Gagal memuat beranda">{s.error}</Alert>;
  const d = s.data || {};
  const kelasList = d.kelas_list || [];
  const perluNilai = kelasList.filter((k) => k.perlu_dinilai > 0);
  const baru = (tugas.data || []).filter((t) => t.status === 'terbit' && t.tenggat);

  return (
    <>
      <PageHeader
        title="Beranda guru"
        desc="Pantau rombel binaan, nilai pengumpulan yang menunggu, dan susun tugas berikutnya."
        actions={<>
          <Button icon="class" variant="sec" onClick={() => navigate('/guru/kelas')}>Kelola rombel</Button>
          <Button icon="plus" onClick={() => navigate('/guru/tugas/baru')}>Tugas baru</Button>
        </>}
      />

      <div className="stats">
        <Stat icon="class" label="Rombel" value={d.kelas ?? 0} />
        <Stat icon="users" label="Siswa binaan" value={d.siswa ?? 0} />
        <Stat icon="assignment" label="Tugas terbit" value={d.tugas_terbit ?? 0} />
        <Stat icon="alert" label="Menunggu dinilai" value={d.menunggu_dinilai ?? 0} tone={d.menunggu_dinilai ? 'warn' : 'ok'} />
        <Stat icon="chart" label="Rata-rata nilai" value={d.rata_nilai ?? '-'} hint="skala 100" tone={toneNilai(d.rata_nilai)} />
      </div>

      <Grid cols={2} min={420}>
        <Card
          title="Menunggu penilaian"
          icon="edit"
          subtitle="Pengumpulan siswa yang belum diberi nilai akhir."
        >
          {perluNilai.length === 0 ? (
            <EmptyState icon="check-circle" title="Semua nilai tertata" desc="Tidak ada pengumpulan yang menunggu pemeriksaan." action={<Button variant="sec" icon="assignment" onClick={() => navigate('/guru/tugas')}>Lihat semua tugas</Button>} />
          ) : (
            <div className="list">
              {perluNilai.map((k) => (
                <div className="list__item" key={k.id}>
                  <Icon name="class" size={17} />
                  <span className="list__main">
                    <b>{k.nama}</b>
                    <span className="dim">{k.jumlah_siswa} siswa • {k.jumlah_tugas} tugas</span>
                  </span>
                  <Badge tone="warn">{k.perlu_dinilai} menunggu</Badge>
                  <Link className="btn-link" to={`/guru/kelas/${k.id}`}>Buka rombel</Link>
                </div>
              ))}
              <Button variant="sec" icon="assignment" onClick={() => navigate('/guru/tugas')}>Nilai lewat daftar tugas</Button>
            </div>
          )}
        </Card>

        <Card title="Siswa terbaik" icon="spark" subtitle="Rata-rata nilai akhir tertinggi di seluruh rombel binaan.">
          <Table
            loading={s.loading && !s.data}
            rows={d.teratas || []}
            empty="Belum ada nilai tersimpan. Terbitkan tugas lebih dulu."
            columns={[
              { key: 'nama', header: 'Siswa', render: (r) => <><b>{r.nama}</b>{r.nis && <div className="dim mono" style={{ fontSize: 11 }}>{r.nis}</div>}</> },
              { key: 'kelas', header: 'Rombel' },
              { key: 'rata_nilai', header: 'Rata', align: 'right', render: (r) => <Badge tone={toneNilai(r.rata_nilai)}>{r.rata_nilai ?? '-'}</Badge> },
            ]}
          />
        </Card>
      </Grid>

      <Card
        title="Progres rombel binaan"
        icon="chart"
        subtitle="Seberapa banyak tugas yang sudah dikumpulkan dan dinilai pada tiap kelas."
      >
        {kelasList.length === 0 ? (
          <EmptyState icon="class" title="Belum punya rombel" desc="Buat rombel lalu impor daftar NIS siswa." action={<Button icon="plus" onClick={() => navigate('/guru/kelas')}>Buat rombel</Button>} />
        ) : (
          <div className="list">
            {kelasList.map((k) => (
              <div className="list__item" key={k.id}>
                <div className="list__main">
                  <b>{k.nama}</b>
                  <div className="dim" style={{ fontSize: 11.5 }}>
                    <span className="mono">{k.kode}</span> • {k.jumlah_siswa} siswa • {k.jumlah_tugas} tugas
                    {k.perlu_dinilai > 0 && <Badge tone="warn">{k.perlu_dinilai} belum dinilai</Badge>}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <ProgressBar
                      value={k.jumlah_tugas - Math.min(k.jumlah_tugas, k.perlu_dinilai)}
                      max={k.jumlah_tugas || 1}
                      tone={k.perlu_dinilai ? 'warn' : 'ok'}
                    />
                  </div>
                </div>
                <Row gap={5}>
                  <Link className="btn-link" to={`/guru/kelas/${k.id}`}><Icon name="chevron-right" size={14} />Kelola</Link>
                </Row>
              </div>
            ))}
          </div>
        )}
      </Card>

      {baru.length > 0 && (
        <Card title="Tenggat terdekat" icon="clock" subtitle="Sepuluh tugas terbit yang paling cepat berakhir.">
          <Table
            rows={baru.slice(0, 10)}
            onRow={(t) => navigate('/guru/tugas/' + t.id)}
            columns={[
              { key: 'judul', header: 'Tugas', render: (t) => <b>{t.judul}</b> },
              { key: 'kelas_nama', header: 'Rombel' },
              { key: 'jenis', header: 'Jenis', render: (t) => <Badge tone={t.jenis === 'praktik' ? 'accent' : 'info'}>{t.jenis}</Badge> },
              { key: 'tenggat', header: 'Tenggat', render: (t) => <span className={hariMenua(t.tenggat) === 'terlambat' ? 'err' : 'dim'}>{hariMenua(t.tenggat) || 'lebih dari sepekan'}</span> },
              { key: 'kumpul', header: 'Pengumpulan', align: 'center', render: (t) => `${t.jumlah_kumpul}/${t.jumlah_siswa}` },
            ]}
          />
        </Card>
      )}
    </>
  );
}
