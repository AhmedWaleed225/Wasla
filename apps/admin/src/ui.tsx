import { formatEgp } from '@wasla/shared';
import { useEffect, useState, type ReactNode } from 'react';

// ---------- Routing (hash based: #/users/123) ----------

export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export const go = (path: string) => {
  window.location.hash = path;
};

// ---------- Formatting ----------

const dt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const d = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) => dt.format(new Date(iso));
export const fmtDate = (iso: string) => d.format(new Date(iso));
export const fmtMoney = (piasters: number) => formatEgp(piasters, 'en');
export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// ---------- Components ----------

const ICONS: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  route: 'M6 18a2.5 2.5 0 1 1 0 .1M18 6a2.5 2.5 0 1 1 0 .1M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" width="32" height="32" role="img" aria-label="Wasla">
      <rect width="64" height="64" rx="18" fill="#0B6E5F" />
      <path d="M17 44c0-10 8-12 15-12s15-2 15-12" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="17" cy="45" r="6" fill="#0B6E5F" stroke="#fff" strokeWidth="4" />
      <circle cx="47" cy="19" r="6.5" fill="#F2A33A" />
    </svg>
  );
}

const TONE: Record<string, string> = {
  ACTIVE: 't-teal',
  SCHEDULED: 't-teal',
  CONFIRMED: 't-teal',
  RESOLVED: 't-teal',
  COMPLETED: 't-blue',
  IN_REVIEW: 't-blue',
  PENDING: 't-sand',
  OPEN: 't-sand',
  SUSPENDED: 't-red',
  CANCELLED: 't-red',
  CANCELLED_BY_DRIVER: 't-red',
  DECLINED: 't-red',
  DELETED: 't-gray',
  DISMISSED: 't-gray',
  EXPIRED: 't-gray',
  CANCELLED_BY_PASSENGER: 't-gray',
};

export function Tag({ value, tone }: { value: string; tone?: string }) {
  return <span className={`tag ${tone ?? TONE[value] ?? 't-gray'}`}>{titleCase(value)}</span>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="err" role="alert">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Card({ title, right, children, alert }: { title?: string; right?: ReactNode; children: ReactNode; alert?: boolean }) {
  return (
    <section className={`cd${alert ? ' alert' : ''}`}>
      {title || right ? (
        <div className="hd" style={{ marginBottom: 12 }}>
          {title ? <h2 className="h2">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span className="m">
        {total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <button className="bt" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <button className="bt" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

/** Text search box that only fires after typing stops. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => {
      if (text !== value) onChange(text);
    }, 300);
    return () => clearTimeout(id);
  }, [text, value, onChange]);
  return (
    <label className="search">
      <Icon name="search" />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

/** Asks for a reason before a consequential action; the reason is stored in the audit log. */
export function ReasonAction({
  label,
  danger,
  onConfirm,
  busy,
}: {
  label: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <button className={`bt ${danger ? 'bd' : 'bp'}`} type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="row" style={{ alignItems: 'stretch' }}>
      <input
        className="input"
        autoFocus
        placeholder="Reason (kept in the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ minWidth: 280 }}
        maxLength={200}
      />
      <button className={`bt ${danger ? 'bd' : 'bp'}`} type="button" disabled={reason.trim().length < 3 || busy} onClick={() => onConfirm(reason.trim())}>
        {busy ? 'Working…' : `Confirm ${label.toLowerCase()}`}
      </button>
      <button className="bt" type="button" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
