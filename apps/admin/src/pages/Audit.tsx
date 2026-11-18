import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../api';
import { Card, ErrorBox, Pager, SearchBox, Tag, fmtDateTime } from '../ui';

/** The append-only audit log. Nothing here can be edited or deleted, by design. */
export function Audit() {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['audit', q, entity, page], queryFn: () => adminApi.audit({ q, status: entity, page }) });

  return (
    <>
      <div className="hd">
        <h1 className="title">Audit log</h1>
        <div className="row">
          <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Action starts with… (e.g. admin.)" />
          <select value={entity} onChange={(e) => (setEntity(e.target.value), setPage(1))} aria-label="Entity">
            <option value="">All entities</option>
            {['user', 'ride', 'booking', 'report', 'rating', 'vehicle', 'session_family'].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
      </div>
      <Card>
        <ErrorBox error={list.error} />
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.createdAt)}</td>
                  <td>
                    <Tag value={a.actorType} tone={a.actorType === 'ADMIN' ? 't-blue' : a.actorType === 'SYSTEM' ? 't-gray' : 't-teal'} />{' '}
                    <span className="m small">{a.actorId?.slice(0, 8) ?? ''}</span>
                  </td>
                  <td><code>{a.action}</code></td>
                  <td>
                    {a.entityType === 'user' && a.entityId ? <a href={`#/users/${a.entityId}`}>user</a> : a.entityType === 'ride' && a.entityId ? <a href={`#/rides/${a.entityId}`}>ride</a> : a.entityType === 'report' && a.entityId ? <a href={`#/reports/${a.entityId}`}>report</a> : (a.entityType ?? '—')}
                  </td>
                  <td className="small m" style={{ whiteSpace: 'normal', maxWidth: 360 }}>{a.metadata ? JSON.stringify(a.metadata) : ''}</td>
                  <td className="small">{a.ip ?? ''}</td>
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
