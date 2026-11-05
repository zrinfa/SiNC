// =============================================================
// router.js - router berbasis hash (#/halaman). Dipilih karena situs
// disajikan sebagai berkas statis di public_html cPanel, tanpa rewrite
// server untuk rute React.
// =============================================================
import { useEffect, useState } from 'react';

export function currentPath() {
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/';
}

export function navigate(to, { replace = false } = {}) {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (window.location.hash === target) return;
  if (replace) window.location.replace(window.location.pathname + window.location.search + target);
  else window.location.hash = target;
}

export function parse(path = currentPath()) {
  const [raw, query] = path.split('?');
  return {
    segments: raw.split('/').filter(Boolean),
    query: Object.fromEntries(new URLSearchParams(query || '')),
  };
}

export function useRoute() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function Link({ to, children, className, title, onClick }) {
  return (
    <a
      href={'#' + to}
      className={className}
      title={title}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
