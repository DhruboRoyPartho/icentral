import { startTransition, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function apiRequest(path, options = {}) {
  const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.error || data?.message || 'Request failed';
    throw new Error(message);
  }

  return data;
}

function formatDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toUpperStatus(value) {
  return String(value || 'pending').toUpperCase();
}

export default function NotificationsPage() {
  const { isAuthenticated, role } = useAuth();
  const normalizedRole = String(role || '').toLowerCase();
  const isModerator = normalizedRole === 'admin' || normalizedRole === 'faculty';
  const isAlumni = normalizedRole === 'alumni';
  const [statusFilter, setStatusFilter] = useState(isModerator ? 'pending' : 'all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const [banner, setBanner] = useState({ type: 'idle', message: '' });

  useEffect(() => {
    setStatusFilter(isModerator ? 'pending' : 'all');
  }, [isModerator]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadNotifications() {
      if (!isAuthenticated) {
        setItems([]);
        setLoading(false);
        setCanReview(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('status', statusFilter);
        params.set('limit', '30');

        const result = await apiRequest(`/users/notifications/alumni-verifications?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!isMounted) return;

        startTransition(() => {
          setItems(Array.isArray(result.data) ? result.data : []);
          setCanReview(Boolean(result?.meta?.canReview));
        });
      } catch (error) {
        if (!isMounted || error.name === 'AbortError') return;
        setBanner({ type: 'error', message: `Could not load notifications: ${error.message}` });
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadNotifications();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isAuthenticated, statusFilter, refreshTick]);

  const pageCopy = useMemo(() => {
    if (isModerator) {
      return {
        eyebrow: 'Faculty/Admin Notifications',
        title: 'Alumni Verification Applications',
        subtitle: 'Review alumni verification requests and take action.',
      };
    }

    if (isAlumni) {
      return {
        eyebrow: 'Alumni Notifications',
        title: 'Verification Updates',
        subtitle: 'Track your alumni verification outcomes and review feedback.',
      };
    }

    return {
      eyebrow: 'Notifications',
      title: 'Role-based Inbox',
      subtitle: 'Notifications are curated by account type.',
    };
  }, [isAlumni, isModerator]);

  async function reviewApplication(id, action) {
    if (!canReview) return;
    setBusyId(id);
    try {
      const reviewNote = action === 'reject'
        ? window.prompt('Optional rejection note:', '') || ''
        : '';

      await apiRequest(`/users/notifications/alumni-verifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          reviewNote: reviewNote.trim() || null,
        }),
      });
      setBanner({ type: 'success', message: `Application ${action === 'approve' ? 'approved' : 'rejected'}.` });
      setRefreshTick((prev) => prev + 1);
    } catch (error) {
      setBanner({ type: 'error', message: `Could not review application: ${error.message}` });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="moderation-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel placeholder-panel">
        <div className="placeholder-hero">
          <p className="eyebrow">{pageCopy.eyebrow}</p>
          <h2>{pageCopy.title}</h2>
          <p>{pageCopy.subtitle}</p>
        </div>
      </section>

      {!isAuthenticated && (
        <section className="panel">
          <div className="inline-alert warn-alert">
            <p>
              Please <Link to="/login">sign in</Link> to view your notifications.
            </p>
          </div>
        </section>
      )}

      {isAuthenticated && (
        <section className="panel feed-panel">
          <div className="panel-header feed-header">
            <div>
              <p className="eyebrow">Inbox</p>
              <h3>{isModerator ? 'Verification Requests' : 'Recent Notifications'}</h3>
            </div>
            <div className="header-actions">
              <span className="pill">{loading ? 'Loading...' : `${items.length} item(s)`}</span>
              <button className="btn btn-soft" type="button" onClick={() => setRefreshTick((prev) => prev + 1)}>
                Refresh
              </button>
            </div>
          </div>

          {(isModerator || isAlumni) && (
            <form className="feed-filters" onSubmit={(event) => event.preventDefault()}>
              <label>
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  {isModerator ? (
                    <>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="all">All</option>
                    </>
                  ) : (
                    <>
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </>
                  )}
                </select>
              </label>
            </form>
          )}

          {loading ? (
            <div className="skeleton-grid" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div className="feed-card skeleton-card" key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <h4>No notifications found</h4>
              <p>
                {isModerator && 'No verification applications match the current filter.'}
                {isAlumni && 'No verification updates are available yet.'}
                {!isModerator && !isAlumni && 'No notifications are configured for your account type yet.'}
              </p>
            </div>
          ) : (
            <div className="feed-grid">
              {items.map((item, index) => (
                <article className="feed-card social-post-card" key={item.id} style={{ '--card-index': index }}>
                  <div className="social-post-header">
                    <div className="post-author-chip">
                      <span className="post-avatar">{isModerator ? 'A' : 'N'}</span>
                      <div>
                        <strong>
                          {isModerator
                            ? (item.applicant?.fullName || 'Unknown applicant')
                            : 'Alumni Verification Update'}
                        </strong>
                        <small>
                          {isModerator
                            ? (item.applicant?.email || 'No email available')
                            : `Submitted ${formatDate(item.createdAt)}`}
                        </small>
                      </div>
                    </div>
                    <div className="pill-row">
                      <span className="pill">{toUpperStatus(item.status)}</span>
                    </div>
                  </div>

                  <div className="api-note">
                    {isModerator && <p><strong>Applicant ID:</strong> {item.applicantId || 'N/A'}</p>}
                    <p><strong>Student ID:</strong> {item.studentId || 'N/A'}</p>
                    <p><strong>Current Job Info:</strong> {item.currentJobInfo || 'N/A'}</p>
                    <p><strong>Submitted:</strong> {formatDate(item.createdAt)}</p>
                    {item.reviewedAt && <p><strong>Reviewed:</strong> {formatDate(item.reviewedAt)}</p>}
                    {item.reviewNote && <p><strong>Review Note:</strong> {item.reviewNote}</p>}
                  </div>

                  {isModerator && item.idCardImageDataUrl && (
                    <div className="feed-image-wrap">
                      <img src={item.idCardImageDataUrl} alt={`ID card of ${item.applicant?.fullName || 'applicant'}`} loading="lazy" />
                    </div>
                  )}

                  {canReview && (
                    <div className="feed-card-actions social-actions">
                      <button
                        className="btn btn-accent"
                        type="button"
                        disabled={busyId === item.id || item.status !== 'pending'}
                        onClick={() => reviewApplication(item.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-danger-soft"
                        type="button"
                        disabled={busyId === item.id || item.status !== 'pending'}
                        onClick={() => reviewApplication(item.id, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
