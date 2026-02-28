import { useEffect, useMemo, useState } from 'react';
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

  const jobDetails = useMemo(() => {
    return jobPost ? getJobDetailsFromPost(jobPost) : null;
  }, [jobPost]);

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
    <div className="moderation-page job-applications-page">
      <section className="panel job-portal-overview-panel">
        <div className="job-portal-overview-head">
          <div>
            <p className="eyebrow">Recruitment Inbox</p>
            <h2>Candidate Applications</h2>
            <p>Review applications, evaluate fit, and contact promising candidates efficiently.</p>
          </div>
          <div className="job-overview-stats">
            <div className="job-overview-stat-card">
              <span>Total applications</span>
              <strong>{applications.length}</strong>
            </div>
            <div className="job-overview-stat-card">
              <span>Latest received</span>
              <strong>{applications[0]?.createdAt ? formatDate(applications[0].createdAt).split(',')[0] : 'N/A'}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="job-applications-layout">
        <section className="panel feed-panel job-applications-main">
          <div className="panel-header feed-header">
            <div>
              <p className="eyebrow">Applications</p>
              <h3>{jobDetails?.jobTitle || 'Job Post'}</h3>
            </div>
            <div className="header-actions">
              <span className="pill">{loading ? 'Loading...' : `${applications.length} candidate(s)`}</span>
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
              <p>When students apply, their profiles and CV files will appear here.</p>
            </div>
          ) : (
            <div className="feed-grid job-applicant-grid">
              {applications.map((application, index) => (
                <article className="feed-card applicant-profile-card" key={application.id} style={{ '--card-index': index }}>
                  <header className="applicant-profile-head">
                    <div>
                      <p className="applicant-kicker">Applicant</p>
                      <h4>{application.applicantName || 'Unknown applicant'}</h4>
                    </div>
                    <span className="pill">{formatDate(application.createdAt)}</span>
                  </header>

                  <div className="applicant-meta-grid">
                    <p><strong>Student ID</strong><span>{application.studentId || 'N/A'}</span></p>
                    <p><strong>Current Year</strong><span>{application.currentYear || 'N/A'}</span></p>
                    <p><strong>Contact</strong><span>{application.contactInformation || 'N/A'}</span></p>
                  </div>

                  <div className="applicant-summary-block">
                    <h5>Candidate Statement</h5>
                    <p>{application.description || 'No description provided.'}</p>
                  </div>

                  <div className="feed-card-actions applicant-actions">
                    {application.cvDataUrl ? (
                      <a
                        href={application.cvDataUrl}
                        download={application.cvFileName || 'cv'}
                        className="btn btn-primary-solid"
                      >
                        Download CV ({formatCvSize(application.cvFileSize)})
                      </a>
                    ) : (
                      <span className="pill">CV not available</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="panel job-applications-side">
          <div className="job-apply-post-summary">
            <p className="eyebrow">Position</p>
            <h3>{jobDetails?.jobTitle || 'Job Post'}</h3>
            <p><strong>Company:</strong> {jobDetails?.companyName || 'N/A'}</p>
            <p><strong>Salary:</strong> {jobDetails?.salaryRange || 'N/A'}</p>
          </div>

          <div className="job-apply-note-block">
            <h4>Review checklist</h4>
            <p>Prioritize candidates with clear motivation, relevant coursework or projects, and complete contact details.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
