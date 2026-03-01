import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

const FEED_SECTIONS = [
  { key: 'home', label: 'Home', to: '/home', hint: 'Main feed', roles: 'all', icon: 'HM' },
  { key: 'jobs', label: 'Job Portal', to: '/job-portal', hint: 'Career posts', roles: 'all', icon: 'JB' },
  { key: 'events', label: 'Events', to: '/events', hint: 'Campus events', roles: 'all', icon: 'EV' },
  { key: 'collaborate', label: 'Collaborate', to: '/collaborate', hint: 'Teams & invites', roles: 'all', icon: 'CO' },
  { key: 'notifications', label: 'Notifications', to: '/notifications', hint: 'Inbox', roles: 'all', icon: 'NT' },
  { key: 'moderation', label: 'Moderation', to: '/moderation', hint: 'Admin / Faculty', roles: ['admin', 'faculty'], icon: 'MD' },
  { key: 'newsletter', label: 'Newsletter', to: '/newsletter', hint: 'Curation flow', roles: 'all', icon: 'NW' },
];

const GROUP_CHATS = [
  { id: 'grp-1', label: 'ICE-Batch-2021', status: '3 members typing' },
  { id: 'grp-2', label: 'RU Programmers', status: '14 new updates' },
];

function SidebarItem({ item, canAccess }) {
  if (!canAccess) {
    return (
      <div className="feed-menu-item is-locked" aria-disabled="true">
        <div className="feed-menu-title-row">
          <span>{item.icon} {item.label}</span>
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
        <span>{item.icon} {item.label}</span>
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
        <div className="topbar-left">
          <div className="brand-badge" aria-hidden="true">IC</div>
          <label className="topbar-search" htmlFor="global-search">
            <span className="topbar-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M10 3a7 7 0 1 1 0 14a7 7 0 0 1 0-14zm0 2a5 5 0 1 0 .001 10.001A5 5 0 0 0 10 5zm8.707 11.293l2 2a1 1 0 0 1-1.414 1.414l-2-2a1 1 0 0 1 1.414-1.414z" />
              </svg>
            </span>
            <input id="global-search" type="search" placeholder="Search ICEntral" />
          </label>
        </div>

        <nav className="topbar-nav" aria-label="Primary">
          <NavLink to="/home" className={({ isActive }) => `topbar-nav-link${isActive ? ' is-active' : ''}`}>HOME</NavLink>
          <NavLink to="/job-portal" className={({ isActive }) => `topbar-nav-link${isActive ? ' is-active' : ''}`}>JOBS</NavLink>
          <NavLink to="/collaborate" className={({ isActive }) => `topbar-nav-link${isActive ? ' is-active' : ''}`}>COLLAB</NavLink>
          <NavLink to="/events" className={({ isActive }) => `topbar-nav-link${isActive ? ' is-active' : ''}`}>EVENTS</NavLink>
        </nav>

        <div className="social-topbar-actions topbar-right">
          <button
            type="button"
            className="topbar-circle-btn topbar-notif-btn"
            aria-label="Notifications"
            onClick={() => navigate('/notifications')}
          >
            <span className="notif-dot" />
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 3a5 5 0 0 0-5 5v2.25c0 .95-.32 1.88-.92 2.62l-.9 1.13A1.5 1.5 0 0 0 6.35 16.5h11.3a1.5 1.5 0 0 0 1.17-2.5l-.9-1.13A4.22 4.22 0 0 1 17 10.25V8a5 5 0 0 0-5-5zm0 18a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21z" />
            </svg>
          </button>

          <button type="button" className="profile-btn" aria-label="Profile">
            <span className="avatar-badge" aria-hidden="true">{initials}</span>
            <span className="profile-meta">
              <strong>{profileName}</strong>
              <small>{roleLabel}</small>
            </span>
          </button>

          {isAuthenticated ? (
            <button type="button" className="btn btn-soft logout-mini-btn" onClick={handleLogout}>
              Log out
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
        <aside className="feed-sidebar feed-sidebar-left" aria-label="Feed sections">
          <section className="panel sidebar-panel compact-panel">
            <div className="session-card">
              <p>
                <span>Signed in as</span>
                <strong>{profileName}</strong>
              </p>
              <p>
                <span>Role</span>
                <strong>{roleLabel}</strong>
              </p>
            </div>
          </section>

          <section className="panel sidebar-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Explore</p>
                <h3>Menu</h3>
              </div>
            </div>

            <nav className="feed-menu-list">
              {FEED_SECTIONS.map((item) => {
                const canAccess = item.roles === 'all' || (Array.isArray(item.roles) && isModerator);
                return <SidebarItem key={item.key} item={item} canAccess={canAccess} />;
              })}
            </nav>
          </section>
        </aside>

        <main className="social-main-content">
          <Outlet />
        </main>

        <aside className="feed-sidebar feed-sidebar-right" aria-label="Social sidebar">
          <section className="panel sidebar-panel compact-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Group chats</p>
                <h3>Recent</h3>
              </div>
            </div>

            <div className="contact-list">
              {GROUP_CHATS.map((group) => (
                <div className="contact-item" key={group.id}>
                  <span className="contact-avatar contact-avatar-group" aria-hidden="true">#</span>
                  <div>
                    <strong>{group.label}</strong>
                    <small>{group.status}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
