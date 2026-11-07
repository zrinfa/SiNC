// =============================================================
// api.js - klien REST Firebase Serverless + mesin simulasi G-Code.
// Menggunakan Firestore, Firebase Auth, dan Firebase Storage.
// =============================================================
import { handleFirebaseApi } from './firebaseApi.js';

export function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

export async function api(path, opts = {}) {
  try {
    return await handleFirebaseApi(path, opts);
  } catch (err) {
    console.error('API Error:', path, err);
    throw err;
  }
}

// unggah multipart (materi, lkpd) ke Firebase Storage
export async function apiForm(path, fd, method = 'POST') {
  try {
    return await handleFirebaseApi(path, { method }, fd);
  } catch (err) {
    console.error('API Form Error:', path, err);
    throw err;
  }
}

// unduh berkas (CSV rekap nilai langsung di-generate di browser)
export async function unduhBerkas(path, namaBerkas) {
  if (path.includes('/api/export/nilai')) {
    const urlObj = new URL(path, window.location.origin);
    const kelasId = urlObj.searchParams.get('kelas_id');
    const data = await handleFirebaseApi(`/api/kelas/${kelasId}/rekap`);
    const rows = [['NIS', 'Nama', 'Kelas']];
    (data.tugas || []).forEach((t) => rows[0].push(`${t.judul} (${t.poin})`));
    rows[0].push('Rata-rata');

    (data.baris || []).forEach((b) => {
      const row = [b.siswa?.nis || '', b.siswa?.nama || '', b.siswa?.kelas || data.kelas?.nama || ''];
      const isi = [];
      (data.tugas || []).forEach((t) => {
        const n = b.nilai?.[t.id] ?? null;
        row.push(n === null ? '' : n);
        if (n !== null && n !== undefined) isi.push(Number(n));
      });
      row.push(isi.length > 0 ? (isi.reduce((acc, c) => acc + c, 0) / isi.length).toFixed(1) : '');
      rows.push(row);
    });

    const csvContent = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = namaBerkas || 'nilai.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
}

export const urlBerkas = (p) => (p ? p : null);
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'));

// ---------------- G-CODE ENGINE ----------------
const RES = 0.5, TOL = 0.5;

export function parseGCode(text) {
  const out = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith(';')) continue;
    line = line.replace(/\(.*?\)/g, '').trim();
    if (!line) continue;
    const ins = { raw: line };
    for (const m of line.matchAll(/([A-Z])\s*(-?\d+(?:\.\d+)?)/gi)) ins[m[1].toUpperCase()] = parseFloat(m[2]);
    out.push(ins);
  }
  return out;
}

function arcPoints(a1, b1, a2, b2, ins, cw) {
  let ca, cb, r;
  if (ins.I !== undefined || ins.K !== undefined) {
    ca = a1 + (ins.I ?? 0); cb = b1 + (ins.K ?? 0);
    r = Math.hypot(a1 - ca, b1 - cb);
    if (r < 1e-9) return { error: 'pusat busur sama dengan titik awal (I/K nol).' };
    if (Math.abs(Math.hypot(a2 - ca, b2 - cb) - r) > 0.5)
      return { error: 'titik akhir tidak pada lingkaran I/K (selisih > 0.5 mm). Periksa I/K.' };
  } else if (ins.R !== undefined) {
    r = ins.R;
    if (r <= 0) return { error: 'R harus positif.' };
    const dx = b2 - b1, dy = a2 - a1, d = Math.hypot(dx, dy);
    if (d < 1e-9) return { error: 'titik awal = titik akhir, busur tak terdefinisi.' };
    if (r < d / 2 - 1e-9) return { error: `R=${r} terlalu kecil untuk jarak titik (${d.toFixed(2)} mm).` };
    const mx = (b1 + b2) / 2, my = (a1 + a2) / 2;
    const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
    const s = cw ? -1 : 1;
    cb = mx + s * h * (-dy / d); ca = my + s * h * (dx / d);
  } else {
    return { error: 'busur butuh R atau I/K (mis. G03 X20 Z-20 R5).' };
  }
  const ang1 = Math.atan2(a1 - ca, b1 - cb), ang2 = Math.atan2(a2 - ca, b2 - cb);
  let sweep = cw ? ang1 - ang2 : ang2 - ang1;
  while (sweep <= 0) sweep += 2 * Math.PI;
  if (sweep < 1e-9) sweep = 2 * Math.PI;
  const n = Math.max(8, Math.min(200, Math.ceil((r * sweep) / 0.5)));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const a = cw ? ang1 - (sweep * i) / n : ang1 + (sweep * i) / n;
    pts.push([ca + r * Math.sin(a), cb + r * Math.cos(a)]);
  }
  return { points: pts };
}

