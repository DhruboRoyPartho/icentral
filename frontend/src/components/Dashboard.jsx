import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
    const navigate = useNavigate();
    const { user: sessionUser, isAuthenticated, clearAuthSession } = useAuth();
    const [user, setUser] = useState(sessionUser);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login', { replace: true });
            return;
        }
        setUser(sessionUser || null);
    }, [isAuthenticated, navigate, sessionUser]);

    const handleLogout = () => {
        clearAuthSession();
        navigate('/login');
    };

    if (!user) {
        return (
            <div className="dashboard-page">
                <section className="panel">
                    <p className="eyebrow">Dashboard</p>
                    <h2>Loading profile...</h2>
                    <p className="subtitle auth-subtitle">Preparing your session data.</p>
                </section>
            </div>
        );
    }

    const roleLabel = String(user.role || 'member');
    const displayName = user.full_name || user.name || 'User';
    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'U';

    return (
        <div className="dashboard-page">
            <section className="panel dashboard-hero-panel">
                <div className="dashboard-hero-copy">
                    <p className="eyebrow">Account Overview</p>
                    <h2>Welcome, {displayName}</h2>
                    <p className="hero-subtext">
                        Your account is connected and ready. Use the feed to publish updates, browse sections, and manage community posts.
                    </p>

                    <div className="dashboard-action-row">
                        <button type="button" className="btn btn-primary-solid" onClick={() => navigate('/home')}>
                            Go to Feed
                        </button>
                        <button type="button" className="btn btn-soft" onClick={() => navigate('/events')}>
                            Browse Events
                        </button>
                        <button type="button" className="btn btn-danger-soft" onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </div>

                <div className="dashboard-identity-card">
                    <div className="dashboard-avatar" aria-hidden="true">{initials}</div>
                    <div>
                        <p className="eyebrow">Signed In As</p>
                        <h3>{displayName}</h3>
                        <p className="dashboard-role">{roleLabel}</p>
                    </div>
                    <div className="dashboard-pill-stack">
                        <span className="pill tone-ok">Active session</span>
                        <span className="pill">{user.email}</span>
                    </div>
                </div>
            </section>

            <div className="dashboard-card-grid">
                <section className="panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">Profile</p>
                            <h3>Account Details</h3>
                        </div>
                    </div>
                    <div className="session-card dashboard-detail-list">
                        <p>
                            <span>Role</span>
                            <strong style={{ textTransform: 'capitalize' }}>{roleLabel}</strong>
                        </p>
                        <p>
                            <span>Email</span>
                            <strong>{user.email || 'Not provided'}</strong>
                        </p>
                        <p>
                            <span>Name</span>
                            <strong>{displayName}</strong>
                        </p>
                    </div>
                </section>

                <section className="panel">
                    <div className="panel-header">
                        <div>
                            <p className="eyebrow">Workspace</p>
                            <h3>Quick Summary</h3>
                        </div>
                    </div>
                    <div className="hero-stats dashboard-mini-stats">
                        <div className="stat-tile">
                            <span>Status</span>
                            <strong>Ready</strong>
                        </div>
                        <div className="stat-tile">
                            <span>Access</span>
                            <strong>{roleLabel === 'admin' || roleLabel === 'faculty' ? 'Moderator' : 'Standard'}</strong>
                        </div>
                    </div>
                    <p className="muted-line">
                        The main dashboard experience now lives in the feed shell. This page is styled to match and can be reused for account-centric views.
                    </p>
                </section>
            </div>
        </div>
    );
}





// import { useEffect, useState } from 'react';
// import { useNavigate } from 'react-router-dom';

// export default function Dashboard() {
//     const navigate = useNavigate();
//     const [user, setUser] = useState(null);

//     useEffect(() => {
//         // Check if the user is logged in by looking for the token
//         const token = localStorage.getItem('token');
//         const userData = localStorage.getItem('user');

//         if (!token || !userData) {
//             // Kick them out if not authenticated
//             navigate('/login'); 
//         } else {
//             setUser(JSON.parse(userData));
//         }
//     }, [navigate]);

//     const handleLogout = () => {
//         // Clear the data and send them to login
//         localStorage.removeItem('token');
//         localStorage.removeItem('user');
//         navigate('/login');
//     };

//     if (!user) return <p>Loading...</p>;

//     return (
//         <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
//             <h1>Department Portal Dashboard</h1>
//             <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
//                 <h3>Welcome, {user.full_name}!</h3>
//                 <p><strong>Role:</strong> {user.role.toUpperCase()}</p>
//                 <p><strong>Email:</strong> {user.email}</p>
//             </div>
//             <button 
//                 onClick={handleLogout} 
//                 style={{ marginTop: '20px', padding: '10px 20px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
//                 Logout
//             </button>
//         </div>
//     );
// }
