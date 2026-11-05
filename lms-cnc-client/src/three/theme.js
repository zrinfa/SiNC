// =============================================================
// theme.js — konstanta visual simulator 3D.
// Konvensi: sumbu benda kerja = world Z (Z=0 muka chuck, Z negatif
// ke tailstock), 1 unit Three.js = ~22 mm (MM = 0.045), X pada G-Code = DIAMETER.
// =============================================================

export const MM = 0.045; // mm -> unit scene (proporsional realistis terhadap mesin)
export const PROFILE_RES = 0.5; // harus sama dengan RES di api.js

// arah datangnya pahat dilihat dari operator (kanan-bawah, miring diagonal slant bed)
export const TOOL_ANGLE = -35 * (Math.PI / 180);
export const TOOL_DIR = { x: Math.cos(TOOL_ANGLE), y: Math.sin(TOOL_ANGLE) };

export const COLORS = {
  bg: 0x0f1317,
  floor: 0x171c21,
  castIron: 0x3d4650,
  painted: 0x2b333b,
  body: 0xd6dbde,
  bodyLight: 0xe7eaec,
  bodyShade: 0xbfc7cc,
  base: 0x252c33,
  darkSteel: 0x59636e,
  steel: 0xaeb9c4,
  chuck: 0x656d76,
  jaw: 0x7c848d,
  brass: 0xe0b23a,
  insert: 0xf0c24b,
  stock: 0x8794a2,
  feed: 0x4fd19a,
  rapid: 0xd1904f,
  target: 0x5b8fb0,
  danger: 0xd15f5f,
  screen: 0x1d3b46,
  coolant: 0x4aa7e8,
};

// preset kamera (posisi, target) — dipakai tombol di overlay
export const VIEWS = {
  iso: { pos: [18.0, 10.5, 6.5], target: [0, -0.6, -1.2] },
  depan: { pos: [19.0, 3.8, -1.2], target: [0, -0.6, -1.2] },
  atas: { pos: [0.01, 19.5, -1.2], target: [0, 0, -1.2] },
  pahat: { pos: [6.2, 2.4, 1.2], target: [0.3, -0.7, -1.0] },
};

// label sumbu untuk HUD
export const AXIS_HELP = 'X = diameter • Z = aksial (negatif ke tailstock)';
