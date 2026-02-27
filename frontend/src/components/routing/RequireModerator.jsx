import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

export default function RequireModerator({ children }) {
  const location = useLocation();
  const { isAuthenticated, isModerator } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!isModerator) {
    return (
      <section className="panel placeholder-panel">
        <div className="placeholder-hero">
          <p className="eyebrow">Restricted Area</p>
          <h2>Moderation is limited to Admin and Faculty accounts</h2>
          <p>
            Your account is signed in, but it does not have access to moderation tools.
            Use a faculty/admin account to continue.
          </p>
        </div>
      </section>
    );
  }

  return children;
}
