// =============================================================
// SiswaHome.jsx - beranda siswa: ringkasan tugas, tenggat terdekat,
// dan jalan pintas ke simulator.
// =============================================================
import { useMemo } from 'react';
import { api } from '../../api';
import { Link, navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Grid, PageHeader, Row, Stat, Table,
} from '../../ui/primitives.jsx';
import { formatTanggal, hariMenua, toneNilai, useAsync } from '../../ui/hooks.jsx';

const STATUS_LABEL = {
  belum: 'Belum dikerjakan',
  terkumpul: 'Menunggu penilaian',
  dinilai: 'Sudah dinilai',
  perlu_revisi: 'Perlu revisi',
};

export default function SiswaHome() {
  const stats = useAsync(() => api('/api/stats/siswa'), []);
  const daftar = useAsync(() => api('/api/tugas/saya'), []);
  const kelas = useAsync(() => api('/api/kelas'), []);

  const rows = daftar.data || [];
  const perlu = useMemo(() => rows.filter((t) => !t.punya_saya || t.punya_saya.status === 'perlu_revisi'), [rows]);
  const berjalan = useMemo(() => rows.filter((t) => t.punya_saya && t.punya_saya.status === 'terkumpul'), [rows]);

  const s = stats.data || {};

  return (
    <>
      <PageHeader
        title="Beranda belajar"
        desc="Kerjakan tugas, jalankan simulator, lalu kirim hasilnya ke guru untuk dinilai."
        actions={<>
          <Button variant="sec" icon="cube" onClick={() => navigate('/siswa/latihan')}>Simulator bebas</Button>
          <Button icon="assignment" onClick={() => navigate('/siswa/tugas')}>Tugas & kuis</Button>
        </>}
      />

      {daftar.error && <Alert tone="danger" title="Gagal memuat tugas">{daftar.error}</Alert>}

      <div className="stats">
        <Stat icon="assignment" label="Tugas terbit" value={s.tugas_aktif ?? '-'} />
        <Stat icon="clock" label="Perlu dikerjakan" value={s.perlu_dikerjakan ?? '-'} tone={s.perlu_dikerjakan ? 'warn' : 'ok'} />
        <Stat icon="chart" label="Rata nilai saya" value={s.rata_nilai ?? '-'} tone={toneNilai(s.rata_nilai)} />
        <Stat icon="check-circle" label="Lulus batas" value={`${s.tuntas ?? 0}/${s.total ?? 0}`} tone="ok" />
      </div>

      <Grid cols={2} min={420}>
        <Card
          title="Perlu dikerjakan"
          icon="flag"
          subtitle={`${perlu.length} tugas belum terkumpul atau diminta revisi.`}
        >
          {perlu.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title="Semua tugas sudah terkumpul"
              desc="Gunakan waktu luang untuk berlatih di simulator bebas."
              action={<Button variant="sec" icon="cube" onClick={() => navigate('/siswa/latihan')}>Buka simulator</Button>}
            />
          ) : (
            <Table
              rows={perlu.slice(0, 6)}
              rowKey="id"
              onRow={(t) => navigate('/siswa/tugas/' + t.id)}
              columns={[
                {
                  key: 'judul',
                  header: 'Penugasan',
                  render: (t) => (
                    <div>
                      <b>{t.judul}</b>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {t.kelas_nama} • {t.jenis === 'praktik' ? 'praktik G-Code' : `kuis ${(t.soal || []).length} butir`}
                        {t.punya_saya?.status === 'perlu_revisi' && <span className="err"> • revisi guru</span>}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'tenggat',
                  header: 'Tenggat',
                  render: (t) => (t.tenggat
                    ? <Badge tone={hariMenua(t.tenggat) === 'terlambat' ? 'danger' : 'warn'} icon="clock">{hariMenua(t.tenggat) || formatTanggal(t.tenggat, { waktu: false })}</Badge>
                    : <span className="dim">tanpa batas</span>),
                },
                {
                  key: 'aksi',
                  header: '',
                  align: 'right',
                  render: (t) => (
                    <Button
                      size="sm"
                      icon="play"
                      onClick={(e) => { e.stopPropagation(); navigate('/siswa/tugas/' + t.id); }}
                    >
                      {t.punya_saya?.status === 'perlu_revisi' ? 'Revisi' : 'Kerjakan'}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Card title="Tenggat terdekat" icon="calendar" subtitle="Kurang dari tiga hari lagi.">
          {(s.tenggat_dekat || []).length === 0 ? (
            <p className="dim">Tidak ada tenggat mendesak. Kerja terhitung rapi.</p>
          ) : (
            <div className="list">
              {s.tenggat_dekat.map((t) => (
                <Link className="list__item" key={t.id} to={`/siswa/tugas/${t.id}`}>
                  <Icon name="clock" size={17} />
                  <div className="list__main">
                    <b>{t.judul}</b>
                    <div className="dim">{t.kelas_nama} • {formatTanggal(t.tenggat)}</div>
                  </div>
                  <Badge tone={hariMenua(t.tenggat) === 'terlambat' ? 'danger' : 'warn'}>{hariMenua(t.tenggat) || 'segera'}</Badge>
                </Link>
              ))}
            </div>
          )}

          <div className="kv" style={{ marginTop: 12 }}>
            <span>Terkumpul, menunggu nilai</span><b>{berjalan.length}</b>
            <span>Rombel diikuti</span><b>{(kelas.data || []).length}</b>
          </div>
        </Card>
      </Grid>

      <Grid cols={2} min={420}>
        <Card
          title="Rombel saya"
          icon="class"
          actions={<Link className="btn btn--sec btn--sm" to="/siswa/kelas"><Icon name="chevron-right" size={14} />Kelola</Link>}
        >
          {(kelas.data || []).length === 0 ? (
            <EmptyState
              icon="class"
              title="Belum bergabung dengan rombel"
              desc="Masukkan kode undangan dari guru agar tugas dan materi muncul di sini."
              action={<Button icon="plus" onClick={() => navigate('/siswa/kelas')}>Gabung rombel</Button>}
            />
          ) : (
            <div className="list">
              {(kelas.data || []).map((k) => (
                <div className="list__item" key={k.id}>
                  <Icon name="class" size={17} />
                  <div className="list__main">
                    <b>{k.nama}</b>
                    <div className="dim">{k.kompetensi || 'program keahlian'} • {k.jumlah_siswa} siswa • {k.jumlah_tugas} tugas</div>
                  </div>
                  <Link className="btn btn--sec btn--sm" to={`/siswa/materi?kelas=${k.id}`}>Materi</Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Latihan mandiri"
          icon="cube"
          subtitle="Simulator bebas tidak mengirim apa pun ke guru; pakai untuk bereksperimen."
        >
          <div className="belajar-grid">
            <Link className="belajar-kartu" to="/siswa/latihan">
              <Icon name="cube" size={22} />
              <b>Simulator bebas</b>
              <span className="dim">Pilih modul berjenjang atau mulai dari program contoh.</span>
            </Link>
            <Link className="belajar-kartu" to="/siswa/program">
              <Icon name="code" size={22} />
              <b>Program saya</b>
              <span className="dim">Simpan versi G-Code dengan nama program, muat kapan saja.</span>
            </Link>
            <Link className="belajar-kartu" to="/siswa/materi">
              <Icon name="book" size={22} />
              <b>Materi ajar</b>
              <span className="dim">Bacaan, video, dan PDF dari guru tiap rombel.</span>
            </Link>
            <Link className="belajar-kartu" to="/siswa/nilai">
              <Icon name="chart" size={22} />
              <b>Rekap nilai</b>
              <span className="dim">Nilai akhir per tugas, rata-rata per rombel, catatan guru.</span>
            </Link>
          </div>
          <Row className="catatan">
            <Icon name="info" size={14} />
            <span className="dim">Siklus animasi menampilkan pintu kaca tertutup, coolant, dan benda kerja yang terpotong sesuai langkah G-Code Anda.</span>
          </Row>
        </Card>
      </Grid>

      <Card title="Status pengerjaan" icon="layers">
        {rows.length === 0 ? (
          <p className="dim">Guru belum menerbitkan tugas untuk rombel Anda.</p>
        ) : (
          <Table
            rows={rows}
            rowKey="id"
            onRow={(t) => navigate('/siswa/tugas/' + t.id)}
            columns={[
              { key: 'judul', header: 'Penugasan', render: (t) => <b>{t.judul}</b> },
              { key: 'kelas', header: 'Rombel', render: (t) => <span className="dim">{t.kelas_nama}</span> },
              { key: 'jenis', header: 'Jenis', render: (t) => <Badge tone="muted" icon={t.jenis === 'praktik' ? 'cube' : 'quiz'}>{t.jenis}</Badge> },
              {
                key: 'status',
                header: 'Status saya',
                render: (t) => {
                  const p = t.punya_saya;
                  const tone = !p ? 'muted' : p.status === 'dinilai' ? 'ok' : p.status === 'perlu_revisi' ? 'warn' : 'accent';
                  return <Badge tone={tone}>{STATUS_LABEL[p?.status || 'belum']}</Badge>;
                },
              },
              {
                key: 'nilai',
                header: 'Skor',
                align: 'center',
                render: (t) => (t.punya_saya?.skor_simulasi == null
                  ? <span className="dim">-</span>
                  : <Badge tone={toneNilai(t.punya_saya.skor_simulasi, t.batas_lulus)}>{t.punya_saya.skor_simulasi}</Badge>),
              },
              { key: 'tenggat', header: 'Tenggat', render: (t) => <span className="dim">{t.tenggat ? formatTanggal(t.tenggat, { waktu: false }) : 'tanpa batas'}</span> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
