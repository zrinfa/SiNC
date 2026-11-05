// =============================================================
// Sparks.js — percikan dan geram kecil di titik potong (G01/G02/G03).
// Satu Points pool, material additive, tanpa alokasi per frame.
// =============================================================
import * as THREE from 'three';

const MAX = 260;

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,235,1)');
  grd.addColorStop(0.25, 'rgba(255,220,120,.95)');
  grd.addColorStop(0.6, 'rgba(255,145,35,.45)');
  grd.addColorStop(1, 'rgba(255,110,20,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSparks() {
  const group = new THREE.Group();

  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = -999;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const tex = sparkTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.17,
    map: tex,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // titik panas (glow) di kontak pahat
  const glowMat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xffc45a,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const contact = new THREE.Sprite(glowMat);
  contact.scale.set(0.9, 0.9, 1);
  contact.renderOrder = 7;
  contact.visible = false;
  group.add(contact);

  // cahaya kilat kecil di titik potong
  const glow = new THREE.PointLight(0xffa63a, 0, 4.5, 2);
  group.add(glow);

  const origin = new THREE.Vector3();
  let cursor = 0;
  let spawnAcc = 0;
  let active = false;
  let flicker = 0;

  function emit(count) {
    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const speed = 0.7 + Math.random() * 2.4;
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.06;
      positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.06;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.06;
      vel[i * 3] = Math.cos(a) * speed * 0.55 + 0.55;
      vel[i * 3 + 1] = Math.abs(Math.sin(a)) * speed * 0.85 + 0.5;
      vel[i * 3 + 2] = Math.sin(a) * speed * 0.8;
      maxLife[i] = 0.35 + Math.random() * 0.8;
      life[i] = maxLife[i];
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.88 + Math.random() * 0.12;
      colors[i * 3 + 2] = 0.45 + Math.random() * 0.25;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  function setActive(on) {
    const next = !!on;
    if (next === active) return;
    active = next;
    contact.visible = active;
    if (!active) {
      for (let i = 0; i < MAX; i++) {
        life[i] = 0;
        positions[i * 3 + 1] = -999;
      }
      geo.attributes.position.needsUpdate = true;
      glow.intensity = 0;
      glowMat.opacity = 0;
    }
  }

  function setOrigin(x, y, z) {
    origin.set(x, y, z);
    glow.position.copy(origin);
    contact.position.copy(origin);
  }

  function update(dt) {
    const d = Math.min(dt, 0.05);
    if (active) {
      spawnAcc += d;
      const step = 1 / 150;
      while (spawnAcc >= step) {
        emit(2);
        spawnAcc -= step;
      }
    } else {
      spawnAcc = 0;
    }

    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= d;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = -999;
        continue;
      }
      vel[i * 3 + 1] -= 7.5 * d;
      const drag = Math.max(0, 1 - 0.8 * d);
      vel[i * 3] *= drag;
      vel[i * 3 + 2] *= drag;
      positions[i * 3] += vel[i * 3] * d;
      positions[i * 3 + 1] += vel[i * 3 + 1] * d;
      positions[i * 3 + 2] += vel[i * 3 + 2] * d;

      const k = Math.max(0, life[i] / maxLife[i]);
      colors[i * 3] = k > 0.55 ? 1 : k * 1.5;
      colors[i * 3 + 1] = k * k * (0.95 + 0.05 * Math.sin(performance.now() * 0.03));
      colors[i * 3 + 2] = k * k * 0.18;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;

    flicker += d;
    glow.intensity = active ? 9 + Math.sin(flicker * 42) * 3 + Math.random() * 2 : 0;
    glowMat.opacity = active ? 0.32 + Math.sin(flicker * 36) * 0.1 : 0;
    const cs = 0.72 + Math.sin(flicker * 30) * 0.12 + Math.random() * 0.06;
    contact.scale.set(cs, cs, 1);
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    glowMat.dispose();
    tex.dispose();
  }

  return { group, setActive, setOrigin, update, dispose };
}
