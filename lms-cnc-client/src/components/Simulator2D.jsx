// =============================================================
// Simulator2D.jsx — viewport 2D yang mengikuti playhead pecahan.
// Menggambar ulang hanya saat posisi berubah, sehingga animasi
// pahat tetap halus tanpa membebani React.
// =============================================================
import { useEffect, useRef } from 'react';
import { drawSim } from '../api';
import { createCutter } from '../three/cutProfile';
import { toolAt } from '../three/playback';

export default function Simulator2D({ sim, stockD = 40, stockL = 60, playheadRef, crashed = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!sim || !canvasRef.current || !playheadRef) return;
    const cutter = createCutter(sim, stockD);
    let raf = 0;
    let lastPh = -1;
    let lastCrash = null;

    const draw = (ph) => {
      const { profile, idx } = cutter.update(ph);
      const pos = toolAt(sim.moves, ph, stockD);
      drawSim(canvasRef.current, {
        profile,
        movesUpTo: sim.moves.slice(0, idx),
        stockD,
        stockL,
        toolPos: { x: pos.x, z: pos.z },
        crashed,
      });
    };

    const tick = () => {
      const ph = Math.max(0, Math.min(playheadRef.current || 0, sim.moves.length));
      if (Math.abs(ph - lastPh) > 1e-4 || crashed !== lastCrash) {
        draw(ph);
        lastPh = ph;
        lastCrash = crashed;
      }
      raf = requestAnimationFrame(tick);
    };

    // gambar kondisi awal / posisi terakhir saat view dibuka
    const ph0 = Math.max(0, Math.min(playheadRef.current || 0, sim.moves.length));
    draw(ph0);
    lastPh = ph0;
    lastCrash = crashed;

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim, stockD, stockL, playheadRef, crashed]);

  return (
    <div className="viewport2d">
      <canvas ref={canvasRef} width={900} height={500} aria-label="Visualisasi 2D potongan melintang" />
    </div>
  );
}
