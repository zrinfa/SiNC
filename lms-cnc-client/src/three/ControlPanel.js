// =============================================================
// ControlPanel.js — panel kontrol fisik menempel di casing kiri mesin.
// Referensi: GreMaT STH 6166 — layar + tombol tertanam di permukaan
// casing kiri headstock. Layar memakai CanvasTexture (panelArt.js).
// =============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS } from './theme';
import { drawPanelLabel, drawPanelScreen } from './panelArt';

function box(w, h, d, color, metalness = 0.4, roughness = 0.55, radius = 0.05) {
  const r = Math.min(radius, Math.min(w, h, d) / 3.5);
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 2, r),
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createControlPanel({ span = 6 } = {}) {
  const group = new THREE.Group();

  // panel menempel langsung di permukaan casing kiri headstock
  const panelX = 3.74;    // flush dengan permukaan casing depan
  const panelY = 1.15;    // sedikit di atas tengah — sejajar mata operator
  const panelZ = 6.55;    // Z sama dengan casing kiri headstock

  const head = new THREE.Group();
  head.position.set(panelX, panelY, panelZ);
  head.rotation.y = Math.PI / 2;
  head.rotation.x = -0.03;
  group.add(head);

  // ---------- bezel utama (frame tertanam di casing) ----------
  const bezel = box(3.45, 2.55, 0.28, 0x161c21, 0.35, 0.52, 0.09);
  bezel.position.set(0, 0.35, -0.02);
  head.add(bezel);

  const bezelLip = box(3.5, 0.09, 0.34, 0x303941, 0.65, 0.35, 0.02);
  bezelLip.position.set(0, 1.63, 0.01);
  head.add(bezelLip);

  // ---------- layar ----------
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 960;
  screenCanvas.height = 640;
  const screenCtx = screenCanvas.getContext('2d');
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  drawPanelScreen(screenCtx, { w: 960, h: 640 });

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 1.94),
    new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false })
  );
  screen.position.set(0, 0.41, 0.145);
  head.add(screen);

  // kaca pelindung layar
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(3.06, 2.1),
    new THREE.MeshStandardMaterial({
      color: 0x9fc6d4,
      transparent: true,
      opacity: 0.08,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
    })
  );
  glass.position.set(0, 0.41, 0.16);
  head.add(glass);

  // label merek di atas layar
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 52;
  const labelCtx = labelCanvas.getContext('2d');
  drawPanelLabel(labelCtx);
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.75, 0.28),
    new THREE.MeshBasicMaterial({ map: labelTexture, toneMapped: false })
  );
  label.position.set(0, 1.43, 0.15);
  head.add(label);

  // tombol soft-key di bawah layar
  for (let i = 0; i < 8; i++) {
    const key = box(0.24, 0.13, 0.1, i === 7 ? 0x4c9d63 : 0x39434c, 0.45, 0.5, 0.02);
    key.position.set(-1.18 + i * 0.34, -0.68, 0.16);
    head.add(key);
  }

  // ---------- panel bawah: tombol fisik, lampu, e-stop, jog dial ----------
  const lowerPanel = box(3.45, 1.65, 0.28, 0x1a2128, 0.32, 0.55, 0.07);
  lowerPanel.position.set(0, -1.28, -0.02);
  head.add(lowerPanel);

  // tombol power (hijau)
  const btnPower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0x3fba58, metalness: 0.3, roughness: 0.4, emissive: 0x1a5a28, emissiveIntensity: 0.5 })
  );
  btnPower.rotation.x = Math.PI / 2;
  btnPower.position.set(-1.2, -0.98, 0.16);
  head.add(btnPower);

  // tombol emergency stop (merah besar)
  const eStop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.15, 20),
    new THREE.MeshStandardMaterial({ color: 0xcc2222, metalness: 0.25, roughness: 0.35, emissive: 0x661111, emissiveIntensity: 0.4 })
  );
  eStop.rotation.x = Math.PI / 2;
  eStop.position.set(-0.6, -1.38, 0.17);
  head.add(eStop);

  // label E-STOP
  const eStopRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.03, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xeebb22, metalness: 0.4, roughness: 0.4 })
  );
  eStopRing.position.set(-0.6, -1.38, 0.12);
  head.add(eStopRing);

  // lampu indikator (3 lampu: merah, kuning, hijau)
  const indicatorColors = [0xdd3333, 0xeebb22, 0x33cc55];
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 12),
      new THREE.MeshBasicMaterial({ color: indicatorColors[i], toneMapped: false })
    );
    lamp.position.set(-1.2, -1.28 - i * 0.2, 0.17);
    head.add(lamp);
  }

  // jog dial (roda putar)
  const jogDial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.18, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.darkSteel, metalness: 0.82, roughness: 0.25 })
  );
  jogDial.rotation.x = Math.PI / 2;
  jogDial.position.set(0.65, -1.38, 0.15);
  head.add(jogDial);

  // garis-garis di jog dial
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const notch = box(0.015, 0.28, 0.03, 0x8a949e, 0.7, 0.3, 0.003);
    notch.position.set(0.65 + Math.cos(a) * 0.28, -1.38 + Math.sin(a) * 0.28, 0.25);
    head.add(notch);
  }

  // tombol navigasi kecil (arrow pad) di kanan
  const navBtns = [
    { dx: 0, dy: 0.18 },  // atas
    { dx: 0, dy: -0.18 }, // bawah
    { dx: -0.18, dy: 0 }, // kiri
    { dx: 0.18, dy: 0 },  // kanan
  ];
  for (const { dx, dy } of navBtns) {
    const nav = box(0.15, 0.15, 0.08, 0x39434c, 0.45, 0.5, 0.02);
    nav.position.set(1.15 + dx, -1.0 + dy, 0.16);
    head.add(nav);
  }

  // handle samping
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.035, 8, 24, Math.PI),
    new THREE.MeshStandardMaterial({ color: COLORS.darkSteel, metalness: 0.8, roughness: 0.3 })
  );
  handle.rotation.z = -Math.PI / 2;
  handle.rotation.y = Math.PI / 2;
  handle.position.set(1.75, 0.6, 0.12);
  head.add(handle);

  // lampu status LED
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x55e86b, toneMapped: false })
  );
  led.position.set(-1.48, 1.53, 0.17);
  head.add(led);

  let lastDraw = 0;
  function setData(data) {
    if (!data) return;
    const now = performance.now();
    if (now - lastDraw < 110) return;
    lastDraw = now;
    drawPanelScreen(screenCtx, {
      w: 960,
      h: 640,
      ...data,
      preview: data.preview || data.profile,
    });
    screenTexture.needsUpdate = true;
  }

  function dispose() {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
    screenTexture.dispose();
    labelTexture.dispose();
  }

  return {
    group,
    setData,
    dispose,
    getView: () => ({
      pos: [panelX + 4.1, panelY + 1.35, panelZ + 2.5],
      target: [panelX - 0.05, panelY + 0.05, panelZ],
    }),
  };
}

