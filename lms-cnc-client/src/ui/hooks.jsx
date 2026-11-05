// =============================================================
// hooks.js - utilitas data + format untuk seluruh halaman.
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';

// muat data async dengan loading/error/reload
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current()
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, setData: (data) => setState({ loading: false, data, error: null }) };
}

export const inTanggal = (s) => {
  if (!s) return false;
  const t = new Date(String(s).replace(' ', 'T'));
  return !Number.isNaN(t.getTime());
};

export function formatTanggal(s, { waktu = true } = {}) {
  if (!inTanggal(s)) return '-';
  const d = new Date(String(s).replace(' ', 'T'));
  const opsi = { day: '2-digit', month: 'short', year: 'numeric' };
  if (waktu) Object.assign(opsi, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('id-ID', opsi);
}

export function hariMenua(s) {
  if (!inTanggal(s)) return null;
  const jam = (new Date(String(s).replace(' ', 'T')) - Date.now()) / 36e5;
  if (jam < 0) return 'terlambat';
  if (jam < 24) return 'hari ini';
  if (jam < 48) return 'besok';
  if (jam <= 168) return Math.round(jam / 24) + ' hari lagi';
  return null;
}

// nilai angka 0-100 → tone badge
export function toneNilai(v, batas = 75) {
  if (v == null) return 'muted';
  if (v >= batas) return 'ok';
  if (v >= Math.max(40, batas - 25)) return 'warn';
  return 'danger';
}

export const pct = (a, b) => (!b ? 0 : Math.round((a / b) * 100));

export function inisial(nama = '') {
  return nama.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

export function opsiInput(daftar, { kosong = null, label = (x) => x } = {}) {
  return [
    ...(kosong ? [<option key="__kosong" value="">{kosong}</option>] : []),
    ...(daftar || []).map((x) => <option key={x.id ?? x.value ?? x} value={x.id ?? x.value ?? x}>{label(x)}</option>),
  ];
}
