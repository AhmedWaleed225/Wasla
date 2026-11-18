import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminMeDto, AdminRole, AdminStaffWithPasswordDto } from '@wasla/shared';
import { useState, type FormEvent } from 'react';
import { adminApi } from '../api';
import { Card, ErrorBox, Tag, fmtDateTime, titleCase } from '../ui';

const ROLES: AdminRole[] = ['SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE'];

/** Shows a temporary password once, with a copy button. It can't be shown again. */
function OneTimePassword({ result, onDone }: { result: AdminStaffWithPasswordDto; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ok stack" role="status">
      <p>
        Temporary password for <b>{result.name}</b> ({result.email}). Give it to them securely — it won't be shown again, and
        they'll have to change it when they sign in.
      </p>
      <div className="row">
        <code style={{ fontSize: 16, background: '#fff', padding: '6px 10px', borderRadius: 8 }}>{result.temporaryPassword}</code>
        <button
          className="bt"
          type="button"
          onClick={() => void navigator.clipboard?.writeText(result.temporaryPassword).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="bt bp" type="button" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

export function Staff({ me }: { me: AdminMeDto }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['staff'], queryFn: adminApi.staff });
  const [shown, setShown] = useState<AdminStaffWithPasswordDto | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('SUPPORT');

  const refresh = () => void qc.invalidateQueries({ queryKey: ['staff'] });
  const create = useMutation({
    mutationFn: () => adminApi.createStaff({ email, name, role }),
    onSuccess: (r) => {
      setShown(r);
      setEmail('');
      setName('');
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; role?: AdminRole; disabled?: boolean }) => adminApi.updateStaff(v.id, { role: v.role, disabled: v.disabled }),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: (id: string) => adminApi.resetStaffPassword(id),
    onSuccess: (r) => {
      setShown(r);
      refresh();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <>
      <div className="hd">
        <div>
          <h1 className="title">Staff</h1>
          <p className="m small">Super admins only. Every change here is recorded in the audit log.</p>
        </div>
      </div>

      {shown ? <OneTimePassword result={shown} onDone={() => setShown(null)} /> : null}
      <ErrorBox error={create.error ?? update.error ?? reset.error} />

      <Card title="Add a staff member">
        <form className="row" onSubmit={submit}>
          <input className="input" placeholder="Name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" type="email" placeholder="Work email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ minWidth: 240 }} />
          <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} aria-label="Role">
            {ROLES.map((r) => (
              <option key={r} value={r}>{titleCase(r)}</option>
            ))}
          </select>
          <button className="bt bp" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
        </form>
        <p className="m small" style={{ marginTop: 8 }}>They get a temporary password to change at first sign-in.</p>
      </Card>

      <Card title="Accounts">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((s) => {
                const self = s.id === me.id;
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b>{self ? <span className="m small"> (you)</span> : null}</td>
                    <td>{s.email}</td>
                    <td>
                      <select
                        value={s.role}
                        disabled={self || update.isPending}
                        aria-label={`Role for ${s.name}`}
                        onChange={(e) => update.mutate({ id: s.id, role: e.target.value as AdminRole })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{titleCase(r)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="row" style={{ gap: 4 }}>
                      {s.disabled ? <Tag value="Disabled" tone="t-red" /> : <Tag value="Active" tone="t-teal" />}
                      {s.locked ? <Tag value="Locked" tone="t-sand" /> : null}
                      {s.mustChangePassword ? <Tag value="Temporary password" tone="t-blue" /> : null}
                    </td>
                    <td>{s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : '—'}</td>
                    <td>
                      {self ? null : (
                        <div className="row" style={{ gap: 6 }}>
                          <button className="bt" type="button" disabled={reset.isPending} onClick={() => reset.mutate(s.id)}>
                            Reset password
                          </button>
                          <button
                            className={`bt${s.disabled ? '' : ' bd'}`}
                            type="button"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: s.id, disabled: !s.disabled })}
                          >
                            {s.disabled ? 'Enable' : 'Disable'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.isPending ? <p className="m small">Loading…</p> : null}
        <ErrorBox error={list.error} />
      </Card>
    </>
  );
}
