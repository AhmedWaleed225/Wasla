import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCan, type AdminMeDto, type ReportStatus } from '@wasla/shared';
import { useState } from 'react';
import { adminApi } from '../api';
import { Card, ErrorBox, Pager, Tag, fmtDateTime, go } from '../ui';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'urgent', label: 'Urgent (safety, harassment)' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
];

export function ReportsList() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['reports', status, page], queryFn: () => adminApi.reports({ status, page }) });

  return (
    <>
      <div className="hd">
        <h1 className="title">Complaints & reports</h1>
        <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Filter">
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <Card>
        <ErrorBox error={list.error} />
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Reason</th>
                <th>Reported</th>
                <th>Reporter</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((r) => (
                <tr key={r.id} className="click" onClick={() => go(`/reports/${r.id}`)}>
                  <td><Tag value={r.reason} tone={r.urgent ? 't-red' : 't-gray'} /></td>
                  <td>
                    <b>{r.reported.displayName}</b> {r.reported.status === 'SUSPENDED' ? <Tag value="SUSPENDED" /> : null}
                  </td>
                  <td>{r.reporter.displayName}</td>
                  <td><Tag value={r.status} /></td>
                  <td>{fmtDateTime(r.createdAt)}</td>
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

export function ReportDetail({ id, me }: { id: string; me: AdminMeDto }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => adminApi.report(id) });
  const [note, setNote] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (status: ReportStatus | undefined) => adminApi.updateReport(id, { status, adminNote: note ?? undefined }),
    onSuccess: (r) => {
      qc.setQueryData(['report', id], r);
      setNote(null);
      void qc.invalidateQueries({ queryKey: ['reports'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <p className="m">Loading…</p>;
  const r = q.data;
  const canHandle = adminCan(me.role, 'handleReports');
  const reporterId = r.reporter.id;

  return (
    <>
      <div className="hd">
        <div>
          <a href="#/reports" className="small">← Reports</a>
          <h1 className="title">
            {r.reported.displayName} · <Tag value={r.reason} tone={r.urgent ? 't-red' : 't-gray'} />
          </h1>
          <p className="m small">Opened {fmtDateTime(r.createdAt)} by {r.reporter.displayName}</p>
        </div>
        <Tag value={r.status} />
      </div>

      <div className="grid2">
        <Card title="Report">
          <dl className="dl">
            <dt>Reported user</dt>
            <dd><a href={`#/users/${r.reported.id}`}>{r.reported.displayName}</a> <Tag value={r.reported.status} /></dd>
            <dt>Reporter</dt>
            <dd><a href={`#/users/${reporterId}`}>{r.reporter.displayName}</a></dd>
            <dt>Details</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{r.details ?? '—'}</dd>
            <dt>Trip</dt>
            <dd>{r.ride ? <a href={`#/rides/${r.ride.id}`}>{r.ride.route} · {fmtDateTime(r.ride.departureAt)}</a> : '—'}</dd>
            <dt>Handled by</dt>
            <dd>{r.handledBy ?? '—'}{r.resolvedAt ? ` · closed ${fmtDateTime(r.resolvedAt)}` : ''}</dd>
          </dl>
        </Card>

        <Card title="Handling">
          {canHandle ? (
            <div className="stack">
              <label className="f">
                Internal note (not shown to users)
                <textarea rows={4} maxLength={2000} value={note ?? r.adminNote ?? ''} onChange={(e) => setNote(e.target.value)} />
              </label>
              <ErrorBox error={update.error} />
              <div className="row">
                {r.status === 'OPEN' ? <button className="bt" type="button" disabled={update.isPending} onClick={() => update.mutate('IN_REVIEW')}>Start review</button> : null}
                {r.status === 'OPEN' || r.status === 'IN_REVIEW' ? (
                  <>
                    <button className="bt bp" type="button" disabled={update.isPending} onClick={() => update.mutate('RESOLVED')}>Resolve</button>
                    <button className="bt" type="button" disabled={update.isPending} onClick={() => update.mutate('DISMISSED')}>Dismiss</button>
                  </>
                ) : (
                  <button className="bt" type="button" disabled={update.isPending} onClick={() => update.mutate('OPEN')}>Reopen</button>
                )}
                {note !== null ? <button className="bt" type="button" disabled={update.isPending} onClick={() => update.mutate(undefined)}>Save note</button> : null}
              </div>
              <p className="m small">To suspend the reported user, open their profile.</p>
            </div>
          ) : (
            <p className="small">{r.adminNote ?? 'No note.'}</p>
          )}
        </Card>

        {r.messages ? (
          <Card title={`Trip chat (${r.messages.length})`} right={<span className="m small">Viewing is recorded in the audit log</span>}>
            {r.messages.length === 0 ? <p className="m small">No messages on this booking.</p> : null}
            <div className="chat">
              {r.messages.map((m, i) => (
                <div key={i} className={`bubble${m.senderId === reporterId ? ' r' : ''}`}>
                  <span className="m small">{m.senderId === reporterId ? r.reporter.displayName : m.senderId === r.reported.id ? r.reported.displayName : 'Other'} · {fmtDateTime(m.createdAt)}</span>
                  <br />
                  {m.body}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
