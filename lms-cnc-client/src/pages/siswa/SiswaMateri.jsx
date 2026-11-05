// =============================================================
// SiswaMateri.jsx — bacaan belajar siswa: pilih rombel, tampilkan
// materi yang guru unggah, dan tautan ke tugas pada rombel yang sama.
// =============================================================
import { useMemo, useState } from 'react';
import { api } from '../../api';
import { Link } from '../../router';
import { MateriReadonly } from '../shared/MateriPanel.jsx';
import Icon from '../../ui/Icon.jsx';
import {
  Badge, Card, EmptyState, PageHeader, Row, Select, Stat,
} from '../../ui/primitives.jsx';
import { formatTanggal, useAsync } from '../../ui/hooks.jsx';

export default function SiswaMateri({ kelasId }) {
  const kelas = useAsync(() => api('/api/kelas'), []);
  const tugas = useAsync(() => api('/api/tugas/saya'), []);
  const [pilih, setPilih] = useState(kelasId || '');

  const daftar = kelas.data || [];
  const aktif = useMemo(
    () => daftar.find((k) => String(k.id) === String(pilih)) || daftar[0] || null,
    [daftar, pilih]
  );

  const tugasKelas = useMemo(() => {
    if (!aktif) return [];
    return (tugas.data || []).filter((t) => String(t.kelas_id) === String(aktif.id));
  }, [tugas.data, aktif]);

  if (!kelas.loading && daftar.length === 0) {
    return (
      <>
        <PageHeader title="Materi ajar" desc="Bahan bacaan dari guru sebelum mengerjakan tugas praktik." />
        <EmptyState
          icon="class"
          title="Anda belum bergabung rombel"
          desc="Materi selalu menempel pada satu rombel. Masuk dulu dengan kode dari guru."
          action={<Link className="btn btn--primary" to="/siswa/kelas">Gabung rombel</Link>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Materi ajar"
        desc="Baca dulu materi, baru susun program G-Code di simulator. Berkas PDF dan video terbuka di tab baru."
      />

      {daftar.length > 1 && (
        <Row gap={8} style={{ marginBottom: 12 }}>
          <Select
            value={aktif ? String(aktif.id) : ''}
            onChange={(e) => setPilih(e.target.value)}
            style={{ maxWidth: 320 }}
            aria-label="Pilih rombel"
          >
            {daftar.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </Select>
        </Row>
      )}

      {aktif && (
        <div className="grid-tugas">
          <Card
            title="Materi rombel"
            subtitle={`${aktif.nama}${aktif.kompetensi ? ' • ' + aktif.kompetensi : ''}`}
            icon="book"
          >
            <MateriReadonly kelasId={aktif.id} />
          </Card>

          <div>
            <Card title="Tugas di rombel ini" icon="assignment">
              <div className="stats">
                <Stat label="Jumlah tugas" value={tugasKelas.length} icon="assignment" />
                <Stat label="Perlu dikerjakan" value={tugasKelas.filter((t) => !t.punya_saya || t.punya_saya.status === 'perlu_revisi').length} tone="warn" icon="clock" />
              </div>
              {tugasKelas.length === 0 ? (
                <p className="dim">Belum ada tugas pada rombel ini.</p>
              ) : (
                <div className="list">
                  {tugasKelas.map((t) => (
                    <Link className="list__item" key={t.id} to={`/siswa/tugas/${t.id}`}>
                      <Icon name={t.jenis === 'kuis' ? 'quiz' : 'code'} size={17} />
                      <div className="list__main">
                        <b>{t.judul}</b>
                        <div className="dim">
                          <Badge tone={t.jenis === 'kuis' ? 'accent' : 'muted'}>{t.jenis === 'kuis' ? 'kuis' : 'praktik'}</Badge>
                          {t.tenggat && <span>tenggat {formatTanggal(t.tenggat, { waktu: false })}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function BadgeJenis({ jenis }) {
  const kuis = jenis === 'kuis';
  return (
    <span className={`role-tag role-tag--${kuis ? 'guru' : 'siswa'}`} style={{ marginRight: 6 }}>
      {kuis ? 'kuis' : 'praktik'}
    </span>
  );
}
