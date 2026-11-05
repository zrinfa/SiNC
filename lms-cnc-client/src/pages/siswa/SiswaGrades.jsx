// =============================================================
// SiswaGrades.jsx - rekap nilai siswa: nilai akhir per tugas,
// rata-rata per rombel, dan catatan guru.
// =============================================================
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { navigate } from '../../router';
import {
  Alert, Badge, Button, Card, EmptyState, Grid, PageHeader, ProgressBar, Stat, Table, Tabs,
} from '../../ui/primitives.jsx';
import { toneNilai, useAsync } from '../../ui/hooks.jsx';

const TONE = { dinilai: 'ok', terkumpul: 'accent', perlu_revisi: 'warn', belum: 'muted' };

export default function SiswaGrades() {
  const data = useAsync(() => api('/api/nilai/saya'), []);
  const [kelasId, setKelasId] = useState('');

  const baris = data.data?.nilai || [];
  const perKelas = data.data?.per_kelas || [];
  const rows = useMemo(() => (kelasId ? baris.filter((b) => b.tugas.kelas_id === kelasId) : baris), [baris, kelasId]);

  const ringkas = useMemo(() => ({
    dinilai: baris.filter((b) => b.status === 'dinilai').length,
    menunggu: baris.filter((b) => b.status === 'terkumpul').length,
    tuntas: baris.filter((b) => b.tuntas).length,
    revisi: baris.filter((b) => b.status === 'perlu_revisi').length,
  }), [baris]);

  if (data.error) return <Alert tone="danger" title="Gagal memuat nilai">{data.error}</Alert>;

  return (
    <>
      <PageHeader
        title="Nilai saya"
        desc="Nilai akhir berskala 0-100: memakai penilaian guru bila sudah ada, jika belum memakai skor simulator."
        actions={<Button variant="sec" icon="assignment" onClick={() => navigate('/siswa/tugas')}>Ke daftar tugas</Button>}
      />

      <div className="stats">
        <Stat icon="chart" label="Rata-rata saya" value={data.data?.rata_rata ?? '-'} tone={toneNilai(data.data?.rata_rata)} />
        <Stat icon="check-circle" label="Tugas tuntas" value={`${ringkas.tuntas}/${baris.length}`} tone="ok" />
        <Stat icon="edit" label="Sudah dinilai guru" value={ringkas.dinilai} />
        <Stat icon="send" label="Menunggu nilai" value={ringkas.menunggu} tone={ringkas.menunggu ? 'warn' : 'ok'} />
        <Stat icon="refresh" label="Perlu revisi" value={ringkas.revisi} tone={ringkas.revisi ? 'amber' : 'ok'} />
      </div>

      {baris.length === 0 && !data.loading ? (
        <Card title="Belum ada nilai" icon="chart">
          <EmptyState
            icon="chart"
            title="Nilai akan muncul setelah Anda mengumpulkan"
            desc="Kerjakan satu tugas praktik atau kuis, lalu kirim dari halaman tugas."
            action={<Button icon="play" onClick={() => navigate('/siswa/tugas')}>Lihat tugas</Button>}
          />
        </Card>
      ) : (
        <>
          {perKelas.length > 0 && (
            <Tabs
              value={kelasId}
              onChange={setKelasId}
              items={[
                { value: '', label: 'Semua rombel', icon: 'layers' },
                ...perKelas.map((k) => ({ value: k.kelas_id, label: k.kelas_nama, icon: 'class', count: k.jumlah })),
              ]}
            />
          )}

          {perKelas.length > 0 && (
            <Grid cols={perKelas.length > 2 ? 2 : 1} min={320}>
              {perKelas.map((k) => (
                <Card key={k.kelas_id} title={k.kelas_nama} icon="class" subtitle={`${k.jumlah} nilai tersimpan`}>
                  <ProgressBar value={k.rata} tone={toneNilai(k.rata)} label={`rata-rata ${k.rata}/100`} />
                </Card>
              ))}
            </Grid>
          )}

          <Card title={`Rincian ${rows.length} penugasan`} icon="assignment">
            <Table
              rows={rows}
              rowKey="id"
              onRow={(b) => navigate('/siswa/tugas/' + b.tugas.id)}
              columns={[
                {
                  key: 'tugas',
                  header: 'Penugasan',
                  render: (b) => (
                    <div>
                      <b>{b.tugas.judul}</b>
                      <div className="dim" style={{ fontSize: 11.5 }}>{b.tugas.kelas_nama} • {b.tugas.jenis}</div>
                    </div>
                  ),
                },
                { key: 'status', header: 'Status', render: (b) => <Badge tone={TONE[b.status]}>{b.status.replace('_', ' ')}</Badge> },
                { key: 'skor', header: 'Skor simulator', align: 'center', render: (b) => <span className="mono">{b.skor_simulasi ?? '-'}</span> },
                {
                  key: 'guru',
                  header: 'Nilai guru',
                  align: 'center',
                  render: (b) => <span className="mono">{b.nilai_guru == null ? '-' : `${b.nilai_guru}/${b.tugas.poin}`}</span>,
                },
                {
                  key: 'nilai',
                  header: 'Nilai akhir',
                  align: 'center',
                  render: (b) => (b.nilai == null
                    ? <span className="dim">-</span>
                    : <Badge tone={toneNilai(b.nilai, b.batas_lulus)}>{b.nilai}</Badge>),
                },
                {
                  key: 'tuntas',
                  header: 'Batas lulus',
                  align: 'center',
                  render: (b) => (b.nilai == null
                    ? <span className="dim">-</span>
                    : <Badge tone={b.tuntas ? 'ok' : 'danger'} icon={b.tuntas ? 'check' : 'close'}>{b.batas_lulus}</Badge>),
                },
                {
                  key: 'catatan',
                  header: 'Catatan guru',
                  render: (b) => (b.catatan_guru
                    ? <span className="dim" title={b.catatan_guru}>{b.catatan_guru.slice(0, 54)}{b.catatan_guru.length > 54 ? '…' : ''}</span>
                    : <span className="dim">-</span>),
                },
              ]}
            />
            <p className="dim" style={{ marginTop: 8 }}>
              Butir yang belum dinilai guru memakai skor simulator sebagai nilai akhir, jadi hasil berlatih langsung terlihat.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
