// =============================================================
// SiswaFreeSim.jsx - simulator bebas untuk siswa: pilih modul latihan
// dari pustaka, muat program tersimpan (?program=), atau mulai dari
// program contoh tanpa modul.
// =============================================================
import { useMemo, useState } from 'react';
import { api, urlBerkas } from '../../api';
import { navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import { Alert, Badge, Card, Field, Grid, PageHeader, Row, Select } from '../../ui/primitives.jsx';
import { useAsync } from '../../ui/hooks.jsx';
import Simulator from '../../components/Simulator.jsx';

const KOSONG = { judul: '', level: '', deskripsi: '', target: null, starter_gcode: '' };

// program tersimpan siswa → bentuk modul supaya Simulator bisa memakainya
function dariProgram(p) {
  return {
    id: 'program:' + p.id,
    judul: p.nama,
    level: '',
    deskripsi: 'Program tersimpan dari lemari Anda.',
    starter_gcode: p.gcode,
    target: {
      stock_d: +p.stock_diameter,
      stock_l: +p.stock_panjang,
      target_d: +p.target_diameter,
      target_z: +p.target_panjang,
    },
  };
}

export default function SiswaFreeSim({ programId }) {
  const modul = useAsync(() => api('/api/modules'), []);
  const simpanan = useAsync(() => (programId ? api('/api/programs') : Promise.resolve([])), [programId]);
  const [pilih, setPilih] = useState('');
  const [bebasStockD, setBebasStockD] = useState(30);
  const [bebasStockL, setBebasStockL] = useState(60);

  const daftar = useMemo(
    () => (modul.data || []).slice().sort((a, b) => a.level - b.level || a.judul.localeCompare(b.judul)),
    [modul.data]
  );
  const program = useMemo(
    () => (programId ? (simpanan.data || []).find((p) => p.id === programId) : null),
    [simpanan.data, programId]
  );

  const aktif = program ? dariProgram(program) : (daftar.find((m) => m.id === pilih) || KOSONG);
  const targetAktif = aktif.target || {
    stock_d: bebasStockD,
    stock_l: bebasStockL,
    target_d: Math.round(bebasStockD / 2),
    target_z: Math.round(bebasStockL * 0.6),
  };

  const gantiPilihan = (value) => {
    setPilih(value);
    if (programId) navigate('/siswa/latihan', { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Simulator bebas"
        desc="Tempat berlatih: susun G-Code, jalankan siklus, lihat benda kerja terpotong. Tidak ada nilai yang dikirim ke guru."
        badge={<>
          {program && <Badge tone="accent" icon="code">Program tersimpan</Badge>}
          {aktif.level && <Badge tone="accent" icon="layers">Lv.{aktif.level}</Badge>}
          <Badge tone="muted" icon="target">target Ø{targetAktif.target_d} x Z-{targetAktif.target_z}</Badge>
          <Badge tone="muted" icon="cube">stock Ø{targetAktif.stock_d} x {targetAktif.stock_l}</Badge>
        </>}
      />

      {modul.error && <Alert tone="danger" title="Modul tidak tersedia">{modul.error}</Alert>}
      {programId && simpanan.data && !program && (
        <Alert tone="warn" title="Program tidak ditemukan">
          Program itu sudah dihapus atau bukan milik Anda. Simulator memakai program contoh.
        </Alert>
      )}

      <Grid cols={2} min={300}>
        <Card title="Pilih latihan" icon="book" subtitle={`${daftar.length} modul tersedia di pustaka.`}>
          <Field label="Modul latihan" hint="Setiap modul membawa target geometri, instruksi, dan program awal.">
            <Select value={pilih} onChange={(e) => gantiPilihan(e.target.value)}>
              <option value="">{program ? program.nama : 'Mode bebas (program contoh)'}</option>
              {daftar.map((m) => <option key={m.id} value={m.id}>Lv.{m.level} • {m.judul}</option>)}
            </Select>
          </Field>

          {program && (
            <Row className="catatan">
              <Icon name="code" size={15} />
              <span>Editor terisi ulang dari program <b>{program.nama}</b>. Ubah pilihan modul di atas untuk melepaskannya.</span>
            </Row>
          )}

          {aktif.level ? (
            <>
              <p className="dim" style={{ marginTop: 2 }}>{aktif.deskripsi || 'Tidak ada deskripsi modul.'}</p>
              <div className="kv">
                <span>Stock</span><b className="mono">Ø{targetAktif.stock_d} x {targetAktif.stock_l} mm</b>
                <span>Target akhir</span><b className="mono">Ø{targetAktif.target_d} x Z-{targetAktif.target_z} mm</b>
              </div>
              {aktif.lkpd_url && (
                <Row className="catatan">
                  <Icon name="pdf" size={15} />
                  <a className="link-berkas" href={urlBerkas(aktif.lkpd_url)} target="_blank" rel="noreferrer">Unduh LKPD modul ini</a>
                </Row>
              )}
            </>
          ) : (
            <>
              <div className="kv">
                <span>Bahan baku</span><b className="mono">Ø{targetAktif.stock_d} x {targetAktif.stock_l} mm</b>
                <span>Program</span><b className="mono">{program ? 'dari lemari program saya' : 'contoh G00/G01'}</b>
                <span>Tujuan</span><b>bebas bereksperimen</b>
              </div>

              {!program && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)' }}>
                  <b style={{ fontSize: 12, display: 'block', marginBottom: 6, color: 'var(--text-strong)' }}>
                    Atur Dimensi Benda Kerja (Stock):
                  </b>
                  <div className="u-row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                      <span>Diameter:</span>
                      <select
                        value={bebasStockD}
                        onChange={(e) => setBebasStockD(Number(e.target.value))}
                        style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(18,25,38,.85)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', fontSize: 12 }}
                      >
                        <option value={20}>Ø 20 mm</option>
                        <option value={25}>Ø 25 mm</option>
                        <option value={30}>Ø 30 mm (Proporsional)</option>
                        <option value={32}>Ø 32 mm</option>
                        <option value={40}>Ø 40 mm</option>
                        <option value={50}>Ø 50 mm</option>
                      </select>
                    </label>

                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                      <span>Panjang:</span>
                      <select
                        value={bebasStockL}
                        onChange={(e) => setBebasStockL(Number(e.target.value))}
                        style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(18,25,38,.85)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', fontSize: 12 }}
                      >
                        <option value={40}>40 mm</option>
                        <option value={50}>50 mm</option>
                        <option value={60}>60 mm (Standar)</option>
                        <option value={80}>80 mm</option>
                        <option value={100}>100 mm</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          <Row className="u-row--between" style={{ marginTop: 12 }}>
            <span className="dim">Butuh bantuan menyusun kode? Buka AI Tutor di bawah simulator.</span>
            <a className="link-berkas" href="#/siswa/program"><Icon name="folder" size={13} /> Lemari program</a>
          </Row>
        </Card>

        <Card title="Cara memakai simulator" icon="spark">
          <ol className="langkah">
            <li>Tulis atau tempel G-Code pada editor. Sintaks yang dikenali: G00, G01, G02, G03, G90, G91.</li>
            <li>Angka X memakai diameter, Z bernilai negatif ke arah lawan chuck. Satu blok bisa memuat beberapa sumbu.</li>
            <li>Tekan Animasi untuk melihat pahat memotong benda kerja; Jalankan penuh menampilkan mesin 3D layar penuh.</li>
            <li>Gunakan Mundur/Maju untuk memeriksa langkah demi langkah, dan nyalakan "Benda transparan" untuk melihat target.</li>
            <li>Simpan hasil kerja ke lemari program agar bisa dimuat dan diperbaiki lagi nanti.</li>
          </ol>
        </Card>
      </Grid>

      <Simulator
        key={program ? program.id : (aktif.id ? aktif.id : `bebas-${bebasStockD}-${bebasStockL}`)}
        modul={aktif.id ? aktif : null}
        idModul={program ? null : (aktif.id || null)}
        programId={program ? program.id : null}
        programNama={program ? program.nama : ''}
        initialStockD={bebasStockD}
        initialStockL={bebasStockL}
        onRekomendasi={(id) => gantiPilihan(String(id))}
      />
    </>
  );
}
