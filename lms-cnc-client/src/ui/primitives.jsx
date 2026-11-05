// =============================================================
// primitives.jsx - komponen dasar desain system LMS.
// Semua kelas CSS-nya ada di styles.css bagian "design system".
// Ikon hanya lewat <Icon />, tanpa emoji.
// =============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ---------------------------------- tombol --------------------------------- */
export function Button({ variant = 'primary', size = 'md', icon, iconRight, children, loading, className, ...rest }) {
  return (
    <button
      type={rest.type || 'button'}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, loading && 'is-loading', className)}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children != null && <span>{children}</span>}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 14 : 16} /> : null}
    </button>
  );
}

export function IconButton({ name, title, variant = 'ghost', size = 'md', className, ...rest }) {
  return (
    <button type="button" title={title} aria-label={title} className={cx('btn', `btn--${variant}`, `btn--icon`, `btn--${size}`, className)} {...rest}>
      <Icon name={name} size={size === 'sm' ? 14 : 17} />
    </button>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Memuat" />;
}

/* --------------------------------- kontainer -------------------------------- */
export function Card({ title, subtitle, actions, icon, tone, children, className, bodyClass, footer }) {
  return (
    <section className={cx('card', tone && `card--${tone}`, className)}>
      {(title || actions) && (
        <header className="card__head">
          <div className="card__title">
            {icon && <Icon name={icon} size={17} className="card__icon" />}
            <div>
              <h3>{title}</h3>
              {subtitle && <p className="dim">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children && <div className={cx('card__body', bodyClass)}>{children}</div>}
      {footer && <footer className="card__foot">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ title, desc, actions, badge }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {desc && <p className="dim">{desc}</p>}
        {badge && <div className="page-head__badge">{badge}</div>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}

export function Row({ children, wrap = true, className, gap, style }) {
  return <div className={cx('u-row', className)} style={gap != null ? { ...style, gap } : style}>{children}</div>;
}

export function Grid({ cols = 2, children, className, min, style }) {
  return (
    <div
      className={cx('u-grid', min && 'u-grid--auto', className)}
      style={{ '--grid-min': min ? `${min}px` : undefined, gridTemplateColumns: min ? undefined : `repeat(${cols}, minmax(0, 1fr))`, ...style }}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone }) {
  return (
    <div className={cx('stat', tone && `stat--${tone}`)}>
      {icon && <Icon name={icon} size={18} className="stat__icon" />}
      <div className="stat__text">
        <b>{value}</b>
        <span>{label}</span>
        {hint && <em>{hint}</em>}
      </div>
    </div>
  );
}

/* ---------------------------------- form ---------------------------------- */
export function Field({ label, hint, error, required, children, htmlFor, className }) {
  return (
    <label className={cx('field', error && 'field--error', className)} htmlFor={htmlFor}>
      {label && <span className="field__label">{label}{required && <i aria-hidden>*</i>}</span>}
      {children}
      {hint && !error && <span className="field__hint dim">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

export const Input = ({ className, ...rest }) => <input className={cx('input', className)} {...rest} />;
export const Textarea = ({ className, ...rest }) => <textarea className={cx('input', 'textarea', className)} {...rest} />;
export const Select = ({ className, children, ...rest }) => <select className={cx('input', 'select', className)} {...rest}>{children}</select>;

export function SearchInput({ value, onChange, placeholder = 'Cari', className }) {
  return (
    <span className={cx('search', className)}>
      <Icon name="search" size={15} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={cx('switch', disabled && 'is-disabled')}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden />
      {label && <span className="switch__label">{label}</span>}
    </label>
  );
}

/* ---------------------------------- data ---------------------------------- */
export function Badge({ tone, children, icon, className }) {
  return <span className={cx('badge', tone && `badge--${tone}`, className)}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

export function Table({ columns, rows, rowKey = 'id', onRow, empty = 'Belum ada data.', loading, className }) {
  return (
    <div className={cx('table-wrap', className)}>
      <table className="table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'ta-r' : c.align === 'center' ? 'ta-c' : ''} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="table__loading"><Spinner size={18} /></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="table__empty">{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr
              key={r[rowKey] ?? i}
              className={onRow ? 'is-clickable' : ''}
              onClick={onRow ? () => onRow(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'ta-r' : c.align === 'center' ? 'ta-c' : ''}>
                  {c.render ? c.render(r, i) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ items, value, onChange, className }) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={cx('tabs__item', value === it.value && 'is-active')}
          onClick={() => onChange(it.value)}
        >
          {it.icon && <Icon name={it.icon} size={15} />}
          {it.label}
          {it.count != null && <em>{it.count}</em>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone, label }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / (max || 1)) * 100)));
  return (
    <div className={cx('pbar', tone && `pbar--${tone}`)}>
      <i style={{ width: `${pct}%` }} />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, icon, action }) {
  const auto = { info: 'info', ok: 'check-circle', warn: 'alert', danger: 'alert' }[tone] || 'info';
  return (
    <div className={cx('alert', `alert--${tone}`)} role={tone === 'danger' ? 'alert' : 'note'}>
      <Icon name={icon || auto} size={17} />
      <div className="alert__body">
        {title && <b>{title}</b>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="alert__action">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'box', title, desc, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <b>{title}</b>
      {desc && <p className="dim">{desc}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function Modal({ open, title, children, footer, onClose, width = 560, icon }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', esc);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('modal-open'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <header className="modal__head">
          <b>{icon && <Icon name={icon} size={17} />}{title}</b>
          <IconButton name="close" title="Tutup" variant="ghost" size="sm" onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------- notifikasi -------------------------------- */
let toastPush = () => {};
export function toast(message, tone = 'ok', opts = {}) {
  toastPush({ message, tone, ...opts });
}

export function Toaster() {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const remove = useCallback((id) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  useEffect(() => {
    toastPush = (t) => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-3), { id, ...t }]);
      setTimeout(() => remove(id), t.timeout || (t.action ? 7000 : 3200));
    };
    return () => { toastPush = () => {}; };
  }, [remove]);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx('toast', `toast--${t.tone}`)}>
          <Icon name={{ ok: 'check-circle', danger: 'x-circle', warn: 'alert', info: 'info' }[t.tone] || 'info'} size={16} />
          <span>{t.message}</span>
          {t.action && <button onClick={() => { t.action.onClick(); remove(t.id); }}>{t.action.label}</button>}
          <IconButton name="close" title="Tutup" size="sm" variant="ghost" onClick={() => remove(t.id)} />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- konfirmasi ------------------------------- */
let askPush = () => Promise.resolve(false);
export function askConfirm({ title = 'Yakin?', message, confirmLabel = 'Lanjutkan', tone = 'danger' } = {}) {
  return askPush({ title, message, confirmLabel, tone });
}

export function ConfirmHost() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(() => {});
  useEffect(() => {
    askPush = (req) => new Promise((resolve) => { resolveRef.current = resolve; setState(req); });
    return () => { askPush = () => Promise.resolve(false); };
  }, []);
  const done = (ok) => { resolveRef.current(ok); setState(null); };
  return (
    <Modal
      open={!!state}
      title={state?.title}
      width={420}
      onClose={() => done(false)}
      footer={<>
        <Button variant="sec" onClick={() => done(false)}>Batal</Button>
        <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => done(true)} icon={state?.tone === 'danger' ? 'trash' : 'check'}>
          {state?.confirmLabel}
        </Button>
      </>}
    >
      <p className="confirm-msg">{state?.message}</p>
    </Modal>
  );
}
