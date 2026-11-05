# Kontrak API LMS Simulator Bubut CNC

Acuan tunggal untuk backend (`backend-php/routes/*.php`) dan frontend
(`lms-cnc-client/src/`). Semua endpoint berprefix `/api`, respons selalu JSON,
keberhasilan mengirim status 200 (kecuali 201 dibuat), dan kegagalan mengirim
`{"error": "pesan untuk pengguna"}` dengan status 400/401/403/404/413/500.

## Aturan umum

- Autentikasi: header `Authorization: Bearer <token>` hasil `/api/login`.
- Peran ditulis `[admin]`, `[guru]`, `[siswa]`. `[guru]` pada sumber daya kelas
  berarti pengampu kelas tersebut atau admin. `[siswa]` berarti anggota kelas.
- `target` selalu objek `{stock_d, stock_l, target_d, target_z}` dalam mm.
  Sumbernya `tugas.target_profil`, bila NULL diambil dari `modul_latihan`.
- Tanggal memakai format MySQL `YYYY-MM-DD HH:MM:SS`, waktu server.
- Identitas berupa UUID string 36 karakter, dibuat backend (`uuid4()`).
- Tidak ada emoji dan tidak ada em dash pada teks yang dikirim ke klien.

## Objek

```jsonc
user    {id, nama, email, username, nis, role, kelas, status, last_login}
kelas   {id, nama, kode, guru_id, guru_nama, tingkat, kompetensi, tahun_ajaran,
         deskripsi, jumlah_siswa, jumlah_tugas, perlu_dinilai}
anggota {id, user_id, nama, email, nis, kelas, gabung_pada,
         jumlah_tugas, terkumpul, dinilai, rata_nilai}
materi  {id, kelas_id, judul, tipe, url, berkas, isi, urutan, dibuat_oleh, created_at}
tugas   {id, kelas_id, kelas_nama, judul, instruksi, jenis, status, poin, batas_lulus,
         tenggat, boleh_ulang, modul_id, starter_gcode, lkpd_url, materi_ids, target,
         dibuat_oleh, dibuat_nama, created_at, jumlah_siswa, jumlah_kumpul,
         jumlah_dinilai, skor_rata}
soal    {id, tugas_id, urutan, tipe, teks, opsi, kunci, pembahasan, poin, target}
         // untuk siswa: kunci dan pembahasan dihilangkan
pengumpulan {id, tugas_id, tugas_judul, siswa_id, siswa_nama, nis, gcode,
             skor_simulasi, ada_error, nilai_guru, nilai_akhir, catatan_guru, status,
             jumlah_percobaan, waktu_submit, waktu_periksa, diperiksa_nama}
jawaban {id, soal_id, urutan, tipe, teks, jawaban, gcode, benar, poin, soal_poin,
         pembahasan, kunci}
```

## 1. Auth

| Metode | Path | Peran | Berkas | Hasil |
|---|---|---|---|---|
| POST | `/api/register` | publik | `{nama, email, password, kelas?, kode?}` | `{token, user}`; role selalu `siswa`; `kode` membuat siswa langsung bergabung ke kelas itu |
| POST | `/api/login` | publik | `{email, password}` | `{token, user}`; akun `nonaktif` ditolak 403; `last_login` diperbarui |
| GET | `/api/me` | login | - | `user` |
| PUT | `/api/me` | login | `{nama, kelas?}` | `user` |
| PUT | `/api/me/password` | login | `{password_lama, password_baru}` | `{ok: true}` |

## 2. Pengguna `[admin]`

| Metode | Path | Berkas | Hasil |
|---|---|---|---|
| GET | `/api/users?role=&status=&q=&kelas_id=&bukan_di_kelas=` | query filter, `q` mencari di nama/email/nis/username | `user[]`; guru hanya boleh `role=siswa` |
| POST | `/api/users` | `{nama, email, password, role, nis?, username?, kelas?}` | `user`; bila `password` dikosongkan backend membuat satu password acak dan mengirimnya sekali lewat field tambahan `password_sementara`; email/username ganda 400 |
| POST | `/api/users/bulk` | `{role, teks, pisahkan?, password_sementara?}` tiap baris `NIS;Nama;Email` (guru: `Nama;Email`), pemisah otomatis `;` `,` atau tab | `{dibuat: user[], lewat: n, password_sementara}`; satu password dipakai bersama untuk seluruh batch, `lewat` menghitung baris yang NIS/emailnya sudah ada |
| PUT | `/api/users/{id}` | `{nama?, email?, role?, status?, nis?, kelas?, username?}` | `user` |
| POST | `/api/users/{id}/reset-password` | - | `{password_sementara}` (12 karakter acak, dikirim sekali ke layar) |
| DELETE | `/api/users/{id}` | - | `{ok: true}`; menolak menghapus akun sendiri dan menolak menghapus pengguna yang masih punya kelas |

`[guru]` boleh `GET /api/users?role=siswa` saja, dipakai untuk mencari calon anggota kelas.

