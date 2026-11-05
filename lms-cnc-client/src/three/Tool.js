// =============================================================
// Tool.js — toolpost CNC bubut slant bed (miring diagonal).
// Kompak, proporsional, tidak menabrak chuck dan tidak keluar pintu.
// Bergerak kaku bersama pada sumbu X (diagonal) & Z (aksial).
// =============================================================
import * as THREE from 'three';
import { COLORS, MM, TOOL_ANGLE } from './theme';

function box(w, h, d, color, metalness = 0.6, roughness = 0.45) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(rTop, rBottom, h, color, segments = 16, metalness = 0.6, roughness = 0.4) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createTool() {
  const rootGroup = new THREE.Group();

  // Seluruh toolpost assembly bergerak bersama
  const toolpostGroup = new THREE.Group();
  rootGroup.add(toolpostGroup);

  const slantAngle = TOOL_ANGLE; // -35 derajat
  const cosSlant = Math.cos(slantAngle);
  const sinSlant = Math.sin(slantAngle);

  // Jarak offset kompak dari pusat toolpost ke ujung insert
  const RADIAL_OFFSET = 0.92;
  const AXIAL_OFFSET = -0.65; // toolpost berada lebih ke kanan (-Z) agar bebas dan tidak menabrak chuck

  // -----------------------------------------------------------
  // 1. Sadle / Carriage geser bawah (rel Z)
  // Menempel di sisi kanan (-Z) dari ujung pahat, bebas dari chuck
  // -----------------------------------------------------------
  const saddle = box(1.5, 0.45, 1.5, COLORS.castIron, 0.5, 0.6);
  saddle.position.set(0.3 * cosSlant, 0.3 * sinSlant - 0.45, -0.35);
  saddle.rotation.z = slantAngle;
  toolpostGroup.add(saddle);

  // Pelat geser silang (Cross slide)
  const crossSlide = box(1.3, 0.28, 1.3, COLORS.darkSteel, 0.68, 0.38);
  crossSlide.position.set(0.1 * cosSlant, 0.1 * sinSlant - 0.18, -0.12);
  crossSlide.rotation.z = slantAngle;
  toolpostGroup.add(crossSlide);

  // -----------------------------------------------------------
  // 2. Blok Toolpost 4-Station Kotak Miring Diagonal
  // Ukuran proporsional: 0.95 x 0.72 x 0.95 unit
  // -----------------------------------------------------------
  const turretBlock = new THREE.Group();
  turretBlock.rotation.z = slantAngle;
  toolpostGroup.add(turretBlock);

  // Badan kotak toolpost
  const blockMesh = box(0.95, 0.72, 0.95, 0x2e363e, 0.65, 0.4);
  turretBlock.add(blockMesh);

  // Pelat atas toolpost
  const topPlate = box(1.02, 0.08, 1.02, COLORS.darkSteel, 0.75, 0.3);
  topPlate.position.set(0, 0.38, 0);
  turretBlock.add(topPlate);

  // Poros pengunci tengah silinder
  const centerPost = cylinder(0.18, 0.2, 0.25, 0x9aa5b0, 0.85, 0.25);
  centerPost.position.set(0, 0.52, 0);
  turretBlock.add(centerPost);

  const centerCap = cylinder(0.12, 0.15, 0.12, 0x4a545e, 0.8, 0.3);
  centerCap.position.set(0, 0.68, 0);
  turretBlock.add(centerCap);

  // Baut penjepit pahat di atas (4 pasang)
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x1a2128, metalness: 0.85, roughness: 0.3 });
  for (const bx of [-0.32, 0.32]) {
    for (const bz of [-0.32, 0.32]) {
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), boltMat);
      bolt.position.set(bx, 0.46, bz);
      turretBlock.add(bolt);
    }
  }

  // Celah slot tempat pahat terpasang
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x161c22, metalness: 0.7, roughness: 0.5 });
  const frontSlot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.95), slotMat);
  frontSlot.position.set(-0.38, -0.04, 0);
  turretBlock.add(frontSlot);

  // -----------------------------------------------------------
  // 3. Batang Pemegang Pahat (Tool Shank) & Insert Karbida Emas
  // Panjang kaku tetap, menjulur ke titik potong (-RADIAL_OFFSET, -AXIAL_OFFSET)
  // -----------------------------------------------------------
  const toolAssembly = new THREE.Group();
  toolpostGroup.add(toolAssembly);

  // Posisi ujung insert relatif terhadap toolpost:
  const localTipX = -RADIAL_OFFSET * cosSlant;
  const localTipY = -RADIAL_OFFSET * sinSlant;
  const localTipZ = -AXIAL_OFFSET; // menjulur ke depan (+Z) menuju titik potong

  // Batang baja pahat pejal
  const shankLength = 1.05;
  const shankMat = new THREE.MeshStandardMaterial({ color: 0x242c35, metalness: 0.8, roughness: 0.32 });
  const shankMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, shankLength), shankMat);
  // Posisikan shank dari slot toolpost menuju ke arah ujung insert
  shankMesh.position.set(localTipX * 0.5, localTipY * 0.5, localTipZ * 0.45);
  shankMesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(localTipX, localTipY, localTipZ).normalize()
  );
  toolAssembly.add(shankMesh);

  // Kepala pemegang insert di ujung
  const headMesh = box(0.26, 0.22, 0.26, 0x3d4752, 0.82, 0.28);
  headMesh.position.set(localTipX * 0.92, localTipY * 0.92, localTipZ * 0.92);
  headMesh.rotation.z = slantAngle;
  toolAssembly.add(headMesh);

  // Insert karbida emas (rhombic / diamond)
  const insertMesh = box(0.18, 0.09, 0.18, COLORS.insert, 0.9, 0.18);
  insertMesh.position.set(localTipX, localTipY, localTipZ);
  insertMesh.rotation.y = Math.PI / 4;
  insertMesh.rotation.z = slantAngle;
  toolAssembly.add(insertMesh);

  // Plat penjepit insert
  const clampPlate = box(0.2, 0.06, 0.16, 0x1c2228, 0.85, 0.3);
  clampPlate.position.set(localTipX * 0.94, localTipY * 0.94 + 0.11, localTipZ * 0.94);
  clampPlate.rotation.z = slantAngle;
  toolAssembly.add(clampPlate);

  // -----------------------------------------------------------
  // 4. Selang Coolant Fleksibel (Loc-Line Biru + Nozzle Oranye)
  // Berada di sebelah KANAN toolpost (-Z), mengarah ke pahat (nyerong kiri depan)
  // -----------------------------------------------------------
  const coolantHoseGroup = new THREE.Group();
  toolpostGroup.add(coolantHoseGroup);

  // Dudukan selang di sebelah kanan atas blok toolpost
  const hoseBase = box(0.18, 0.18, 0.18, COLORS.darkSteel, 0.8, 0.3);
  hoseBase.position.set(0.15, 0.38, -0.36);
  coolantHoseGroup.add(hoseBase);

  // Titik nozzle semprot: diberi jarak aman & proporsional (tidak menempel ke pahat)
  // Berada di kanan-atas pahat, menyemprotkan fluida melintasi udara ke titik insert
  const nozzlePosLocal = new THREE.Vector3(
    localTipX * 0.35,
    localTipY * 0.35 + 0.52,
    localTipZ * 0.35 - 0.28
  );

  const curvePoints = [
    new THREE.Vector3(0.15, 0.47, -0.36),
    new THREE.Vector3(0.08, 0.74, -0.25),
    new THREE.Vector3(localTipX * 0.2, localTipY * 0.2 + 0.65, -0.15),
    nozzlePosLocal,
  ];
  const hoseCurve = new THREE.CatmullRomCurve3(curvePoints);
  const hoseGeo = new THREE.TubeGeometry(hoseCurve, 24, 0.04, 8, false);
  const hoseMat = new THREE.MeshStandardMaterial({
    color: 0x1b5fa8,
    metalness: 0.3,
    roughness: 0.45,
    emissive: 0x072242,
    emissiveIntensity: 0.35,
  });
  const hoseTube = new THREE.Mesh(hoseGeo, hoseMat);
  coolantHoseGroup.add(hoseTube);

  // Cincin ruas oranye
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xee7824, metalness: 0.3, roughness: 0.4 });
  for (let t = 0.3; t <= 0.85; t += 0.3) {
    const pt = hoseCurve.getPointAt(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), orangeMat);
    ring.position.copy(pt);
    coolantHoseGroup.add(ring);
  }

  // Ujung nozzle semprot mengarah nyerong ke titik ujung insert pahat
  const nozzleTipMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.048, 0.16, 12), orangeMat);
  nozzleTipMesh.position.copy(nozzlePosLocal);
  nozzleTipMesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(localTipX - nozzlePosLocal.x, localTipY - nozzlePosLocal.y, localTipZ - nozzlePosLocal.z).normalize()
  );
  coolantHoseGroup.add(nozzleTipMesh);

  // -----------------------------------------------------------
  // 5. Indikator Kontak & Tabrakan
  // -----------------------------------------------------------
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 14, 14),
    new THREE.MeshBasicMaterial({ color: COLORS.danger, transparent: true, opacity: 0.9, toneMapped: false })
  );
  glow.visible = false;
  rootGroup.add(glow);

  const tipMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 14, 14),
    new THREE.MeshBasicMaterial({
      color: 0xffd45a,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      toneMapped: false,
    })
  );
  tipMark.renderOrder = 6;
  rootGroup.add(tipMark);

  const currentTipWorld = new THREE.Vector3(0, 0, 0);
  const currentNozzleWorld = new THREE.Vector3(0, 0, 0);

  function setPosition(radiusMm, zMm) {
    const r = Math.max(0, radiusMm) * MM;
    const tz = zMm * MM;

    // Koordinat ujung insert di dunia
    const tx = r * cosSlant;
    const ty = r * sinSlant;
    currentTipWorld.set(tx, ty, tz);

    // Posisi toolpost: aman di dalam mesin (tidak menembus pintu atau chuck)
    const tpX = tx + RADIAL_OFFSET * cosSlant;
    const tpY = ty + RADIAL_OFFSET * sinSlant;
    const tpZ = tz + AXIAL_OFFSET;

    toolpostGroup.position.set(tpX, tpY, tpZ);

    // Titik nozzle dunia untuk semprotan coolant
    currentNozzleWorld.copy(nozzlePosLocal).add(toolpostGroup.position);

    glow.position.set(tx, ty, tz);
    tipMark.position.set(tx, ty, tz);
  }

  function setCrash(on) {
    glow.visible = on;
  }

  setPosition(15, 0);

  function dispose() {
    rootGroup.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
  }

  return {
    group: rootGroup,
    setPosition,
    setCrash,
    dispose,
    getTip: () => currentTipWorld,
    getNozzle: () => currentNozzleWorld,
    getZ: () => currentTipWorld.z,
  };
}