export function applyCut(profile, x1, z1, x2, z2) {
  const steps = profile.length;
  const idx = (zv) => Math.max(0, Math.min(steps - 1, Math.round(-zv / RES)));
  const lo = Math.max(0, Math.min(idx(Math.max(z1, z2)), idx(Math.min(z1, z2))));
  const hi = Math.min(steps - 1, Math.max(idx(Math.max(z1, z2)), idx(Math.min(z1, z2))));
  const rS = x1 / 2, rE = x2 / 2;
  if (lo === hi) { if (rE < profile[lo]) profile[lo] = Math.max(0, rE); return; }
  for (let i = lo; i <= hi; i++) {
    const t = (i - lo) / (hi - lo);
    const r = z1 <= z2 ? rS + (rE - rS) * t : rE + (rS - rE) * (1 - t);
    if (r < profile[i]) profile[i] = Math.max(0, r);
  }
}

export function simulate(instructions, stockD, stockL) {
  const steps = Math.round(stockL / RES) + 1;
  const profile = new Array(steps).fill(stockD / 2);
  const stockR = stockD / 2;
  let x = stockD, z = 0, mode = 'abs';
  const moves = [], events = [];
  let hasMode = false, first = true;
  const idx = (zv) => Math.max(0, Math.min(steps - 1, Math.round(-zv / RES)));
  const chuckHit = (px, pz) => -pz < -1e-9 && px / 2 < stockR + 1 - 1e-9;

  for (const ins of instructions) {
    const g = ins.G;
    if (g === 90) { mode = 'abs'; hasMode = true; continue; }
    if (g === 91) { mode = 'inc'; hasMode = true; continue; }
    if (g === undefined) continue;
    if (![0, 1, 2, 3].includes(g)) {
      if (Number.isInteger(g) && g >= 0 && g <= 99)
        events.push({ type: 'warn', msg: `Baris "${ins.raw}": G${g} diabaikan simulator v1 (hanya G00/G01/G02/G03/G90/G91).` });
      continue;
    }
    const tX = ins.X !== undefined ? (mode === 'abs' ? ins.X : x + ins.X) : x;
    const tZ = ins.Z !== undefined ? (mode === 'abs' ? ins.Z : z + ins.Z) : z;
    if (tX < -1e-9) events.push({ type: 'err', msg: `Baris "${ins.raw}": diameter X tidak boleh negatif.`, moveIndex: moves.length });

    if (g === 0) {
      if (!first) {
        const segLen = Math.abs(tX - x) + Math.abs(tZ - z);
        const n = Math.max(1, Math.min(400, Math.ceil(segLen / 0.5)));
        for (let k = 1; k <= n; k++) {
          const qx = x + ((tX - x) * k) / n, qz = z + ((tZ - z) * k) / n;
          if (qx / 2 < profile[idx(qz)] - 0.05 || chuckHit(qx, qz)) {
            events.push({ type: 'err', msg: `Baris "${ins.raw}": gerakan cepat (G00) menabrak material/chuck di Z≈${qz.toFixed(1)}.`, moveIndex: moves.length });
            break;
          }
        }
      }
      moves.push({ x1: x, z1: z, x2: tX, z2: tZ, rapid: true });
    } else if (g === 1) {
      if (ins.F === undefined) events.push({ type: 'warn', msg: `Baris "${ins.raw}": G01 tanpa F (feed rate).` });
      else if (ins.F > 2000) events.push({ type: 'warn', msg: `Baris "${ins.raw}": F${ins.F} berlebihan untuk bubut latihan.` });
      if (chuckHit(tX, tZ)) events.push({ type: 'err', msg: `Baris "${ins.raw}": pahat masuk zona chuck (Z>0 di dalam material).`, moveIndex: moves.length });
      applyCut(profile, x, z, tX, tZ);
      moves.push({ x1: x, z1: z, x2: tX, z2: tZ, rapid: false });
    } else {
      if (ins.F === undefined) events.push({ type: 'warn', msg: `Baris "${ins.raw}": busur tanpa F (feed rate).` });
      const arc = arcPoints(x / 2, -z, tX / 2, -tZ, ins, g === 2);
      if (arc.error) {
        events.push({ type: 'err', msg: `Baris "${ins.raw}": ${arc.error}`, moveIndex: moves.length });
      } else {
        let px = x, pz = z, stop = false;
        for (const [ra, ba] of arc.points) {
          const qx = ra * 2, qz = -ba;
          if (chuckHit(qx, qz)) {
            events.push({ type: 'err', msg: `Baris "${ins.raw}": busur masuk zona chuck.`, moveIndex: moves.length });
            stop = true; break;
          }
          applyCut(profile, px, pz, qx, qz);
          moves.push({ x1: px, z1: pz, x2: qx, z2: qz, rapid: false, arc: true });
          px = qx; pz = qz;
        }
        if (stop) { x = tX; z = tZ; first = false; continue; }
      }
    }
    x = tX; z = tZ; first = false;
  }
  if (!hasMode) events.push({ type: 'warn', msg: 'Tidak ada G90/G91 - diasumsikan absolut (G90).' });
  if (!events.some((e) => e.type === 'err') && !events.some((e) => e.type === 'warn'))
    events.push({ type: 'ok', msg: 'Simulasi selesai tanpa tabrakan terdeteksi.' });
  return { profile, moves, events, resolution: RES };
}

