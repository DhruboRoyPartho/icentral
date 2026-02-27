import { useEffect, useState } from 'react';
import { AuthContext } from './AuthContextValue';

function safeParseUser(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStoredSession() {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  return {
    token: localStorage.getItem('token'),
    user: safeParseUser(localStorage.getItem('user')),
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);

  useEffect(() => {
    function handleStorageChange() {
      setSession(readStoredSession());
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  function setAuthSession({ token, user }) {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }

    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }

    setSession({ token: token || null, user: user || null });
  }

  function clearAuthSession() {
    setAuthSession({ token: null, user: null });
  }

  const role = String(session.user?.role || '').toLowerCase();
  const value = {
    token: session.token || null,
    user: session.user || null,
    role,
    isAuthenticated: Boolean(session.token && session.user),
    isModerator: role === 'admin' || role === 'faculty',
    setAuthSession,
    clearAuthSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
