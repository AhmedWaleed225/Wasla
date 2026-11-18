import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCan, type AdminMeDto } from '@wasla/shared';
import { useState } from 'react';
import { adminApi } from '../api';
import { Card, ErrorBox, Pager, ReasonAction, SearchBox, Tag, fmtDate, fmtDateTime, go, titleCase } from '../ui';

export function UsersList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['users', q, status, page], queryFn: () => adminApi.users({ q, status, page }) });

  return (
    <>
      <div className="hd">
        <h1 className="title">Users</h1>
        <div className="row">
          <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Name or phone digits" />
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>
      <Card>
        <ErrorBox error={list.error} />
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Roles</th>
                <th>Rating</th>
                <th>Trips</th>
                <th>Open reports</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((u) => (
                <tr key={u.id} className="click" onClick={() => go(`/users/${u.id}`)}>
                  <td><b>{u.displayName}</b></td>
                  <td dir="ltr">{u.phone}</td>
                  <td>{u.roles.map(titleCase).join(' + ')}</td>
                  <td>{u.ratingAverage !== null ? `${u.ratingAverage} (${u.ratingCount})` : u.ratingCount ? `— (${u.ratingCount})` : '—'}</td>
                  <td>{u.ridesCompleted}</td>
                  <td>{u.openReportsAgainst > 0 ? <Tag value={String(u.openReportsAgainst)} tone="t-red" /> : '0'}</td>
                  <td><Tag value={u.status} /></td>
                  <td>{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.isPending ? <p className="m small">Loading…</p> : null}
        {list.data ? <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}
      </Card>
    </>
  );
}

export function UserDetail({ id, me }: { id: string; me: AdminMeDto }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => adminApi.user(id) });
  const onDone = (u: Awaited<ReturnType<typeof adminApi.user>>) => {
    qc.setQueryData(['user', id], u);
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
  const suspend = useMutation({ mutationFn: (reason: string) => adminApi.suspend(id, reason), onSuccess: onDone });
  const reinstate = useMutation({ mutationFn: (reason: string) => adminApi.reinstate(id, reason), onSuccess: onDone });

  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <p className="m">Loading…</p>;
  const u = q.data;
  const canSuspend = adminCan(me.role, 'suspendUsers');

  return (
    <>
      <div className="hd">
        <div>
          <a href="#/users" className="small">← Users</a>
          <h1 className="title">{u.fullName ?? u.displayName}</h1>
          <p className="m small" dir="ltr" style={{ textAlign: 'left' }}>{u.phone}</p>
        </div>
        <div className="row">
          <Tag value={u.status} />
          {canSuspend && u.status === 'ACTIVE' ? <ReasonAction label="Suspend" danger busy={suspend.isPending} onConfirm={(r) => suspend.mutate(r)} /> : null}
          {canSuspend && u.status === 'SUSPENDED' ? <ReasonAction label="Reinstate" busy={reinstate.isPending} onConfirm={(r) => reinstate.mutate(r)} /> : null}
        </div>
      </div>
      <ErrorBox error={suspend.error ?? reinstate.error} />
      {u.status === 'SUSPENDED' && u.suspendedReason ? <div className="err">Suspended: {u.suspendedReason}</div> : null}
      {canSuspend && u.status === 'ACTIVE' ? (
        <p className="m small">Suspending signs the user out everywhere, cancels their upcoming rides (passengers are notified) and their active bookings.</p>
      ) : null}

      <div className="grid2">
        <Card title="Account">
          <dl className="dl">
            <dt>Display name</dt>
            <dd>{u.displayName}</dd>
            <dt>Roles</dt>
            <dd>{u.roles.map(titleCase).join(' + ')}</dd>
            <dt>Gender</dt>
            <dd>{u.gender ? titleCase(u.gender) : '—'}</dd>
            <dt>Rating</dt>
            <dd>{u.ratingAverage !== null ? `${u.ratingAverage} from ${u.ratingCount}` : `${u.ratingCount} rating(s), average hidden below 3`}</dd>
            <dt>Trips completed</dt>
            <dd>{u.ridesCompleted}</dd>
            <dt>Joined</dt>
            <dd>{fmtDate(u.createdAt)}</dd>
          </dl>
        </Card>

        <Card title="Cars">
          {u.vehicles.length === 0 ? <p className="m small">No cars.</p> : null}
          {u.vehicles.map((v) => (
            <p key={v.id} className="small">
              <b>{v.make} {v.model}</b> · {v.color} · {v.year} · {v.seats} seats · <bdi dir="rtl">{v.plate}</bdi>
            </p>
          ))}
        </Card>

        <Card title={`Reports against (${u.reportsAgainst.length})`}>
          <ReportMiniTable rows={u.reportsAgainst} who="reporter" />
        </Card>

        <Card title={`Reports filed (${u.reportsFiled.length})`}>
          <ReportMiniTable rows={u.reportsFiled} who="reported" />
        </Card>

        <Card title="Ratings received">
          {u.recentRatings.length === 0 ? <p className="m small">No ratings yet.</p> : null}
          <div className="stack">
            {u.recentRatings.map((r) => (
              <div key={r.id} className="small">
                <b>{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</b> from {r.raterName} · {fmtDate(r.createdAt)}
                {r.tags.length ? <span className="m"> · {r.tags.map(titleCase).join(', ')}</span> : null}
                {r.comment ? <p>“{r.comment}”</p> : null}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Recent rides (as driver)">
          {u.recentRides.length === 0 ? <p className="m small">None.</p> : null}
          <table>
            <tbody>
              {u.recentRides.map((r) => (
                <tr key={r.id} className="click" onClick={() => go(`/rides/${r.id}`)}>
                  <td>{fmtDateTime(r.departureAt)}</td>
                  <td>{r.route}</td>
                  <td><Tag value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Recent bookings (as passenger)">
          {u.recentBookings.length === 0 ? <p className="m small">None.</p> : null}
          <table>
            <tbody>
              {u.recentBookings.map((b) => (
                <tr key={b.id} className="click" onClick={() => go(`/rides/${b.rideId}`)}>
                  <td>{fmtDateTime(b.departureAt)}</td>
                  <td>{b.route}</td>
                  <td><Tag value={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function ReportMiniTable({ rows, who }: { rows: Awaited<ReturnType<typeof adminApi.user>>['reportsAgainst']; who: 'reporter' | 'reported' }) {
  if (rows.length === 0) return <p className="m small">None.</p>;
  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="click" onClick={() => go(`/reports/${r.id}`)}>
            <td><Tag value={r.reason} tone={r.urgent ? 't-red' : 't-gray'} /></td>
            <td>{who === 'reporter' ? `by ${r.reporter.displayName}` : `about ${r.reported.displayName}`}</td>
            <td><Tag value={r.status} /></td>
            <td>{fmtDate(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
