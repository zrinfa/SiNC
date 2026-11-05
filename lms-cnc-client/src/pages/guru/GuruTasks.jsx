// =============================================================
// GuruTasks.jsx - seluruh tugas & kuis milik guru, lintas rombel.
// =============================================================
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, IconButton, PageHeader, Row,
  SearchInput, Select, Stat, Table, Tabs, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, hariMenua, toneNilai, useAsync } from '../../ui/hooks.jsx';

export default function GuruTasks() {
  const [tab, setTab] = useState('aktif');
  const [kelasId, setKelasId] = useState('');
  const [q, setQ] = useState('');
  const kelas = useAsync(() => api('/api/kelas'), []);
  const daftar = useAsync(() => api('/api/tugas' + (kelasId ? '?kelas_id=' + kelasId : '')), [kelasId]);
  const rows = daftar.data || [];

  const tersaring = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (t && ![r.judul, r.kelas_nama, r.instruksi].filter(Boolean).join(' ').toLowerCase().includes(t)) return false;
      if (tab === 'aktif') return r.status === 'terbit';
      if (tab === 'draf') return r.status === 'draf';
      if (tab === 'nilai') return r.perlu_dinilai === undefined ? r.jumlah_kumpul > r.jumlah_dinilai : r.status === 'terbit' && r.jumlah_kumpul > r.jumlah_dinilai;
      return true;
    });
  }, [rows, q, tab]);

  const hitung = useMemo(() => ({
    terbit: rows.filter((r) => r.status === 'terbit').length,
    draf: rows.filter((r) => r.status === 'draf').length,
    nilai: rows.filter((r) => r.jumlah_kumpul > r.jumlah_dinilai).length,
  }), [rows]);

  const ubahStatus = async (t) => {
    const status = t.status === 'terbit' ? 'draf' : 'terbit';
    try {
      await api(`/api/tugas/${t.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      toast(status === 'terbit' ? `Tugas ${t.judul} terbit.` : `Tugas ${t.judul} dikembalikan ke draf.`);
      daftar.reload();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const hapus = async (t) => {
    const ok = await askConfirm({
      title: 'Hapus tugas',
      message: `Tugas "${t.judul}" pada ${t.kelas_nama} beserta pengumpulan dan nilainya dihapus permanen.`,
      confirmLabel: 'Hapus tugas',
    });
    if (!ok) return;
    try { await api('/api/tugas/' + t.id, { method: 'DELETE' }); toast('Tugas dihapus.'); daftar.reload(); }
    catch (e) { toast(e.message, 'danger'); }
  };

  return (
    <>
      <PageHeader
        title="Tugas & kuis"
        desc="Seluruh penugasan lintas rombel. Terbitkan bila siap dikerjakan siswa."
        actions={<>
          <Button icon="quiz" variant="sec" onClick={() => navigate('/guru/tugas/baru?jenis=kuis')}>Susun kuis</Button>
          <Button icon="plus" onClick={() => navigate('/guru/tugas/baru')}>Tugas praktik</Button>
        </>}
      />

      <div className="stats">
        <Stat icon="assignment" label="Total penugasan" value={rows.length} />
        <Stat icon="check-circle" label="Terbit" value={hitung.terbit} tone="ok" />
        <Stat icon="edit" label="Draf" value={hitung.draf} />
        <Stat icon="alert" label="Perlu dinilai" value={hitung.nilai} tone={hitung.nilai ? 'warn' : 'ok'} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'aktif', label: 'Terbit', icon: 'flag', count: hitung.terbit },
          { value: 'nilai', label: 'Menunggu nilai', icon: 'edit', count: hitung.nilai },
          { value: 'draf', label: 'Draf', icon: 'file', count: hitung.draf },
          { value: 'semua', label: 'Semua', icon: 'layers' },
        ]}
      />

      <Card
        title={`${tersaring.length} penugasan`}
        icon="assignment"
        bodyClass="u-row"
        actions={<>
          <SearchInput value={q} onChange={setQ} placeholder="cari judul atau rombel" />
          <Select className="input" style={{ width: 200 }} value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
            <option value="">Semua rombel</option>
            {(kelas.data || []).map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </Select>
        </>}
      >
        {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}
        {tersaring.length === 0 && !daftar.loading ? (
          <EmptyState
            icon="assignment"
            title={rows.length ? 'Tidak ada penugasan pada penyaring ini.' : 'Belum ada tugas.'}
            desc={rows.length ? 'Ubah tab atau pilih rombel lain.' : 'Mulai dengan tugas praktik G-Code agar siswa dapat langsung memakai simulator.'}
            action={!rows.length && <Button icon="plus" onClick={() => navigate('/guru/tugas/baru')}>Buat tugas pertama</Button>}
          />
        ) : (
          <Table
            loading={daftar.loading && !daftar.data}
            rows={tersaring}
            onRow={(t) => navigate('/guru/tugas/' + t.id)}
            columns={[
              {
                key: 'judul',
                header: 'Penugasan',
                render: (t) => (
                  <div>
                    <b>{t.judul}</b>
                    <div className="dim" style={{ fontSize: 11.5 }}>{t.kelas_nama} • {t.jenis === 'praktik' ? 'simulator G-Code' : `${(t.soal || []).length} butir`}</div>
                  </div>
                ),
              },
              { key: 'status', header: 'Status', render: (t) => <Badge tone={t.status === 'terbit' ? 'ok' : 'muted'}>{t.status}</Badge> },
              { key: 'poin', header: 'Poin', align: 'center', render: (t) => <span className="mono">{t.poin}</span> },
              { key: 'batas', header: 'Batas lulus', align: 'center', render: (t) => <span className="mono">{t.batas_lulus}</span> },
              {
                key: 'tenggat',
                header: 'Tenggat',
                render: (t) => t.tenggat
                  ? <span className={hariMenua(t.tenggat) === 'terlambat' ? 'err' : 'dim'}>{formatTanggal(t.tenggat)}<div style={{ fontSize: 11 }}>{hariMenua(t.tenggat) || ''}</div></span>
                  : <span className="dim">tanpa batas</span>,
              },
              {
                key: 'kumpul',
                header: 'Pengumpulan',
                align: 'center',
                render: (t) => (
                  <span className="u-row" style={{ gap: 6, justifyContent: 'center' }}>
                    <b className="mono">{t.jumlah_kumpul}</b>
                    <span className="dim">dari {t.jumlah_siswa}</span>
                    {t.jumlah_kumpul > t.jumlah_dinilai && <Badge tone="warn">{t.jumlah_kumpul - t.jumlah_dinilai} belum dinilai</Badge>}
                  </span>
                ),
              },
              { key: 'skor', header: 'Rata', align: 'center', render: (t) => <Badge tone={toneNilai(t.skor_rata, t.batas_lulus)}>{t.skor_rata ?? '-'}</Badge> },
              {
                key: 'aksi',
                header: 'Aksi',
                align: 'right',
                render: (t) => (
                  <Row gap={3}>
                    <IconButton
                      name={t.status === 'terbit' ? 'eye-off' : 'flag'}
                      title={t.status === 'terbit' ? 'Tarik ke draf' : 'Terbitkan'}
                      size="sm"
                      variant="sec"
                      onClick={(e) => { e.stopPropagation(); ubahStatus(t); }}
                    />
                    <IconButton name="edit" title="Sunting" size="sm" variant="sec" onClick={(e) => { e.stopPropagation(); navigate('/guru/tugas/' + t.id + '/sunting'); }} />
                    <IconButton name="chart" title="Lihat hasil" size="sm" variant="sec" onClick={(e) => { e.stopPropagation(); navigate('/guru/tugas/' + t.id); }} />
                    <IconButton name="trash" title="Hapus" size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); hapus(t); }} />
                  </Row>
                ),
              },
            ]}
          />
        )}
        <p className="dim" style={{ marginTop: 10 }}>
          <Icon name="info" size={13} /> Tugas draf tidak tampil kepada siswa. Nilai akhir memakai skala 100;
          poin tugas hanya dipakai sebagai pembagi nilai guru.
        </p>
      </Card>
    </>
  );
}
