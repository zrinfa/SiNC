// =============================================================
// Workpiece.js — silinder benda kerja dari profile[] (radius per 0,5 mm).
// Vertex di-update inkremental: hanya ring yang berubah yang ditulis ulang,
// jadi pemotongan bisa mengikuti pahat tiap frame tanpa rebuild geometry.
// =============================================================
import * as THREE from 'three';
import { COLORS, MM, PROFILE_RES } from './theme';

export function createWorkpiece({ stockD, stockL, radialSegments = 72 }) {
  const rings = Math.round(stockL / PROFILE_RES) + 1;
  const S = radialSegments;
  const cos = new Float32Array(S);
  const sin = new Float32Array(S);
  for (let j = 0; j < S; j++) {
    const a = (j / S) * Math.PI * 2;
    cos[j] = Math.cos(a);
    sin[j] = Math.sin(a);
  }

  const positions = new Float32Array(rings * S * 3);
  const normals = new Float32Array(rings * S * 3);
  const uvs = new Float32Array(rings * S * 2);
  const indices = new Uint32Array((rings - 1) * S * 6);

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < S; j++) {
      const v = (i * S + j) * 2;
      uvs[v] = j / S;
      uvs[v + 1] = i / (rings - 1);
    }
  }

  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      const a = i * S + j;
      const b = i * S + j2;
      const c = (i + 1) * S + j;
      const d = (i + 1) * S + j2;
      const o = (i * S + j) * 6;
      indices[o] = a; indices[o + 1] = c; indices[o + 2] = b;
      indices[o + 3] = b; indices[o + 4] = c; indices[o + 5] = d;
    }
  }

  const bodyGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const norAttr = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
  bodyGeo.setAttribute('position', posAttr);
  bodyGeo.setAttribute('normal', norAttr);
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bodyGeo.setIndex(new THREE.BufferAttribute(indices, 1));

  // tekstur halus bekas bubut (dibuat prosedural, tanpa file eksternal)
  function makeMachinedTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8c8c8c';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      const g = 105 + Math.random() * 55;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(0, y, size, 1);
    }
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(Math.random() * size, 0, 1, size);
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  const brushed = makeMachinedTexture();

  const material = new THREE.MeshStandardMaterial({
    color: COLORS.stock,
    metalness: 0.6,
    roughness: 0.78,
    roughnessMap: brushed,
    bumpMap: brushed,
    bumpScale: 0.004,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(bodyGeo, material);
  body.castShadow = true;
  body.receiveShadow = true;

  // tutup ujung (muka chuck & ujung bebas) supaya benda kerja padat (pejal) dan tidak bolong/hollow
  function makeCap(normalZ) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((S + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((S + 1) * 3).fill(0), 3));
    const capUv = new Float32Array((S + 1) * 2);
    capUv[0] = 0.5; capUv[1] = 0.5;
    for (let j = 0; j < S; j++) {
      capUv[(j + 1) * 2] = 0.5 + 0.5 * Math.cos((j / S) * Math.PI * 2);
      capUv[(j + 1) * 2 + 1] = 0.5 + 0.5 * Math.sin((j / S) * Math.PI * 2);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(capUv, 2));
    const idx = new Uint32Array(S * 3);
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      const o = j * 3;
      if (normalZ > 0) { idx[o] = 0; idx[o + 1] = j + 1; idx[o + 2] = j2 + 1; }
      else { idx[o] = 0; idx[o + 1] = j2 + 1; idx[o + 2] = j + 1; }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  const capFront = makeCap(1);
  const capBack = makeCap(-1);
  // Posisi mesh tetap di (0,0,0) karena koordinat Z vertex ditulis absolut oleh updateCap()
  capFront.position.set(0, 0, 0);
  capBack.position.set(0, 0, 0);

  // Silinder bahan baku yang dicekam kuat di dalam rahang chuck (Z=0.00 hingga Z=0.65)
  const clampedStockR = (stockD / 2) * MM;
  const clampedGeo = new THREE.CylinderGeometry(clampedStockR, clampedStockR, 0.65, S, 1, false);
  clampedGeo.rotateX(Math.PI / 2);
  const clampedMesh = new THREE.Mesh(clampedGeo, material);
  clampedMesh.position.set(0, 0, 0.325);
  clampedMesh.castShadow = true;
  clampedMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(body, capFront, capBack, clampedMesh);

  const current = new Float32Array(rings);
  const zOf = (i) => -i * PROFILE_RES * MM;

  function writeRing(i, r) {
    const rUnit = Math.max(0.001, r) * MM;
    const z = zOf(i);
    const rPrev = current[Math.max(0, i - 1)];
    const rNext = current[Math.min(rings - 1, i + 1)];
    const nzRaw = i === 0
      ? (current[1] - current[0]) / PROFILE_RES
      : i === rings - 1
        ? (current[rings - 1] - current[rings - 2]) / PROFILE_RES
        : (rNext - rPrev) / (2 * PROFILE_RES);

    for (let j = 0; j < S; j++) {
      const v = (i * S + j) * 3;
      positions[v] = rUnit * cos[j];
      positions[v + 1] = rUnit * sin[j];
      positions[v + 2] = z;
      // normal permukaan revolusi: (cos, sin, -dr/dz)
      const nx = cos[j], ny = sin[j], nz = nzRaw;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[v] = nx / len;
      normals[v + 1] = ny / len;
      normals[v + 2] = nz / len;
    }
  }

  function updateCap(cap, r, z) {
    const g = cap.geometry;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const rr = Math.max(0.001, r) * MM;
    p[0] = 0; p[1] = 0; p[2] = z;
    for (let j = 0; j < S; j++) {
      const v = (j + 1) * 3;
      p[v] = rr * cos[j];
      p[v + 1] = rr * sin[j];
      p[v + 2] = z;
    }
    const nz = z === 0 ? 1 : -1;
    for (let j = 0; j <= S; j++) {
      n[j * 3] = 0; n[j * 3 + 1] = 0; n[j * 3 + 2] = nz;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  }

  let initialized = false;
  let dirty = false;

  function update(profile) {
    if (!profile || profile.length !== rings) return;
    let lo = -1, hi = -1;
    for (let i = 0; i < rings; i++) {
      if (current[i] !== profile[i]) {
        if (lo < 0) lo = i;
        hi = i;
        current[i] = profile[i];
      }
    }
    if (lo < 0 && initialized) return;

    const from = initialized ? Math.max(0, lo - 1) : 0;
    const to = initialized ? Math.min(rings - 1, hi + 1) : rings - 1;
    for (let i = from; i <= to; i++) writeRing(i, current[i]);

    posAttr.addUpdateRange(from * S * 3, (to - from + 1) * S * 3);
    norAttr.addUpdateRange(from * S * 3, (to - from + 1) * S * 3);
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;

    if (!initialized) {
      bodyGeo.computeBoundingSphere();
      bodyGeo.computeBoundingBox();
      initialized = true;
    }
    dirty = true;
  }

  let capFrontR = -1;
  let capBackR = -1;

  function syncCaps(profile) {
    if (!profile || profile.length !== rings) return;
    if (profile[0] !== capFrontR) {
      capFrontR = profile[0];
      updateCap(capFront, capFrontR, 0);
    }
    const backR = profile[rings - 1];
    if (backR !== capBackR) {
      capBackR = backR;
      updateCap(capBack, backR, -stockL * MM);
    }
  }

  // inisialisasi awal: silinder penuh
  const initial = new Array(rings).fill(stockD / 2);
  update(initial);
  syncCaps(initial);

  function setTransparent(on) {
    material.transparent = on;
    material.opacity = on ? 0.32 : 1;
    material.depthWrite = !on;
    material.needsUpdate = true;
  }

  function setCrash(on) {
    material.emissive.setHex(on ? 0x7a1414 : 0x000000);
    material.emissiveIntensity = on ? 1.3 : 0;
  }

  function dispose() {
    bodyGeo.dispose();
    capFront.geometry.dispose();
    capBack.geometry.dispose();
    brushed.dispose();
    material.dispose();
  }

  return { group, update, syncCaps, setTransparent, setCrash, dispose, rings };
}
