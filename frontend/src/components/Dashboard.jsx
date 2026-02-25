import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            navigate('/login'); 
        } else {
            setUser(JSON.parse(userData));
        }
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    if (!user) return <p style={{textAlign: 'center', marginTop: '50px'}}>Loading...</p>;

    return (
        <div>
            {/* Top Navigation Bar */}
            <nav className="dashboard-nav">
                <h1>ICEntral</h1>
                <button onClick={handleLogout} className="btn-danger">Logout</button>
            </nav>

            {/* Main Content Area */}
            <div className="dashboard-container">
                <div className="card" style={{ maxWidth: '100%' }}>
                    <h2 style={{ textAlign: 'left', marginBottom: '20px' }}>Welcome, {user.full_name}!</h2>
                    <div style={{ display: 'grid', gap: '10px', color: 'var(--text-muted)' }}>
                        <p><strong>Role:</strong> <span style={{ textTransform: 'capitalize' }}>{user.role}</span></p>
                        <p><strong>Email:</strong> {user.email}</p>
                    </div>
                </div>
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