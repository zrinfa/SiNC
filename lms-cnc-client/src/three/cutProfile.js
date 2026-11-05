// =============================================================
// cutProfile.js — pemotongan bertahap dari playhead pecahan.
// Dipakai bersama oleh viewport 3D dan 2D agar bentuk benda kerja
// selalu identik dengan engine simulate().
// =============================================================
import { applyCut } from '../api';

export function createCutter(sim, stockD) {
  const profile = new Array(sim.profile.length).fill(stockD / 2);
  let upto = 0;
  let lastPh = 0;

  function reset() {
    profile.fill(stockD / 2);
    upto = 0;
  }

  function update(ph) {
    const clamped = Math.max(0, Math.min(ph, sim.moves.length));
    if (clamped + 1e-6 < lastPh) reset();
    lastPh = clamped;

    const idx = Math.min(Math.floor(clamped), sim.moves.length);
    for (; upto < idx; upto++) {
      const m = sim.moves[upto];
      if (!m.rapid) applyCut(profile, m.x1, m.z1, m.x2, m.z2);
    }

    // potongan sebagian di dalam segmen aktif (gerak pahat halus)
    if (idx < sim.moves.length) {
      const m = sim.moves[idx];
      const t = clamped - idx;
      if (!m.rapid && t > 0) {
        applyCut(
          profile,
          m.x1, m.z1,
          m.x1 + (m.x2 - m.x1) * t,
          m.z1 + (m.z2 - m.z1) * t
        );
      }
    }

    return { profile, idx };
  }

  return { update, reset };
}
