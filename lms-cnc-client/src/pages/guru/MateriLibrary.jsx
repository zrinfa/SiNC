// =============================================================
// MateriLibrary.jsx - Materi ajar lintas rombel untuk guru.
// =============================================================
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { navigate } from '../../router';
import MateriPanel from '../shared/MateriPanel.jsx';
import {
  Alert, Button, Card, EmptyState, PageHeader, Row, Select, Stat,
} from '../../ui/primitives.jsx';
import { useAsync } from '../../ui/hooks.jsx';

export default function MateriLibrary({ kelasId }) {
  const kelas = useAsync(() => api('/api/kelas'), []);
  const [aktif, setAktif] = useState(kelasId || '');

  useEffect(() => {
    if (kelasId) { setAktif(kelasId); return; }
    if (!aktif && (kelas.data || []).length) setAktif(kelas.data[0].id);
  }, [kelasId, kelas.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = kelas.data || [];
  const pilih = list.find((k) => k.id === aktif);

  return (
    <>
      <PageHeader
        title="Materi ajar"
        desc="Bahan bacaan, berkas PDF, video dan tautan yang dibagikan ke satu rombel."
        actions={pilih && <Button variant="sec" icon="class" onClick={() => navigate('/guru/kelas/' + pilih.id)}>Buka detail rombel</Button>}
      />

      {kelas.error && <Alert tone="danger" title="Gagal memuat rombel">{kelas.error}</Alert>}
      {list.length === 0 && !kelas.loading ? (
        <EmptyState
          icon="class"
          title="Belum ada rombel"
          desc="Materi selalu menempel pada satu rombel. Buat rombel lebih dulu."
          action={<Button icon="plus" onClick={() => navigate('/guru/kelas')}>Buat rombel</Button>}
        />
      ) : (
        <Card
          title={pilih ? `Materi rombel ${pilih.nama}` : 'Pilih rombel'}
          icon="book"
          subtitle={pilih ? `Kode gabung ${pilih.kode || '-'} • ${pilih.jumlah_siswa} siswa` : undefined}
          bodyClass="u-row"
          actions={
            <Select className="input" style={{ width: 240 }} value={aktif} onChange={(e) => { setAktif(e.target.value); navigate('/guru/materi?kelas=' + e.target.value); }}>
              {list.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </Select>
          }
        >
          {pilih && <MateriPanel kelasId={pilih.id} bolehTulis />}
          <Row gap={10}>
            <Stat icon="book" label="Jumlah materi" value={pilih ? 'lihat daftar' : 0} />
            <Stat icon="users" label="Siswa menerima" value={pilih?.jumlah_siswa ?? 0} />
          </Row>
        </Card>
      )}
    </>
  );
}
