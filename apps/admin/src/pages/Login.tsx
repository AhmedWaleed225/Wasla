import { useState, type FormEvent } from 'react';
import type { AdminMeDto } from '@wasla/shared';
import { adminApi } from '../api';
import { ErrorBox, Logo } from '../ui';

export function Login({ onSignedIn }: { onSignedIn: (me: AdminMeDto) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await adminApi.login(email, password));
    } catch (err) {
      setError(err);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="cd" onSubmit={submit}>
        <div className="row">
          <Logo />
          <h1 className="h2">Wasla Ops</h1>
        </div>
        <p className="m small">Staff sign-in. Every action in the console is recorded.</p>
        <label className="f">
          Email
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="f">
          Password
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <ErrorBox error={error} />
        <button className="bt bp" type="submit" disabled={busy} style={{ height: 40 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
