import type { AdminMeDto } from '@wasla/shared';
import { useState, type FormEvent } from 'react';
import { adminApi } from '../api';
import { ErrorBox, Logo } from '../ui';

/**
 * Change your own password. Shown on its own (forced) after signing in with a
 * temporary password, or from the sidebar at any time.
 */
export function ChangePassword({ me, forced, onChanged }: { me: AdminMeDto; forced: boolean; onChanged: (me: AdminMeDto) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const mismatch = repeat.length > 0 && next !== repeat;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await adminApi.changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setRepeat('');
      onChanged(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <form className="cd stack" onSubmit={submit} style={{ maxWidth: 420 }}>
      {forced ? (
        <>
          <div className="row">
            <Logo />
            <h1 className="h2">Set your password</h1>
          </div>
          <p className="small m">
            Hi {me.name}. You signed in with a temporary password. Choose your own before continuing; it signs out your other sessions.
          </p>
        </>
      ) : (
        <h1 className="title">Change password</h1>
      )}
      <label className="f">
        Current password
        <input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="f">
        New password (12+ characters)
        <input className="input" type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="f">
        Repeat new password
        <input className="input" type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      {mismatch ? <div className="err">The new passwords don't match.</div> : null}
      <ErrorBox error={error} />
      {done && !forced ? <div className="ok">Password changed. Your other sessions were signed out.</div> : null}
      <button className="bt bp" type="submit" disabled={busy || mismatch || next.length < 12} style={{ height: 40 }}>
        {busy ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );

  return forced ? <main className="login">{form}</main> : form;
}
