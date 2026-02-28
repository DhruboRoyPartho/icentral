import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export default function Signup() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        university_id: '', full_name: '', session: '', email: '', phone_number: '', role: 'student', password: ''
    });

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSignup = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const contentType = response.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
                ? await response.json()
                : { success: false, message: await response.text() };
            
            if (response.ok && data.success) {
                alert('Registration successful! Please login.');
                navigate('/login');
            } else {
                alert(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error(error);
            alert(`Cannot reach API (${API_BASE_URL}). Make sure the API gateway is running on port 5000.`);
        }
    };

    return (
        <div className="auth-shell">
            <div className="auth-stage auth-stage-signup">
                <aside className="panel auth-brand-panel" aria-label="Registration overview">
                    <div className="auth-brand-mark" aria-hidden="true">IC</div>
                    <div className="auth-brand-copy">
                        <p className="eyebrow">Academic Onboarding</p>
                        <h1 className="auth-brand-title">Create your ICEntral account</h1>
                        <p className="auth-brand-description">
                            Set up your profile to participate in department communication and opportunity sharing.
                        </p>
                    </div>

                    <div className="auth-brand-divider" aria-hidden="true" />

                    <ul className="auth-quick-points" aria-label="Registration guidance">
                        <li>Use your university email for verification and updates</li>
                        <li>Select the correct role to get relevant permissions</li>
                        <li>Profile details can support moderation and collaboration</li>
                    </ul>
                </aside>

                <section className="panel auth-form-panel" aria-labelledby="signup-title">
                    <div className="auth-form-head">
                        <p className="eyebrow">Registration</p>
                        <h2 id="signup-title">Create your account</h2>
                        <p className="auth-subtitle">Fill in your academic profile details to join the portal.</p>
                    </div>

                    <form onSubmit={handleSignup} className="stacked-form auth-form">
                        <div className="field-row two-col">
                            <label>
                                <span>University ID</span>
                                <input
                                    name="university_id"
                                    placeholder="e.g., 202012345"
                                    onChange={handleChange}
                                    required
                                />
                            </label>
                            <label>
                                <span>Role</span>
                                <select name="role" onChange={handleChange} defaultValue="student">
                                    <option value="student">Student</option>
                                    <option value="alumni">Alumni</option>
                                    <option value="faculty">Faculty</option>
                                </select>
                            </label>
                        </div>

                        <label>
                            <span>Full Name</span>
                            <input name="full_name" placeholder="Your full name" autoComplete="name" onChange={handleChange} required />
                        </label>

                        <div className="field-row two-col">
                            <label>
                                <span>Academic Session</span>
                                <input
                                    name="session"
                                    placeholder="e.g., 2020-2021"
                                    onChange={handleChange}
                                />
                            </label>
                            <label>
                                <span>Phone Number</span>
                                <input
                                    name="phone_number"
                                    placeholder="+8801XXXXXXXXX"
                                    autoComplete="tel"
                                    onChange={handleChange}
                                />
                            </label>
                        </div>

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
                                placeholder="Create a secure password"
                                autoComplete="new-password"
                                onChange={handleChange}
                                required
                            />
                        </label>

                        <button type="submit" className="btn btn-primary-solid auth-submit-btn">Create Account</button>
                    </form>

                    <p className="auth-link auth-link-themed">
                        Already have an account? <Link to="/login">Sign in</Link>
                    </p>
                </section>
            </div>
        </div>
    );
}
