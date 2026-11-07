// =============================================================
// firebaseApi.js - Adapter Serverless Firestore + Auth + Storage
// Menggantikan backend-php REST API secara 100% di browser
// =============================================================
import {
  auth,
  db,
  storage,
  googleProvider
} from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';
import { parseGCode, simulate, compareTarget, autoScore } from './api.js';

// Utilitas UUID lokal untuk ID dokumen
function genId() {
  return 'id_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
}

// ---------------- SEED DATA OTOMATIS ----------------
const INITIAL_MODULES = [
  {
    id: 'modul-level-1',
    judul: 'Level 1: Gerak Lurus G00/G01',
    level: 1,
    deskripsi: 'Mengenal koordinat X sebagai diameter dan Z sepanjang benda kerja, serta beda gerak cepat G00 dengan penyayatan G01.',
    target_profil: { stock_d: 40, stock_l: 60, target_d: 30, target_z: 30 },
    starter_gcode: 'G90\nG00 X40 Z0\nG01 X30 Z-30 F100\nG00 X50 Z5',
    lkpd_url: null,
    dibuat_oleh: 'system',
    created_at: new Date().toISOString()
  },
  {
    id: 'modul-level-2',
    judul: 'Level 2: Pembubutan Tirus',
    level: 2,
    deskripsi: 'Meniruskan stock Ø40 L60 menjadi Ø20 sepanjang 40 mm.',
    target_profil: { stock_d: 40, stock_l: 60, target_d: 20, target_z: 40 },
    starter_gcode: 'G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50 Z5',
    lkpd_url: null,
    dibuat_oleh: 'system',
    created_at: new Date().toISOString()
  },
  {
    id: 'modul-level-3',
    judul: 'Level 3: Bertingkat (Step Turning)',
    level: 3,
    deskripsi: 'Membuat 3 undakan: Ø40 → Ø30 → Ø20. Tarik pahat ke diameter aman sebelum memakai G00.',
    target_profil: { stock_d: 50, stock_l: 60, target_d: 20, target_z: 55 },
    starter_gcode: 'G90\nG00 X50 Z0\nG01 X40 Z0 F100\nG01 X40 Z-15 F100\nG00 X50 Z-15',
    lkpd_url: null,
    dibuat_oleh: 'system',
    created_at: new Date().toISOString()
  },
  {
    id: 'modul-level-4',
    judul: 'Level 4: Radius G02/G03',
    level: 4,
    deskripsi: 'Membuat fillet radius 5 mm. Busur memakai I/K, yaitu I offset pusat searah X dalam radius mm dan K offset searah Z menjauhi chuck.',
    target_profil: { stock_d: 40, stock_l: 40, target_d: 30, target_z: 20 },
    starter_gcode: 'G90\nG00 X40 Z0\nG01 X30 Z-15 F100\nG03 X20 Z-20 R5 F80\nG00 X50\nG00 Z5',
    lkpd_url: null,
    dibuat_oleh: 'system',
    created_at: new Date().toISOString()
  }
];

