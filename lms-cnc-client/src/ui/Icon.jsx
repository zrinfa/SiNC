// =============================================================
// Icon.jsx - set ikon garis (stroke) SVG inline.
// Aturan desain: TIDAK ada emoji di seluruh UI. Setiap "ikon"
// adalah <Icon name="..." /> yang mewarisi warna teks (currentColor).
// =============================================================

const P = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  class: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  users: <><path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.2" /><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" /></>,
  shield: <><path d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 9.5-4.1-1.8-7-5.3-7-9.5V6z" /><path d="M9 12l2 2 4-4" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 5.5V20.5" /></>,
  assignment: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4M8.5 11l2 2 4-4M8.5 16.5h7" /></>,
  quiz: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.6c-.8.4-1 1-1 1.8M12 17.4v.2" /></>,
  code: <><path d="M9 7l-4.5 5L9 17M15 7l4.5 5L15 17" /></>,
  cube: <><path d="M12 2.8l8 4.3v9.8L12 21.2 4 16.9V7.1z" /><path d="M4 7.1l8 4.4 8-4.4M12 11.5v9.7" /></>,
  layers: <><path d="M12 3l8.5 4.6L12 12.2 3.5 7.6z" /><path d="M4 12.4l8 4.3 8-4.3M4 16.6l8 4.3 8-4.3" /></>,
  chart: <><path d="M4 20h16" /><rect x="5.5" y="11" width="3.4" height="7" rx="1" /><rect x="10.8" y="6.5" width="3.4" height="11.5" rx="1" /><rect x="16" y="9" width="3.4" height="9" rx="1" /></>,
  play: <><path d="M7 4.6l12.5 7.4L7 19.4z" /></>,
  pause: <><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></>,
  stop: <><rect x="5.5" y="5.5" width="13" height="13" rx="2" /></>,
  'step-back': <><path d="M18.5 5.2v13.6L8 12z" /><path d="M5.5 5v14" /></>,
  'step-forward': <><path d="M5.5 5.2v13.6L16 12z" /><path d="M18.5 5v14" /></>,
  restart: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4.2h-4.2" /></>,
  rewind: <><path d="M3.5 12a8.5 8.5 0 1 0 3-6.5" /><path d="M3.5 4v4.2H7.7" /></>,
  save: <><path d="M5 3.8h10.5L20 8.3V20a1.2 1.2 0 0 1-1.2 1.2H5A1.2 1.2 0 0 1 3.8 20V5A1.2 1.2 0 0 1 5 3.8z" /><path d="M8 3.8v5h7v-5M8 21.2v-5.4h8v5.4" /></>,
  edit: <><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="M14.5 5.5l4 4" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4.3h5v2.2M6.5 6.5l.9 13.2a1.2 1.2 0 0 0 1.2 1.1h6.8a1.2 1.2 0 0 0 1.2-1.1l.9-13.2" /><path d="M10 10.5v7M14 10.5v7" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M6 12h12" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  check: <><path d="M4.5 12.5l5 5L20 7" /></>,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="M8 12.2l2.8 2.8L16.5 9" /></>,
  'x-circle': <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  alert: <><path d="M12 3.6l9 15.6H3z" /><path d="M12 9.4v4.4M12 16.6v.2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10.8v5.4M12 7.6v.2" /></>,
  'chevron-right': <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />,
  'chevron-left': <path d="M14.5 5.5L8 12l6.5 6.5" />,
  'chevron-down': <path d="M5.5 9.5L12 16l6.5-6.5" />,
  'chevron-up': <path d="M5.5 14.5L12 8l6.5 6.5" />,
  'arrow-left': <><path d="M20 12H4.5" /><path d="M10.5 6l-6 6 6 6" /></>,
  'arrow-right': <><path d="M4 12h15.5" /><path d="M13.5 6l6 6-6 6" /></>,
  upload: <><path d="M12 16.5V4.8" /><path d="M7.5 9.3L12 4.8l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  download: <><path d="M12 4.5v11.7" /><path d="M7.5 12.2L12 16.7l4.5-4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="M15.4 15.4L20 20" /></>,
  filter: <><path d="M3.5 5.5h17l-6.6 7.6v5.4l-3.8-2v-3.4z" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.6a7.6 7.6 0 0 0 .1-5.2l-2.1-.5-1-2.4.9-2A7.6 7.6 0 0 0 12 2.8l-.6 2.1-2.5.4-1.7-1.4a7.6 7.6 0 0 0-2.6 4.5l1.8 1.5-.4 2.5-2.1.7a7.6 7.6 0 0 0 2.1 4.7l2-1.1 2.2 1.3.3 2.4a7.6 7.6 0 0 0 4.8-1.6l-.6-2.1z" /></>,
  logout: <><path d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15" /><path d="M18.5 12H10M15.6 8.8L18.8 12l-3.2 3.2" /></>,
  login: <><path d="M9 4.5h8.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H9" /><path d="M4.5 12H13M10 8.8L6.8 12 10 15.2" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 5.6L20 7" /></>,
  link: <><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L11.6 7.4" /><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1.4-1.4" /></>,
  video: <><rect x="3" y="6" width="12.5" height="12" rx="2" /><path d="M15.5 11l5.5-3.4v8.8L15.5 13z" /></>,
  file: <><path d="M6 3.5h7.5L19 9v11.5H6z" /><path d="M13.5 3.5V9H19" /></>,
  pdf: <><path d="M6 3.5h7.5L19 9v11.5H6z" /><path d="M13.5 3.5V9H19M9 13.5h1.6a1.4 1.4 0 0 1 0 2.8H9zM13.4 16.3h1.4M16.6 16.3h1.6" /></>,
  folder: <><path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9v9A1.5 1.5 0 0 1 19 19.5H5a1.5 1.5 0 0 1-1.5-1.5z" /></>,
  target: <><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r=".8" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2.2" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M3.5 10.5h17M8 3.5v4M16 3.5v4" /></>,
  flag: <><path d="M5.5 21V4.2h13l-2.6 4.4 2.6 4.4h-13" /></>,
  robot: <><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M12 4.2V8M9 13v1.6M15 13v1.6M2.5 12.5v3M21.5 12.5v3" /><circle cx="12" cy="3.4" r="1.4" /></>,
  spark: <><path d="M12 3.2l2.1 5.3 5.3 2.1-5.3 2.1L12 18l-2.1-5.3-5.3-2.1 5.3-2.1z" /><path d="M18.6 16.4l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /></>,
  eye: <><path d="M2.8 12S6.2 6.2 12 6.2 21.2 12 21.2 12 17.8 17.8 12 17.8 2.8 12 2.8 12z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M4 4l16 16" /><path d="M9.6 9.7a3 3 0 0 0 4.2 4.2M6.4 6.9C4.2 8.5 2.8 12 2.8 12s3.4 5.8 9.2 5.8c1.7 0 3.2-.5 4.4-1.2M9.9 6.5c.7-.2 1.4-.3 2.1-.3 5.8 0 9.2 5.8 9.2 5.8s-.9 1.6-2.6 3.1" /></>,
  maximize: <><path d="M4 9.5V4h5.5M14.5 4H20v5.5M20 14.5V20h-5.5M9.5 20H4v-5.5" /></>,
  minimize: <><path d="M9.5 4v5.5H4M14.5 4v5.5H20M20 14.5h-5.5V20M4 14.5h5.5V20" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></>,
  ruler: <><path d="M3.2 14.8L14.8 3.2l6 6L9.2 20.8z" /><path d="M8 8.5l1.8 1.8M11 5.5l1.8 1.8M5 11.5l1.8 1.8" /></>,
  send: <><path d="M20.5 3.5L10.8 13.2M20.5 3.5l-6.4 17-3.3-7.3-7.3-3.3z" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1" /></>,
  refresh: <><path d="M20 11.5a8 8 0 0 0-13.7-4.7L4 9" /><path d="M4 4.5V9h4.5M4 12.5a8 8 0 0 0 13.7 4.7L20 15" /><path d="M20 19.5V15h-4.5" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  graduation: <><path d="M2.8 9L12 4.5 21.2 9 12 13.5z" /><path d="M6.5 11v4.8c0 1.4 2.5 2.7 5.5 2.7s5.5-1.3 5.5-2.7V11" /></>,
  box: <><path d="M4.5 8.2L12 4.2l7.5 4v7.6L12 19.8l-7.5-4z" /><path d="M4.5 8.2L12 12.2l7.5-4M12 12.2v7.6" /></>,
  speed: <><path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" /><path d="M12 12.5l3.6-3.2" /><circle cx="12" cy="13.4" r="1.2" /></>,
};

export const ICONS = Object.keys(P);

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.7, filled = false, title }) {
  const shape = P[name] || P.info;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {shape}
    </svg>
  );
}
