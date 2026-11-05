// =============================================================
// SiswaPrograms.jsx — lemari program G-Code milik siswa.
// Disimpan dari simulator, bisa dimuat ulang, disunting, dihapus.
// =============================================================
import { useMemo, useState } from 'react';
import { api, autoScore, compareTarget, highlightGcode, parseGCode, simulate } from '../../api';
import { navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Grid, IconButton, Input,
  Modal, PageHeader, Row, SearchInput, Stat, Table, Textarea, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, useAsync } from '../../ui/hooks.jsx';

const KOSONG = {
  nama: '', gcode: '', stock_diameter: 40, stock_panjang: 60, target_diameter: 20, target_panjang: 40,
};

export default function SiswaPrograms() {
  const daftar = useAsync(() => api('/api/programs'), []);
  const [cari, setCari] = useState('');
  const [edit, setEdit] = useState(null);   // 'baru' | objek program
  const [form, setForm] = useState(KOSONG);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const semua = daftar.data || [];
    return q ? semua.filter((p) => (p.nama + ' ' + p.gcode).toLowerCase().includes(q)) : semua;
  }, [daftar.data, cari]);

  const bukaSunting = (p) => {
    setForm({
      nama: p.nama,
      gcode: p.gcode,
      stock_diameter: p.stock_diameter,
      stock_panjang: p.stock_panjang,
      target_diameter: p.target_diameter,
      target_panjang: p.target_panjang,
    });
    setErr('');
    setEdit(p);
  };

  const simpan = async () => {
    setErr('');
    if (!form.nama.trim()) return setErr('Nama program wajib diisi.');
    if (!form.gcode.trim()) return setErr('Program G-Code kosong.');
    setBusy(true);
    try {
      const body = JSON.stringify({
        nama: form.nama.trim(),
        gcode: form.gcode,
        stock_diameter: +form.stock_diameter || 40,
        stock_panjang: +form.stock_panjang || 60,
        target_diameter: +form.target_diameter || 20,
        target_panjang: +form.target_panjang || 40,
      });
      await api(edit === 'baru' ? '/api/programs' : '/api/programs/' + edit.id, { method: edit === 'baru' ? 'POST' : 'PUT', body });
      toast(edit === 'baru' ? 'Program tersimpan.' : 'Perubahan tersimpan.');
      setEdit(null);
      daftar.reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const hapus = async (p) => {
    const ok = await askConfirm({ title: 'Hapus program', message: `"${p.nama}" akan dihapus permanen dari lemari Anda.`, confirmLabel: 'Hapus' });
    if (!ok) return;
    try { await api('/api/programs/' + p.id, { method: 'DELETE' }); toast('Program dihapus.'); daftar.reload(); }
    catch (e) { toast(e.message, 'danger'); }
  }

  const salin = (p) => {
    setForm({ ...KOSONG, ...p, nama: p.nama + ' (salinan)' });
    setErr('');
    setEdit('baru');
  };

  const muat = (p) => navigate('/siswa/latihan?program=' + p.id);

  const totalBaris = (p) => p.gcode.split('\n').filter((l) => l.trim()).length;

  return (
    <>
      <PageHeader
        title="Program saya"
        desc="Lemari pribadi berisi program G-Code yang Anda simpan dari simulator. Muat ulang untuk berlatih atau memperbaiki."
        actions={<Button icon="plus" onClick={() => { setForm(KOSONG); setErr(''); setEdit('baru'); }}>Susun program</Button>}
      />

      {daftar.error && <Alert tone="danger" title="Gagal memuat">{daftar.error}</Alert>}

      {(daftar.data || []).length > 0 && (
        <>
          <div className="stats">
            <Stat label="Program tersimpan" value={(daftar.data || []).length} icon="code" />
            <Stat label="Baris kode" value={(daftar.data || []).reduce((a, p) => a + totalBaris(p), 0)} icon="layers" />
            <Stat label="Terakhir disimpan" value={formatTanggal(daftar.data?.[0]?.disimpan_pada, { waktu: false })} icon="clock" />
          </div>
          <Row style={{ marginBottom: 10 }}>
            <SearchInput value={cari} onChange={setCari} placeholder="Cari nama atau isi kode" />
          </Row>
        </>
      )}

      {rows.length === 0 && !daftar.loading && (
        <EmptyState
          icon="code"
          title={cari ? 'Tidak ada yang cocok' : 'Belum ada program'}
          desc={cari
            ? 'Coba kata kunci lain, atau kosongkan kolom pencarian.'
            : 'Buka simulator, susun G-Code, lalu tekan "Simpan ke program saya". Program akan muncul di sini.'}
          action={!cari && (
            <>
              <Button icon="cube" onClick={() => navigate('/siswa/latihan')}>Buka simulator</Button>
              <Button variant="sec" icon="plus" onClick={() => { setForm(KOSONG); setErr(''); setEdit('baru'); }}>Susun program</Button>
            </>
          )}
        />
      )}

      {rows.length > 0 && (
        <Card title={`${rows.length} program`} icon="code">
          <Table
            rowKey="id"
            rows={rows}
            loading={daftar.loading}
            columns={[
              {
                key: 'nama',
                header: 'Program',
                render: (p) => (
                  <div className="prog-sel">
                    <b>{p.nama}</b>
                    <span className="dim">{formatTanggal(p.disimpan_pada)} • {totalBaris(p)} baris</span>
                  </div>
                ),
              },
              {
                key: 'ukuran',
                header: 'Stock ke target',
                render: (p) => (
                  <span className="dim mono">
                    Ø{+p.stock_diameter} L{+p.stock_panjang} ke Ø{+p.target_diameter} Z-{+p.target_panjang}
                  </span>
                ),
              },
              {
                key: 'skor',
                header: 'Skor simulasi',
                align: 'center',
                render: (p) => <SkorRingkas p={p} />,
              },
              {
                key: 'aksi',
                header: 'Aksi',
                align: 'right',
                render: (p) => (
                  <Row gap={4} className="u-row--end">
                    <Button size="sm" icon="play" onClick={() => muat(p)}>Muat</Button>
                    <IconButton name="edit" title="Sunting" size="sm" variant="sec" onClick={() => bukaSunting(p)} />
                    <IconButton name="copy" title="Duplikat" size="sm" variant="sec" onClick={() => salin(p)} />
                    <IconButton name="trash" title="Hapus" size="sm" variant="danger" onClick={() => hapus(p)} />
                  </Row>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Modal
        open={!!edit}
        title={edit === 'baru' ? 'Susun program' : 'Sunting program'}
        icon="code"
        width={720}
        onClose={() => setEdit(null)}
        footer={<>
          <Button variant="sec" onClick={() => setEdit(null)}>Batal</Button>
          <Button icon="save" onClick={simpan} loading={busy}>Simpan program</Button>
        </>}
      >
        {err && <Alert tone="danger" title="Periksa isian">{err}</Alert>}
        <Field label="Nama program" required hint="mis. O0001 Tirus luar, atau Percobaan 3 passes.">
          <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Nama program" />
        </Field>
        <Field label="Ukuran bahan & target" hint="Diameter X dalam mm (satu sumbu = setengah diameter).">
          <Grid cols={4} min={110}>
            <Input type="number" step="0.5" value={form.stock_diameter} onChange={(e) => setForm({ ...form, stock_diameter: e.target.value })} title="Stock Ø" />
            <Input type="number" step="0.5" value={form.stock_panjang} onChange={(e) => setForm({ ...form, stock_panjang: e.target.value })} title="Stock panjang" />
            <Input type="number" step="0.5" value={form.target_diameter} onChange={(e) => setForm({ ...form, target_diameter: e.target.value })} title="Target Ø" />
            <Input type="number" step="0.5" value={form.target_panjang} onChange={(e) => setForm({ ...form, target_panjang: e.target.value })} title="Target Z" />
          </Grid>
        </Field>
        <Field label="G-Code" required hint="G00 cepat, G01 lurus, G02/G03 busur, G90 absolut, G91 inkremental.">
          <div className="editor editor--mini">
            <pre className="hl" dangerouslySetInnerHTML={{ __html: highlightGcode(form.gcode) + '\n' }} />
            <Textarea
              rows={12}
              spellCheck={false}
              value={form.gcode}
              onChange={(e) => setForm({ ...form, gcode: e.target.value })}
              onScroll={(e) => { e.target.previousSibling.scrollTop = e.target.scrollTop; }}
            />
          </div>
        </Field>
        <PratinjauSkor form={form} />
      </Modal>
    </>
  );
}

/* Skor cepat dari mesin G-Code di dalam browser, tanpa memanggil API. */
function SkorRingkas({ p }) {
  const hasil = useMemo(() => {
    try {
      const sim = simulate(parseGCode(p.gcode), +p.stock_diameter, +p.stock_panjang);
      const cmp = compareTarget(sim.profile, +p.target_diameter, +p.target_panjang);
      const { skor, ada_error } = autoScore(sim.events, cmp);
      return { skor, ada_error, match: cmp.match };
    } catch { return null; }
  }, [p]);
  if (!hasil) return <Badge tone="danger">kode error</Badge>;
  if (hasil.ada_error) return <Badge tone="danger">{hasil.skor}/100 tabrakan</Badge>;
  return <Badge tone={hasil.match ? 'ok' : 'muted'}>{hasil.skor}/100{hasil.match ? ' sesuai' : ''}</Badge>;
}

function PratinjauSkor({ form }) {
  const hasil = useMemo(() => {
    if (!form.gcode.trim()) return null;
    try {
      const sim = simulate(parseGCode(form.gcode), +form.stock_diameter || 40, +form.stock_panjang || 60);
      const cmp = compareTarget(sim.profile, +form.target_diameter || 20, +form.target_panjang || 40);
      const { skor, ada_error } = autoScore(sim.events, cmp);
      return { skor, ada_error, detail: cmp.detail, jumlah: sim.moves.length };
    } catch { return false; }
  }, [form]);

  if (hasil === null) return <p className="dim">Tulis kode untuk melihat skor simulasi.</p>;
  if (hasil === false) return <Alert tone="danger" title="Kode tidak dapat dibaca">Periksa kembali sintaks G-Code.</Alert>;
  return (
    <div className={`score ${!hasil.ada_error && hasil.skor >= 70 ? 'match' : 'nomatch'}`}>
      Skor simulasi {hasil.skor}/100 • {hasil.jumlah} gerak
      {hasil.ada_error && ' • tabrakan terdeteksi'}
      <div className="dim">{hasil.detail}</div>
    </div>
  );
}