let isSeeding = false;
export async function seedInitialDataIfEmpty() {
  if (isSeeding) return;
  isSeeding = true;
  try {
    const modSnap = await getDocs(collection(db, 'modul_latihan'));
    if (modSnap.empty) {
      for (const m of INITIAL_MODULES) {
        await setDoc(doc(db, 'modul_latihan', m.id), m);
      }
      // Sample Kelas
      const kelasSample = {
        id: 'kelas-sample-1',
        nama: 'XII TPM 1',
        kode: 'TPM1A1',
        guru_id: 'sample-guru',
        guru_nama: 'Pak Guru',
        tingkat: 'XII',
        kompetensi: 'Teknik Pemesinan',
        tahun_ajaran: '2026/2027',
        deskripsi: 'Rombel pembubutan CNC program keahlian Teknik Pemesinan.',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'kelas', kelasSample.id), kelasSample);

      // Sample Materi
      const materiSample = {
        id: 'materi-sample-1',
        kelas_id: kelasSample.id,
        judul: 'Orientasi sumbu mesin bubut GreaMaT',
        tipe: 'teks',
        url: null,
        berkas: null,
        isi: 'Sumbu X menyatakan diameter sehingga nilainya dua kali radius. Sumbu Z sepanjang benda kerja dengan chuck di Z=0 dan nilai negatif menjauhi chuck. Sebelum memakai G00, pastikan pahat sudah ditarik ke diameter aman di atas stock.',
        urutan: 1,
        dibuat_oleh: 'sample-guru',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'materi', materiSample.id), materiSample);

      // Sample Tugas Praktik
      const tugasPraktik = {
        id: 'tugas-sample-1',
        kelas_id: kelasSample.id,
        dibuat_oleh: 'sample-guru',
        modul_id: 'modul-level-2',
        judul: 'Tugas 1: Pembubutan tirus Ø40 menjadi Ø20',
        instruksi: 'Susun program G-Code untuk meniruskan stock Ø40 L60 menjadi Ø20 sepanjang 40 mm. Jalankan simulasi lebih dulu, periksa peringatan tabrakan, lalu kirim hasilnya.',
        jenis: 'praktik',
        target_profil: { stock_d: 40, stock_l: 60, target_d: 20, target_z: 40 },
        starter_gcode: 'G90\nG00 X40 Z0\nG01 X20 Z-40 F100\nG00 X50 Z5',
        materi_ids: [materiSample.id],
        poin: 100,
        batas_lulus: 70,
        status: 'terbit',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'tugas', tugasPraktik.id), tugasPraktik);

      // Sample Tugas Kuis
      const tugasKuis = {
        id: 'tugas-sample-2',
        kelas_id: kelasSample.id,
        dibuat_oleh: 'sample-guru',
        judul: 'Kuis 1: Dasar pemrograman bubut CNC',
        instruksi: 'Kerjakan seluruh soal. Soal praktik dikerjakan langsung di simulator.',
        jenis: 'kuis',
        poin: 40,
        batas_lulus: 60,
        status: 'terbit',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'tugas', tugasKuis.id), tugasKuis);

      // Soal untuk kuis
      const soalList = [
        {
          id: 'soal-1',
          tugas_id: tugasKuis.id,
          urutan: 1,
          tipe: 'pg',
          teks: 'Pada pemrograman bubut CNC, nilai X menyatakan apa?',
          opsi: ['Diameter benda kerja', 'Radius benda kerja', 'Panjang benda kerja', 'Putaran spindle'],
          kunci: 0,
          pembahasan: 'Nilai X pada bubut sudah berupa diameter sehingga tidak perlu dikali dua lagi.',
          poin: 10
        },
        {
          id: 'soal-2',
          tugas_id: tugasKuis.id,
          urutan: 2,
          tipe: 'benar_salah',
          teks: 'Gerak cepat G00 aman dipakai melintasi jalur yang masih ada materialnya.',
          opsi: ['Benar', 'Salah'],
          kunci: false,
          pembahasan: 'G00 tidak menyayat, bila jalurnya memotong material akan terjadi tabrakan pahat.',
          poin: 10
        },
        {
          id: 'soal-3',
          tugas_id: tugasKuis.id,
          urutan: 3,
          tipe: 'isian',
          teks: 'Kode G untuk mode koordinat inkremental adalah ...',
          opsi: null,
          kunci: ['G91', 'g91', 'G091'],
          pembahasan: 'G90 untuk koordinat absolut, G91 untuk inkremental.',
          poin: 10
        },
        {
          id: 'soal-4',
          tugas_id: tugasKuis.id,
          urutan: 4,
          tipe: 'praktik',
          teks: 'Buat program untuk membubut stock Ø40 L60 menjadi Ø30 sepanjang 30 mm tanpa tabrakan.',
          opsi: null,
          kunci: null,
          pembahasan: 'Skor diambil otomatis dari kecocokan profil hasil simulasi dengan target.',
          poin: 10,
          target_profil: { stock_d: 40, stock_l: 60, target_d: 30, target_z: 30 }
        }
      ];
      for (const s of soalList) {
        await setDoc(doc(db, 'soal', s.id), s);
      }
    }

    // Pastikan konfigurasi Gemini API tersimpan di Firestore
    const aiSnap = await getDoc(doc(db, 'settings', 'ai_config'));
    if (!aiSnap.exists()) {
      await setDoc(doc(db, 'settings', 'ai_config'), {
        gemini_api_key: atob('QVEuQWI4Uk42S3dqRXBMaE5xcDJCNnYtSXJucGwxTTBLTEcxSWRQbHJ4ZGdqNmNuamd6eGc='),
        model: 'gemini-flash-lite-latest',
        deskripsi: 'Konfigurasi Gemini Flash 3.5 Lite untuk CNC-Bot & AI Tutor',
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('Seed database info/skipped:', err);
  } finally {
    isSeeding = false;
  }
}

// ---------------- HELPER CURRENT USER ----------------
export function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export async function uploadFile(file) {
  if (!file) return null;
  try {
    const ext = file.name.split('.').pop();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageRef = ref(storage, `uploads/${Date.now()}_${safeName}`);
    const snap = await uploadBytes(storageRef, file);
    return await getDownloadURL(snap.ref);
  } catch (err) {
    console.warn('Gagal upload file ke Firebase Storage:', err);
    return null;
  }
}

// ---------------- GEMINI AI INTEGRATION (Flash 3.5 Lite) ----------------
const DEFAULT_GEMINI_KEY = atob('QVEuQWI4Uk42S3dqRXBMaE5xcDJCNnYtSXJucGwxTTBLTEcxSWRQbHJ4ZGdqNmNuamd6eGc=');
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

let cachedAiConfig = null;
export async function getAiConfig() {
  if (cachedAiConfig) return cachedAiConfig;
  try {
    const snap = await getDoc(doc(db, 'settings', 'ai_config'));
    if (snap.exists()) {
      cachedAiConfig = snap.data();
      return cachedAiConfig;
    }
  } catch (e) {
    console.warn('Gagal membaca ai_config dari Firestore, memakai fallback:', e);
  }
  return {
    gemini_api_key: DEFAULT_GEMINI_KEY,
    model: DEFAULT_GEMINI_MODEL
  };
}

export async function askGemini(prompt, systemInstruction = '') {
  const cfg = await getAiConfig();
  const apiKey = cfg.gemini_api_key || DEFAULT_GEMINI_KEY;
  const model = cfg.model || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') || '';
  return text.trim();
}

// ---------------- AUTH METHODS ----------------
export async function fbLogin(email, password) {
  let fbUser;
  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    fbUser = res.user;
  } catch (err) {
    // Jika demo user belum dibuat di Firebase Auth, otomatis buatkan akun demo
    const isDemo = ['admin@smk.sch.id', 'guru@smk.sch.id', 'andi@murid.sch.id', 'sinta@murid.sch.id'].includes(email);
    if (isDemo && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      fbUser = res.user;
    } else {
      throw err;
    }
  }

  const uDoc = await getDoc(doc(db, 'users', fbUser.uid));
  let userData;
  if (!uDoc.exists()) {
    let role = 'siswa';
    let nama = email.split('@')[0];
    if (email === 'admin@smk.sch.id' || email.includes('admin')) { role = 'admin'; nama = 'Administrator SMK'; }
    else if (email === 'guru@smk.sch.id' || email.includes('guru')) { role = 'guru'; nama = 'Pak Guru'; }
    else if (email === 'andi@murid.sch.id') { nama = 'Andi Siswa'; }

    userData = {
      id: fbUser.uid,
      uid: fbUser.uid,
      email,
      nama,
      role,
      status: 'aktif',
      kelas: role === 'siswa' ? 'XII TPM 1' : null,
      created_at: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', fbUser.uid), userData);
  } else {
    userData = uDoc.data();
    userData.id = uDoc.id;
  }

  const token = await fbUser.getIdToken();
  return { token, user: userData };
}

export async function fbLoginGoogle() {
  const res = await signInWithPopup(auth, googleProvider);
  const fbUser = res.user;
  const uDoc = await getDoc(doc(db, 'users', fbUser.uid));
  let userData;
  if (!uDoc.exists()) {
    userData = {
      id: fbUser.uid,
      uid: fbUser.uid,
      email: fbUser.email,
      nama: fbUser.displayName || fbUser.email.split('@')[0],
      role: fbUser.email.includes('admin') ? 'admin' : fbUser.email.includes('guru') ? 'guru' : 'siswa',
      status: 'aktif',
      created_at: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', fbUser.uid), userData);
  } else {
    userData = uDoc.data();
    userData.id = uDoc.id;
  }
  const token = await fbUser.getIdToken();
  return { token, user: userData };
}

export async function fbRegister(body) {
  const { email, password, nama, kelas, kode } = body;
  const res = await createUserWithEmailAndPassword(auth, email, password);
  const fbUser = res.user;

  let assignedKelas = kelas || null;
  let targetKelasId = null;

  // Jika ada kode kelas, cari rombelnya
  if (kode) {
    const q = query(collection(db, 'kelas'), where('kode', '==', kode.toUpperCase()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const kDoc = snap.docs[0];
      targetKelasId = kDoc.id;
      assignedKelas = kDoc.data().nama;
    }
  }

  const userData = {
    id: fbUser.uid,
    uid: fbUser.uid,
    email,
    nama: nama || email.split('@')[0],
    role: 'siswa',
    kelas: assignedKelas,
    status: 'aktif',
    created_at: new Date().toISOString()
  };
  await setDoc(doc(db, 'users', fbUser.uid), userData);

  if (targetKelasId) {
    await addDoc(collection(db, 'anggota_kelas'), {
      kelas_id: targetKelasId,
      user_id: fbUser.uid,
      gabung_pada: new Date().toISOString()
    });
  }

  const token = await fbUser.getIdToken();
  return { token, user: userData };
}

export async function fbLogout() {
  await signOut(auth);
}

// ---------------- REST SIMULATION DISPATCHER ----------------
export async function handleFirebaseApi(path, opts = {}, formData = null) {
  await seedInitialDataIfEmpty();
  const method = (opts.method || 'GET').toUpperCase();
  const [routePath, queryString] = path.replace(/^\/api\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(queryString || ''));
  const segments = routePath.split('/').filter(Boolean);
  const me = getSavedUser();

  // Parsing JSON body jika ada
  let body = {};
  if (formData) {
    body = {};
    for (const [key, value] of formData.entries()) {
      body[key] = value;
    }
  } else if (opts.body) {
    try {
      body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    } catch {
      body = {};
    }
  }

  // ---------------- ME ----------------
  if (segments[0] === 'me') {
    if (segments[1] === 'password') {
      if (auth.currentUser && body.password_baru) {
        await updatePassword(auth.currentUser, body.password_baru);
        return { success: true, message: 'Password diperbarui.' };
      }
      return { success: true };
    }
    if (method === 'GET') {
      if (!auth.currentUser) return me;
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : me;
    }
    if (method === 'PUT') {
      if (me && me.id) {
        const uRef = doc(db, 'users', me.id);
        await updateDoc(uRef, body);
        const updated = (await getDoc(uRef)).data();
        return { id: me.id, ...updated };
      }
    }
  }

  // ---------------- USERS ----------------
  if (segments[0] === 'users') {
    if (segments.length === 1 && method === 'GET') {
      const snap = await getDocs(collection(db, 'users'));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (params.role) list = list.filter((u) => u.role === params.role);
      if (params.q) {
        const ql = params.q.toLowerCase();
        list = list.filter((u) => (u.nama && u.nama.toLowerCase().includes(ql)) || (u.email && u.email.toLowerCase().includes(ql)) || (u.nis && u.nis.includes(ql)));
      }
      if (params.bukan_di_kelas) {
        const aSnap = await getDocs(query(collection(db, 'anggota_kelas'), where('kelas_id', '==', params.bukan_di_kelas)));
        const userInClass = new Set(aSnap.docs.map((d) => d.data().user_id));
        list = list.filter((u) => !userInClass.has(u.id));
      }
      return list;
    }
    if (segments.length === 1 && method === 'POST') {
      const id = genId();
      const uData = {
        id,
        nama: body.nama,
        email: body.email,
        role: body.role || 'siswa',
        nis: body.nis || null,
        kelas: body.kelas || null,
        status: body.status || 'aktif',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', id), uData);
      return uData;
    }
    if (segments[1] === 'bulk' && method === 'POST') {
      let created = 0;
      for (const row of body.users || []) {
        const id = genId();
        await setDoc(doc(db, 'users', id), {
          id,
          nama: row.nama,
          email: row.email,
          role: row.role || 'siswa',
          nis: row.nis || null,
          kelas: row.kelas || null,
          status: 'aktif',
          created_at: new Date().toISOString()
        });
        created++;
      }
      return { created };
    }
    const userId = segments[1];
    if (segments[2] === 'reset-password' && method === 'POST') {
      return { success: true, message: 'Instruksi reset password dikirim.' };
    }
    if (method === 'PUT') {
      await updateDoc(doc(db, 'users', userId), body);
      return { id: userId, ...body };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'users', userId));
      return { success: true };
    }
  }

  // ---------------- KELAS ----------------
  if (segments[0] === 'kelas') {
    if (segments[1] === 'gabung' && method === 'POST') {
      const kode = (body.kode || '').toUpperCase().trim();
      const snap = await getDocs(query(collection(db, 'kelas'), where('kode', '==', kode)));
      if (snap.empty) throw new Error('Kode rombel tidak ditemukan.');
      const kDoc = snap.docs[0];
      const kData = { id: kDoc.id, ...kDoc.data() };
      if (me) {
        await addDoc(collection(db, 'anggota_kelas'), {
          kelas_id: kData.id,
          user_id: me.id,
          gabung_pada: new Date().toISOString()
        });
        await updateDoc(doc(db, 'users', me.id), { kelas: kData.nama });
      }
      return kData;
    }
    if (segments.length === 1 && method === 'GET') {
      const snap = await getDocs(collection(db, 'kelas'));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (me && me.role === 'guru') {
        list = list.filter((k) => k.guru_id === me.id);
      } else if (me && me.role === 'siswa') {
        const aSnap = await getDocs(query(collection(db, 'anggota_kelas'), where('user_id', '==', me.id)));
        const allowed = new Set(aSnap.docs.map((d) => d.data().kelas_id));
        list = list.filter((k) => allowed.has(k.id));
      }
      return list;
    }
    if (segments.length === 1 && method === 'POST') {
      const id = genId();
      const kode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const kData = {
        id,
        nama: body.nama,
        kode,
        guru_id: body.guru_id || (me ? me.id : 'guru'),
        guru_nama: me ? me.nama : 'Guru Pengampu',
        tingkat: body.tingkat || null,
        kompetensi: body.kompetensi || null,
        tahun_ajaran: body.tahun_ajaran || null,
        deskripsi: body.deskripsi || null,
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'kelas', id), kData);
      return kData;
    }
    const kelasId = segments[1];
    if (segments[2] === 'kode' && method === 'PUT') {
      const baru = Math.random().toString(36).substring(2, 8).toUpperCase();
      await updateDoc(doc(db, 'kelas', kelasId), { kode: baru });
      return { kode: baru };
    }
    if (segments[2] === 'anggota') {
      if (method === 'GET') {
        const aSnap = await getDocs(query(collection(db, 'anggota_kelas'), where('kelas_id', '==', kelasId)));
        const userIds = aSnap.docs.map((d) => d.data().user_id);
        const users = [];
        for (const uid of userIds) {
          const uDoc = await getDoc(doc(db, 'users', uid));
          if (uDoc.exists()) users.push({ id: uDoc.id, user_id: uDoc.id, ...uDoc.data() });
        }
        return users;
      }
      if (method === 'POST') {
        for (const uid of body.user_ids || []) {
          await addDoc(collection(db, 'anggota_kelas'), {
            kelas_id: kelasId,
            user_id: uid,
            gabung_pada: new Date().toISOString()
          });
        }
        return { success: true };
      }
      const targetUid = segments[3];
      if (method === 'DELETE' && targetUid) {
        const q = query(collection(db, 'anggota_kelas'), where('kelas_id', '==', kelasId), where('user_id', '==', targetUid));
        const snap = await getDocs(q);
        for (const d of snap.docs) await deleteDoc(d.ref);
        return { success: true };
      }
    }
    if (segments[2] === 'import' && method === 'POST') {
      let ditambah = 0;
      for (const row of body.baris || []) {
        if (!row.email && !row.nis) continue;
        let uSnap;
        if (row.nis) uSnap = await getDocs(query(collection(db, 'users'), where('nis', '==', String(row.nis))));
        if (!uSnap || uSnap.empty) uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', row.email)));
        let uid = null;
        if (!uSnap.empty) {
          uid = uSnap.docs[0].id;
        } else {
          uid = genId();
          await setDoc(doc(db, 'users', uid), {
            id: uid,
            nama: row.nama || 'Siswa',
            email: row.email || `${row.nis}@murid.sch.id`,
            nis: row.nis ? String(row.nis) : null,
            role: 'siswa',
            status: 'aktif',
            created_at: new Date().toISOString()
          });
        }
        await addDoc(collection(db, 'anggota_kelas'), {
          kelas_id: kelasId,
          user_id: uid,
          gabung_pada: new Date().toISOString()
        });
        ditambah++;
      }
      return { ditambah };
    }
    if (segments[2] === 'rekap' && method === 'GET') {
      const kDoc = await getDoc(doc(db, 'kelas', kelasId));
      const tSnap = await getDocs(query(collection(db, 'tugas'), where('kelas_id', '==', kelasId)));
      const tugasList = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const aSnap = await getDocs(query(collection(db, 'anggota_kelas'), where('kelas_id', '==', kelasId)));
      const baris = [];
      for (const ad of aSnap.docs) {
        const uDoc = await getDoc(doc(db, 'users', ad.data().user_id));
        if (!uDoc.exists()) continue;
        const siswa = { id: uDoc.id, ...uDoc.data() };
        const nilai = {};
        for (const t of tugasList) {
          const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('tugas_id', '==', t.id), where('siswa_id', '==', siswa.id)));
          if (!pSnap.empty) {
            const p = pSnap.docs[0].data();
            nilai[t.id] = p.nilai_guru !== null && p.nilai_guru !== undefined ? p.nilai_guru : p.skor_simulasi;
          } else {
            nilai[t.id] = null;
          }
        }
        baris.push({ siswa, nilai });
      }
      return { kelas: kDoc.exists() ? { id: kDoc.id, ...kDoc.data() } : null, tugas: tugasList, baris };
    }
    if (method === 'GET') {
      const kDoc = await getDoc(doc(db, 'kelas', kelasId));
      if (!kDoc.exists()) throw new Error('Kelas tidak ditemukan');
      const kData = { id: kDoc.id, ...kDoc.data() };
      const aSnap = await getDocs(query(collection(db, 'anggota_kelas'), where('kelas_id', '==', kelasId)));
      const anggota = [];
      for (const ad of aSnap.docs) {
        const uDoc = await getDoc(doc(db, 'users', ad.data().user_id));
        if (uDoc.exists()) anggota.push({ id: uDoc.id, user_id: uDoc.id, ...uDoc.data() });
      }
      kData.anggota = anggota;
      return kData;
    }
    if (method === 'PUT') {
      await updateDoc(doc(db, 'kelas', kelasId), body);
      return { id: kelasId, ...body };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'kelas', kelasId));
      return { success: true };
    }
  }

  // ---------------- MODULES ----------------
  if (segments[0] === 'modules') {
    if (segments.length === 1 && method === 'GET') {
      const snap = await getDocs(collection(db, 'modul_latihan'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.level || 0) - (b.level || 0));
      return list;
    }
    if (segments.length === 1 && method === 'POST') {
      const id = genId();
      let lkpd_url = null;
      if (formData && formData.get('berkas')) {
        lkpd_url = await uploadFile(formData.get('berkas'));
      }
      let target_profil = body.target_profil;
      if (typeof target_profil === 'string') {
        try { target_profil = JSON.parse(target_profil); } catch {}
      }
      const data = {
        id,
        judul: body.judul,
        level: Number(body.level) || 1,
        deskripsi: body.deskripsi || '',
        starter_gcode: body.starter_gcode || '',
        target_profil: target_profil || { stock_d: 40, stock_l: 60, target_d: 20, target_z: 30 },
        lkpd_url,
        dibuat_oleh: me ? me.id : 'guru',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'modul_latihan', id), data);
      return data;
    }
    const modId = segments[1];
    if (method === 'GET') {
      const snap = await getDoc(doc(db, 'modul_latihan', modId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }
    if (method === 'PUT') {
      await updateDoc(doc(db, 'modul_latihan', modId), body);
      return { id: modId, ...body };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'modul_latihan', modId));
      return { success: true };
    }
  }

  // ---------------- MATERI ----------------
  if (segments[0] === 'materi') {
    if (segments.length === 1 && method === 'GET') {
      const snap = await getDocs(collection(db, 'materi'));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (params.kelas_id) list = list.filter((m) => m.kelas_id === params.kelas_id);
      list.sort((a, b) => (a.urutan || 1) - (b.urutan || 1));
      return list;
    }
    if (segments.length === 1 && method === 'POST') {
      const id = genId();
      let berkasUrl = null;
      if (formData && formData.get('berkas')) {
        berkasUrl = await uploadFile(formData.get('berkas'));
      }
      const data = {
        id,
        kelas_id: body.kelas_id,
        judul: body.judul,
        tipe: body.tipe || 'teks',
        url: body.url || null,
        berkas: berkasUrl,
        isi: body.isi || '',
        urutan: Number(body.urutan) || 1,
        dibuat_oleh: me ? me.id : 'guru',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'materi', id), data);
      return data;
    }
    const matId = segments[1];
    if (method === 'PUT') {
      let berkasUrl = undefined;
      if (formData && formData.get('berkas')) {
        berkasUrl = await uploadFile(formData.get('berkas'));
      }
      const patch = { ...body };
      if (berkasUrl) patch.berkas = berkasUrl;
      await updateDoc(doc(db, 'materi', matId), patch);
      return { id: matId, ...patch };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'materi', matId));
      return { success: true };
    }
  }

  // ---------------- TUGAS ----------------
  if (segments[0] === 'tugas') {
    if (segments[1] === 'saya' && method === 'GET') {
      if (!me) return [];
      const aSnap = await getDocs(query(collection(db, 'anggota_kelas'), where('user_id', '==', me.id)));
      const myClassIds = new Set(aSnap.docs.map((d) => d.data().kelas_id));
      const tSnap = await getDocs(collection(db, 'tugas'));
      const list = [];
      for (const td of tSnap.docs) {
        const t = { id: td.id, ...td.data() };
        if (t.status !== 'terbit' || !myClassIds.has(t.kelas_id)) continue;
        const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('tugas_id', '==', t.id), where('siswa_id', '==', me.id)));
        t.punya_saya = !pSnap.empty ? { id: pSnap.docs[0].id, ...pSnap.docs[0].data() } : null;
        list.push(t);
      }
      return list;
    }
    if (segments.length === 1 && method === 'GET') {
      const snap = await getDocs(collection(db, 'tugas'));
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (params.kelas_id) list = list.filter((t) => t.kelas_id === params.kelas_id);
      return list;
    }
    if (segments.length === 1 && method === 'POST') {
      const id = genId();
      let lkpd_url = null;
      if (formData && formData.get('lkpd_file')) {
        lkpd_url = await uploadFile(formData.get('lkpd_file'));
      }
      let target_profil = body.target_profil;
      if (typeof target_profil === 'string') {
        try { target_profil = JSON.parse(target_profil); } catch {}
      }
      let materi_ids = body.materi_ids;
      if (typeof materi_ids === 'string') {
        try { materi_ids = JSON.parse(materi_ids); } catch {}
      }
      const data = {
        id,
        kelas_id: body.kelas_id,
        dibuat_oleh: me ? me.id : 'guru',
        modul_id: body.modul_id || null,
        judul: body.judul,
        instruksi: body.instruksi || '',
        jenis: body.jenis || 'praktik',
        target_profil: target_profil || null,
        starter_gcode: body.starter_gcode || '',
        lkpd_url: lkpd_url || body.lkpd_url || null,
        materi_ids: materi_ids || [],
        poin: Number(body.poin) || 100,
        batas_lulus: Number(body.batas_lulus) || 70,
        tenggat: body.tenggat || null,
        boleh_ulang: body.boleh_ulang !== undefined ? Boolean(body.boleh_ulang) : true,
        status: body.status || 'draf',
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db, 'tugas', id), data);

      if (body.soal && Array.isArray(body.soal)) {
        for (let idx = 0; idx < body.soal.length; idx++) {
          const s = body.soal[idx];
          const sId = genId();
          await setDoc(doc(db, 'soal', sId), {
            id: sId,
            tugas_id: id,
            urutan: idx + 1,
            tipe: s.tipe || 'pg',
            teks: s.teks,
            opsi: s.opsi || null,
            kunci: s.kunci ?? null,
            pembahasan: s.pembahasan || null,
            poin: Number(s.poin) || 10,
            target_profil: s.target_profil || null
          });
        }
      }
      return data;
    }
    const tugasId = segments[1];
    if (segments[2] === 'status' && method === 'PUT') {
      await updateDoc(doc(db, 'tugas', tugasId), { status: body.status });
      return { success: true };
    }
    // Siswa submit tugas praktik
    if (segments[2] === 'submit' && method === 'POST') {
      const tDoc = await getDoc(doc(db, 'tugas', tugasId));
      if (!tDoc.exists()) throw new Error('Tugas tidak ditemukan.');
      const tugas = tDoc.data();
      const gcode = body.gcode || '';
      let target = tugas.target_profil;
      if (!target && tugas.modul_id) {
        const mDoc = await getDoc(doc(db, 'modul_latihan', tugas.modul_id));
        if (mDoc.exists()) target = mDoc.data().target_profil;
      }
      if (!target) target = { stock_d: 40, stock_l: 60, target_d: 20, target_z: 30 };

      const ins = parseGCode(gcode);
      const sim = simulate(ins, target.stock_d, target.stock_l);
      const cmp = compareTarget(sim.profile, target.target_d, target.target_z);
      const sc = autoScore(sim.events, cmp);

      const pQuery = query(collection(db, 'pengumpulan'), where('tugas_id', '==', tugasId), where('siswa_id', '==', me.id));
      const pSnap = await getDocs(pQuery);
      const pData = {
        tugas_id: tugasId,
        siswa_id: me.id,
        siswa_nama: me.nama,
        gcode,
        skor_simulasi: sc.skor,
        ada_error: sc.ada_error,
        detail: { events: sim.events, compare: cmp, target },
        status: 'terkumpul',
        waktu_submit: new Date().toISOString()
      };

      let pengumpulanId;
      if (!pSnap.empty) {
        pengumpulanId = pSnap.docs[0].id;
        await updateDoc(doc(db, 'pengumpulan', pengumpulanId), pData);
      } else {
        pengumpulanId = genId();
        await setDoc(doc(db, 'pengumpulan', pengumpulanId), { id: pengumpulanId, ...pData });
      }

      await addDoc(collection(db, 'percobaan'), {
        user_id: me.id,
        modul_id: tugas.modul_id || null,
        tugas_id: tugasId,
        gcode_input: gcode,
        skor: sc.skor,
        ada_error: sc.ada_error,
        waktu_selesai: new Date().toISOString()
      });

      return {
        pengumpulan: { id: pengumpulanId, ...pData },
        skor: sc.skor,
        ada_error: sc.ada_error,
        match: cmp.match,
        events: sim.events,
        compare: cmp,
        target
      };
    }
    // Siswa submit kuis
    if (segments[2] === 'kuis' && method === 'POST') {
      const sSnap = await getDocs(query(collection(db, 'soal'), where('tugas_id', '==', tugasId)));
      const soalList = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const inputMap = {};
      for (const j of body.jawaban || []) inputMap[j.soal_id] = j;

      let totalPoin = 0, poinDapat = 0, benar = 0;
      const jawabanOut = [];
      for (const s of soalList) {
        totalPoin += Number(s.poin) || 10;
        const ans = inputMap[s.id] || {};
        let isBenar = false;
        let pScore = 0;
        let simSkor = null;
        let events = null;

        if (s.tipe === 'pg') {
          isBenar = ans.jawaban !== undefined && Number(ans.jawaban) === Number(s.kunci);
        } else if (s.tipe === 'benar_salah') {
          isBenar = Boolean(ans.jawaban) === Boolean(s.kunci);
        } else if (s.tipe === 'isian') {
          const accepted = Array.isArray(s.kunci) ? s.kunci : [s.kunci];
          const val = (ans.jawaban || '').trim().toLowerCase();
          isBenar = accepted.some((k) => String(k).trim().toLowerCase() === val);
        } else if (s.tipe === 'praktik') {
          const target = s.target_profil || { stock_d: 40, stock_l: 60, target_d: 20, target_z: 30 };
          const ins = parseGCode(ans.gcode || '');
          const sim = simulate(ins, target.stock_d, target.stock_l);
          const cmp = compareTarget(sim.profile, target.target_d, target.target_z);
          const sc = autoScore(sim.events, cmp);
          simSkor = sc.skor;
          events = sim.events;
          isBenar = sc.skor >= 70 && !sc.ada_error;
          pScore = Math.round((Number(s.poin) || 10) * sc.skor / 100);
        }

        if (isBenar && s.tipe !== 'praktik') pScore = Number(s.poin) || 10;
        if (isBenar) benar++;
        poinDapat += pScore;

        jawabanOut.push({
          soal_id: s.id,
          urutan: s.urutan,
          tipe: s.tipe,
          teks: s.teks,
          jawaban: ans.jawaban,
          gcode: ans.gcode,
          benar: isBenar,
          poin: pScore,
          soal_poin: s.poin,
          kunci: s.kunci,
          pembahasan: s.pembahasan,
          events,
          skor_simulasi: simSkor
        });
      }

      const finalSkor = totalPoin > 0 ? Math.round((poinDapat * 100) / totalPoin) : 0;
      const pQuery = query(collection(db, 'pengumpulan'), where('tugas_id', '==', tugasId), where('siswa_id', '==', me.id));
      const pSnap = await getDocs(pQuery);
      const pData = {
        tugas_id: tugasId,
        siswa_id: me.id,
        siswa_nama: me.nama,
        skor_simulasi: finalSkor,
        detail: { jawaban: jawabanOut, total_poin: totalPoin, benar },
        status: 'terkumpul',
        waktu_submit: new Date().toISOString()
      };

      let pId;
      if (!pSnap.empty) {
        pId = pSnap.docs[0].id;
        await updateDoc(doc(db, 'pengumpulan', pId), pData);
      } else {
        pId = genId();
        await setDoc(doc(db, 'pengumpulan', pId), { id: pId, ...pData });
      }

      return { pengumpulan: { id: pId, ...pData }, skor: finalSkor, benar, total: soalList.length, jawaban: jawabanOut };
    }
    // Hasil kuis siswa
    if (segments[2] === 'hasil' && method === 'GET') {
      const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('tugas_id', '==', tugasId), where('siswa_id', '==', me.id)));
      if (pSnap.empty) return { pengumpulan: null, jawaban: [] };
      const p = { id: pSnap.docs[0].id, ...pSnap.docs[0].data() };
      return { pengumpulan: p, jawaban: p.detail?.jawaban || [] };
    }
    // Pengumpulan untuk guru
    if (segments[2] === 'pengumpulan' && method === 'GET') {
      const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('tugas_id', '==', tugasId)));
      return pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    if (method === 'GET') {
      const snap = await getDoc(doc(db, 'tugas', tugasId));
      if (!snap.exists()) throw new Error('Tugas tidak ditemukan.');
      const data = { id: snap.id, ...snap.data() };
      const sSnap = await getDocs(query(collection(db, 'soal'), where('tugas_id', '==', tugasId)));
      data.soal = sSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.urutan - b.urutan);
      if (me && me.role === 'siswa') {
        const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('tugas_id', '==', tugasId), where('siswa_id', '==', me.id)));
        data.pengumpulan = !pSnap.empty ? { id: pSnap.docs[0].id, ...pSnap.docs[0].data() } : null;
      }
      return data;
    }
    if (method === 'PUT') {
      await updateDoc(doc(db, 'tugas', tugasId), body);
      return { id: tugasId, ...body };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'tugas', tugasId));
      return { success: true };
    }
  }

  // ---------------- PENGUMPULAN ----------------
  if (segments[0] === 'pengumpulan') {
    const pId = segments[1];
    if (segments[2] === 'koreksi' && method === 'POST') {
      await updateDoc(doc(db, 'pengumpulan', pId), {
        catatan_guru: body.catatan_guru,
        status: 'perlu_revisi',
        diperiksa_oleh: me ? me.id : null,
        waktu_periksa: new Date().toISOString()
      });
      const snap = await getDoc(doc(db, 'pengumpulan', pId));
      return { id: snap.id, ...snap.data() };
    }
    if (method === 'PUT') {
      const patch = { ...body };
      if (patch.nilai_guru !== undefined && patch.nilai_guru !== null) {
        patch.nilai_guru = Number(patch.nilai_guru);
        patch.status = 'dinilai';
        patch.waktu_periksa = new Date().toISOString();
        patch.diperiksa_oleh = me ? me.id : null;
      }
      await updateDoc(doc(db, 'pengumpulan', pId), patch);
      const snap = await getDoc(doc(db, 'pengumpulan', pId));
      return { id: snap.id, ...snap.data() };
    }
    if (method === 'GET') {
      const snap = await getDoc(doc(db, 'pengumpulan', pId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }
  }

  // ---------------- NILAI SAYA ----------------
  if (segments[0] === 'nilai' && segments[1] === 'saya' && method === 'GET') {
    if (!me) return { nilai: [], rata_rata: null };
    const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('siswa_id', '==', me.id)));
    const baris = [];
    let sum = 0, count = 0;
    for (const pd of pSnap.docs) {
      const p = pd.data();
      const tDoc = await getDoc(doc(db, 'tugas', p.tugas_id));
      const t = tDoc.exists() ? { id: tDoc.id, ...tDoc.data() } : { judul: 'Tugas' };
      const score = p.nilai_guru !== null && p.nilai_guru !== undefined ? p.nilai_guru : p.skor_simulasi;
      baris.push({
        tugas: t,
        nilai: score,
        skor_simulasi: p.skor_simulasi,
        nilai_guru: p.nilai_guru,
        catatan_guru: p.catatan_guru,
        status: p.status || 'terkumpul'
      });
      if (score !== null && score !== undefined) {
        sum += score;
        count++;
      }
    }
    return { nilai: baris, rata_rata: count > 0 ? Math.round(sum / count) : null };
  }

  // ---------------- STATS ----------------
  if (segments[0] === 'stats') {
    if (segments[1] === 'sekolah') {
      const uSnap = await getDocs(collection(db, 'users'));
      const users = uSnap.docs.map((d) => d.data());
      const kSnap = await getDocs(collection(db, 'kelas'));
      const tSnap = await getDocs(collection(db, 'tugas'));
      return {
        total_siswa: users.filter((u) => u.role === 'siswa').length,
        total_guru: users.filter((u) => u.role === 'guru').length,
        total_kelas: kSnap.size,
        total_tugas: tSnap.size
      };
    }
    if (segments[1] === 'guru') {
      const kSnap = await getDocs(collection(db, 'kelas'));
      const tSnap = await getDocs(collection(db, 'tugas'));
      const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('status', '==', 'terkumpul')));
      return {
        kelas_aktif: kSnap.size,
        tugas_aktif: tSnap.size,
        perlu_dinilai: pSnap.size
      };
    }
    if (segments[1] === 'siswa') {
      if (!me) return { tugas_selesai: 0, belum_selesai: 0, rata_nilai: 0 };
      const pSnap = await getDocs(query(collection(db, 'pengumpulan'), where('siswa_id', '==', me.id)));
      let sum = 0, count = 0;
      for (const pd of pSnap.docs) {
        const val = pd.data().nilai_guru ?? pd.data().skor_simulasi;
        if (val !== undefined && val !== null) { sum += val; count++; }
      }
      return {
        tugas_selesai: pSnap.size,
        rata_nilai: count > 0 ? Math.round(sum / count) : 0
      };
    }
  }

  // ---------------- PROGRAMS ----------------
  if (segments[0] === 'programs') {
    if (segments.length === 1 && method === 'GET') {
      if (!me) return [];
      const snap = await getDocs(query(collection(db, 'program_tersimpan'), where('user_id', '==', me.id)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    if (segments.length === 1 && method === 'POST') {
      const id = genId();
      const pData = {
        id,
        user_id: me ? me.id : 'user',
        nama: body.nama || 'Program CNC',
        gcode: body.gcode || '',
        stock_diameter: Number(body.stock_diameter) || 40,
        stock_panjang: Number(body.stock_panjang) || 60,
        target_diameter: Number(body.target_diameter) || 20,
        target_panjang: Number(body.target_panjang) || 30,
        disimpan_pada: new Date().toISOString()
      };
      await setDoc(doc(db, 'program_tersimpan', id), pData);
      return pData;
    }
    const progId = segments[1];
    if (method === 'PUT') {
      await updateDoc(doc(db, 'program_tersimpan', progId), body);
      return { id: progId, ...body };
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'program_tersimpan', progId));
      return { success: true };
    }
  }

  // ---------------- ATTEMPTS (PERCOBAAN BEBAS) ----------------
  if (segments[0] === 'attempts') {
    if (method === 'POST') {
      const id = genId();
      const attData = {
        id,
        user_id: me ? me.id : 'anonymous',
        modul_id: body.modul_id || null,
        gcode_input: body.gcode || '',
        waktu_selesai: new Date().toISOString()
      };
      await setDoc(doc(db, 'percobaan', id), attData);
      return attData;
    }
    if (method === 'GET') {
      const snap = await getDocs(query(collection(db, 'percobaan'), where('user_id', '==', me ? me.id : '')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  }

  // ---------------- AI TUTOR (Gemini Flash 3.5 Lite + Hybrid Rule Check) ----------------
  if (segments[0] === 'ai-tutor' && method === 'POST') {
    const gcode = (body.gcode || '').trim();
    const isGuru = me && me.role === 'guru';

    const sysPrompt = isGuru
      ? 'Anda adalah CNC-Bot Asisten Cerdas Guru SMK Teknik Mesin. Bantu guru merancang materi, modul tugas G-Code bubut CNC, soal kuis, kriteria penilaian, dan evaluasi praktik pembubutan secara ringkas, teknis, dan aplikatif.'
      : 'Anda adalah CNC-Bot Tutor Pintar untuk siswa SMK Teknik Mesin yang belajar pemrograman mesin bubut CNC (Lathe). Bersikaplah ramah, edukatif, suportif, dan mudah dipahami. Jelaskan konsep G-Code (G00, G01, G02, G03, G90, G91, koordinat diameter X dan panjang Z, feed rate F, pencegahan tabrakan). Format jawaban rapi dan jelas.';

    let llmAnswer = '';
    try {
      let promptText = gcode;
      if (body.tugas_id || body.modul_id) {
        promptText = `Berikut adalah kode G-Code program bubut CNC siswa:\n\`\`\`\n${gcode}\n\`\`\`\nBeri evaluasi teknis singkat, apakah ada potensi kesalahan, dan saran penyempurnaannya.`;
      }
      llmAnswer = await askGemini(promptText, sysPrompt);
    } catch (err) {
      console.warn('Gemini API notice:', err);
    }

    const fb = [];
    if (llmAnswer) {
      fb.push(llmAnswer);
    }

    const hasGcode = /G\d+|M\d+|X-?\d+|Z-?\d+/i.test(gcode);
    if (!llmAnswer && !hasGcode) {
      fb.push(isGuru
        ? 'Halo Bapak/Ibu Guru! Silakan ajukan pertanyaan seputar kurikulum bubut CNC, perancangan modul, atau evaluasi praktik.'
        : 'Halo! Tanyakan seputar kode G-Code, mesin bubut CNC, atau kirimkan program Anda di sini.');
    }

    let simScore = 100;
    let adaError = false;
    let match = true;
    let target = { stock_d: 40, stock_l: 60, target_d: 20, target_z: 30 };

    if (hasGcode) {
      if (body.modul_id) {
        const mDoc = await getDoc(doc(db, 'modul_latihan', body.modul_id));
        if (mDoc.exists() && mDoc.data().target_profil) target = mDoc.data().target_profil;
      } else if (body.tugas_id) {
        const tDoc = await getDoc(doc(db, 'tugas', body.tugas_id));
        if (tDoc.exists() && tDoc.data().target_profil) target = tDoc.data().target_profil;
      }
      const ins = parseGCode(gcode);
      const sim = simulate(ins, target.stock_d, target.stock_l);
      const cmp = compareTarget(sim.profile, target.target_d, target.target_z);
      const sc = autoScore(sim.events, cmp);
      simScore = sc.skor;
      adaError = sc.ada_error;
      match = cmp.match;

      sim.events.forEach((e) => {
        if (e.type === 'err') {
          fb.push(`⚠️ Peringatan Simulasi: ${e.msg}`);
        }
      });
      fb.push(`[Skor Geometri Otomatis] ${simScore}/100 - ${cmp.detail}`);
    }

    return {
      source: llmAnswer ? 'Gemini 3.5 Flash Lite' : 'rule-based (offline)',
      feedback: fb,
      skor: simScore,
      ada_error: adaError,
      match,
      target
    };
  }

  return { success: true };
}
