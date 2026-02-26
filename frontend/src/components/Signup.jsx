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
                <section className="panel auth-brand-panel">
                    <div className="auth-brand-mark" aria-hidden="true">IC</div>
                    <div className="auth-brand-copy">
                        <p className="eyebrow">Join The Network</p>
                        <h1>Create Your ICEntral Account</h1>
                        <p>
                            Register once to post, track campus updates, and collaborate with students, alumni, and faculty.
                        </p>
                    </div>

                    <div className="auth-metric-grid" aria-label="Platform benefits">
                        <div className="stat-tile">
                            <span>Feed</span>
                            <strong>Unified</strong>
                        </div>
                        <div className="stat-tile">
                            <span>Access</span>
                            <strong>Role-based</strong>
                        </div>
                        <div className="stat-tile">
                            <span>Sections</span>
                            <strong>6 routes</strong>
                        </div>
                        <div className="stat-tile">
                            <span>Mode</span>
                            <strong>Community-first</strong>
                        </div>
                    </div>
                </section>

                <section className="panel auth-form-panel auth-form-panel-wide" aria-labelledby="signup-title">
                    <div className="panel-header auth-panel-header">
                        <div>
                            <p className="eyebrow">Registration</p>
                            <h2 id="signup-title">Create Account</h2>
                        </div>
                        <span className="pill pill-ghost">New member</span>
                    </div>

                    <p className="subtitle auth-subtitle">Join the ICEntral department portal.</p>

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

                        <button type="submit" className="btn btn-accent auth-submit-btn">Create Account</button>
                    </form>

                    <p className="auth-link auth-link-themed">
                        Already have an account? <Link to="/login">Sign in</Link>
                    </p>
                </section>
            </div>
        </div>
    );
}







// import { useState } from 'react';
// import { useNavigate, Link } from 'react-router-dom';

// export default function Signup() {
//     const navigate = useNavigate();
//     const [formData, setFormData] = useState({
//         university_id: '', full_name: '', session: '', email: '', phone_number: '', role: 'student', password: ''
//     });

//     const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

//     const handleSignup = async (e) => {
//         e.preventDefault();
//         try {
//             const response = await fetch('http://localhost:5000/auth/signup', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(formData)
//             });
//             const data = await response.json();
            
//             if (data.success) {
//                 alert('Registration successful! Please login.');
//                 navigate('/login');
//             } else {
//                 alert(data.message || 'Registration failed');
//             }
//         } catch (error) {
//             console.error(error);
//             alert('Server error');
//         }
//     };

//     return (
//         <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
//             <h2>Create an Account</h2>
//             <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                 <input name="university_id" placeholder="ID Number" onChange={handleChange} required />
//                 <input name="full_name" placeholder="Full Name" onChange={handleChange} required />
//                 <input name="session" placeholder="Session (e.g., 2020-2021)" onChange={handleChange} />
//                 <input name="email" type="email" placeholder="Email" onChange={handleChange} required />
//                 <input name="phone_number" placeholder="Phone Number" onChange={handleChange} />
//                 <select name="role" onChange={handleChange}>
//                     <option value="student">Student</option>
//                     <option value="alumni">Alumni</option>
//                     <option value="faculty">Faculty</option>
//                 </select>
//                 <input name="password" type="password" placeholder="Password" onChange={handleChange} required />
//                 <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>Sign Up</button>
//             </form>
//             <p>Already have an account? <Link to="/login">Login here</Link></p>
//         </div>
//     );
// }
