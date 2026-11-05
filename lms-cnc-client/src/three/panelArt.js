// =============================================================
// panelArt.js — lukisan layar kontrol GreaMaT 805Ta.
// Dipakai dua kali: overlay 2D saat mengedit program dan tekstur
// layar pada panel fisik di mesin 3D.
// =============================================================

const YELLOW = '#ffd21e';
const YELLOW_DIM = '#8a7414';
const GREEN = '#55e86b';
const CYAN = '#71c7e8';
const RED = '#ff6b55';

function dashedLine(ctx, x1, y1, x2, y2, dash = 8) {
  ctx.save();
  ctx.setLineDash([dash, dash]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function text(ctx, value, x, y, size, color = YELLOW, align = 'left', weight = 'bold') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Consolas, "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

export function drawPanelScreen(ctx, {
  w = 960,
  h = 640,
  profile,
  preview,
  tool,
  stockD = 40,
  stockL = 60,
  target,
  status = 'EDIT',
  program = 'O0240',
  line = 'N00950',
  cutting = false,
} = {}) {
  ctx.clearRect(0, 0, w, h);

  // layar CRT gelap dengan sedikit vignette
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, w * 0.75);
  bg.addColorStop(0, '#0a110c');
  bg.addColorStop(0.66, '#050906');
  bg.addColorStop(1, '#020403');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // bingkai tipis dalam layar
  ctx.strokeStyle = 'rgba(255,210,30,.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // ---------------- header ----------------
  text(ctx, 'GRAPHICS', 34, 55, 30, YELLOW);
  const right = w - 34;
  text(ctx, program, right - 250, 55, 28, YELLOW, 'right');
  text(ctx, line, right - 40, 55, 28, YELLOW, 'right');

  const px = tool?.x ?? 0;
  const pz = tool?.z ?? 0;
  text(ctx, 'X', right - 250, 86, 17, YELLOW, 'right');
  text(ctx, (px).toFixed(3), right - 160, 86, 18, YELLOW, 'right');
  text(ctx, 'Z', right - 250, 109, 17, YELLOW, 'right');
  text(ctx, (pz).toFixed(3), right - 160, 109, 18, YELLOW, 'right');
  text(ctx, 'C', right - 250, 132, 17, YELLOW, 'right');
  text(ctx, '0', right - 160, 132, 18, YELLOW, 'right');

  // ---------------- ikon sumbu ----------------
  ctx.strokeStyle = YELLOW;
  ctx.fillStyle = YELLOW;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(46, 90);
  ctx.lineTo(46, 152);
  ctx.lineTo(126, 152);
  ctx.stroke();
  // panah Z ke kanan
  ctx.beginPath();
  ctx.moveTo(126, 152);
  ctx.lineTo(113, 145);
  ctx.lineTo(113, 159);
  ctx.closePath();
  ctx.fill();
  // panah X ke bawah
  ctx.beginPath();
  ctx.moveTo(46, 152);
  ctx.lineTo(39, 139);
  ctx.lineTo(53, 139);
  ctx.closePath();
  ctx.fill();
  text(ctx, 'Z', 136, 158, 19, YELLOW);
  text(ctx, 'X', 37, 178, 19, YELLOW);

  // ---------------- area grafik ----------------
  const plot = { x: 205, y: 112, w: 610, h: 330 };
  const zb = plot.x + 26;
  const len = Math.max(1, stockL);
  const zScale = (plot.w - 58) / len;
  const maxR = Math.max(stockD / 2, target?.d ? target.d / 2 : 0, 1);
  const base = plot.y + plot.h - 28;
  const rScale = (plot.h - 58) / maxR;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y - 8, plot.w, plot.h);
  ctx.clip();

  // grid halus
  ctx.strokeStyle = 'rgba(255,210,30,.07)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= 10; gx++) {
    const x = zb + (gx / 10) * len * zScale;
    ctx.beginPath();
    ctx.moveTo(x, plot.y + 8);
    ctx.lineTo(x, base);
    ctx.stroke();
  }
  for (let gy = 0; gy <= 5; gy++) {
    const y = base - (gy / 5) * maxR * rScale;
    ctx.beginPath();
    ctx.moveTo(zb, y);
    ctx.lineTo(zb + len * zScale, y);
    ctx.stroke();
  }

  const xAt = (mm) => zb + Math.max(0, Math.min(len, mm)) * zScale;
  const yAt = (r) => base - Math.max(0, r) * rScale;

  function fillProfile(radii, fill, stroke, alpha = 1) {
    if (!radii || !radii.length) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(xAt(0), base);
    for (let i = 0; i < radii.length; i++) {
      ctx.lineTo(xAt(i * 0.5), yAt(radii[i]));
    }
    ctx.lineTo(xAt((radii.length - 1) * 0.5), base);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // bayangan program lengkap (hasil akhir)
  const hasCut = profile?.some((r) => r < stockD / 2 - 0.02) ?? false;
  if (preview && preview.length) {
    if (hasCut) {
      fillProfile(preview, 'rgba(138,116,20,.34)', 'rgba(255,210,30,.42)');
    } else {
      fillProfile(preview, 'rgba(255,198,0,.78)', '#ffe45a');
    }
  }

  // stok awal
  ctx.strokeStyle = 'rgba(240,245,240,.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(zb, yAt(stockD / 2), len * zScale, base - yAt(stockD / 2));

  // profil aktual / potongan saat ini
  if (hasCut) fillProfile(profile, 'rgba(255,198,0,.78)', '#ffe45a');

  // garis target
  if (target?.d && target?.z) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    dashedLine(ctx, xAt(target.z), yAt(target.d / 2), xAt(target.z), base, 7);
    dashedLine(ctx, zb, yAt(target.d / 2), xAt(target.z), yAt(target.d / 2), 7);
  }

  // posisi pahat
  const tx = xAt(-pz);
  const ty = yAt(px / 2);
  ctx.fillStyle = cutting ? '#fff3b0' : RED;
  ctx.beginPath();
  ctx.arc(tx, ty, cutting ? 6 : 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (cutting) {
    ctx.strokeStyle = 'rgba(255,220,80,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  // label sumbu pada grafik
  text(ctx, 'Z+', zb - 4, plot.y + 18, 14, YELLOW_DIM);
  text(ctx, 'X+', zb + 6, base - maxR * rScale - 8, 14, YELLOW_DIM);

  ctx.restore();

  // ---------------- status & soft keys ----------------
  const statusColor = status === 'ALARM' ? RED
    : status === 'AUTO' || status === 'SELESAI' ? GREEN : YELLOW;
  text(ctx, status, 620, 512, 24, statusColor, 'left');

  const keys = ['GRAPHM', 'GRAPH', 'Q-GRAPH', 'STOP', 'CLEAR'];
  let kx = 32;
  for (const key of keys) {
    const active = key === 'GRAPH';
    const label = key;
    const kw = key === 'Q-GRAPH' ? 142 : 116;
    if (active) {
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillRect(kx, 532, kw, 40);
      text(ctx, label, kx + kw / 2, 560, 21, '#071007', 'center');
    } else {
      text(ctx, '(', kx, 560, 22, GREEN, 'left');
      text(ctx, label, kx + 16, 560, 21, GREEN, 'left');
      text(ctx, ')', kx + 20 + ctx.measureText(label).width, 560, 22, GREEN, 'left');
    }
    kx += kw + 10;
  }

  // footer kecil
  text(ctx, 'GreaMaT  CNC Series 805Ta', w - 32, h - 22, 15, 'rgba(255,210,30,.55)', 'right', 'normal');

  // scanline + vignette CRT
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();

  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

export function drawPanelLabel(ctx, w = 512, h = 52) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#12171b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.strokeRect(1, 1, w - 2, h - 2);
  text(ctx, 'GreaMaT', 16, 36, 28, '#e8edf2');
  text(ctx, 'CNC Series  805Ta', 152, 35, 23, '#c6ced6', 'left', 'normal');
}
