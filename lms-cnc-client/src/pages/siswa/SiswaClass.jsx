// =============================================================
// SiswaClass.jsx - rombel yang diikuti siswa, bergabung memakai kode
// undangan guru, dan daftar teman sekelas.
// =============================================================
import { useState } from 'react';
import { api } from '../../api';
import { Link, navigate } from '../../router';
import { useSession } from '../../session.jsx';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Grid, Input, PageHeader, Row, Stat, Table, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, toneNilai, useAsync } from '../../ui/hooks.jsx';

export default function SiswaClass() {
  const { user } = useSession();
  const daftar = useAsync(() => api('/api/kelas'), []);
  const [kode, setKode] = useState('');
  const [pilih, setPilih] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = daftar.data || [];
  const aktif = rows.find((k) => k.id === pilih) || rows[0];
  const anggota = useAsync(
    () => (aktif ? api(`/api/kelas/${aktif.id}/anggota`) : Promise.resolve([])),
    [aktif?.id]
  );
  const saya = (anggota.data || []).find((a) => a.user_id === user.id);

  const gabung = async () => {
    const k = kode.trim().toUpperCase();
    if (!k) return toast('Masukkan kode kelas dari guru.', 'warn');
    setBusy(true);
    try {
      const baru = await api('/api/kelas/gabung', { method: 'POST', body: JSON.stringify({ kode: k }) });
      setKode('');
      toast(`Bergabung dengan ${baru.nama}.`);
      daftar.reload();
      setPilih(baru.id);
    } catch (e) { toast(e.message, 'danger'); }
    setBusy(false);
  };

  const salinKode = async () => {
    if (!aktif?.kode) return;
    try {
      await navigator.clipboard.writeText(aktif.kode);
      toast('Kode kelas disalin.');
    } catch { toast('Peramban menolak akses papan klip.', 'warn'); }
  };

  return (
    <>
      <PageHeader
        title="Kelas saya"
        desc="Rombel menentukan tugas, materi, dan nilai yang Anda terima. Kode undangan diberikan oleh guru."
        actions={<Button variant="sec" icon="book" onClick={() => navigate('/siswa/materi')}>Materi ajar</Button>}
      />

      {daftar.error && <Alert tone="danger" title="Gagal memuat kelas">{daftar.error}</Alert>}

      <Grid cols={2} min={340}>
        <Card title="Bergabung dengan rombel" icon="login">
          <Field label="Kode undangan" hint="Contoh: CNC7X2K. Huruf kecil otomatis diubah menjadi besar.">
            <Row gap={6}>
              <Input
                value={kode}
                placeholder="masukkan kode kelas"
                maxLength={10}
                onChange={(e) => setKode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && gabung()}
              />
              <Button icon="check" loading={busy} onClick={gabung}>Gabung</Button>
            </Row>
          </Field>
          <p className="dim">
            <Icon name="info" size={13} /> Anda dapat mengikuti lebih dari satu rombel. Nilai tiap rombel dihitung terpisah.
          </p>
        </Card>

        <Card title="Rombel yang diikuti" icon="class" subtitle={`${rows.length} kelas aktif.`}>
          {rows.length === 0 ? (
            <EmptyState icon="class" title="Belum ada rombel" desc="Masukkan kode undangan di samping untuk mulai belajar." />
          ) : (
            <div className="list">
              {rows.map((k) => (
                <button
                  type="button"
                  key={k.id}
                  className={`list__item list__item--pilih${aktif?.id === k.id ? ' is-active' : ''}`}
                  onClick={() => setPilih(k.id)}
                >
                  <Icon name="class" size={17} />
                  <div className="list__main">
                    <b>{k.nama}</b>
                    <div className="dim">{k.guru_nama || 'guru belum diatur'} • {k.jumlah_siswa} siswa • {k.jumlah_tugas} tugas</div>
                  </div>
                  <Badge tone="muted" className="mono">{k.kode}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </Grid>

      {aktif && (
        <>
          <div className="stats">
            <Stat icon="users" label="Teman sekelas" value={aktif.jumlah_siswa} />
            <Stat icon="assignment" label="Tugas terbit" value={aktif.jumlah_tugas} />
            <Stat icon="chart" label="Rata nilai saya" value={saya?.rata_nilai ?? '-'} hint={saya ? `${saya.dinilai} tugas dinilai` : 'belum ada nilai'} />
            <Stat icon="check" label="Terkumpul" value={`${saya?.terkumpul ?? 0}/${saya?.jumlah_tugas ?? 0}`} tone="ok" />
            <Stat icon="calendar" label="Tahun ajaran" value={aktif.tahun_ajaran || '-'} />
          </div>

          <Card
            title={`Anggota ${aktif.nama}`}
            icon="users"
            subtitle={aktif.deskripsi || `Kode undangan ${aktif.kode} • tingkat ${aktif.tingkat || '-'}`.trim()}
            actions={<>
              <Button variant="sec" size="sm" icon="copy" onClick={salinKode}>Salin kode</Button>
              <Link className="btn btn--sec btn--sm" to={`/siswa/materi?kelas=${aktif.id}`}><Icon name="book" size={14} />Materi</Link>
            </>}
          >
            <Table
              loading={anggota.loading && !anggota.data}
              rows={anggota.data || []}
              columns={[
                {
                  key: 'nama',
                  header: 'Siswa',
                  render: (a) => (
                    <div>
                      <b>{a.nama}{a.user_id === user.id && <span className="dim"> (Anda)</span>}</b>
                      <div className="dim" style={{ fontSize: 11.5 }}>{a.nis || 'tanpa NIS'}</div>
                    </div>
                  ),
                },
                { key: 'gabung', header: 'Bergabung', render: (a) => <span className="dim">{formatTanggal(a.gabung_pada, { waktu: false })}</span> },
                { key: 'kumpul', header: 'Terkumpul', align: 'center', render: (a) => <span className="mono">{a.terkumpul}/{a.jumlah_tugas}</span> },
                { key: 'dinilai', header: 'Dinilai', align: 'center', render: (a) => <span className="mono">{a.dinilai}</span> },
                { key: 'rata', header: 'Rata nilai', align: 'center', render: (a) => <Badge tone={toneNilai(a.rata_nilai)}>{a.rata_nilai ?? '-'}</Badge> },
              ]}
              empty="Daftar anggota belum tersedia."
            />
            <p className="dim" style={{ marginTop: 8 }}>
              <Icon name="lock" size={13} /> Data pribadi teman (email, status akun) tidak ditampilkan kepada siswa.
              Keluar dari rombel dilakukan oleh guru pengampu.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
