import { useQuery } from '@tanstack/react-query';
import { adminCan, type AdminMeDto } from '@wasla/shared';
import { adminApi } from '../api';
import { Card, ErrorBox, Tag, fmtDateTime, go, titleCase } from '../ui';

export function Overview({ me }: { me: AdminMeDto }) {
  const q = useQuery({ queryKey: ['overview'], queryFn: adminApi.overview, refetchInterval: 60_000 });
  const canReports = adminCan(me.role, 'viewReports');
  const urgent = useQuery({
    queryKey: ['reports', 'urgent', 1],
    queryFn: () => adminApi.reports({ status: 'urgent', page: 1 }),
    enabled: canReports,
    refetchInterval: 60_000,
  });

  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <p className="m">Loading…</p>;
  const o = q.data;
  const max = Math.max(1, ...o.bookings.last7Days.map((d) => d.count));

  return (
    <>
      <div className="hd">
        <div>
          <h1 className="title">Overview</h1>
          <p className="m small">Live numbers from the database · times in Cairo</p>
        </div>
      </div>

      <div className="cards">
        <div className="cd">
          <p className="k">Upcoming rides</p>
          <p className="kv">{o.rides.upcoming}</p>
          <p className="m small">{o.rides.departingToday} leaving today</p>
        </div>
        <div className="cd">
          <p className="k">Bookings today</p>
          <p className="kv">{o.bookings.today}</p>
          <p className="m small">{o.rides.completedLast7Days} rides completed in 7 days</p>
        </div>
        <div className="cd">
          <p className="k">Users</p>
          <p className="kv">{o.users.total}</p>
          <p className="m small">
            {o.users.newLast7Days} new this week · {o.users.drivers} drivers
          </p>
        </div>
        <div className={`cd${o.reports.urgentOpen > 0 ? ' alert' : ''}`}>
          <p className="k" style={o.reports.urgentOpen ? { color: 'var(--red-text)' } : undefined}>Open reports</p>
          <p className="kv" style={o.reports.urgentOpen ? { color: 'var(--red)' } : undefined}>{o.reports.open}</p>
          <p className="small" style={{ color: o.reports.urgentOpen ? 'var(--red-text)' : 'var(--slate)' }}>
            {o.reports.urgentOpen} safety or harassment
          </p>
        </div>
        <div className="cd">
          <p className="k">Suspended</p>
          <p className="kv">{o.users.suspended}</p>
          <p className="m small">accounts</p>
        </div>
      </div>

      <div className="grid2">
        {canReports ? (
          <Card title="Urgent reports" right={<a href="#/reports">All reports</a>} alert={(urgent.data?.total ?? 0) > 0}>
            <ErrorBox error={urgent.error} />
            {urgent.data && urgent.data.items.length === 0 ? <p className="m small">No open safety or harassment reports.</p> : null}
            {urgent.data && urgent.data.items.length > 0 ? (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Reason</th>
                      <th>Reported</th>
                      <th>By</th>
                      <th>Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urgent.data.items.slice(0, 6).map((r) => (
                      <tr key={r.id} className="click" onClick={() => go(`/reports/${r.id}`)}>
                        <td><Tag value={r.reason} tone="t-red" /></td>
                        <td><b>{r.reported.displayName}</b></td>
                        <td>{r.reporter.displayName}</td>
                        <td>{fmtDateTime(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card title="Bookings · last 7 days" right={<span className="m small">by day booked</span>}>
          <div className="bars" role="img" aria-label={o.bookings.last7Days.map((d) => `${d.date}: ${d.count}`).join(', ')}>
            {o.bookings.last7Days.map((d) => (
              <div key={d.date} title={`${d.date}: ${d.count}`}>
                <div className="bar" style={{ height: `${(d.count / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="row small m" style={{ gap: 10, marginTop: 6 }}>
            {o.bookings.last7Days.map((d) => (
              <span key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                {new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' })} · {d.count}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Your access">
          <p className="small">
            Signed in as <b>{me.name}</b> ({titleCase(me.role)}). Buttons your role can't use are hidden; the API checks again on every request.
          </p>
        </Card>
      </div>
    </>
  );
}
