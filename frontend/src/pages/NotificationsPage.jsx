import { useEffect, useMemo, useState } from 'react';
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

function mapAnnouncementToCard(post) {
  return {
    id: `announcement-${post.id}`,
    kind: 'announcement',
    label: 'Announcement',
    title: post.title || 'New announcement posted',
    message: post.summary || 'A new announcement is available in the feed.',
    createdAt: post.createdAt || null,
    ctaLabel: 'Open Home Feed',
    ctaTo: '/home',
  };
}

function mapVerificationToCard(item, isModerator) {
  if (isModerator) {
    return {
      id: `verification-${item.id}`,
      kind: 'verification',
      label: 'Verification',
      title: 'New approval request pending',
      message: `${item.applicant?.fullName || 'An alumni'} submitted a verification request.`,
      createdAt: item.createdAt || null,
      ctaLabel: 'Review in Moderation',
      ctaTo: '/moderation',
    };
  }

  const normalizedStatus = String(item.status || '').toLowerCase();
  if (normalizedStatus === 'approved') {
    return {
      id: `verification-${item.id}`,
      kind: 'verification',
      label: 'Verification',
      title: 'Application accepted',
      message: item.reviewNote || 'Your alumni verification has been approved.',
      createdAt: item.reviewedAt || item.updatedAt || item.createdAt || null,
      ctaLabel: 'Open Job Portal',
      ctaTo: '/job-portal',
    };
  }

  if (normalizedStatus === 'rejected') {
    return {
      id: `verification-${item.id}`,
      kind: 'verification',
      label: 'Verification',
      title: 'Application rejected',
      message: item.reviewNote || 'Your verification request was rejected. You can apply again.',
      createdAt: item.reviewedAt || item.updatedAt || item.createdAt || null,
      ctaLabel: 'Apply Again',
      ctaTo: '/alumni-verification',
    };
  }

  return {
    id: `verification-${item.id}`,
    kind: 'verification',
    label: 'Verification',
    title: 'Application pending',
    message: 'Your alumni verification request is still pending review.',
    createdAt: item.createdAt || null,
    ctaLabel: 'View Verification',
    ctaTo: '/alumni-verification',
  };
}

export default function NotificationsPage() {
  const { isAuthenticated, role } = useAuth();
  const normalizedRole = String(role || '').toLowerCase();
  const isModerator = normalizedRole === 'admin' || normalizedRole === 'faculty';
  const isAlumni = normalizedRole === 'alumni';
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [banner, setBanner] = useState({ type: 'idle', message: '' });

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadNotifications() {
      setLoading(true);
      setBanner({ type: 'idle', message: '' });

      const allCards = [];
      const errors = [];

      const announcementQuery = '/posts/feed?type=ANNOUNCEMENT&status=published&limit=12&offset=0';
      try {
        const announcementsResult = await apiRequest(announcementQuery, { signal: controller.signal });
        const announcements = Array.isArray(announcementsResult.data) ? announcementsResult.data : [];
        allCards.push(...announcements.map(mapAnnouncementToCard));
      } catch (error) {
        if (error.name !== 'AbortError') {
          errors.push(`Announcements: ${error.message}`);
        }
      }

      if (isAuthenticated && (isModerator || isAlumni)) {
        try {
          const statusParam = isModerator ? 'pending' : 'all';
          const verificationResult = await apiRequest(`/users/notifications/alumni-verifications?status=${statusParam}&limit=20`, {
            signal: controller.signal,
          });
          const items = Array.isArray(verificationResult.data) ? verificationResult.data : [];
          allCards.push(...items.map((item) => mapVerificationToCard(item, isModerator)));
        } catch (error) {
          if (error.name !== 'AbortError') {
            errors.push(`Verification: ${error.message}`);
          }
        }
      }

      if (!isMounted) return;

      const sorted = allCards
        .slice()
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });

      setCards(sorted);
      if (errors.length) {
        setBanner({ type: 'error', message: `Some notifications failed to load. ${errors.join(' | ')}` });
      }
      setLoading(false);
    }

    loadNotifications();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [isAuthenticated, isModerator, isAlumni, refreshTick]);

  const headerCopy = useMemo(() => {
    if (isModerator) {
      return {
        eyebrow: 'Notifications',
        title: 'Admin Notification Center',
        subtitle: 'You will see new approval requests and feed announcements here.',
      };
    }
    if (isAlumni) {
      return {
        eyebrow: 'Notifications',
        title: 'Alumni Notification Center',
        subtitle: 'You will see verification outcomes and feed announcements here.',
      };
    }
    return {
      eyebrow: 'Notifications',
      title: 'Notification Center',
      subtitle: 'Announcements and account-relevant updates appear here.',
    };
  }, [isAlumni, isModerator]);

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
          <p className="eyebrow">{headerCopy.eyebrow}</p>
          <h2>{headerCopy.title}</h2>
          <p>{headerCopy.subtitle}</p>
        </div>
      </section>

      {!isAuthenticated && (
        <section className="panel">
          <div className="inline-alert warn-alert">
            <p>
              You are in guest mode. <Link to="/login">Sign in</Link> to receive personal account notifications.
            </p>
          </div>
        </section>
      )}

      <section className="panel feed-panel">
        <div className="panel-header feed-header">
          <div>
            <p className="eyebrow">Feed</p>
            <h3>Recent Notifications</h3>
          </div>
          <div className="header-actions">
            <span className="pill">{loading ? 'Loading...' : `${cards.length} notification(s)`}</span>
            <button className="btn btn-soft" type="button" onClick={() => setRefreshTick((prev) => prev + 1)}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="skeleton-grid" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="feed-card skeleton-card" key={index} />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="empty-state">
            <h4>No notifications yet</h4>
            <p>New announcements and account updates will appear here.</p>
          </div>
        ) : (
          <div className="feed-grid">
            {cards.map((card, index) => (
              <article className="feed-card social-post-card" key={card.id} style={{ '--card-index': index }}>
                <div className="social-post-header">
                  <div className="post-author-chip">
                    <span className="post-avatar">{card.kind === 'announcement' ? 'A' : 'N'}</span>
                    <div>
                      <strong>{card.title}</strong>
                      <small>{formatDate(card.createdAt)}</small>
                    </div>
                  </div>
                  <div className="pill-row">
                    <span className="pill">{card.label}</span>
                  </div>
                </div>

                <p className="feed-summary">{card.message}</p>

                <div className="feed-card-actions social-actions">
                  <Link className="btn btn-soft" to={card.ctaTo}>{card.ctaLabel}</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
