import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { setAuthSession } = useAuth();
    const [credentials, setCredentials] = useState({ email: '', password: '' });

    const handleChange = (e) => setCredentials({ ...credentials, [e.target.name]: e.target.value });

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const contentType = response.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await response.json()
                : { success: false, message: await response.text() };
            
            if (response.ok && data.success) {
                setAuthSession({ token: data.token, user: data.user });
                navigate(location.state?.from || '/home'); 
            } else {
                alert(data.message || 'Invalid credentials');
            }
        } catch (error) {
            console.error(error);
            alert(`Cannot reach API (${API_BASE_URL}). Make sure the API gateway is running on port 5000.`);
        }
    };

    return (
        <div className="auth-shell">
            <div className="auth-stage">
                <section className="panel auth-brand-panel">
                    <div className="auth-brand-mark" aria-hidden="true">IC</div>
                    <div className="auth-brand-copy">
                        <p className="eyebrow">Department Community Platform</p>
                        <h1>ICEntral</h1>
                        <p>
                            A shared space for announcements, events, opportunities, and collaboration across your department.
                        </p>
                    </div>

                    <ul className="auth-feature-list" aria-label="Platform highlights">
                        <li className="auth-feature-item">
                            <span className="pill tone-ok">Unified feed</span>
                            <p>Keep up with posts, pinned updates, and community tags in one timeline.</p>
                        </li>
                        <li className="auth-feature-item">
                            <span className="pill tone-warn">Role aware</span>
                            <p>Faculty and admins get moderation access while students keep a focused feed view.</p>
                        </li>
                        <li className="auth-feature-item">
                            <span className="pill tone-pin">Fast access</span>
                            <p>Sign in to continue where you left off and manage posts from the main feed.</p>
                        </li>
                    </ul>
                </section>

                <section className="panel auth-form-panel" aria-labelledby="login-title">
                    <div className="panel-header auth-panel-header">
                        <div>
                            <p className="eyebrow">Authentication</p>
                            <h2 id="login-title">Welcome Back</h2>
                        </div>
                        <span className="pill pill-ghost">Sign in</span>
                    </div>

                    <p className="subtitle auth-subtitle">Sign in to continue to ICEntral.</p>

                    <form onSubmit={handleLogin} className="stacked-form auth-form">
                        <label>
                            <span>Email Address</span>
                            <input
                                name="email"
                                type="email"
                                placeholder="you@university.edu"
                                autoComplete="email"
                                onChange={handleChange}
                                required
                            />
                        </label>

                        <label>
                            <span>Password</span>
                            <input
                                name="password"
                                type="password"
                                placeholder="Enter your password"
                                autoComplete="current-password"
                                onChange={handleChange}
                                required
                            />
                        </label>

                        <button type="submit" className="btn btn-primary-solid auth-submit-btn">Sign In</button>
                    </form>

                    <p className="auth-link auth-link-themed">
                        Don't have an account yet? <Link to="/signup">Create one</Link>
                    </p>
                </section>
            </div>
        </div>
    );
}







// import { useState } from 'react';
// import { useNavigate, Link } from 'react-router-dom';

// export default function Login() {
//     const navigate = useNavigate();
//     const [credentials, setCredentials] = useState({ email: '', password: '' });

//     const handleChange = (e) => setCredentials({ ...credentials, [e.target.name]: e.target.value });

//     const handleLogin = async (e) => {
//         e.preventDefault();
//         try {
//             const response = await fetch('http://localhost:5000/auth/login', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(credentials)
//             });
//             const data = await response.json();
            
//             if (data.success) {
//                 // Save the token and user info to the browser
//                 localStorage.setItem('token', data.token);
//                 localStorage.setItem('user', JSON.stringify(data.user));
//                 navigate('/dashboard'); // Redirect to dashboard
//             } else {
//                 alert(data.message || 'Invalid credentials');
//             }
//         } catch (error) {
//             console.error(error);
//             alert('Server error');
//         }
//     };

//     return (
//         <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
//             <h2>Welcome Back</h2>
//             <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                 <input name="email" type="email" placeholder="Email" onChange={handleChange} required />
//                 <input name="password" type="password" placeholder="Password" onChange={handleChange} required />
//                 <button type="submit" style={{ padding: '10px', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>Login</button>
//             </form>
//             <p>Don't have an account? <Link to="/signup">Register here</Link></p>
//         </div>
//     );
// }
