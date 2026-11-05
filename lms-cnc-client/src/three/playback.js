// =============================================================
// playback.js — utilitas pemetaan playhead -> posisi pahat.
// Dipisah dari komponen agar Fast Refresh Vite tetap bekerja.
// =============================================================

/** Posisi pahat (X masih diameter, mm) pada playhead pecahan. */
export function toolAt(moves, ph, stockD) {
  if (!moves || moves.length === 0) return { x: stockD, z: 0 };
  const i = Math.max(0, Math.min(Math.floor(ph), moves.length - 1));
  const t = Math.max(0, Math.min(1, ph - i));
  const m = moves[i];
  return {
    x: m.x1 + (m.x2 - m.x1) * t,
    z: m.z1 + (m.z2 - m.z1) * t,
  };
}
