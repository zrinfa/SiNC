// =============================================================
// Toolpath.js — garis lintasan pahat 3D.
// Hijau = G01/G02/G03 (feeding), oranye putus-putus = G00 (rapid).
// Garis "preview" (semua langkah) dibuat redup; garis "traveled"
// menyala mengikuti langkah yang sudah dijalankan.
// =============================================================
import * as THREE from 'three';
import { COLORS, MM, TOOL_DIR } from './theme';

const OFFSET = 0.035; // sedikit di luar permukaan agar tidak z-fighting

function point(xMm, zMm) {
  const r = (xMm / 2) * MM + OFFSET;
  return [r * TOOL_DIR.x, r * TOOL_DIR.y, zMm * MM];
}

function buildPositions(moves, from, to, dashedRapid) {
  const feed = [];
  const rapid = [];
  for (let i = from; i < to; i++) {
    const m = moves[i];
    if (!m) continue;
    const a = point(m.x1, m.z1);
    const b = point(m.x2, m.z2);
    if (!m.rapid) {
      feed.push(...a, ...b);
      continue;
    }
    if (!dashedRapid) {
      rapid.push(...a, ...b);
      continue;
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const dashes = Math.max(2, Math.ceil(len / 0.42));
    for (let d = 0; d < dashes; d++) {
      const t0 = d / dashes;
      const t1 = (d + 0.58) / dashes;
      for (const t of [t0, t1]) {
        rapid.push(
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t
        );
      }
    }
  }
  return { feed: new Float32Array(feed), rapid: new Float32Array(rapid) };
}

function lineMesh(color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  const m = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.LineSegments(g, m);
  line.frustumCulled = false;
  return line;
}

export function createToolpath() {
  const group = new THREE.Group();
  const previewFeed = lineMesh(COLORS.feed, 0.18);
  const previewRapid = lineMesh(COLORS.rapid, 0.18);
  const feed = lineMesh(COLORS.feed, 0.95);
  const rapid = lineMesh(COLORS.rapid, 0.95);
  group.add(previewFeed, previewRapid, feed, rapid);

  let cacheMoves = null;
  let cacheUpTo = -1;

  function setGeometry(line, positions) {
    line.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    line.geometry = g;
  }

  function setMoves(moves) {
    if (cacheMoves === moves) return;
    cacheMoves = moves;
    cacheUpTo = -1;
    const p = buildPositions(moves, 0, moves.length, true);
    setGeometry(previewFeed, p.feed);
    setGeometry(previewRapid, p.rapid);
    setGeometry(feed, new Float32Array(0));
    setGeometry(rapid, new Float32Array(0));
  }

  function setProgress(upTo) {
    if (!cacheMoves || upTo === cacheUpTo) return;
    cacheUpTo = upTo;
    const p = buildPositions(cacheMoves, 0, upTo, true);
    setGeometry(feed, p.feed);
    setGeometry(rapid, p.rapid);
  }

  function setVisible(on) {
    group.visible = on;
  }

  function dispose() {
    for (const l of [previewFeed, previewRapid, feed, rapid]) {
      l.geometry.dispose();
      l.material.dispose();
    }
  }

  return { group, setMoves, setProgress, setVisible, dispose };
}
