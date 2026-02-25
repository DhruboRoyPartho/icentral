import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
    const navigate = useNavigate();
    const [credentials, setCredentials] = useState({ email: '', password: '' });

    const handleChange = (e) => setCredentials({ ...credentials, [e.target.name]: e.target.value });

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('http://localhost:5000/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const data = await response.json();
            
            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                navigate('/dashboard'); 
            } else {
                alert(data.message || 'Invalid credentials');
            }
        } catch (error) {
            console.error(error);
            alert('Server error');
        }
    };

    return (
        <div className="auth-container">
            <div className="card">
                <h2>Welcome Back</h2>
                <p className="subtitle">Sign in to continue to ICEntral</p>
                
                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <input name="email" type="email" placeholder="Email Address" onChange={handleChange} required />
                        <input name="password" type="password" placeholder="Password" onChange={handleChange} required />
                    </div>
                    <button type="submit" className="btn-primary">Sign In</button>
                </form>
                
                <p className="auth-link">
                    Don't have an account yet? <Link to="/signup">Register here</Link>
                </p>
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