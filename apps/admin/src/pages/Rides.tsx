import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCan, type AdminMeDto } from '@wasla/shared';
import { useState } from 'react';
import { adminApi } from '../api';
import { Card, ErrorBox, Pager, ReasonAction, SearchBox, Tag, fmtDateTime, fmtMoney, go, titleCase } from '../ui';

export function RidesList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['rides', q, status, page], queryFn: () => adminApi.rides({ q, status, page }) });

  return (
    <>
      <div className="hd">
        <h1 className="title">Rides</h1>
        <div className="row">
          <SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Place name" />
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
            <option value="">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>
      <Card>
        <ErrorBox error={list.error} />
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Departure</th>
                <th>Route</th>
                <th>Driver</th>
                <th>Seats</th>
                <th>Price</th>
                <th>Mode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((r) => (
                <tr key={r.id} className="click" onClick={() => go(`/rides/${r.id}`)}>
                  <td>{fmtDateTime(r.departureAt)}</td>
                  <td>
                    {r.route}
                    {r.womenOnly ? <> <Tag value="Women only" tone="t-sand" /></> : null}
                  </td>
                  <td>{r.driver.displayName}</td>
                  <td>{r.seatsTotal - r.seatsAvailable}/{r.seatsTotal}</td>
                  <td>{fmtMoney(r.pricePerSeatPiasters)}</td>
                  <td>{titleCase(r.bookingMode)}</td>
                  <td><Tag value={r.status} /></td>
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

export function RideDetail({ id, me }: { id: string; me: AdminMeDto }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ride', id], queryFn: () => adminApi.ride(id) });
  const cancel = useMutation({
    mutationFn: (reason: string) => adminApi.cancelRide(id, reason),
    onSuccess: (r) => {
      qc.setQueryData(['ride', id], r);
      void qc.invalidateQueries({ queryKey: ['rides'] });
    },
  });

  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <p className="m">Loading…</p>;
  const r = q.data;

  return (
    <>
      <div className="hd">
        <div>
          <a href="#/rides" className="small">← Rides</a>
          <h1 className="title">{r.route}</h1>
          <p className="m small">{fmtDateTime(r.departureAt)} · {fmtMoney(r.pricePerSeatPiasters)} per seat</p>
        </div>
        <div className="row">
          <Tag value={r.status} />
          {adminCan(me.role, 'cancelRides') && r.status === 'SCHEDULED' ? (
            <ReasonAction label="Cancel ride" danger busy={cancel.isPending} onConfirm={(reason) => cancel.mutate(reason)} />
          ) : null}
        </div>
      </div>
      <ErrorBox error={cancel.error} />
      {r.cancelReason ? <div className="err">Cancelled: {r.cancelReason}</div> : null}
      <div className="grid2">
        <Card title="Ride">
          <dl className="dl">
            <dt>Driver</dt>
            <dd><a href={`#/users/${r.driver.id}`}>{r.driver.displayName}</a></dd>
            <dt>Car</dt>
            <dd>
              {r.vehicle.make} {r.vehicle.model} · {r.vehicle.color} · <bdi dir="rtl">{r.vehicle.plate}</bdi>
            </dd>
            <dt>Seats</dt>
            <dd>{r.seatsTotal - r.seatsAvailable} booked of {r.seatsTotal}</dd>
            <dt>Booking mode</dt>
            <dd>{titleCase(r.bookingMode)}{r.womenOnly ? ' · women only' : ''}</dd>
            <dt>Driver's note</dt>
            <dd>{r.notes ?? '—'}</dd>
          </dl>
        </Card>
        <Card title={`Bookings (${r.bookings.length})`}>
          {r.bookings.length === 0 ? <p className="m small">No bookings.</p> : null}
          <table>
            <tbody>
              {r.bookings.map((b) => (
                <tr key={b.id} className="click" onClick={() => go(`/users/${b.passenger.id}`)}>
                  <td>{b.passenger.displayName}</td>
                  <td>{b.seats} seat(s)</td>
                  <td>{fmtMoney(b.totalPiasters)}</td>
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
