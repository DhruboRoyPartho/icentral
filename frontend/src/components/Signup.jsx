import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function Signup() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        university_id: '', full_name: '', session: '', email: '', phone_number: '', role: 'student', password: ''
    });

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSignup = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('http://localhost:5000/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await response.json();
            
            if (data.success) {
                alert('Registration successful! Please login.');
                navigate('/login');
            } else {
                alert(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error(error);
            alert('Server error');
        }
    };

    return (
        <div className="auth-container">
            <div className="card">
                <h2>Create Account</h2>
                <p className="subtitle">Join the ICEntral Department Portal</p>
                
                <form onSubmit={handleSignup}>
                    <div className="form-group">
                        <input name="university_id" placeholder="University ID Number" onChange={handleChange} required />
                        <input name="full_name" placeholder="Full Name" onChange={handleChange} required />
                        <input name="session" placeholder="Academic Session (e.g., 2020-2021)" onChange={handleChange} />
                        <input name="email" type="email" placeholder="Email Address" onChange={handleChange} required />
                        <input name="phone_number" placeholder="Phone Number" onChange={handleChange} />
                        <select name="role" onChange={handleChange}>
                            <option value="student">Student</option>
                            <option value="alumni">Alumni</option>
                            <option value="faculty">Faculty</option>
                        </select>
                        <input name="password" type="password" placeholder="Secure Password" onChange={handleChange} required />
                    </div>
                    <button type="submit" className="btn-primary">Sign Up</button>
                </form>
                
                <p className="auth-link">
                    Already have an account? <Link to="/login">Sign in here</Link>
                </p>
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