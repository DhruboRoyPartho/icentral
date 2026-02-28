import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

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
                <aside className="panel auth-brand-panel" aria-label="Platform overview">
                    <div className="auth-brand-mark" aria-hidden="true">IC</div>
                    <div className="auth-brand-copy">
                        <p className="eyebrow">Department Community Platform</p>
                        <h1 className="auth-brand-title">ICEntral</h1>
                        <p className="auth-brand-description">
                            Professional communication space for academic notices, opportunities, and department updates.
                        </p>
                    </div>

                    <div className="auth-brand-divider" aria-hidden="true" />

                    <ul className="auth-quick-points" aria-label="Platform highlights">
                        <li>Official departmental announcements in one place</li>
                        <li>Role-based access for students, alumni, and faculty</li>
                        <li>Centralized timeline for events, jobs, and collaboration</li>
                    </ul>
                </aside>

                <section className="panel auth-form-panel" aria-labelledby="login-title">
                    <div className="auth-form-head">
                        <p className="eyebrow">Authentication</p>
                        <h2 id="login-title">Sign in to your account</h2>
                        <p className="auth-subtitle">Use your academic email and password to continue.</p>
                    </div>

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
                        New to ICEntral? <Link to="/signup">Create an account</Link>
                    </p>
                </section>
            </div>
        </div>
    );
}