## 3. Kelas

| Metode | Path | Peran | Berkas | Hasil |
|---|---|---|---|---|
| GET | `/api/kelas` | admin: semua, guru: milik sendiri, siswa: kelasnya | - | `kelas[]` |
| POST | `/api/kelas` | guru, admin | `{nama, tingkat?, kompetensi?, tahun_ajaran?, deskripsi?, guru_id?}` (`guru_id` hanya admin) | `kelas`, `kode` dibuat otomatis 6 karakter |
| GET | `/api/kelas/{id}` | pemilik + anggotanya | - | `kelas` + `anggota[]` + `tugas[]` (siswa hanya menerima tugas `terbit` tanpa `kunci` soal, plus `punya_saya`) |
| PUT | `/api/kelas/{id}` | `[guru]` | sama seperti POST | `kelas` |
| DELETE | `/api/kelas/{id}` | `[guru]` | - | `{ok: true}` (anggota ikut lepas, tugas dan nilai terhapus) |
| PUT | `/api/kelas/{id}/kode` | `[guru]` | - | `kelas` dengan `kode` baru |
| POST | `/api/kelas/gabung` | siswa | `{kode}` | `kelas`; label `user.kelas` ikut diperbarui |
| GET | `/api/kelas/{id}/anggota` | `[guru]`, anggota | - | `anggota[]` (email dan status hanya untuk guru/admin; siswa melihat agregat dirinya) |
| POST | `/api/kelas/{id}/anggota` | `[guru]` | `{user_ids: []}` atau `{user_id}` | `{ditambah: n, anggota: anggota[]}`; menolak bukan siswa |
| POST | `/api/kelas/{id}/import` | `[guru]` | `{teks, pisahkan?, password_sementara?}` baris `NIS;Nama;Email` (email boleh kosong, dibuat `nis@sekolah.id`) | `{dibuat: user[], sudah_ada: n, password_sementara, anggota: anggota[]}`; satu password dipakai untuk seluruh batch, bila kosong backend membuatnya |
| DELETE | `/api/kelas/{id}/anggota/{userId}` | `[guru]` | - | `{ok: true}` |
| GET | `/api/kelas/{id}/rekap` | `[guru]`, admin | - | `{tugas: tugas[], baris: [{siswa, nilai: {tugas_id: nilai}}]}` |
| GET | `/api/export/nilai?kelas_id=` | `[guru]`, admin | - | berkas CSV `text/csv` dengan BOM UTF-8 |

## 4. Materi

| Metode | Path | Peran | Berkas | Hasil |
|---|---|---|---|---|
| GET | `/api/materi?kelas_id=` | `[guru]`, anggota | - | `materi[]` urut `urutan` |
| POST | `/api/materi` | `[guru]` | multipart `kelas_id, judul, tipe, url, isi, urutan` dan opsional `berkas` (pdf/png/jpg/webp/gif/mp4/docx, maksimal 20 MB) | `materi`, `berkas` berisi path `/uploads/...` |
| PUT | `/api/materi/{id}` | `[guru]` | sama, `berkas` boleh kosong agar lama tetap dipakai; berkas baru menggantikan yang lama dari disk | `materi` |
| DELETE | `/api/materi/{id}` | `[guru]` | - | `{ok: true}` (berkas ikut terhapus) |

## 5. Modul latihan (pustaka)

Tetap seperti sebelumnya di `/api/modules` (GET, POST, PUT/{id}, DELETE/{id}) dan
`/api/module/{id}` untuk satu modul, dipakai pustaka modul milik guru dan admin.
Respons memuat `dibuat_nama` dan `jumlah_tugas`; tugas yang modul acuannya dihapus
kehilangan pengaitnya (`tugas.modul_id` di-set NULL oleh database) tetapi nilai
siswa tetap tersimpan. Unggah LKPD memakai field multipart `lkpd` pada POST/PUT.

## 6. Tugas dan soal

| Metode | Path | Peran | Berkas | Hasil |
|---|---|---|---|---|
| GET | `/api/tugas?kelas_id=&status=` | `[guru]`, admin | - | `tugas[]` |
| GET | `/api/tugas/saya` | siswa | - | `tugas[]` yang `terbit` + `punya_saya` (ringkasan pengumpulan dirinya) |
| POST | `/api/tugas` | `[guru]` | `{kelas_id, judul, instruksi?, jenis, modul_id?, target_profil?, starter_gcode?, poin, batas_lulus, tenggat?, boleh_ulang, status, lkpd_url?, materi_ids?}` dan opsional `soal[]` saat `jenis=kuis` | `tugas` lengkap dengan `soal[]` |
| GET | `/api/tugas/{id}` | `[guru]` penuh, siswa tanpa kunci | - | `tugas` (+ `soal[]` bila kuis, + `pengumpulan[]` untuk guru) |
| PUT | `/api/tugas/{id}` | `[guru]` | sebagian field + `soal[]` (mengganti seluruh soal) | `tugas` |
| PUT | `/api/tugas/{id}/status` | `[guru]` | `{status: "draf"|"terbit"}` | `tugas` |
| DELETE | `/api/tugas/{id}` | `[guru]` | - | `{ok: true}` |

