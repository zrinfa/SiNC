// =============================================================
// TaskDetail.jsx - satu tugas untuk guru/admin: ringkasan penugasan,
// daftar pengumpulan lengkap (termasuk yang belum mengerjakan),
// penilaian per siswa, permintaan revisi, dan penilaian otomatis.
// =============================================================
import { useMemo, useState } from 'react';
import { api, highlightGcode, urlBerkas } from '../../api';
import { Link, navigate } from '../../router';
import Icon from '../../ui/Icon.jsx';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Grid, IconButton, Input, Modal,
  PageHeader, Row, Select, Stat, Table, Tabs, Textarea, askConfirm, toast,
} from '../../ui/primitives.jsx';
import { formatTanggal, hariMenua, toneNilai, useAsync } from '../../ui/hooks.jsx';

const STATUS_TONE = { dinilai: 'ok', terkumpul: 'accent', perlu_revisi: 'warn', belum: 'muted' };

export default function TaskDetail({ id }) {
  const [tab, setTab] = useState('semua');
  const [nilai, setNilai] = useState(null);   // baris yang sedang dinilai
  const [lihat, setLihat] = useState(null);   // baris yang dibuka G-Code-nya
  const tugas = useAsync(() => api('/api/tugas/' + id), [id]);
  const materi = useAsync(
    () => (tugas.data ? api('/api/materi?kelas_id=' + tugas.data.kelas_id) : Promise.resolve([])),
    [tugas.data?.kelas_id]
  );

  const t = tugas.data;
  const rows = useMemo(() => (t?.pengumpulan || []).filter((p) => {
    if (tab === 'semua') return !!p.id;
    if (tab === 'belum') return !p.id;
    return p.status === tab;
  }), [t, tab]);

  const hitung = useMemo(() => {
    const all = t?.pengumpulan || [];
    const sudah = all.filter((p) => p.id);
    const dinilai = sudah.filter((p) => p.status === 'dinilai');
    const akhir = dinilai.map((p) => p.nilai_akhir).filter((v) => v != null);
    return {
      total: all.length,
      terkumpul: sudah.length,
      belum: all.length - sudah.length,
      dinilai: dinilai.length,
      revisi: sudah.filter((p) => p.status === 'perlu_revisi').length,
      rata: akhir.length ? Math.round(akhir.reduce((a, b) => a + b, 0) / akhir.length) : null,
    };
  }, [t]);

  const materiTerkait = useMemo(() => {
    const ids = new Set((t?.materi_ids || []).map(String));
    return (materi.data || []).filter((m) => ids.has(String(m.id)));
  }, [t, materi.data]);

  const simpanNilai = async (poin, body) => {
    try {
      const baru = await api('/api/pengumpulan/' + poin.id, { method: 'PUT', body: JSON.stringify(body) });
      tugas.setData({ ...t, pengumpulan: t.pengumpulan.map((x) => (x.id === baru.id ? baru : x)) });
      setNilai(null);
      toast(`Penilaian ${baru.siswa_nama} tersimpan.`);
    } catch (e) { toast(e.message, 'danger'); }
  };

  const mintaRevisi = async (poin) => {
    const catatan = (poin.catatan_guru || '').trim();
    if (!catatan) return toast('Isi catatan perbaikan lebih dulu.', 'warn');
    try {
      const baru = await api(`/api/pengumpulan/${poin.id}/koreksi`, {
        method: 'POST', body: JSON.stringify({ catatan_guru: catatan }),
      });
      tugas.setData({ ...t, pengumpulan: t.pengumpulan.map((x) => (x.id === baru.id ? baru : x)) });
      setNilai(null);
      toast(`Revisi diminta ke ${baru.siswa_nama}.`);
    } catch (e) { toast(e.message, 'danger'); }
  };

  const nilaiOtomatis = async () => {
    const target = (t.pengumpulan || []).filter((p) => p.id && p.nilai_guru == null && p.skor_simulasi != null);
    if (!target.length) return toast('Tidak ada pengumpulan yang belum dinilai.', 'warn');
    const ok = await askConfirm({
      title: 'Nilai otomatis',
      message: `${target.length} pengumpulan akan diberi nilai guru sama dengan skor simulator, `
        + `dikonversi ke skala poin tugas (${t.poin}). Nilai yang sudah ada tidak ditimpa.`,
      confirmLabel: 'Nilai sekarang',
      tone: 'info',
    });
    if (!ok) return;
    let berhasil = 0;
    const baru = [...t.pengumpulan];
    for (const p of target) {
      try {
        const hasil = await api('/api/pengumpulan/' + p.id, {
          method: 'PUT',
          body: JSON.stringify({
            nilai_guru: Math.max(0, Math.min(+t.poin, Math.round(p.skor_simulasi * +t.poin / 100))),
            status: 'dinilai',
          }),
        });
        const i = baru.findIndex((x) => x.id === p.id);
        if (i >= 0) baru[i] = hasil;
        berhasil++;
      } catch { /* satu baris gagal tidak menghentikan batch */ }
    }
    tugas.setData({ ...t, pengumpulan: baru });
    toast(`${berhasil} pengumpulan dinilai.`, berhasil ? 'ok' : 'warn');
  };

  const ubahStatus = async () => {
    const status = t.status === 'terbit' ? 'draf' : 'terbit';
    try {
      const baru = await api(`/api/tugas/${t.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      tugas.setData({ ...baru, pengumpulan: t.pengumpulan });
      toast(status === 'terbit' ? 'Tugas terbit, siswa dapat mengerjakan.' : 'Tugas dikembalikan ke draf.');
    } catch (e) { toast(e.message, 'danger'); }
  };

  const hapus = async () => {
    const ok = await askConfirm({
      title: 'Hapus tugas',
      message: `"${t.judul}" beserta seluruh pengumpulan dan nilainya dihapus permanen.`,
      confirmLabel: 'Hapus tugas',
    });
    if (!ok) return;
    try {
      await api('/api/tugas/' + t.id, { method: 'DELETE' });
      toast('Tugas dihapus.');
      navigate('/guru/tugas');
    } catch (e) { toast(e.message, 'danger'); }
  };

  if (tugas.loading && !t) return <div className="content-loading"><Icon name="refresh" className="spin" size={20} /> Memuat tugas…</div>;
  if (tugas.error) return <Alert tone="danger" title="Gagal memuat">{tugas.error}</Alert>;
  if (!t) return null;

  const praktik = t.jenis === 'praktik';

  return (
    <>
      <PageHeader
        title={t.judul}
        desc={`${t.kelas_nama} • ${praktik ? 'tugas praktik simulator G-Code' : `kuis ${(t.soal || []).length} butir`}`}
        badge={<>
          <Badge tone={t.status === 'terbit' ? 'ok' : 'muted'} icon={t.status === 'terbit' ? 'flag' : 'file'}>{t.status}</Badge>
          <Badge tone="accent" icon="target">poin {t.poin}</Badge>
          <Badge tone="muted" icon="check-circle">batas lulus {t.batas_lulus}</Badge>
          {t.tenggat && (
            <Badge tone={hariMenua(t.tenggat) === 'terlambat' ? 'danger' : 'warn'} icon="clock">
              {formatTanggal(t.tenggat)} • {hariMenua(t.tenggat) || 'mendatang'}
            </Badge>
          )}
        </>}
        actions={<>
          <Link className="btn btn--sec btn--md" to={`/siswa/tugas/${t.id}`} title="Pratinjau sebagai siswa">
            <Icon name="eye" size={15} /><span>Pratinjau</span>
          </Link>
          <Button icon="edit" variant="sec" onClick={() => navigate(`/guru/tugas/${t.id}/sunting`)}>Sunting</Button>
          <Button icon={t.status === 'terbit' ? 'eye-off' : 'flag'} variant={t.status === 'terbit' ? 'sec' : 'ok'} onClick={ubahStatus}>
            {t.status === 'terbit' ? 'Tarik ke draf' : 'Terbitkan'}
          </Button>
          <IconButton name="trash" title="Hapus tugas" variant="danger" onClick={hapus} />
        </>}
      />

      <div className="stats">
        <Stat icon="users" label="Siswa terdaftar" value={hitung.total} />
        <Stat icon="send" label="Terkumpul" value={hitung.terkumpul} hint={`${hitung.belum} belum`} tone={hitung.belum ? 'warn' : 'ok'} />
        <Stat icon="check-circle" label="Sudah dinilai" value={hitung.dinilai} tone={hitung.dinilai === hitung.terkumpul ? 'ok' : undefined} />
        <Stat icon="refresh" label="Perlu revisi" value={hitung.revisi} tone={hitung.revisi ? 'amber' : undefined} />
        <Stat icon="chart" label="Rata nilai akhir" value={hitung.rata ?? '-'} tone={toneNilai(hitung.rata, t.batas_lulus)} />
      </div>

      <Grid cols={2} className="grid-tugas" min={420}>
        <Card title="Instruksi & acuan" icon="assignment">
          {t.instruksi
            ? <p className="instruksi">{t.instruksi}</p>
            : <p className="dim">Guru tidak menulis instruksi tambahan.</p>}

          {praktik ? (
            <>
              <div className="kv">
                <span>Stock</span><b className="mono">Ø{t.target.stock_d} x {t.target.stock_l} mm</b>
                <span>Target</span><b className="mono">Ø{t.target.target_d} x Z-{t.target.target_z} mm</b>
                <span>Modul</span><b>{t.modul_id ? 'modul pustaka terhubung' : 'tanpa modul (target mandiri)'}</b>
                <span>Boleh ulang</span><b>{t.boleh_ulang ? 'ya, siswa dapat mengumpulkan ulang' : 'tidak, satu kali kirim'}</b>
              </div>
              {t.starter_gcode && (
                <Field label="G-Code awal yang diberikan ke siswa">
                  <pre className="gcode-view">{t.starter_gcode}</pre>
                </Field>
              )}
            </>
          ) : (
            <div className="kv">
              <span>Butir soal</span><b>{(t.soal || []).length}</b>
              <span>Bobot</span><b className="mono">{(t.soal || []).reduce((a, s) => a + s.poin, 0)} poin soal</b>
              <span>Boleh ulang</span><b>{t.boleh_ulang ? 'ya' : 'tidak'}</b>
            </div>
          )}

          {(t.lkpd_url || materiTerkait.length > 0) && (
            <div className="lampiran">
              {t.lkpd_url && (
                <a className="link-berkas" href={urlBerkas(t.lkpd_url)} target="_blank" rel="noreferrer">
                  <Icon name="pdf" size={15} /> LKPD tugas
                </a>
              )}
              {materiTerkait.map((m) => (
                <span key={m.id} className="link-berkas link-berkas--statis">
                  <Icon name={m.tipe === 'video' ? 'video' : m.tipe === 'pdf' ? 'pdf' : m.tipe === 'tautan' ? 'link' : 'book'} size={15} />
                  {m.judul}
                </span>
              ))}
            </div>
          )}
        </Card>

        {!praktik && (
          <Card title="Kisi-kisi soal" icon="quiz" subtitle="Kunci jawaban tidak ditampilkan di layar ini.">
            <ol className="soal-ringkas">
              {(t.soal || []).map((s) => (
                <li key={s.id}>
                  <div className="soal-ringkas__head">
                    <Badge tone="muted">{s.tipe}</Badge>
                    <span className="mono dim">{s.poin} poin</span>
                    {s.target && <Badge tone="accent" icon="cube">praktik Ø{s.target.target_d}</Badge>}
                  </div>
                  <p>{s.teks}</p>
                  {s.opsi?.length ? <ul className="opsi-ringkas">{s.opsi.map((o, i) => <li key={i} className="dim">{String.fromCharCode(65 + i)}. {o}</li>)}</ul> : null}
                </li>
              ))}
            </ol>
          </Card>
        )}
      </Grid>

      <Card
        title="Pengumpulan siswa"
        icon="users"
        subtitle={`${rows.length} baris pada tab ${tab}. Nilai guru memakai skala poin tugas (${t.poin}); nilai akhir selalu 0-100.`}
        actions={<>
          {hitung.terkumpul > hitung.dinilai && (
            <Button icon="spark" variant="sec" size="sm" onClick={nilaiOtomatis}>Nilai otomatis</Button>
          )}
        </>}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'semua', label: 'Terkumpul', icon: 'send', count: hitung.terkumpul },
            { value: 'terkumpul', label: 'Belum dinilai', icon: 'edit', count: (t.pengumpulan || []).filter((p) => p.id && p.status === 'terkumpul').length },
            { value: 'dinilai', label: 'Selesai dinilai', icon: 'check-circle', count: hitung.dinilai },
            { value: 'perlu_revisi', label: 'Perlu revisi', icon: 'refresh', count: hitung.revisi },
            { value: 'belum', label: 'Belum kumpul', icon: 'alert', count: hitung.belum },
          ]}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={tab === 'belum' ? 'check-circle' : 'send'}
            title={tab === 'belum' ? 'Semua siswa sudah mengumpulkan.' : 'Belum ada pengumpulan pada tab ini.'}
            desc={praktik ? 'Siswa mengerjakan di simulator lalu menekan Kirim ke guru.' : 'Siswa menjawab kuis pada halaman tugas.'}
          />
        ) : (
          <Table
            rows={rows}
            rowKey="siswa_id"
            onRow={(p) => p.id && (praktik ? setLihat(p) : setNilai(p))}
            columns={[
              {
                key: 'siswa_nama',
                header: 'Siswa',
                render: (p) => (
                  <div>
                    <b>{p.siswa_nama}</b>
                    <div className="dim" style={{ fontSize: 11.5 }}>{p.nis || '-'}</div>
                  </div>
                ),
              },
              { key: 'status', header: 'Status', render: (p) => <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge> },
              {
                key: 'skor_simulasi',
                header: praktik ? 'Skor simulator' : 'Skor kuis',
                align: 'center',
                render: (p) => p.skor_simulasi == null
                  ? <span className="dim">-</span>
                  : <span className={p.ada_error ? 'err mono' : 'mono'}>{p.skor_simulasi}{p.ada_error ? ' tabrakan' : ''}</span>,
              },
              { key: 'nilai_guru', header: `Nilai guru (${t.poin})`, align: 'center', render: (p) => <span className="mono">{p.nilai_guru ?? '-'}</span> },
              {
                key: 'nilai_akhir',
                header: 'Nilai akhir',
                align: 'center',
                render: (p) => <Badge tone={toneNilai(p.nilai_akhir, t.batas_lulus)}>{p.nilai_akhir ?? '-'}</Badge>,
              },
              {
                key: 'waktu_submit',
                header: 'Waktu',
                render: (p) => p.waktu_submit
                  ? <span className="dim">{formatTanggal(p.waktu_submit)}<div style={{ fontSize: 11 }}>{p.jumlah_percobaan} percobaan</div></span>
                  : <span className="dim">-</span>,
              },
              {
                key: 'catatan_guru',
                header: 'Catatan',
                render: (p) => p.catatan_guru
                  ? <span className="dim" title={p.catatan_guru}>{p.catatan_guru.slice(0, 48)}{p.catatan_guru.length > 48 ? '…' : ''}</span>
                  : <span className="dim">-</span>,
              },
              {
                key: 'aksi',
                header: 'Aksi',
                align: 'right',
                render: (p) => (
                  <Row gap={3}>
                    {praktik && p.gcode && (
                      <IconButton name="code" title="Lihat G-Code" size="sm" variant="sec" onClick={(e) => { e.stopPropagation(); setLihat(p); }} />
                    )}
                    {p.id && (
                      <IconButton name="edit" title="Beri nilai" size="sm" variant="sec" onClick={(e) => { e.stopPropagation(); setNilai(p); }} />
                    )}
                  </Row>
                ),
              },
            ]}
          />
        )}
      </Card>

      {lihat && (
        <Modal open title={`G-Code - ${lihat.siswa_nama}`} width={720} icon="code" onClose={() => setLihat(null)}
          footer={<>
            <span className="dim spacer">
              {lihat.jumlah_percobaan} percobaan • skor {lihat.skor_simulasi ?? '-'}
            </span>
            <Button variant="sec" onClick={() => setLihat(null)}>Tutup</Button>
            <Button icon="edit" onClick={() => { setNilai(lihat); setLihat(null); }}>Beri nilai</Button>
          </>}
        >
          <pre className="gcode-view gcode-view--hl" dangerouslySetInnerHTML={{ __html: highlightGcode(lihat.gcode || '') }} />
        </Modal>
      )}

      {nilai && (
        <FormNilai poin={t.poin} batas={t.batas_lulus} baris={nilai} onClose={() => setNilai(null)} onSimpan={simpanNilai} onRevisi={mintaRevisi} />
      )}
    </>
  );
}

function FormNilai({ poin, batas, baris, onClose, onSimpan, onRevisi }) {
  const [isi, setIsi] = useState({
    nilai_guru: baris.nilai_guru ?? (baris.skor_simulasi != null ? Math.round(baris.skor_simulasi * poin / 100) : ''),
    catatan_guru: baris.catatan_guru || '',
    status: baris.status === 'belum' ? 'terkumpul' : baris.status,
  });
  const [busy, setBusy] = useState(false);

  const kirim = async (fn) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const skala = isi.nilai_guru === '' ? null : Math.round(isi.nilai_guru * 100 / poin);

  return (
    <Modal
      open
      title={`Penilaian - ${baris.siswa_nama}`}
      icon="edit"
      width={520}
      onClose={onClose}
      footer={<>
        <span className="spacer dim">{baris.nis || '-'}</span>
        <Button variant="sec" icon="refresh" loading={busy} onClick={() => kirim(() => onRevisi({ ...baris, catatan_guru: isi.catatan_guru }))}>
          Minta revisi
        </Button>
        <Button variant="primary" icon="check" loading={busy}
          onClick={() => kirim(() => onSimpan(baris, { nilai_guru: isi.nilai_guru === '' ? null : +isi.nilai_guru, catatan_guru: isi.catatan_guru, status: 'dinilai' }))}>
          Simpan nilai
        </Button>
      </>}
    >
      <div className="kv" style={{ marginBottom: 12 }}>
        <span>Skor simulator</span><b className="mono">{baris.skor_simulasi ?? '-'}</b>
        <span>Percobaan</span><b className="mono">{baris.jumlah_percobaan}</b>
        <span>Dikumpulkan</span><b>{formatTanggal(baris.waktu_submit)}</b>
      </div>

      <Field label={`Nilai guru (0-${poin})`} hint={skala == null ? 'Kosongkan bila nilai tetap diambil dari skor simulator.' : `Setara nilai akhir ${skala}/100.`}>
        <Row gap={8}>
          <Input
            type="number"
            min={0}
            max={poin}
            value={isi.nilai_guru}
            onChange={(e) => setIsi({ ...isi, nilai_guru: e.target.value === '' ? '' : Math.max(0, Math.min(poin, +e.target.value)) })}
          />
          <input
            type="range"
            className="range"
            min={0}
            max={poin}
            value={isi.nilai_guru === '' ? 0 : isi.nilai_guru}
            onChange={(e) => setIsi({ ...isi, nilai_guru: +e.target.value })}
            aria-label="Geser nilai guru"
          />
        </Row>
      </Field>

      <Field label="Catatan untuk siswa" hint="Tulis masukan yang spesifik: arah perbaikan, bukan hanya nilai.">
        <Textarea
          rows={4}
          placeholder="Mis. diameter sudah tepat, tetapi ada tabrakan pada blok finishing. Kurangi feed F100 menjadi F60."
          value={isi.catatan_guru}
          onChange={(e) => setIsi({ ...isi, catatan_guru: e.target.value })}
        />
      </Field>

      <Field label="Status">
        <Select value={isi.status} onChange={(e) => setIsi({ ...isi, status: e.target.value })}>
          <option value="terkumpul">Terkumpul, belum dinilai</option>
          <option value="dinilai">Selesai dinilai</option>
          <option value="perlu_revisi">Perlu revisi (siswa boleh mengirim ulang)</option>
        </Select>
      </Field>

      <p className="dim" style={{ marginTop: 4 }}>
        <Icon name="info" size={13} /> Batas lulus tugas ini {batas}/100.
        {baris.skor_simulasi != null && baris.skor_simulasi >= batas
          ? ' Skor simulator siswa sudah melampaui batas lulus.'
          : ' Skor simulator siswa masih di bawah batas lulus.'}
      </p>
    </Modal>
  );
}
