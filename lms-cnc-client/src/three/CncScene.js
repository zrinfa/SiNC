// =============================================================
// CncScene.js — perakitan scene 3D: renderer, kamera, lampu, mesin,
// benda kerja, pahat, toolpath, penanda target, dan siklus render.
// API imperatif dipakai oleh komponen React (Simulator3D.jsx).
// =============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createMachine } from './Machine';
import { createEnclosure } from './Enclosure';
import { createControlPanel } from './ControlPanel';
import { createCoolant } from './Coolant';
import { createSparks } from './Sparks';
import { createWorkpiece } from './Workpiece';
import { createTool } from './Tool';
import { createToolpath } from './Toolpath';
import { COLORS, MM } from './theme';

export function createCncScene(canvas, { stockD = 40, stockL = 60, target, initialView = 'iso' } = {}) {
  const host = canvas.parentElement;
  const span = Math.max(2.5, stockL * MM);
  const camScale = Math.max(0.78, Math.min(1.25, 0.72 + span * 0.08));
  const cz = -1.2;

  // kamera menyesuaikan lebar viewport supaya mesin tidak terpotong di HP
  const computeFit = () => {
    const aspect = host ? Math.max(0.32, host.clientWidth / Math.max(1, host.clientHeight)) : 1;
    return Math.max(1, Math.min(2.6, Math.pow(1.55 / aspect, 0.75)));
  };
  const fitView = (v, f) => ({
    pos: [
      v.target[0] + (v.pos[0] - v.target[0]) * f,
      v.target[1] + (v.pos[1] - v.target[1]) * f,
      v.target[2] + (v.pos[2] - v.target[2]) * f,
    ],
    target: v.target,
  });

  const controlPanel = createControlPanel({ span });
  const buildViews = (f) => ({
    iso: fitView({ pos: [18.0 * camScale, 10.5 * camScale, cz + 9.5 * camScale], target: [0, -0.6, cz] }, f),
    depan: fitView({ pos: [19.0 * camScale, 3.8 * camScale, cz + 0.5], target: [0, -0.6, cz] }, f),
    atas: fitView({ pos: [0.01, 19.5 * camScale, cz], target: [0, 0, cz] }, f),
    panel: controlPanel.getView(),
  });
  let fit = computeFit();
  let views = buildViews(fit);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 55, 150);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
  const startView = views[initialView] || views.iso;
  camera.position.set(...startView.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...startView.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 110;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.update();

  // ---------- pencahayaan ----------
  const hemi = new THREE.HemisphereLight(0xcfe0f0, 0x1a2128, 0.45);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.15);
  key.position.set(8, 14, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const shadowExtent = Math.max(13, 10 + span * 0.85);
  key.shadow.camera.left = -shadowExtent;
  key.shadow.camera.right = shadowExtent;
  key.shadow.camera.top = shadowExtent;
  key.shadow.camera.bottom = -shadowExtent;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.target.position.set(0, -1, cz + 0.3);
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0x9fc4e8, 0.7);
  fill.position.set(-9, 6, -8);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.55);
  rim.position.set(-2, 5, -13);
  scene.add(rim);

  // refleksi lembut (tanpa file HDR, tetap offline)
  let pmrem = null;
  let envRT = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envRT = pmrem.fromScene(room, 0.04);
    scene.environment = envRT.texture;
    room.dispose?.();
  } catch {
    /* tanpa environment map tetap jalan */
  }

  // ---------- lantai ----------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(34, 64),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, metalness: 0.05, roughness: 0.96 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.35;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(44, 44, 0x2b333b, 0x21282f);
  grid.position.y = -4.34;
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  scene.add(grid);

  // ---------- rig (semua isi mesin, supaya bisa digetarkan saat crash) ----------
  const rig = new THREE.Group();
  scene.add(rig);

  const machine = createMachine({ stockD, stockL });
  rig.add(machine.group);

  const enclosure = createEnclosure({ stockL });
  rig.add(enclosure.group);
  enclosure.setDoor(0);

  // lampu kerja hangat di dalam selubung
  const workLight = new THREE.PointLight(0xffe2b8, 22, 9, 2);
  workLight.position.set(0, 2.7, -span / 2);
  scene.add(workLight);

  rig.add(controlPanel.group);

  const workpiece = createWorkpiece({ stockD, stockL });
  rig.add(workpiece.group);

  const toolpath = createToolpath();
  rig.add(toolpath.group);

  const tool = createTool();
  rig.add(tool.group);

  const sparks = createSparks();
  rig.add(sparks.group);

  const coolant = createCoolant();
  rig.add(coolant.group);

  // isi layar panel fisik pertama kali
  controlPanel.setData({
    profile: new Array(Math.round(stockL / 0.5) + 1).fill(stockD / 2),
    tool: { x: stockD, z: 0 },
    stockD,
    stockL,
    target,
    status: 'EDIT',
  });

  // ---------- penanda target ----------
  const targetGroup = new THREE.Group();
  const targetRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.018, 10, 96),
    new THREE.MeshBasicMaterial({
      color: COLORS.target,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      toneMapped: false,
    })
  );
  targetGroup.add(targetRing);
  targetGroup.renderOrder = 8;
  rig.add(targetGroup);

  function applyTarget(t, visible = true) {
    if (!t) { targetGroup.visible = false; return; }
    const d = Number(t.d ?? t.target_d);
    const z = Number(t.z ?? t.target_z);
    if (!Number.isFinite(d) || !Number.isFinite(z) || d <= 0) {
      targetGroup.visible = false;
      return;
    }
    targetRing.scale.setScalar((d / 2) * MM);
    targetGroup.position.z = -z * MM;
    targetGroup.visible = visible;
  }
  applyTarget(target, true);

  // ---------- state & API ----------
  let tween = null;
  let disposeObserver = null;

  function setView(name) {
    let v = views[name] || views.iso;
    if (name === 'pahat') {
      // kamera dekat mengikuti Z pahat, tetapi tetap di area benda kerja
      const tzRaw = tool.getZ();
      const tz = Math.min(-0.2, Math.max(-span + 0.4, tzRaw));
      v = {
        pos: [6.5, 2.6, tz + 2.6],
        target: [0.3, -0.6, tz - 0.4],
      };
    }
    tween = {
      t: 0,
      dur: name === 'panel' ? 1.05 : 1.15,
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...v.pos),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...v.target),
    };
  }

  function resize() {
    if (!host) return;
    const w = host.clientWidth || 640;
    const h = host.clientHeight || 420;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const newFit = computeFit();
    if (Math.abs(newFit - fit) > 0.01) {
      const ratio = newFit / fit;
      if (tween) {
        tween.fromPos.sub(tween.fromTarget).multiplyScalar(ratio).add(tween.fromTarget);
        tween.toPos.sub(tween.toTarget).multiplyScalar(ratio).add(tween.toTarget);
      }
      camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
      fit = newFit;
      views = buildViews(fit);
      controls.update();
    }
  }
  resize();

  if (typeof ResizeObserver !== 'undefined' && host) {
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    disposeObserver = () => ro.disconnect();
  }

  let crash = false;
  let lastFrame = 0;
  let doorT = 0;
  let doorTarget = 0;

  renderer.setAnimationLoop((now) => {
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    const t = now * 0.001;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const e = tween.t * tween.t * (3 - 2 * tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      if (tween.t >= 1) tween = null;
    }

    if (doorT !== doorTarget) {
      const dir = doorTarget > doorT ? 1 : -1;
      doorT = Math.max(0, Math.min(1, doorT + dir * (dt / 1.05)));
      enclosure.setDoor(doorT);
    }

    sparks.update(dt);
    coolant.update(dt);

    // getaran halus saat tabrakan
    rig.position.y = crash ? Math.sin(t * 55) * 0.015 : 0;

    controls.update();
    renderer.render(scene, camera);
  });

  const api = {
    setProfile(profile) {
      workpiece.update(profile);
      workpiece.syncCaps(profile);
    },
    setMoves(moves, upTo) {
      toolpath.setMoves(moves);
      toolpath.setProgress(upTo);
    },
    setTool(radiusMm, zMm) {
      tool.setPosition(radiusMm, zMm);
      const tip = tool.getTip();
      const nozzle = tool.getNozzle();
      sparks.setOrigin(tip.x, tip.y, tip.z);
      coolant.setAim(nozzle, tip);
    },
    setCutting(on) {
      sparks.setActive(on);
    },
    setCoolant(on) {
      coolant.setActive(on);
      const tip = tool.getTip();
      const nozzle = tool.getNozzle();
      coolant.setAim(nozzle, tip);
    },
    setDoor(closed) {
      doorTarget = closed ? 1 : 0;
    },
    setPanel(data) {
      controlPanel.setData(data);
    },
    setCrash(on) {
      crash = on;
      tool.setCrash(on);
      workpiece.setCrash(on);
      if (!on) rig.position.y = 0;
    },
    setTarget(t, visible) {
      applyTarget(t, visible);
      targetGroup.visible = visible && targetGroup.visible;
    },
    setToolpathVisible(on) {
      toolpath.setVisible(on);
    },
    setWorkpieceTransparent(on) {
      workpiece.setTransparent(on);
    },
    setView,
    resize,
    dispose() {
      renderer.setAnimationLoop(null);
      disposeObserver?.();
      controls.dispose();
      machine.dispose();
      enclosure.dispose();
      controlPanel.dispose();
      sparks.dispose();
      coolant.dispose();
      workpiece.dispose();
      toolpath.dispose();
      tool.dispose();
      scene.remove(workLight);
      floor.geometry.dispose();
      floor.material.dispose();
      grid.geometry.dispose();
      grid.material.dispose();
      targetRing.geometry.dispose();
      targetRing.material.dispose();
      envRT?.dispose();
      pmrem?.dispose();
      renderer.dispose();
    },
  };

  return api;
}
