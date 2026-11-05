// =============================================================
// SiswaTasks.jsx - daftar tugas & kuis yang diterbitkan untuk rombel
// siswa, dengan status pengerjaan pribadi.
// =============================================================
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, PageHeader, Row, SearchInput, Stat, Table, Tabs,
} from '../../ui/primitives.jsx';
import { formatTanggal, hariMenua, toneNilai, useAsync } from '../../ui/hooks.jsx';

const TAB = {
  perlu: (t) => !t.punya_saya || t.punya_saya.status === 'perlu_revisi',
  jalan: (t) => t.punya_saya?.status === 'terkumpul',
  selesai: (t) => t.punya_saya?.status === 'dinilai',
  semua: () => true,
};

export default function SiswaTasks() {
  const [tab, setTab] = useState('perlu');
  const [q, setQ] = useState('');
  const daftar = useAsync(() => api('/api/tugas/saya'), []);
  const rows = daftar.data || [];

  const hitung = useMemo(() => ({
    perlu: rows.filter(TAB.perlu).length,
    jalan: rows.filter(TAB.jalan).length,
    selesai: rows.filter(TAB.selesai).length,
    semua: rows.length,
  }), [rows]);

  const tersaring = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => TAB[tab](r) && (!t || [r.judul, r.kelas_nama, r.instruksi].filter(Boolean).join(' ').toLowerCase().includes(t)));
  }, [rows, tab, q]);

  const label = (r) => {
    const p = r.punya_saya;
    if (!p) return { teks: 'Belum dikerjakan', tone: 'muted' };
    if (p.status === 'perlu_revisi') return { teks: 'Perlu revisi', tone: 'warn' };
    if (p.status === 'terkumpul') return { teks: 'Menunggu nilai', tone: 'accent' };
    return { teks: 'Sudah dinilai', tone: 'ok' };
};

  return (
    <>
      <PageHeader
        title="Tugas & kuis"
        desc="Semua penugasan yang diterbitkan guru untuk rombel Anda."
        actions={<Button variant="sec" icon="cube" onClick={() => navigate('/siswa/latihan')}>Simulator bebas</Button>}
      />

      {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}

      <div className="stats">
        <Stat icon="assignment" label="Total terbit" value={hitung.semua} />
        <Stat icon="clock" label="Perlu dikerjakan" value={hitung.perlu} tone={hitung.perlu ? 'warn' : 'ok'} />
        <Stat icon="send" label="Menunggu nilai" value={hitung.jalan} />
        <Stat icon="check-circle" label="Selesai dinilai" value={hitung.selesai} tone="ok" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'perlu', label: 'Perlu dikerjakan', icon: 'flag', count: hitung.perlu },
          { value: 'jalan', label: 'Menunggu nilai', icon: 'send', count: hitung.jalan },
          { value: 'selesai', label: 'Selesai', icon: 'check-circle', count: hitung.selesai },
          { value: 'semua', label: 'Semua', icon: 'layers', count: hitung.semua },
        ]}
      />

      <Card
        title={`${tersaring.length} penugasan`}
        icon="assignment"
        actions={<SearchInput value={q} onChange={setQ} placeholder="cari judul atau instruksi" />}
      >
        {tersaring.length === 0 && !daftar.loading ? (
          <EmptyState
            icon="check-circle"
            title={rows.length ? 'Tidak ada penugasan pada tab ini.' : 'Belum ada tugas untuk rombel Anda.'}
            desc={rows.length ? 'Pindah tab untuk melihat penugasan lain.' : 'Biasanya guru menerbitkan tugas praktik G-Code lebih dulu.'}
          />
        ) : (
          <Table
            loading={daftar.loading && !daftar.data}
            rows={tersaring}
            rowKey="id"
            onRow={(r) => navigate('/siswa/tugas/' + r.id)}
            columns={[
              {
                key: 'judul',
                header: 'Penugasan',
                render: (r) => (
                  <div>
                    <b>{r.judul}</b>
                    <div className="dim" style={{ fontSize: 11.5 }}>
                      {r.kelas_nama} • {r.jenis === 'praktik' ? 'praktik simulator' : `kuis ${(r.soal || []).length} butir`}
                      {r.lkpd_url && ' • LKPD'}
                    </div>
                  </div>
                ),
              },
              { key: 'jenis', header: 'Bentuk', render: (r) => <Badge tone="muted" icon={r.jenis === 'praktik' ? 'cube' : 'quiz'}>{r.jenis}</Badge> },
              {
                key: 'target',
                header: 'Target',
                render: (r) => r.jenis === 'praktik'
                  ? <span className="mono dim">Ø{r.target.target_d} x Z-{r.target.target_z}</span>
                  : <span className="dim">{(r.soal || []).length} butir</span>,
              },
              {
                key: 'tenggat',
                header: 'Tenggat',
                render: (r) => (r.tenggat
                  ? <span className={hariMenua(r.tenggat) === 'terlambat' ? 'err' : 'dim'}>
                    {formatTanggal(r.tenggat, { waktu: false })}
                    <div style={{ fontSize: 11 }}>{hariMenua(r.tenggat) || ''}</div>
                  </span>
                  : <span className="dim">tanpa batas</span>),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => {
                  const l = label(r);
                  return <Badge tone={l.tone}>{l.teks}</Badge>;
                },
              },
              {
                key: 'skor',
                header: 'Skor saya',
                align: 'center',
                render: (r) => (r.punya_saya?.skor_simulasi == null
                  ? <span className="dim">-</span>
                  : <Badge tone={toneNilai(r.punya_saya.skor_simulasi, r.batas_lulus)}>{r.punya_saya.skor_simulasi}</Badge>),
              },
              {
                key: 'aksi',
                header: '',
                align: 'right',
                render: (r) => (
                  <Row gap={4}>
                    {r.punya_saya?.catatan_guru && <Icon name="alert" size={15} className="amber" title="Ada catatan guru" />}
                    <Button
                      size="sm"
                      variant={TAB.perlu(r) ? 'primary' : 'sec'}
                      icon={TAB.perlu(r) ? 'play' : 'eye'}
                      onClick={(e) => { e.stopPropagation(); navigate('/siswa/tugas/' + r.id); }}
                    >
                      {TAB.perlu(r) ? (r.punya_saya ? 'Revisi' : 'Kerjakan') : 'Buka'}
                    </Button>
                  </Row>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
