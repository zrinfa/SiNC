// =============================================================
// Machine.js — bodi mesin bubut: bed, headstock, chuck 3 rahang,
// tailstock, dan panel kontrol. Dimensi dalam unit scene (1 unit = 10 mm).
// Z=0 adalah muka benda kerja; chuck & headstock berada di Z positif,
// sehingga pahat di Z=0 tetap terlihat (tidak tertelan chuck).
// =============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, MM } from './theme';

function mat(color, metalness = 0.5, roughness = 0.5) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function box(w, h, d, color, metalness = 0.5, roughness = 0.5, radius = 0.07) {
  const r = Math.min(radius, Math.min(w, h, d) / 3.5);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat(color, metalness, roughness));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cylinder(rTop, rBottom, h, color, segments = 32, metalness = 0.5, roughness = 0.5) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, segments),
    mat(color, metalness, roughness)
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createMachine({ stockD = 40, stockL = 60 } = {}) {
  const g = new THREE.Group();
  const span = Math.max(2.5, stockL * MM);

  // geometri alas mengikuti panjang benda kerja
  const bedFront = 6.5;
  const bedRear = -(span + 5.0);
  const bedLen = bedFront - bedRear;
  const bedMid = (bedFront + bedRear) / 2;
  const tailZ = -(span + 2.4);
  const legRear = -(span + 3.2);

  // ---------- alas / bed ----------
  const bed = box(7.2, 1.1, bedLen, COLORS.castIron, 0.45, 0.62, 0.1);
  bed.position.set(0, -3.05, bedMid);
  g.add(bed);

  // bak penampung beram
  const tray = box(8.4, 0.22, bedLen + 1.2, COLORS.painted, 0.35, 0.7, 0.06);
  tray.position.set(0, -3.9, bedMid);
  g.add(tray);

  // kaki mesin
  for (const z of [4.8, legRear]) {
    const leg = box(6.2, 0.7, 1.3, COLORS.painted, 0.3, 0.75, 0.05);
    leg.position.set(0, -4.0, z);
    g.add(leg);
  }

  // rel / ways
  for (const x of [-2.25, 2.25]) {
    const rail = box(0.9, 0.22, bedLen - 1.4, COLORS.darkSteel, 0.7, 0.38, 0.04);
    rail.position.set(x, -2.42, bedMid);
    g.add(rail);
  }

  // ---------- headstock ----------
  // Bodi headstock menyatu padat ke spindel dan chuck dengan jarak bebas aman dari pahat
  const head = box(5.2, 5.0, 4.4, COLORS.body, 0.3, 0.55, 0.12);
  head.position.set(0, 0.0, 4.4);
  g.add(head);

  const headTop = box(4.7, 0.22, 4.0, COLORS.bodyShade, 0.35, 0.5, 0.05);
  headTop.position.set(0, 2.6, 4.4);
  g.add(headTop);

  // tuas pengatur headstock
  for (const [x, z] of [[-1.7, 4.0], [0, 3.5], [1.7, 4.0]]) {
    const shaft = cylinder(0.08, 0.08, 0.62, COLORS.steel, 12, 0.85, 0.3);
    shaft.position.set(x, 2.95, z);
    g.add(shaft);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), mat(COLORS.brass, 0.8, 0.3));
    knob.position.set(x, 3.26, z);
    knob.castShadow = true;
    g.add(knob);
  }

  // kisi ventilasi di sisi headstock
  for (let i = 0; i < 4; i++) {
    const vent = box(0.06, 0.16, 1.6, 0x141a20, 0.2, 0.9, 0.02);
    vent.position.set(2.62, -0.9 + i * 0.42, 4.4);
    g.add(vent);
  }

  // kerah dudukan spindel utama menyatu rapat di muka headstock (Z=2.20 -> Z=1.82)
  const collar = cylinder(1.95, 1.95, 0.45, COLORS.castIron, 48, 0.5, 0.55);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0, 2.05);
  g.add(collar);

  const spindle = cylinder(1.3, 1.3, 0.6, COLORS.steel, 32, 0.88, 0.25);
  spindle.rotation.x = Math.PI / 2;
  spindle.position.set(0, 0, 1.95);
  g.add(spindle);

  // ---------- chuck 3 rahang (diletakkan di Z=0.625 memberi ruang aman bagi pahat dan toolpost) ----------
  // Pelat belakang chuck (Z=1.85 -> Z=1.59)
  const backPlate = cylinder(1.78, 1.78, 0.26, COLORS.darkSteel, 48, 0.7, 0.35);
  backPlate.rotation.x = Math.PI / 2;
  backPlate.position.set(0, 0, 1.72);
  g.add(backPlate);

  // Badan silinder chuck (Z=1.675 -> Z=0.625, muka chuck di Z=0.625)
  const chuck = cylinder(1.65, 1.62, 1.05, COLORS.chuck, 48, 0.62, 0.4);
  chuck.rotation.x = Math.PI / 2;
  chuck.position.set(0, 0, 1.15);
  g.add(chuck);

  // alur konsentris pada muka chuck
  for (const r of [1.1, 0.65]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.024, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x2c343c, metalness: 0.6, roughness: 0.5 })
    );
    ring.position.set(0, 0, 0.63);
    g.add(ring);
  }

  const clampR = Math.max(0.35, (stockD / 2) * MM);
  const jaws = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
  for (const a of jaws) {
    const jaw = new THREE.Group();
    jaw.rotation.z = a;

    // Badan rahang bertingkat mencekam di muka chuck (Z=0.63 -> Z=0.30)
    const bodyW = 0.42;
    const body = box(bodyW, 0.42, 0.36, 0x4c545e, 0.6, 0.4, 0.03);
    body.position.set(clampR + bodyW / 2, 0, 0.48);
    jaw.add(body);

    const stepW = 0.32;
    const step = box(stepW, 0.32, 0.32, COLORS.jaw, 0.65, 0.36, 0.03);
    step.position.set(clampR + bodyW + stepW / 2, 0, 0.48);
    jaw.add(step);

    g.add(jaw);
  }

  // ---------- tailstock (terparkir rapi di kanan, tanpa benda asing/quill yang menabrak) ----------
  const tailBody = box(2.4, 2.5, 2.5, COLORS.painted, 0.4, 0.55, 0.09);
  tailBody.position.set(0, -1.15, tailZ);
  g.add(tailBody);

  const wheelZ = tailZ - 1.4;
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.09, 10, 32),
    mat(COLORS.darkSteel, 0.8, 0.3)
  );
  wheel.position.set(0, 0, wheelZ);
  g.add(wheel);

  const handle = cylinder(0.055, 0.055, 0.42, COLORS.brass, 12, 0.8, 0.3);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.72, 0, wheelZ);
  g.add(handle);

  // tuas pengunci tailstock
  const lock = cylinder(0.07, 0.07, 1.1, COLORS.brass, 12, 0.8, 0.3);
  lock.rotation.z = Math.PI / 2;
  lock.position.set(1.5, -0.3, tailZ);
  g.add(lock);

  const lockKnob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), mat(COLORS.brass, 0.8, 0.3));
  lockKnob.position.set(2.1, -0.3, tailZ);
  g.add(lockKnob);

  // Panel kontrol utama berada di sisi mesin (ControlPanel.js),
  // bukan menempel pada pintu yang bisa dibuka.

  // piring nama mesin di muka headstock
  const plate = box(1.9, 0.4, 0.05, 0xb8c2cc, 0.7, 0.35, 0.02);
  plate.position.set(-1.4, 0.95, 2.18);
  g.add(plate);

  const plateAccent = box(1.5, 0.08, 0.06, COLORS.rapid, 0.2, 0.6, 0.02);
  plateAccent.position.set(-1.4, 0.82, 2.16);
  g.add(plateAccent);

  function dispose() {
    g.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
  }

  return { group: g, dispose };
}
