import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getJobDetailsFromPost } from '../utils/jobPortalStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const initialPostForm = {
  jobTitle: '',
  companyName: '',
  jobDescription: '',
  salaryRange: '',
};

const FEED_PAGE_LIMIT = 50;

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

export default function JobPortalPage() {
  const { token, isAuthenticated, user, setAuthSession } = useAuth();
  const [feedItems, setFeedItems] = useState([]);
  const [postForm, setPostForm] = useState(initialPostForm);
  const [searchInput, setSearchInput] = useState('');
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [banner, setBanner] = useState({ type: 'idle', message: '' });
  const [feedError, setFeedError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [verificationStatus, setVerificationStatus] = useState('not_submitted');
  const [loadingVerification, setLoadingVerification] = useState(false);

  const deferredSearch = useDeferredValue(searchInput);
  const activeSearch = deferredSearch.trim().toLowerCase();
  const normalizedRole = String(user?.role || '').toLowerCase();
  const isAlumni = normalizedRole === 'alumni';
  const isFacultyOrAdmin = normalizedRole === 'faculty' || normalizedRole === 'admin';
  const fallbackStatus = String(user?.alumniVerificationStatus || '').toLowerCase();
  const effectiveVerificationStatus = verificationStatus || fallbackStatus || 'not_submitted';
  const canCreateJobPost = isAuthenticated && (isFacultyOrAdmin || (isAlumni && effectiveVerificationStatus === 'approved'));

  const filteredFeedItems = useMemo(() => {
    if (!activeSearch) return feedItems;

    return feedItems.filter((post) => {
      const details = getJobDetailsFromPost(post);
      const searchable = [
        details.jobTitle,
        details.companyName,
        details.jobDescription,
        details.salaryRange,
      ].join(' ').toLowerCase();
      return searchable.includes(activeSearch);
    });
  }, [feedItems, activeSearch]);

  const uniqueCompaniesCount = useMemo(() => {
    return new Set(feedItems.map((post) => getJobDetailsFromPost(post).companyName)).size;
  }, [feedItems]);

  const myPostsCount = useMemo(() => {
    if (!user?.id) return 0;
    return feedItems.filter((post) => String(post.authorId || '') === String(user.id)).length;
  }, [feedItems, user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadMyVerificationStatus() {
      if (!isAuthenticated || !isAlumni) {
        if (!isMounted) return;
        setVerificationStatus('not_submitted');
        return;
      }

      setLoadingVerification(true);
      try {
        const result = await apiRequest('/users/alumni-verification/me');
        if (!isMounted) return;

        const status = String(result?.data?.status || 'not_submitted').toLowerCase();
        setVerificationStatus(status);

        if (token && user) {
          setAuthSession({
            token,
            user: {
              ...user,
              alumniVerificationStatus: status,
              isVerifiedAlumni: status === 'approved',
            },
          });
        }
      } catch {
        if (!isMounted) return;
        setVerificationStatus(fallbackStatus || 'not_submitted');
      } finally {
        if (isMounted) setLoadingVerification(false);
      }
    }

    loadMyVerificationStatus();
    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAlumni]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadFeed() {
      setLoadingFeed(true);
      setFeedError('');

      try {
        const params = new URLSearchParams();
        params.set('type', 'JOB');
        params.set('status', 'published');
        params.set('limit', String(FEED_PAGE_LIMIT));
        params.set('offset', '0');

        const result = await apiRequest(`/posts/feed?${params.toString()}`, {
          signal: controller.signal,
        });

        const items = Array.isArray(result.data)
          ? result.data.filter((item) => String(item?.type || '').toUpperCase() === 'JOB')
          : [];

        if (!isMounted) return;

        startTransition(() => {
          setFeedItems(items);
        });
      } catch (error) {
        if (!isMounted || error.name === 'AbortError') return;
        setFeedError(error.message);
      } finally {
        if (isMounted) setLoadingFeed(false);
      }
    }

    loadFeed();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [refreshTick]);

  function refreshFeed() {
    setRefreshTick((prev) => prev + 1);
  }

  function updatePostField(field, value) {
    setPostForm((prev) => ({ ...prev, [field]: value }));
  }

  function isPostOwner(post) {
    if (!post?.authorId || !user?.id) return false;
    return String(post.authorId) === String(user.id);
  }

  async function handleCreatePost(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to create job posts.' });
      return;
    }

    if (!canCreateJobPost) {
      setBanner({
        type: 'error',
        message: (!isAlumni && !isFacultyOrAdmin)
          ? 'Only verified alumni or faculty/admin can post in the Job Portal.'
          : effectiveVerificationStatus === 'pending'
            ? 'Your alumni verification is still pending review.'
            : 'Only verified alumni can post in the Job Portal.',
      });
      return;
    }

    const jobTitle = postForm.jobTitle.trim();
    const companyName = postForm.companyName.trim();
    const jobDescription = postForm.jobDescription.trim();
    const salaryRange = postForm.salaryRange.trim();

    if (!jobTitle || !companyName || !jobDescription || !salaryRange) {
      setBanner({ type: 'error', message: 'All job fields are required.' });
      return;
    }

    const maybeAuthorId = user?.id && /^[0-9a-fA-F-]{32,36}$/.test(String(user.id)) ? user.id : undefined;
    const refEntityId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `job-details-${Date.now()}`;

    const payload = {
      type: 'JOB',
      title: jobTitle,
      summary: jobDescription,
      status: 'published',
      ref: {
        service: 'job-details',
        entityId: refEntityId,
        metadata: {
          jobTitle,
          companyName,
          jobDescription,
          salaryRange,
        },
      },
      ...(maybeAuthorId ? { authorId: maybeAuthorId } : {}),
    };

    setSubmittingPost(true);
    try {
      await apiRequest('/posts/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setPostForm(initialPostForm);
      setBanner({ type: 'success', message: 'Job post created successfully.' });
      refreshFeed();
    } catch (error) {
      setBanner({ type: 'error', message: `Could not create job post: ${error.message}` });
    } finally {
      setSubmittingPost(false);
    }
  }

  return (
    <div className="home-feed-page job-portal-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel job-portal-overview-panel">
        <div className="job-portal-overview-head">
          <div>
            <p className="eyebrow">Job Portal</p>
            <h2>Professional Opportunities Hub</h2>
            <p>Post opportunities, review quality applicants, and maintain a trusted alumni hiring channel.</p>
          </div>
          <div className="job-overview-stats">
            <div className="job-overview-stat-card">
              <span>Open jobs</span>
              <strong>{feedItems.length}</strong>
            </div>
            <div className="job-overview-stat-card">
              <span>Companies</span>
              <strong>{uniqueCompaniesCount}</strong>
            </div>
            <div className="job-overview-stat-card">
              <span>Your posts</span>
              <strong>{myPostsCount}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="job-portal-top-grid">
        <section className="panel composer-panel job-composer-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Create</p>
              <h3>Post a Job Opportunity</h3>
            </div>
            <span className="pill pill-ghost">POST /posts/posts</span>
          </div>

          {!isAuthenticated && (
            <div className="inline-alert warn-alert">
              <p>
                Guest mode is active. You can browse jobs, but posting requires authentication.
                <Link to="/login"> Sign in</Link> or <Link to="/signup"> create an account</Link>.
              </p>
            </div>
          )}

          {isAuthenticated && !canCreateJobPost && (
            <div className="inline-alert warn-alert">
              <p>
                {!isAlumni && !isFacultyOrAdmin && 'Only verified alumni or faculty/admin can create job posts in this section.'}
                {isAlumni && loadingVerification && 'Checking your alumni verification status...'}
                {isAlumni && !loadingVerification && effectiveVerificationStatus === 'pending' && (
                  <>
                    Your alumni verification is pending. Faculty/Admin approval will unlock job posting.
                  </>
                )}
                {isAlumni && !loadingVerification && (effectiveVerificationStatus === 'not_submitted' || effectiveVerificationStatus === 'rejected') && (
                  <>
                    You need verified alumni status to post jobs.
                    {' '}
                    <Link to="/alumni-verification">Apply for verification</Link>.
                  </>
                )}
              </p>
            </div>
          )}

          <form className="stacked-form job-create-form" onSubmit={handleCreatePost}>
            <div className="job-form-block">
              <div className="job-form-block-head">
                <p className="eyebrow">Role Details</p>
                <h4>Position Basics</h4>
              </div>
              <div className="field-row two-col">
                <label>
                  <span>Job Title</span>
                  <input
                    type="text"
                    placeholder="e.g. Junior Frontend Developer"
                    value={postForm.jobTitle}
                    onChange={(e) => updatePostField('jobTitle', e.target.value)}
                    disabled={!canCreateJobPost}
                  />
                </label>
                <label>
                  <span>Company Name</span>
                  <input
                    type="text"
                    placeholder="e.g. TechNova Ltd."
                    value={postForm.companyName}
                    onChange={(e) => updatePostField('companyName', e.target.value)}
                    disabled={!canCreateJobPost}
                  />
                </label>
              </div>
              <label>
                <span>Salary Range</span>
                <input
                  type="text"
                  placeholder="e.g. $40,000 - $55,000"
                  value={postForm.salaryRange}
                  onChange={(e) => updatePostField('salaryRange', e.target.value)}
                  disabled={!canCreateJobPost}
                />
              </label>
            </div>

            <div className="job-form-block">
              <div className="job-form-block-head">
                <p className="eyebrow">Description</p>
                <h4>Role Expectations</h4>
              </div>
              <label>
                <span>Job Description</span>
                <textarea
                  rows={4}
                  placeholder="Describe responsibilities, required skills, and expectations"
                  value={postForm.jobDescription}
                  onChange={(e) => updatePostField('jobDescription', e.target.value)}
                  disabled={!canCreateJobPost}
                />
              </label>
            </div>

            <div className="job-composer-footer">
              <button className="btn btn-primary-solid" type="submit" disabled={submittingPost || !canCreateJobPost}>
                {submittingPost ? 'Posting...' : 'Post Job'}
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="panel feed-panel job-feed-panel">
        <div className="panel-header feed-header">
          <div>
            <p className="eyebrow">Explore</p>
            <h3>Open Job Listings</h3>
          </div>
          <div className="header-actions">
            <span className="pill">{loadingFeed ? 'Refreshing...' : `${filteredFeedItems.length} post(s)`}</span>
            <button className="btn btn-soft" type="button" onClick={refreshFeed}>Refresh</button>
          </div>
        </div>

        <form className="feed-filters job-feed-filters" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>Search Jobs</span>
            <input
              type="search"
              placeholder="Search by title, company, description, or salary"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
        </form>

        {feedError && (
          <div className="inline-alert" role="alert">
            <p>{feedError}</p>
          </div>
        )}

        {loadingFeed ? (
          <div className="skeleton-grid" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="feed-card skeleton-card" key={index} />
            ))}
          </div>
        ) : filteredFeedItems.length === 0 ? (
          <div className="empty-state">
            <h4>No job posts found</h4>
            <p>Create a job post above, or change your search.</p>
          </div>
        ) : (
          <div className="feed-grid job-feed-grid">
            {filteredFeedItems.map((item, index) => {
              const details = getJobDetailsFromPost(item);
              const isOwner = isPostOwner(item);
              const canViewApplications = isOwner && isAlumni;

              return (
                <article className="feed-card social-post-card job-post-card job-post-card-elevated" key={item.id} style={{ '--card-index': index }}>
                  <header className="job-card-head">
                    <div className="job-card-title-wrap">
                      <h4>{details.jobTitle}</h4>
                      <p>{details.companyName}</p>
                    </div>
                    <span className="pill">{formatDate(item.createdAt)}</span>
                  </header>

                  <div className="job-card-meta-row">
                    <span className="pill">Salary: {details.salaryRange}</span>
                    {isOwner && <span className="pill tone-ok">Your post</span>}
                  </div>

                  <p className="job-card-description">{details.jobDescription}</p>

                  <footer className="feed-card-actions social-actions job-card-actions">
                    {!isOwner && (
                      isAuthenticated ? (
                        <Link
                          className="btn btn-primary-solid"
                          to={`/job-portal/${item.id}/apply`}
                          state={{
                            fromJobPortal: true,
                            postId: item.id,
                            jobTitle: details.jobTitle,
                            companyName: details.companyName,
                          }}
                        >
                          Apply Now
                        </Link>
                      ) : (
                        <Link className="btn btn-soft" to="/login">Sign in to Apply</Link>
                      )
                    )}

                    {canViewApplications && (
                      <Link
                        className="btn btn-soft"
                        to={`/job-portal/${item.id}/applications`}
                        state={{ fromViewApplications: true, postId: item.id }}
                      >
                        View Applications
                      </Link>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
