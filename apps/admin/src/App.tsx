import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCan, type AdminMeDto, type AdminPermission } from '@wasla/shared';
import { useEffect, type ReactElement } from 'react';
import { adminApi, setSignedOutHandler } from './api';
import { Audit } from './pages/Audit';
import { ChangePassword } from './pages/ChangePassword';
import { Staff } from './pages/Staff';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { ReportDetail, ReportsList } from './pages/Reports';
import { RideDetail, RidesList } from './pages/Rides';
import { UserDetail, UsersList } from './pages/Users';
import { ErrorBox, Icon, Logo, titleCase, useRoute } from './ui';

const NAV: { path: string; label: string; icon: Parameters<typeof Icon>[0]['name']; perm: AdminPermission }[] = [
  { path: '', label: 'Overview', icon: 'grid', perm: 'viewOverview' },
  { path: 'users', label: 'Users', icon: 'user', perm: 'viewUsers' },
  { path: 'rides', label: 'Rides', icon: 'route', perm: 'viewRides' },
  { path: 'reports', label: 'Complaints & reports', icon: 'flag', perm: 'viewReports' },
  { path: 'audit', label: 'Audit log', icon: 'list', perm: 'viewAudit' },
  { path: 'staff', label: 'Staff', icon: 'user', perm: 'manageStaff' },
];

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: adminApi.me, retry: false, staleTime: Infinity });
  const route = useRoute();

  useEffect(() => {
    setSignedOutHandler(() => qc.setQueryData(['me'], null));
  }, [qc]);

  if (me.isPending) return <p className="m" style={{ padding: 24 }}>Loading…</p>;
  if (!me.data) return <Login onSignedIn={(m) => qc.setQueryData(['me'], m)} />;
  const admin: AdminMeDto = me.data;
  const setMe = (m: AdminMeDto) => qc.setQueryData(['me'], m);

  // A temporary password has to be replaced before anything else (the API enforces this too).
  if (admin.mustChangePassword) return <ChangePassword me={admin} forced onChanged={setMe} />;

  const signOut = async () => {
    try {
      await adminApi.logout();
    } finally {
      qc.clear();
      qc.setQueryData(['me'], null);
    }
  };

  const [section = '', id] = route;
  const allowed = NAV.find((n) => n.path === section);
  const permitted = !allowed || adminCan(admin.role, allowed.perm);

  let page: ReactElement;
  if (!permitted) page = <ErrorBox error={new Error("Your role can't open this section.")} />;
  else if (section === 'users') page = id ? <UserDetail id={id} me={admin} /> : <UsersList />;
  else if (section === 'rides') page = id ? <RideDetail id={id} me={admin} /> : <RidesList />;
  else if (section === 'reports') page = id ? <ReportDetail id={id} me={admin} /> : <ReportsList />;
  else if (section === 'audit') page = <Audit />;
  else if (section === 'staff') page = <Staff me={admin} />;
  else if (section === 'password') page = <ChangePassword me={admin} forced={false} onChanged={setMe} />;
  else page = <Overview me={admin} />;

  return (
    <div className="layout">
      <aside className="side">
        <div className="brand">
          <Logo />
          Wasla Ops
        </div>
        <nav className="nav" aria-label="Sections">
          {NAV.filter((n) => adminCan(admin.role, n.perm)).map((n) => (
            <a key={n.path} href={`#/${n.path}`} className={section === n.path ? 'on' : undefined} aria-current={section === n.path ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="who">
          <span>
            {admin.name}
            <br />
            <span className="small">{titleCase(admin.role)}</span>
          </span>
          <a href="#/password" className="small" style={{ color: 'var(--rail)' }}>
            Change password
          </a>
          <button className="bt" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{page}</main>
    </div>
  );
}
