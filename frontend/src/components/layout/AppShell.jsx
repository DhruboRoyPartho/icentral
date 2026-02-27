import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

const FEED_SECTIONS = [
  { key: 'home', label: 'Home', to: '/home', hint: 'All posts', roles: 'all' },
  { key: 'jobs', label: 'Job Portal', to: '/job-portal', hint: 'Job-tag posts', roles: 'all' },
  { key: 'events', label: 'Events', to: '/events', hint: 'Event-tag posts', roles: 'all' },
  { key: 'collaborate', label: 'Collaborate', to: '/collaborate', hint: 'Post & invite collaborators', roles: 'all' },
  { key: 'moderation', label: 'Moderation', to: '/moderation', hint: 'Admin / Faculty only', roles: ['admin', 'faculty'] },
  { key: 'newsletter', label: 'Newsletter', to: '/newsletter', hint: 'Newsletter workflow', roles: 'all' },
];

function SidebarItem({ item, canAccess }) {
  if (!canAccess) {
    return (
      <div className="feed-menu-item is-locked" aria-disabled="true">
        <div className="feed-menu-title-row">
          <span>{item.label}</span>
          <span className="mini-pill">Locked</span>
        </div>
        <small>{item.hint}</small>
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `feed-menu-item${isActive ? ' is-active' : ''}`}
      end={item.to === '/home'}
    >
      <div className="feed-menu-title-row">
        <span>{item.label}</span>
      </div>
      <small>{item.hint}</small>
    </NavLink>
  );
}

export default function AppShell() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isModerator, clearAuthSession } = useAuth();

  const profileName = user?.full_name || user?.name || 'Guest User';
  const roleLabel = user?.role ? String(user.role) : 'guest';
  const initials = profileName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'GU';

  function handleLogout() {
    clearAuthSession();
    navigate('/login');
  }

  return (
    <div className="social-shell">
      <header className="social-topbar">
        <div className="brand-block">
          <div className="brand-badge" aria-hidden="true">IC</div>
          <div>
            <p className="eyebrow">Department Community Platform</p>
            <h1>ICEntral</h1>
          </div>
        </div>

        <div className="social-topbar-actions">
          <button type="button" className="icon-btn" aria-label="Notifications">
            <span aria-hidden="true">Notifications</span>
            <span className="notif-dot" />
          </button>

          <button type="button" className="profile-btn" aria-label="Profile">
            <span className="avatar-badge" aria-hidden="true">{initials}</span>
            <span className="profile-meta">
              <strong>{profileName}</strong>
              <small>{roleLabel}</small>
            </span>
          </button>

          {isAuthenticated ? (
            <button type="button" className="btn btn-soft" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <div className="auth-inline-links">
              <NavLink to="/login" className="btn btn-soft">Login</NavLink>
              <NavLink to="/signup" className="btn btn-accent">Signup</NavLink>
            </div>
          )}
        </div>
      </header>

      <div className="social-layout">
        <main className="social-main-content">
          <Outlet />
        </main>

        <aside className="feed-sidebar" aria-label="Feed sections">
          <section className="panel sidebar-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Explore</p>
                <h3>Feed Sections</h3>
              </div>
              <span className="pill pill-ghost">Switch view</span>
            </div>

            <nav className="feed-menu-list">
              {FEED_SECTIONS.map((item) => {
                const canAccess = item.roles === 'all' || (Array.isArray(item.roles) && isModerator);
                return <SidebarItem key={item.key} item={item} canAccess={canAccess} />;
              })}
            </nav>
          </section>

          <section className="panel sidebar-panel compact-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Session</p>
                <h3>Auth State</h3>
              </div>
            </div>
            <div className="session-card">
              <p>
                <span>Status</span>
                <strong>{isAuthenticated ? 'Signed in' : 'Guest mode'}</strong>
              </p>
              <p>
                <span>Access</span>
                <strong>{isModerator ? 'Moderator' : 'Standard'}</strong>
              </p>
              <p>
                <span>User</span>
                <strong>{profileName}</strong>
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
