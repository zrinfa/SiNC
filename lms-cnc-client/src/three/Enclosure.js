// =============================================================
// Enclosure.js — bodi mesin putih + pintu kaca geser.
// Mengikuti mesin referensi: panel kontrol menempel di casing kiri,
// pintu kaca di tengah, casing kanan berisi logo, dan base gelap.
// =============================================================
import * as THREE from 'three';
import { COLORS, MM } from './theme';

const FRAME = 0x2d353d;
const INNER = 0x1b2228;

function part(w, h, d, color, metalness = 0.35, roughness = 0.55) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function logoTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 160);
  ctx.fillStyle = '#c9202b';
  ctx.font = '800 70px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GreMaT', 256, 74);
  ctx.fillStyle = '#20262c';
  ctx.fillRect(96, 92, 320, 48);
  ctx.fillStyle = '#f4f6f7';
  ctx.font = '700 36px Arial, Helvetica, sans-serif';
  ctx.fillText('STH 6166', 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createEnclosure({ stockL = 60 } = {}) {
  const g = new THREE.Group();
  const span = Math.max(2.5, stockL * MM);

  const frontZ = 4.5;
  const rearZ = -(span + 1.95);
  const leftEnd = 8.65;
  const centreZ = (frontZ + rearZ) / 2;
  const opening = frontZ - rearZ;
  const doorW = opening / 2 + 0.1;
  const rightW = Math.max(3.8, doorW + 0.8);
  const rightEnd = rearZ - rightW;
  const leftMid = (frontZ + leftEnd) / 2;
  const leftW = leftEnd - frontZ;
  const rightMid = (rearZ + rightEnd) / 2;
  const doorX = 3.62;
  const glassTop = 3.35;
  const topY = 3.88;
  const botY = -2.58;
  const height = topY - botY;
  const glassH = glassTop - botY;
  const machineMid = (leftEnd + rightEnd) / 2;
  const machineLen = leftEnd - rightEnd;

  // ---------------- base gelap bawah ----------------
  const base = part(7.55, 1.55, machineLen, COLORS.base, 0.3, 0.62);
  base.position.set(0, -3.62, machineMid);
  g.add(base);

  const baseTrim = part(7.7, 0.16, machineLen + 0.1, 0x171d22, 0.25, 0.7);
  baseTrim.position.set(0, -2.82, machineMid);
  g.add(baseTrim);

  // ---------------- dinding belakang + sisi ----------------
  const back = part(0.18, height + 0.35, machineLen - 0.1, INNER, 0.2, 0.7);
  back.position.set(-3.65, (topY + botY) / 2 + 0.1, machineMid);
  g.add(back);

  for (const z of [leftEnd, rightEnd]) {
    const sideWall = part(7.35, height + 0.35, 0.16, COLORS.bodyShade, 0.3, 0.55);
    sideWall.position.set(0, (topY + botY) / 2 + 0.1, z);
    g.add(sideWall);
  }

  // ---------------- casing depan kiri (panel menempel) ----------------
  const leftCase = part(0.22, height, leftW, COLORS.bodyLight, 0.25, 0.5);
  leftCase.position.set(doorX, (topY + botY) / 2, leftMid);
  g.add(leftCase);

  const leftTop = part(7.4, 0.22, leftW, COLORS.bodyShade, 0.25, 0.55);
  leftTop.position.set(0, topY, leftMid);
  g.add(leftTop);

  // inset gelap di bawah panel + kisi ventilasi
  const lowerInset = part(0.035, 1.05, 2.25, INNER, 0.2, 0.8);
  lowerInset.position.set(doorX + 0.13, -1.35, 6.55);
  g.add(lowerInset);
  for (let i = 0; i < 4; i++) {
    const vent = part(0.02, 0.07, 1.55, 0x0d1115, 0.1, 0.9);
    vent.position.set(doorX + 0.155, -0.98 - i * 0.18, 6.55);
    g.add(vent);
  }

  // ---------------- casing depan kanan + logo ----------------
  const rightCase = part(0.22, height, rightW, COLORS.bodyLight, 0.25, 0.5);
  rightCase.position.set(doorX, (topY + botY) / 2, rightMid);
  g.add(rightCase);

  const rightTop = part(7.4, 0.22, rightW, COLORS.bodyShade, 0.25, 0.55);
  rightTop.position.set(0, topY, rightMid);
  g.add(rightTop);

  const logoTex = logoTexture();
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.95, 0.61),
    new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false })
  );
  logo.position.set(doorX + 0.125, 1.25, rightMid);
  logo.rotation.y = Math.PI / 2;
  g.add(logo);

  // stiker peringatan kecil di casing kanan
  for (let i = 0; i < 2; i++) {
    const sticker = part(0.02, 0.26, 0.26, i === 0 ? 0xe0b23a : 0xc9202b, 0.15, 0.5);
    sticker.position.set(doorX + 0.13, -0.35 - i * 0.36, rightMid + 0.75);
    g.add(sticker);
  }

  // ---------------- header atas + rangka pintu ----------------
  const header = part(0.2, topY - glassTop, opening, COLORS.bodyLight, 0.25, 0.5);
  header.position.set(doorX, (topY + glassTop) / 2, centreZ);
  g.add(header);

  const topRail = part(0.18, 0.16, opening + 0.05, FRAME, 0.55, 0.4);
  topRail.position.set(doorX + 0.02, glassTop, centreZ);
  g.add(topRail);

  for (const z of [frontZ, rearZ]) {
    const post = part(0.2, height, 0.18, FRAME, 0.55, 0.4);
    post.position.set(doorX, (topY + botY) / 2, z);
    g.add(post);
  }
  const sill = part(0.25, 0.16, opening, FRAME, 0.55, 0.4);
  sill.position.set(doorX, botY, centreZ);
  g.add(sill);

  // top rear beam untuk siluet mesin
  const rearBeam = part(0.18, 0.2, machineLen, FRAME, 0.55, 0.4);
  rearBeam.position.set(-3.65, topY, machineMid);
  g.add(rearBeam);

  // lampu kerja di dalam
  for (const z of [2.8, -span - 0.2]) {
    const lamp = part(1.5, 0.08, 0.24, 0xfff4dc, 0.1, 0.2);
    lamp.position.set(-1.4, topY - 0.18, z);
    g.add(lamp);
  }

  // ---------------- pintu kaca geser (2 panel) ----------------
  const closedZ = [centreZ - doorW / 2 + 0.03, centreZ + doorW / 2 - 0.03];
  // Pintu terbuka: meluncur rapi ke balik casing kanan, berhenti sebelum dinding samping kanan
  const openZ1 = rightEnd + 0.25 + doorW / 2;
  const openZ0 = openZ1 + 0.35;
  const openZ = [openZ0, openZ1];
  const doorXPos = [doorX - 0.055, doorX + 0.035];

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd9eef5,
    metalness: 0.05,
    roughness: 0.02,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  });

  const doors = [];
  for (let i = 0; i < 2; i++) {
    const door = new THREE.Group();
    door.position.set(doorXPos[i], (glassTop + botY) / 2, openZ[i]);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.035, glassH - 0.2, doorW - 0.18), glassMat);
    glass.renderOrder = 2;
    door.add(glass);

    const barH = 0.075;
    for (const y of [-glassH / 2 + 0.12, glassH / 2 - 0.12]) {
      const bar = part(0.065, barH, doorW - 0.03, FRAME, 0.6, 0.35);
      bar.position.set(0.01, y, 0);
      door.add(bar);
    }
    for (const z of [-doorW / 2 + 0.065, doorW / 2 - 0.065]) {
      const bar = part(0.065, glassH - 0.12, 0.075, FRAME, 0.6, 0.35);
      bar.position.set(0.01, 0, z);
      door.add(bar);
    }

    const handleZ = i === 0 ? doorW / 2 - 0.17 : -doorW / 2 + 0.17;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.68, 10),
      new THREE.MeshStandardMaterial({ color: COLORS.steel, metalness: 0.88, roughness: 0.22 })
    );
    handle.position.set(0.09, 0.04, handleZ);
    door.add(handle);

    if (i === 1) {
      const sticker = part(0.018, 0.4, 0.65, 0xe0b23a, 0.15, 0.55);
      sticker.position.set(0.048, 0.55, -doorW / 2 + 0.8);
      door.add(sticker);
    }

    g.add(door);
    doors.push(door);
  }

  function setDoor(t) {
    const k = Math.max(0, Math.min(1, t));
    const e = k * k * (3 - 2 * k);
    for (let i = 0; i < doors.length; i++) {
      doors[i].position.z = openZ[i] + (closedZ[i] - openZ[i]) * e;
    }
  }

  function dispose() {
    g.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
    glassMat.dispose();
    logoTex.dispose();
  }

  return { group: g, setDoor, dispose };
}
