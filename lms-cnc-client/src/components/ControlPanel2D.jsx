// =============================================================
// ControlPanel2D.jsx — tampilan "zoom in" panel kontrol saat mengedit.
// Panel ini menutupi viewport 3D; saat animasi berjalan ia mengecil
// dan kamera 3D melakukan zoom-out ke seluruh mesin.
// =============================================================
import { useEffect, useRef } from 'react';
import { createCutter } from '../three/cutProfile';
import { toolAt } from '../three/playback';
import { drawPanelScreen } from '../three/panelArt';

export default function ControlPanel2D({
  sim,
  stockD = 40,
  stockL = 60,
  target,
  playheadRef,
  visible = true,
  status = 'EDIT',
  crashed = false,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const cutter = sim ? createCutter(sim, stockD) : null;
    let raf = 0;
    let lastPh = -1;
    let lastStatus = '';

    const draw = () => {
      const ph = Math.max(0, Math.min(playheadRef.current || 0, sim?.moves.length || 0));
      const state = cutter?.update(ph) || { profile: null, idx: 0 };
      const pos = sim ? toolAt(sim.moves, ph, stockD) : { x: stockD, z: 0 };
      const m = sim?.moves?.[state.idx];
      const t = ph - state.idx;
      const cutting = !!m && !m.rapid && t > 0.002 && t < 0.998 && !crashed;

      drawPanelScreen(ctx, {
        profile: state.profile,
        preview: sim?.profile,
        tool: { x: pos.x, z: pos.z },
        stockD,
        stockL,
        target,
        status: crashed ? 'ALARM' : status,
        line: `N${String(1000 + Math.floor(ph) * 10).padStart(4, '0')}`,
        cutting,
      });
      lastPh = ph;
      lastStatus = status;
    };

    const tick = () => {
      const ph = Math.max(0, Math.min(playheadRef.current || 0, sim?.moves.length || 0));
      if (Math.abs(ph - lastPh) > 1e-4 || status !== lastStatus) draw();
      raf = requestAnimationFrame(tick);
    };

    draw();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, sim, stockD, stockL, target, playheadRef, status, crashed]);

  return (
    <div className={`panel-stage${visible ? '' : ' panel-stage--hidden'}`} aria-hidden={!visible}>
      <div className="panel-unit">
        <div className="panel-brand">
          <span className="panel-brand__name">GreaMaT</span>
          <span className="panel-brand__series">CNC Series 805Ta</span>
          <span className="panel-brand__led" title="Mode edit" />
        </div>

        <div className="panel-screen-wrap">
          <canvas ref={canvasRef} width={960} height={640} aria-label="Panel kontrol CNC 2D" />
          <div className="panel-glare" />
        </div>

        <div className="panel-strip">
          <div className="panel-strip__hint">
            <b>{crashed || status === 'ALARM' ? 'ALARM'
              : status === 'AUTO' ? 'SIKLUS BERJALAN'
                : status === 'PAUSE' ? 'SIKLUS DIJEDA'
                  : status === 'STOP' ? 'SIKLUS DIHENTIKAN'
                    : status === 'SELESAI' ? 'SIKLUS SELESAI' : 'MODE EDIT'}</b>
            <span>Tekan Animasi, kamera zoom-out ke mesin 3D.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

