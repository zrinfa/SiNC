// =============================================================
// Simulator3D.jsx — viewport 3D untuk simulator bubut.
// Menerima data simulasi yang sama dengan versi 2D (sim.moves/profile),
// lalu memotong benda kerja secara inkremental mengikuti playhead.
// =============================================================
import { useEffect, useRef, useState } from 'react';
import { createCncScene } from '../three/CncScene';
import { createCutter } from '../three/cutProfile';
import { toolAt } from '../three/playback';
import { AXIS_HELP, VIEWS } from '../three/theme';
import Icon from '../ui/Icon.jsx';

const VIEW_LABEL = {
  iso: 'Isometrik',
  depan: 'Depan',
  atas: 'Atas',
  pahat: 'Dekat Pahat',
};

export default function Simulator3D({
  sim,
  stockD = 40,
  stockL = 60,
  playheadRef,
  crashed = false,
  target,
  showToolpath = true,
  transparent = false,
  targetVisible = true,
  height = 540,
  shot = 'machine',
  doorClosed = false,
  status = 'EDIT',
  onError,
  children,
}) {
  const canvasRef = useRef(null);
  const apiRef = useRef(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('iso');

  // buat scene sekali
  useEffect(() => {
    let api;
    try {
      api = createCncScene(canvasRef.current, { stockD, stockL, target, initialView: shot });
    } catch (e) {
      setErr(e?.message || 'WebGL tidak tersedia di perangkat ini.');
      onError?.(e);
      return;
    }
    apiRef.current = api;
    return () => {
      api.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // saat mode berubah: panel = kamera dekat layar, machine = zoom out
  useEffect(() => {
    const next = shot === 'panel' ? 'panel' : 'iso';
    setView('iso');
    apiRef.current?.setView(next);
  }, [shot]);

  useEffect(() => { apiRef.current?.setDoor(doorClosed); }, [doorClosed]);

  // pemotongan inkremental + posisi pahat, mengikuti playheadRef
  useEffect(() => {
    if (!sim || !playheadRef) return;
    const cutter = createCutter(sim, stockD);
    let raf = 0;

    const tick = () => {
      const api = apiRef.current;
      const ph = Math.max(0, Math.min(playheadRef.current || 0, sim.moves.length));
      if (api) {
        const { profile, idx } = cutter.update(ph);
        api.setProfile(profile);
        api.setMoves(sim.moves, idx);
        const pos = toolAt(sim.moves, ph, stockD);
        api.setTool(pos.x / 2, pos.z);

        const m = sim.moves[idx];
        const t = ph - idx;
        const cutting = status === 'AUTO' && !!m && !m.rapid && t > 0.002 && t < 0.998 && !crashed;
        api.setCutting(cutting);
        api.setCoolant(status === 'AUTO' && !crashed, profile);
        api.setPanel({
          profile,
          preview: sim.profile,
          tool: { x: pos.x, z: pos.z },
          stockD,
          stockL,
          target,
          status,
          line: `N${String(1000 + Math.floor(ph) * 10).padStart(4, '0')}`,
          cutting,
        });
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      apiRef.current?.setCutting(false);
      apiRef.current?.setCoolant(false);
    };
  }, [sim, stockD, stockL, playheadRef, crashed, status, target]);

  useEffect(() => { apiRef.current?.setCrash(crashed); }, [crashed]);
  useEffect(() => { apiRef.current?.setToolpathVisible(showToolpath); }, [showToolpath]);
  useEffect(() => { apiRef.current?.setWorkpieceTransparent(transparent); }, [transparent]);
  useEffect(() => {
    apiRef.current?.setTarget(target, targetVisible);
  }, [target, targetVisible]);

  return (
    <div className="viewport3d" style={{ height }}>
      <canvas ref={canvasRef} aria-label="Visualisasi 3D mesin bubut CNC" />

      {err ? (
        <div className="vp3d-fallback">
          <b>Visualisasi 3D tidak bisa dimuat</b>
          <span>{err}</span>
          <span>Sistem akan memakai tampilan 2D otomatis.</span>
        </div>
      ) : (
        <>
          <div className="vp3d-badge">3D • WebGL</div>

          {crashed && <div className="vp3d-alert"><Icon name="alert" size={14} /> TABRAKAN, siklus dihentikan</div>}

          <div className="vp3d-views">
            {Object.keys(VIEWS).map((k) => (
              <button
                key={k}
                className={view === k ? 'active' : ''}
                onClick={() => { setView(k); apiRef.current?.setView(k); }}
              >
                {VIEW_LABEL[k]}
              </button>
            ))}
          </div>

          <div className="vp3d-legend">
            <span><i className="dot feed" />G01/G02/G03</span>
            <span><i className="dot rapid" />G00 cepat</span>
            <span className="hint">{AXIS_HELP}</span>
          </div>

          <div className="vp3d-hint">geser = putar • scroll = zoom</div>
        </>
      )}

      {!err && children}
    </div>
  );
}
