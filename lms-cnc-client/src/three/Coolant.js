// =============================================================
// Coolant.js — semprotan cairan pendingin CNC bubut.
// Nozzle terpasang di toolpost sehingga titik semprot bergerak
// mengikuti pergerakan pahat dan toolpost secara dinamis.
// =============================================================
import * as THREE from 'three';

const MAX = 160;

function dropletTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, 'rgba(235,252,255,1)');
  grd.addColorStop(0.32, 'rgba(125,218,255,.9)');
  grd.addColorStop(0.7, 'rgba(54,158,235,.35)');
  grd.addColorStop(1, 'rgba(40,140,220,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function orient(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return len;
}

function aim(mesh, a, b) {
  const len = orient(mesh, a, b);
  mesh.scale.set(1, Math.max(0.001, len), 1);
}

export function createCoolant() {
  const group = new THREE.Group();

  const nozzle = new THREE.Vector3(2.5, 0.5, 0);
  const target = new THREE.Vector3(1.5, -0.2, 0);
  const sprayDir = new THREE.Vector3().subVectors(target, nozzle);
  const dirNorm = sprayDir.clone().normalize();

  // ---------- Jet Transparan Utama ----------
  const jetMat = new THREE.MeshBasicMaterial({
    color: 0x62ccff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.02, 1, 14, 1, true), jetMat);
  aim(jet, nozzle, target);
  jet.renderOrder = 4;
  group.add(jet);

  // Inti jet lebih terang
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xd9f6ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.012, 1, 10, 1, true), coreMat);
  aim(core, nozzle, target);
  core.renderOrder = 5;
  group.add(core);

  // Garis pancuran tengah
  const streamMat = new THREE.MeshBasicMaterial({
    color: 0xd4f7ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 1, 8, 1, true), streamMat);
  aim(stream, nozzle, target);
  stream.renderOrder = 6;
  group.add(stream);

  // ---------- Butiran Droplet Coolant ----------
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = -999;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dropTex = dropletTexture();
  const dropMat = new THREE.PointsMaterial({
    size: 0.16,
    map: dropTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const drops = new THREE.Points(geo, dropMat);
  drops.frustumCulled = false;
  group.add(drops);

  // Percikan cipratan di titik potong (Splash)
  const splashMat = new THREE.SpriteMaterial({
    map: dropTex,
    color: 0x8fe2ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const splash = new THREE.Sprite(splashMat);
  splash.position.copy(target);
  splash.scale.set(0.7, 0.7, 1);
  splash.renderOrder = 6;
  group.add(splash);

  jet.visible = false;
  core.visible = false;
  stream.visible = false;
  splash.visible = false;

  let cursor = 0;
  let acc = 0;
  let active = false;
  let phase = 0;
  let dripPhase = 0;

  function setAim(nozzleVec, targetVec) {
    if (!nozzleVec || !targetVec) return;
    nozzle.copy(nozzleVec);
    target.copy(targetVec);

    splash.position.copy(target);
    aim(jet, nozzle, target);
    aim(core, nozzle, target);
    aim(stream, nozzle, target);

    sprayDir.subVectors(target, nozzle);
    dirNorm.copy(sprayDir).normalize();
  }

  function emit(count) {
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % MAX;
      positions[i * 3] = nozzle.x + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = nozzle.y + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 2] = nozzle.z + (Math.random() - 0.5) * 0.05;
      const sp = 4.8 + Math.random() * 1.6;
      vel[i * 3] = dirNorm.x * sp + (Math.random() - 0.5) * 0.6;
      vel[i * 3 + 1] = dirNorm.y * sp + (Math.random() - 0.5) * 0.4;
      vel[i * 3 + 2] = dirNorm.z * sp + (Math.random() - 0.5) * 0.6;
      maxLife[i] = 0.28 + Math.random() * 0.2;
      life[i] = maxLife[i];
      colors[i * 3] = 0.72;
      colors[i * 3 + 1] = 0.94;
      colors[i * 3 + 2] = 1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  function setActive(on) {
    if (!!on === active) return;
    active = !!on;
    if (active) {
      jet.visible = true;
      core.visible = true;
      stream.visible = true;
      splash.visible = true;
      dripPhase = 0;
    } else {
      dripPhase = 1.0;
    }
  }

  function update(dt) {
    const d = Math.min(dt, 0.05);

    if (!active && dripPhase > 0) {
      dripPhase = Math.max(0, dripPhase - d);
      if (dripPhase > 0.3) {
        acc += d;
        const step = 1 / 25;
        while (acc >= step) {
          emit(1);
          acc -= step;
        }
      }
      const k = Math.max(0, dripPhase);
      jetMat.opacity = 0.35 * k;
      coreMat.opacity = 0.8 * k;
      streamMat.opacity = 0.78 * k;
      splashMat.opacity = 0.42 * k;
      if (dripPhase <= 0) {
        jet.visible = false;
        core.visible = false;
        stream.visible = false;
        splash.visible = false;
        jetMat.opacity = 0;
        coreMat.opacity = 0;
        streamMat.opacity = 0;
        splashMat.opacity = 0;
      }
    }

    if (active) {
      acc += d;
      const step = 1 / 90;
      while (acc >= step) {
        emit(3);
        acc -= step;
      }
    } else if (dripPhase <= 0) {
      acc = 0;
    }

    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= d;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = -999;
        continue;
      }
      vel[i * 3 + 1] -= 3.8 * d;
      positions[i * 3] += vel[i * 3] * d;
      positions[i * 3 + 1] += vel[i * 3 + 1] * d;
      positions[i * 3 + 2] += vel[i * 3 + 2] * d;
      const k = Math.max(0, life[i] / maxLife[i]);
      colors[i * 3] = 0.62 * k + 0.2;
      colors[i * 3 + 1] = 0.85 * k + 0.12;
      colors[i * 3 + 2] = k * 0.9 + 0.1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    phase += d;
    if (active) {
      jetMat.opacity = 0.35 + Math.sin(phase * 19) * 0.05;
      coreMat.opacity = 0.8 + Math.sin(phase * 27) * 0.08;
      streamMat.opacity = 0.78 + Math.sin(phase * 31) * 0.08;
      splashMat.opacity = 0.42 + Math.sin(phase * 27) * 0.08;
      const s = 0.72 + Math.sin(phase * 23) * 0.08;
      splash.scale.set(s, s, 1);
    }
  }

  function dispose() {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
    geo.dispose();
    dropMat.dispose();
    dropTex.dispose();
    splashMat.dispose();
    streamMat.dispose();
    coreMat.dispose();
    jetMat.dispose();
  }

  return {
    group,
    setAim,
    setActive,
    update,
    dispose,
  };
}
