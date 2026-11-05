// =============================================================
// test-lms.js — uji alur LMS lengkap: admin -> guru -> kelas -> import
// -> materi -> tugas praktik -> submit -> nilai -> kuis -> rekap -> export.
// Jalankan setelah API hidup:  API_BASE=http://localhost:8080 node tests/test-lms.js
// =============================================================
const B = process.env.API_BASE || 'http://localhost:8000';
const unik = Date.now();

async function call(method, path, token, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(method + ' ' + path + ' -> ' + (d.error || r.status));
    e.status = r.status;
    throw e;
  }
  return d;
}
function harus(cond, pesan) { if (!cond) throw new Error('Uji gagal: ' + pesan); }

(async () => {
  const dibersihkan = [];
  try {
    // ---------- 1. admin ----------
    const admin = await call('POST', '/api/login', null, { email: 'admin@smk.sch.id', password: 'password123' });
    harus(admin.user.role === 'admin', 'login admin');
    console.log('1 login admin OK:', admin.user.nama);

    const guruBaru = await call('POST', '/api/users', admin.token, {
      nama: 'Pak Uji ' + unik, email: 'guru' + unik + '@smk.sch.id', role: 'guru', password: 'password123'
    });
    dibersihkan.push(['user', guruBaru.id]);
    console.log('2 admin buat guru OK:', guruBaru.nama, guruBaru.role);

    const cariGuru = await call('GET', '/api/users?role=guru&q=' + encodeURIComponent('Pak Uji'), admin.token);
    harus(cariGuru.some(u => u.id === guruBaru.id), 'filter pengguna');
    console.log('3 filter pengguna OK:', cariGuru.length, 'guru');

    // ---------- 2. guru membuat kelas + import siswa ----------
    const g = await call('POST', '/api/login', null, { email: guruBaru.email, password: 'password123' });
    const kelas = await call('POST', '/api/kelas', g.token, {
      nama: 'XI TPM Uji ' + unik, tingkat: 'XI', kompetensi: 'Teknik Pemesinan', tahun_ajaran: '2026/2027'
    });
    dibersihkan.push(['kelas', kelas.id]);
    harus(/^[A-Z2-9]{6}$/.test(kelas.kode), 'kode undangan otomatis');
    console.log('4 guru buat kelas OK:', kelas.nama, 'kode', kelas.kode);

    const sandiSiswa = 'Uji' + unik + '9';
    const importHasil = await call('POST', `/api/kelas/${kelas.id}/import`, g.token, {
      teks: `${unik}1;Rina Uji;rina${unik}@murid.sch.id\n${unik}2;Doni Uji;\n${unik}1;Rina Duplikat;`,
      password_sementara: sandiSiswa
    });
    harus(importHasil.dibuat.length === 2, 'import membuat 2 akun (baris ketiga duplikat NIS)');
    harus(importHasil.sudah_ada === 1, 'baris duplikat tercatat sebagai sudah ada');
    importHasil.dibuat.forEach(u => dibersihkan.push(['user', u.id]));
    console.log('5 import NIS OK:', importHasil.dibuat.length, 'dibuat,', importHasil.sudah_ada, 'sudah ada. Email otomatis:',
      importHasil.dibuat[1].email);

    const anggota = await call('GET', `/api/kelas/${kelas.id}/anggota`, g.token);
    harus(anggota.length === 2 && anggota[0].jumlah_tugas === 0, 'daftar anggota');
    console.log('6 daftar anggota OK:', anggota.map(a => a.nama + ' (NIS ' + a.nis + ')').join(', '));

    // ---------- 3. siswa gabung dengan kode + materi + tugas ----------
    const rina = importHasil.dibuat.find(u => u.email.startsWith('rina'));
    const s = await call('POST', '/api/login', null, { email: rina.email, password: sandiSiswa });
    const doniEmail = importHasil.dibuat.find(u => !u.email.startsWith('rina')).email;
    const d = await call('POST', '/api/register', null, {
      nama: 'Dodi Gabung ' + unik, email: 'dodi' + unik + '@murid.sch.id',
      password: sandiSiswa, kode: kelas.kode
    });
    dibersihkan.push(['user', d.user.id]);
    console.log('7 siswa masuk + gabung pakai kode OK:', d.user.nama, 'kelas', d.user.kelas);
    void doniEmail;

    const materi = await call('POST', '/api/materi', g.token, {
      kelas_id: kelas.id, judul: 'Materi: aman kerja di mesin bubut', tipe: 'teks',
      isi: 'Gunakan kacamata, jangan memakai sarung tangan saat spindle berputar.', urutan: 1
    });
    const daftarMateri = await call('GET', `/api/materi?kelas_id=${kelas.id}`, g.token);
    harus(daftarMateri.length === 1 && daftarMateri[0].id === materi.id, 'materi tersimpan dan terbaca siswa');
    console.log('8 materi OK:', daftarMateri[0].judul);

    const tugas = await call('POST', '/api/tugas', g.token, {
      kelas_id: kelas.id, judul: 'Praktik: tirus Ø40 ke Ø20', jenis: 'praktik',
      instruksi: 'Bubut tirus sampai target lalu kirim programnya.',
      target_profil: { stock_d: 40, stock_l: 60, target_d: 20, target_z: 40 },
      starter_gcode: 'G90\nG00 X40 Z0\n', poin: 100, batas_lulus: 70,
      materi_ids: [materi.id], status: 'terbit'
    });
    dibersihkan.push(['tugas', tugas.id]);
    console.log('9 tugas praktik terbit OK:', tugas.judul, 'target', JSON.stringify(tugas.target));

    // ---------- 4. siswa mengerjakan praktik ----------
    const daftarSiswa = await call('GET', '/api/tugas/saya', s.token);
    const tampil = daftarSiswa.find(t => t.id === tugas.id);
    harus(tampil && tampil.punya_saya === null, 'tugas tampil di daftar siswa');
    const kirim = await call('POST', `/api/tugas/${tugas.id}/submit`, s.token, {
      gcode: 'G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50 Z5'
    });
    harus(kirim.skor >= 90 && kirim.match, 'skor simulasi praktik');
    harus(kirim.pengumpulan.status === 'terkumpul', 'status terkumpul');
    console.log('10 submit praktik OK: skor', kirim.skor, 'percobaan ke-', kirim.pengumpulan.jumlah_percobaan);

    const ulangi = await call('POST', `/api/tugas/${tugas.id}/submit`, s.token, { gcode: 'G90\nG01 X20 Z-40' });
    harus(ulangi.pengumpulan.jumlah_percobaan === 2, 'jumlah percobaan bertambah');
    console.log('11 submit ulang OK: percobaan', ulangi.pengumpulan.jumlah_percobaan, 'skor', ulangi.skor);

    // ---------- 5. guru menilai ----------
    const kumpulan = await call('GET', `/api/tugas/${tugas.id}/pengumpulan`, g.token);
    harus(kumpulan.length === 3, 'daftar pengumpulan memuat seluruh anggota (2 + doni)');
    const punya = kumpulan.find(k => k.siswa_id === s.user.id);
    await call('PUT', `/api/pengumpulan/${punya.id}`, g.token, { nilai_guru: 85, catatan_guru: 'Sudut tirus sudah tepat.' });
    const dinilai = await call('GET', `/api/tugas/${tugas.id}/pengumpulan`, g.token);
    const barisNilai = dinilai.find(k => k.siswa_id === s.user.id);
    harus(barisNilai.status === 'dinilai' && barisNilai.nilai_akhir === 85, 'nilai guru terpakai');
    console.log('12 penilaian guru OK:', barisNilai.siswa_nama, 'nilai', barisNilai.nilai_akhir, barisNilai.status);

    const nilaiSiswa = await call('GET', '/api/nilai/saya', s.token);
    const baris = nilaiSiswa.nilai.find(n => n.tugas.id === tugas.id);
    harus(baris.nilai === 85 && baris.tuntas, 'nilai tampil untuk siswa');
    console.log('13 nilai saya OK: rata-rata', nilaiSiswa.rata_rata, 'per kelas', nilaiSiswa.per_kelas.length);

    // minta revisi lalu siswa mengumpulkan lagi
    await call('POST', `/api/pengumpulan/${barisNilai.id}/koreksi`, g.token, { catatan_guru: 'Tambahkan gerak aman menjauhi chuck.' });
    const setelahKoreksi = await call('GET', `/api/tugas/saya`, s.token);
    const statusRevisi = setelahKoreksi.find(t => t.id === tugas.id).punya_saya.status;
    harus(statusRevisi === 'perlu_revisi', 'status perlu revisi terlihat siswa');
    await call('POST', `/api/tugas/${tugas.id}/submit`, s.token, {
      gcode: 'G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50 Z5'
    });
    console.log('14 koreksi + revisi OK');

    // ---------- 6. kuis empat tipe soal ----------
    const kuis = await call('POST', '/api/tugas', g.token, {
      kelas_id: kelas.id, judul: 'Kuis: dasar G-Code', jenis: 'kuis', poin: 40, batas_lulus: 60, status: 'terbit',
      soal: [
        { tipe: 'pg', teks: 'Nilai X pada bubut menyatakan?', opsi: ['Diameter', 'Radius', 'Panjang', 'Putaran'], kunci: 0, poin: 10 },
        { tipe: 'benar_salah', teks: 'G00 aman melintasi material.', kunci: false, poin: 10 },
        { tipe: 'isian', teks: 'Kode koordinat inkremental.', kunci: ['G91', 'g91'], poin: 10 },
        { tipe: 'praktik', teks: 'Bubut Ø40 menjadi Ø30 sepanjang 30 mm.', poin: 10,
          target: { stock_d: 40, stock_l: 60, target_d: 30, target_z: 30 } }
      ]
    });
    dibersihkan.push(['tugas', kuis.id]);
    harus(kuis.soal.length === 4 && kuis.soal[0].kunci === 0, 'soal tersimpan dengan kunci untuk guru');
    const kuisSiswa = await call('GET', `/api/tugas/${kuis.id}`, s.token);
    harus(kuisSiswa.soal.every(q => q.kunci === undefined), 'kunci tidak bocor ke siswa');
    console.log('15 kuis dibuat OK:', kuis.soal.map(q => q.tipe).join(', '), '| kunci tersembunyi untuk siswa');

    const jawab = await call('POST', `/api/tugas/${kuis.id}/kuis`, s.token, {
      jawaban: [
        { soal_id: kuis.soal[0].id, jawaban: 0 },
        { soal_id: kuis.soal[1].id, jawaban: false },
        { soal_id: kuis.soal[2].id, jawaban: ' g91 ' },
        { soal_id: kuis.soal[3].id, gcode: 'G90\nG00 X40 Z0\nG01 X30 Z-30 F100\nG00 X50 Z5' }
      ]
    });
    harus(jawab.benar === 4 && jawab.skor === 100, 'kuis dinilai otomatis sempurna');
    console.log('16 jawab kuis OK: benar', jawab.benar + '/' + jawab.total, 'skor', jawab.skor);

    const hasil = await call('GET', `/api/tugas/${kuis.id}/hasil`, s.token);
    harus(hasil.jawaban.length === 4 && hasil.jawaban[0].pembahasan !== undefined, 'hasil kuis per soal');
    const jawabSalah = await call('POST', `/api/tugas/${kuis.id}/kuis`, s.token, {
      jawaban: [{ soal_id: kuis.soal[0].id, jawaban: 2 }]
    });
    harus(jawabSalah.benar === 0 && jawabSalah.skor === 0, 'jawaban kosong/salah tidak dapat poin');
    console.log('17 hasil kuis OK, dan nilai nol untuk jawaban salah:', jawabSalah.skor);

    // ---------- 7. rekap, statistik, ekspor ----------
    const rekap = await call('GET', `/api/kelas/${kelas.id}/rekap`, g.token);
    harus(rekap.tugas.length === 2 && rekap.baris.length === 3, 'rekap memuat 2 tugas dan 3 siswa');
    const barisRina = rekap.baris.find(b => b.siswa.id === s.user.id);
    harus(barisRina.nilai[tugas.id] === 85, 'nilai rekap memakai nilai guru');
    console.log('18 rekap kelas OK:', rekap.baris.map(b => b.siswa.nama + '=' + (b.nilai[tugas.id] ?? '-')).join(', '));

    const res = await fetch(`${B}/api/export/nilai?kelas_id=${kelas.id}`, { headers: { Authorization: 'Bearer ' + g.token } });
    const buffer = Buffer.from(await res.arrayBuffer());
    harus(buffer.subarray(0, 3).toString('hex') === 'efbbbf', 'CSV diawali BOM UTF-8');
    const csv = buffer.toString('utf8');
    harus(csv.includes('Praktik: tirus'), 'CSV memuat judul tugas');
    console.log('19 ekspor CSV OK:', csv.split('\n')[0].trim().replace(/^\uFEFF/, ''), '|', csv.split('\n')[1]);

    const stGuru = await call('GET', '/api/stats/guru', g.token);
    const stKelas = await call('GET', `/api/stats/kelas/${kelas.id}`, g.token);
    const stSiswa = await call('GET', '/api/stats/siswa', s.token);
    const stSekolah = await call('GET', '/api/stats/sekolah', admin.token);
    harus(stGuru.kelas >= 1 && stKelas.tugas.length === 2 && stSiswa.tugas_aktif === 2 && stSekolah.user.siswa >= 3,
      'statistik tiap peran terisi');
    console.log('20 statistik OK: guru', JSON.stringify({ kelas: stGuru.kelas, siswa: stGuru.siswa, menunggu: stGuru.menunggu_dinilai }),
      '| siswa', JSON.stringify({ perlu: stSiswa.perlu_dikerjakan, rata: stSiswa.rata_nilai }),
      '| sekolah', JSON.stringify(stSekolah.user));

    const prog = await call('POST', '/api/programs', s.token, { nama: 'O' + unik, gcode: 'G90\nG00 X40 Z0' });
    await call('DELETE', `/api/programs/${prog.id}`, s.token);
    console.log('21 manajer program tetap jalan');

    // ---------- 8. penolakan akses ----------
    let status = 0;
    try { await call('POST', '/api/kelas', s.token, { nama: 'Kelas siswa' }); }
    catch (e) { status = e.status; }
    harus(status === 403, 'siswa tidak bisa membuat kelas (403), dapat ' + status);

    const guru2 = await call('POST', '/api/users', admin.token, {
      nama: 'Bu Penguji ' + unik, email: 'guru2' + unik + '@smk.sch.id', role: 'guru', password: 'password123'
    });
    dibersihkan.push(['user', guru2.id]);
    const g2 = await call('POST', '/api/login', null, { email: guru2.email, password: 'password123' });
    status = 0;
    try { await call('GET', `/api/kelas/${kelas.id}`, g2.token); } catch (e) { status = e.status; }
    harus(status === 403, 'guru lain tidak bisa membaca kelas (403), dapat ' + status);
    status = 0;
    try { await call('PUT', '/api/users/' + s.user.id, g2.token, { nama: 'ubah' }); } catch (e) { status = e.status; }
    harus(status === 403, 'guru tidak bisa mengubah akun (403), dapat ' + status);
    status = 0;
    try { await call('GET', '/api/stats/sekolah', g.token); } catch (e) { status = e.status; }
    harus(status === 403, 'rekap sekolah khusus admin (403), dapat ' + status);
    console.log('22 proteksi peran OK (siswa, guru lain, admin only)');

    void d; void rina; void doniEmail;

    console.log('\nSEMUA UJI LMS LOLOS');
  } catch (e) {
    console.error('GAGAL:', e.message);
    process.exitCode = 1;
  } finally {
    // bereskan data uji supaya DB staging tetap rapi
    const a = await call('POST', '/api/login', null, { email: 'admin@smk.sch.id', password: 'password123' });
    for (const [jenis, id] of dibersihkan.slice().reverse()) {
      try {
        if (jenis === 'kelas') await call('DELETE', '/api/kelas/' + id, a.token);
        else await call('DELETE', '/api/users/' + id, a.token);
      } catch (err) { console.error('  bersih-bersih ' + jenis + ' ' + id + ': ' + err.message); }
    }
  }
})();