Bentuk tiap item `soal`:

```json
{ "tipe": "pg|benar_salah|isian|praktik", "teks": "...", "poin": 10,
  "opsi": ["A", "B"], "kunci": 0, "pembahasan": "...",
  "target": {"stock_d":40,"stock_l":60,"target_d":30,"target_z":30} }
```

`kunci` untuk `pg` berupa index, `benar_salah` boolean, `isian` array teks yang
diterima (pencocokan mengabaikan besar kecil huruf dan spasi berlebih),
`praktik` tidak memakai kunci karena dinilai mesin G-Code.

## 7. Pengerjaan, pengumpulan, penilaian

| Metode | Path | Peran | Berkas | Hasil |
|---|---|---|---|---|
| POST | `/api/tugas/{id}/submit` | siswa | `{gcode}` tugas `praktik` | `{pengumpulan, percobaan_id, skor, ada_error, match, events, compare, target}`; `skor` 0 sampai 100 hasil mesin G-Code, satu baris `percobaan` ikut tercatat, `jumlah_percobaan` naik |
| POST | `/api/tugas/{id}/kuis` | siswa | `{jawaban: [{soal_id, jawaban, gcode?}]}` | `{pengumpulan, skor, benar, total, jawaban[]}`; dinilai otomatis, `jawaban_kuis` disimpan, skor soal `praktik` diambil dari simulasi |
| GET | `/api/tugas/{id}/pengumpulan?status=` | `[guru]` | - | `pengumpulan[]` termasuk siswa yang belum mengumpulkan (`status: "belum"`, `id: null`) |
| GET | `/api/tugas/{id}/hasil` | siswa | - | `{pengumpulan, jawaban[], tugas}` |
| PUT | `/api/pengumpulan/{id}` | `[guru]` | `{nilai_guru, catatan_guru, status}` dengan `nilai_guru` 0 sampai `tugas.poin` | `pengumpulan`; `status` mengikuti nilai bila tidak dikirim, `dinilai` sekaligus mengisi `waktu_periksa` dan `diperiksa_oleh` |
| POST | `/api/pengumpulan/{id}/koreksi` | `[guru]` | `{catatan_guru}` | `pengumpulan` dengan status `perlu_revisi`; pengumpulan ulang tetap dibuka walau tenggat sudah lewat |
| GET | `/api/nilai/saya` | siswa | - | `{nilai: [{tugas, nilai, skor_simulasi, nilai_guru, catatan_guru, status, batas_lulus, tuntas}], rata_rata, per_kelas: [{kelas_id, kelas_nama, rata, jumlah}]}` |

Skala nilai: `skor_simulasi` selalu 0 sampai 100, sedangkan `nilai_guru` memakai skala
`tugas.poin` supaya guru mengetik angka yang benar-benar ia berikan. Nilai akhir
(kolom `nilai_akhir`) dinormalkan ke skala 100 dengan
`COALESCE(nilai_guru * 100 / poin, skor_simulasi)`.

## 8. Endpoint yang sudah ada (tidak berubah bentuk)

- `POST /api/attempts` kini menerima `tugas_id` opsional dan membalas bentuk lama.
- `GET /api/attempts?modul_id=&user_id=` tidak berubah.
- `GET|POST|PUT|DELETE /api/programs` tidak berubah.
- `GET /api/progress?kelas_id=` untuk guru; tanpa filter memakai seluruh kelasnya.
- `POST /api/ai-tutor` kini menerima `tugas_id` opsional selain `modul_id`.

## 9. Statistik

| Metode | Path | Peran | Hasil |
|---|---|---|---|
| GET | `/api/stats/siswa` | siswa | `{tugas_aktif, perlu_dikerjakan, tenggat_dekat: [{id, judul, tenggat, kelas_nama}], rata_nilai, tuntas, total}` |
| GET | `/api/stats/guru` | guru, admin | `{kelas, siswa, tugas_terbit, menunggu_dinilai, rata_nilai, teratas: [{id, nama, nis, kelas, rata_nilai}], kelas_list: kelas[]}` |
| GET | `/api/stats/kelas/{id}` | `[guru]`, admin | `{kelas, tugas: [{id, judul, jenis, rata, tuntas, belum_kumpul, jumlah_siswa}], distribusi: [{rentang, jumlah}], rata_kelas}` |
| GET | `/api/stats/sekolah` | admin | `{user: {admin, guru, siswa, nonaktif}, kelas, tugas_terbit, pengumpulan: {total, dinilai}, rata_nilai_sekolah, siswa_teratas: [{id, nama, nis, kelas, rata_nilai}], kelas_teratas: [{id, nama, kode, tingkat, siswa, tugas, rata_nilai}], simulasi}` |