export function compareTarget(profile, targetD, targetZ) {
  const idx = Math.round(targetZ / RES);
  if (idx >= profile.length) return { match: false, diff: null, detail: 'Target di luar panjang stock.' };
  const got = profile[Math.max(0, idx - 1)], want = targetD / 2, diff = Math.abs(got - want);
  return { match: diff <= TOL, diff: +diff.toFixed(2), detail: `Radius di Z≈${targetZ}mm: ${got.toFixed(2)}mm (target ${want}mm, toleransi ±${TOL}mm)` };
}

export function autoScore(events, cmp) {
  let errs = 0, warns = 0;
  for (const e of events) e.type === 'err' ? errs++ : e.type === 'warn' && warns++;
  let s = 100 - 25 * errs - 5 * warns;
  if (errs === 0 && cmp && cmp.diff != null && !cmp.match) s -= cmp.diff * 8;
  return { skor: Math.max(0, Math.min(100, Math.round(s))), ada_error: errs > 0 };
}

// ---------------- syntax highlight (educatif, ringan) ----------------
export function highlightGcode(src) {
  return src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\(.*?\))/g, '<span class="tk-c">$1</span>')
    .replace(/(^|\s)(G0*0|G0*1|G0*2|G0*3|G28|G90|G91|M0*[3589]|F-?\d+\.?\d*|S\d+|T\d+)(?=\s|$)/gm, '$1<span class="tk-g">$2</span>')
    .replace(/([XZRIK])(-?\d+\.?\d*)/g, '<span class="tk-a">$1</span><span class="tk-n">$2</span>');
}

// ---------------- render 2D layar CNC ----------------
export function drawSim(canvas, { profile, movesUpTo, stockD, stockL, toolPos, crashed }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#14181d'; ctx.fillRect(0, 0, W, H);
  const cx = H / 2, sX = (W - 90) / stockL, sR = (H / 2 - 30) / (stockD / 2 || 1);
  const X = (zv) => 50 + -zv * sX, Y = (r) => cx - r * sR;
  // chuck
  ctx.fillStyle = '#4a5058'; ctx.fillRect(16, Y(stockD / 2) - 8, 34, stockD * sR / 2 + 16);
  ctx.fillStyle = '#c7cbd1'; ctx.font = '10px sans-serif'; ctx.fillText('CHUCK', 18, Y(stockD / 2) - 12);
  // sumbu tengah
  ctx.strokeStyle = '#3a4048'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(50, cx); ctx.lineTo(W - 40, cx); ctx.stroke(); ctx.setLineDash([]);
  // profil
  ctx.strokeStyle = '#5b8fb0'; ctx.fillStyle = 'rgba(79,163,209,.2)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  profile.forEach((r, i) => { const px = X(-i * RES), py = Y(r); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
  for (let i = profile.length - 1; i >= 0; i--) ctx.lineTo(X(-i * RES), Y(-profile[i]));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // toolpath
  for (const m of movesUpTo) {
    ctx.strokeStyle = m.rapid ? '#d1904f' : '#4fd19a';
    ctx.setLineDash(m.rapid ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(X(m.z1), Y(m.x1 / 2)); ctx.lineTo(X(m.z2), Y(m.x2 / 2)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // pahat
  if (toolPos) {
    const tx = X(toolPos.z), ty = Y(toolPos.x / 2);
    ctx.fillStyle = crashed ? '#d15f5f' : '#e8b923';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 9, ty - 9); ctx.lineTo(tx + 18, ty); ctx.lineTo(tx + 9, ty + 9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0c23a'; ctx.font = 'bold 12px monospace';
    ctx.fillText(`X ${toolPos.x.toFixed(2)}  Z ${toolPos.z.toFixed(2)}`, W - 170, H - 12);
    if (crashed) {
      ctx.fillStyle = '#d15f5f'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('TABRAKAN - simulasi berhenti (auto-stop)', tx + 24, ty - 12);
    }
  }
}
