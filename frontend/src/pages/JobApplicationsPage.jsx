import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getApplicationsForPost, getJobDetailsFromPost } from '../utils/jobPortalStorage';

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

function formatCvSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function JobApplicationsPage() {
  const { postId } = useParams();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  const [jobPost, setJobPost] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const normalizedRole = String(user?.role || '').toLowerCase();
  const isAlumni = normalizedRole === 'alumni';
  const enteredFromViewApplications = Boolean(location.state?.fromViewApplications);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      if (!postId) {
        setError('Missing post id.');
        setLoading(false);
        return;
      }

      if (!enteredFromViewApplications) {
        setLoading(false);
        return;
      }

      if (!isAuthenticated) {
        setError('Sign in required.');
        setLoading(false);
        return;
      }

      try {
        const result = await apiRequest(`/posts/posts/${postId}`);
        if (!isMounted) return;

        const post = result?.data || null;
        if (!post || String(post?.type || '').toUpperCase() !== 'JOB') {
          setError('Job post not found.');
          setLoading(false);
          return;
        }

        if (!isAlumni || String(post.authorId || '') !== String(user?.id || '')) {
          setError('Only the alumni who posted this job can view applications.');
          setLoading(false);
          return;
        }

        setJobPost(post);
        const list = await getApplicationsForPost(postId);
        if (!isMounted) return;
        setApplications(list);
      } catch (fetchError) {
        if (!isMounted) return;
        setError(fetchError.message || 'Failed to load applications.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [postId, enteredFromViewApplications, isAuthenticated, isAlumni, user?.id]);

  async function refreshApplications() {
    if (!postId) return;
    try {
      const list = await getApplicationsForPost(postId);
      setApplications(list);
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to refresh applications.');
    }
  }

  if (!enteredFromViewApplications) {
    return (
      <div className="moderation-page">
        <section className="panel">
          <div className="inline-alert warn-alert">
            <p>
              This page is only accessible from the <strong>View Applications</strong> button inside the original job post.
            </p>
            <Link className="btn btn-soft" to="/job-portal">Back to Job Portal</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="moderation-page">
      <section className="panel placeholder-panel">
        <div className="placeholder-hero">
          <p className="eyebrow">Job Applications</p>
          <h2>Submitted candidates</h2>
          <p>Review all applications for your posted job.</p>
        </div>
      </section>

      <section className="panel feed-panel">
        <div className="panel-header feed-header">
          <div>
            <p className="eyebrow">Applications</p>
            <h3>{jobPost ? getJobDetailsFromPost(jobPost).jobTitle : 'Job Post'}</h3>
          </div>
          <div className="header-actions">
            <span className="pill">{loading ? 'Loading...' : `${applications.length} application(s)`}</span>
            <button type="button" className="btn btn-soft" onClick={refreshApplications} disabled={loading}>Refresh</button>
            <Link className="btn btn-soft" to="/job-portal">Back</Link>
          </div>
        </div>

        {loading ? (
          <div className="skeleton-grid" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div className="feed-card skeleton-card" key={idx} />
            ))}
          </div>
        ) : error ? (
          <div className="inline-alert" role="alert">
            <p>{error}</p>
          </div>
        ) : applications.length === 0 ? (
          <div className="empty-state">
            <h4>No applications submitted yet</h4>
            <p>When students apply, they will appear in this list.</p>
          </div>
        ) : (
          <div className="feed-grid">
            {applications.map((application, index) => (
              <article className="feed-card notification-card" key={application.id} style={{ '--card-index': index }}>
                <div className="notification-card-head">
                  <div className="notification-identity">
                    <span className="notification-icon" aria-hidden="true">CV</span>
                    <div className="notification-title-wrap">
                      <p className="notification-kicker">Applicant</p>
                      <h4 className="notification-title">{application.applicantName || 'Unknown applicant'}</h4>
                    </div>
                  </div>
                  <span className="notification-time">{formatDate(application.createdAt)}</span>
                </div>

                <div className="job-application-details">
                  <p><strong>Student ID:</strong> {application.studentId || 'N/A'}</p>
                  <p><strong>Current Year:</strong> {application.currentYear || 'N/A'}</p>
                  <p><strong>Contact:</strong> {application.contactInformation || 'N/A'}</p>
                  <p><strong>Description:</strong> {application.description || 'N/A'}</p>
                  <p>
                    <strong>CV:</strong>{' '}
                    {application.cvDataUrl ? (
                      <a
                        href={application.cvDataUrl}
                        download={application.cvFileName || 'cv'}
                        className="inline-link"
                      >
                        {application.cvFileName || 'Download CV'} ({formatCvSize(application.cvFileSize)})
                      </a>
                    ) : (
                      application.cvFileName || 'Not available'
                    )}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
