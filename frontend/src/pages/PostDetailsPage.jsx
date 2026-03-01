import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getJobDetailsFromPost } from '../utils/jobPortalStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const COMMENT_PAGE_LIMIT = 200;

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

function formatRelativeTime(value) {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No timestamp';

  const diffMs = Date.now() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) return 'Just now';
  if (diffMs < hourMs) return `${Math.max(1, Math.floor(diffMs / minuteMs))}m ago`;
  if (diffMs < dayMs) return `${Math.max(1, Math.floor(diffMs / hourMs))}h ago`;
  if (diffMs < 7 * dayMs) return `${Math.max(1, Math.floor(diffMs / dayMs))}d ago`;

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function toTitleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function getBaseVoteScore(post) {
  const value = Number(
    post?.score
    ?? post?.voteScore
    ?? post?.upvotes
    ?? post?.upvoteCount
    ?? post?.votes,
  );
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function getCommentCount(post) {
  if (Array.isArray(post?.comments)) return post.comments.length;
  const value = Number(
    post?.commentCount
    ?? post?.commentsCount
    ?? post?.totalComments,
  );
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function getDisplayName(entity) {
  return entity?.fullName
    || entity?.full_name
    || entity?.name
    || entity?.username
    || entity?.email
    || '';
}

function getPostAuthorLabel(post, currentUser = null) {
  const resolved = getDisplayName(post?.author)
    || post?.authorName
    || post?.author_name;
  if (resolved) return String(resolved);
  if (post?.authorId && currentUser?.id && String(post.authorId) === String(currentUser.id)) {
    const ownName = getDisplayName(currentUser);
    if (ownName) return String(ownName);
  }
  if (post?.authorId) return `User ${String(post.authorId).slice(0, 8)}`;
  return 'Community member';
}

function getCommentAuthorLabel(comment, currentUser = null) {
  const resolved = getDisplayName(comment?.author)
    || comment?.authorName
    || comment?.author_name;
  if (resolved) return String(resolved);
  if (comment?.authorId && currentUser?.id && String(comment.authorId) === String(currentUser.id)) {
    const ownName = getDisplayName(currentUser);
    if (ownName) return String(ownName);
  }
  if (comment?.authorId) return `User ${String(comment.authorId).slice(0, 8)}`;
  return 'Community member';
}

export default function PostDetailsPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loadingPost, setLoadingPost] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [pageError, setPageError] = useState('');
  const [banner, setBanner] = useState({ type: 'idle', message: '' });
  const [actionBusy, setActionBusy] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [sharingLink, setSharingLink] = useState(false);

  const normalizedRole = String(user?.role || '').toLowerCase();
  const isJobPost = String(post?.type || '').toUpperCase() === 'JOB';
  const jobDetails = isJobPost ? getJobDetailsFromPost(post) : null;
  const isOwner = post?.authorId && user?.id && String(post.authorId) === String(user.id);
  const canViewApplications = isJobPost && isOwner && normalizedRole === 'alumni';

  const imageRef = useMemo(() => {
    if (!Array.isArray(post?.refs)) return null;
    return post.refs.find((ref) => ref?.service === 'image-upload' && ref?.metadata?.imageDataUrl) || null;
  }, [post]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadPostAndComments() {
      if (!postId) {
        setLoadingPost(false);
        setLoadingComments(false);
        setPageError('Missing post id.');
        return;
      }

      setLoadingPost(true);
      setLoadingComments(true);
      setPageError('');

      try {
        const postResult = await apiRequest(`/posts/posts/${postId}`, {
          signal: controller.signal,
        });
        if (!isMounted) return;

        const loadedPost = postResult?.data || null;
        if (!loadedPost) {
          setPageError('Post not found.');
          setPost(null);
          setComments([]);
          return;
        }

        setPost(loadedPost);

        try {
          const commentsResult = await apiRequest(`/posts/posts/${postId}/comments?limit=${COMMENT_PAGE_LIMIT}&offset=0`, {
            signal: controller.signal,
          });
          if (!isMounted) return;
          const list = Array.isArray(commentsResult?.data) ? commentsResult.data : [];
          const total = Number(commentsResult?.pagination?.total);
          setComments(list);
          if (Number.isFinite(total)) {
            setPost((prev) => (prev ? {
              ...prev,
              commentCount: Math.max(0, Math.trunc(total)),
              commentsCount: Math.max(0, Math.trunc(total)),
            } : prev));
          }
        } catch (error) {
          if (!isMounted || error.name === 'AbortError') return;
          setComments([]);
          setBanner({ type: 'error', message: `Could not load comments: ${error.message}` });
        }
      } catch (error) {
        if (!isMounted || error.name === 'AbortError') return;
        setPageError(error.message || 'Could not load post details.');
      } finally {
        if (isMounted) {
          setLoadingPost(false);
          setLoadingComments(false);
        }
      }
    }

    loadPostAndComments();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [postId]);

  async function handleVote(direction) {
    if (!post || !post.id) return;
    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to vote on posts.' });
      return;
    }

    const currentVote = post?.userVote === 'up' ? 'up' : post?.userVote === 'down' ? 'down' : null;
    const nextVote = currentVote === direction ? 'none' : direction;
    const beforeScore = getBaseVoteScore(post);
    const beforeUpvoteCount = Number.isFinite(Number(post?.upvoteCount)) ? Math.max(0, Math.trunc(Number(post.upvoteCount))) : 0;
    const beforeDownvoteCount = Number.isFinite(Number(post?.downvoteCount)) ? Math.max(0, Math.trunc(Number(post.downvoteCount))) : 0;

    const currentNumeric = currentVote === 'up' ? 1 : currentVote === 'down' ? -1 : 0;
    const nextNumeric = nextVote === 'up' ? 1 : nextVote === 'down' ? -1 : 0;
    const delta = nextNumeric - currentNumeric;

    setPost((prev) => (prev ? {
      ...prev,
      score: beforeScore + delta,
      voteScore: beforeScore + delta,
      upvoteCount: beforeUpvoteCount + (nextNumeric === 1 ? 1 : 0) - (currentNumeric === 1 ? 1 : 0),
      downvoteCount: beforeDownvoteCount + (nextNumeric === -1 ? 1 : 0) - (currentNumeric === -1 ? 1 : 0),
      userVote: nextNumeric === 1 ? 'up' : nextNumeric === -1 ? 'down' : null,
    } : prev));

    setActionBusy(true);
    try {
      const result = await apiRequest(`/posts/posts/${post.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote: nextVote }),
      });
      const payload = result?.data || {};
      setPost((prev) => (prev ? {
        ...prev,
        score: Number.isFinite(Number(payload.score)) ? Math.trunc(Number(payload.score)) : beforeScore,
        voteScore: Number.isFinite(Number(payload.voteScore)) ? Math.trunc(Number(payload.voteScore)) : beforeScore,
        upvoteCount: Number.isFinite(Number(payload.upvoteCount)) ? Math.max(0, Math.trunc(Number(payload.upvoteCount))) : beforeUpvoteCount,
        downvoteCount: Number.isFinite(Number(payload.downvoteCount)) ? Math.max(0, Math.trunc(Number(payload.downvoteCount))) : beforeDownvoteCount,
        userVote: payload.userVote === 'up' ? 'up' : payload.userVote === 'down' ? 'down' : null,
      } : prev));
    } catch (error) {
      setPost((prev) => (prev ? {
        ...prev,
        score: beforeScore,
        voteScore: beforeScore,
        upvoteCount: beforeUpvoteCount,
        downvoteCount: beforeDownvoteCount,
        userVote: currentVote,
      } : prev));
      setBanner({ type: 'error', message: `Vote failed: ${error.message}` });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();
    const content = commentDraft.trim();
    if (!content || !post?.id) return;
    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to comment on posts.' });
      return;
    }

    setActionBusy(true);
    try {
      const result = await apiRequest(`/posts/posts/${post.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      const createdComment = result?.data;
      if (createdComment) {
        setComments((prev) => [createdComment, ...prev]);
      }

      const backendCount = Number(result?.meta?.commentCount);
      if (Number.isFinite(backendCount)) {
        setPost((prev) => (prev ? {
          ...prev,
          commentCount: Math.max(0, Math.trunc(backendCount)),
          commentsCount: Math.max(0, Math.trunc(backendCount)),
        } : prev));
      } else {
        setPost((prev) => (prev ? {
          ...prev,
          commentCount: getCommentCount(prev) + 1,
          commentsCount: getCommentCount(prev) + 1,
        } : prev));
      }

      setCommentDraft('');
    } catch (error) {
      setBanner({ type: 'error', message: `Comment failed: ${error.message}` });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleShare() {
    if (!postId) return;
    setSharingLink(true);
    try {
      const link = typeof window !== 'undefined'
        ? `${window.location.origin}/posts/${postId}`
        : `/posts/${postId}`;

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }

      await navigator.clipboard.writeText(link);
      setBanner({ type: 'success', message: 'Post link copied to clipboard.' });
    } catch (error) {
      setBanner({ type: 'error', message: `Could not share post: ${error.message}` });
    } finally {
      setSharingLink(false);
    }
  }

  const postTitle = post?.title || `${toTitleCase(post?.type || 'post')} update`;
  const postSummary = post?.summary || (isJobPost ? jobDetails?.jobDescription : 'No summary provided.');
  const authorLabel = getPostAuthorLabel(post, user);
  const authorAvatar = String(authorLabel || 'U').trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className="home-feed-page post-details-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel post-details-panel">
        <div className="post-details-top-row">
          <button className="post-back-btn" type="button" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className="post-thread-meta">
            <span className="pill">{post?.type || 'POST'}</span>
            <span>{post?.createdAt ? formatRelativeTime(post.createdAt) : 'Now'}</span>
          </div>
        </div>

        {loadingPost ? (
          <p className="post-comments-hint">Loading post...</p>
        ) : pageError ? (
          <div className="inline-alert" role="alert">
            <p>{pageError}</p>
            <Link className="btn btn-soft" to="/home">Back to feed</Link>
          </div>
        ) : (
          <>
            <header className="post-detail-header">
              <div className="post-author-chip">
                <span className="post-avatar">{authorAvatar}</span>
                <div>
                  <strong>{authorLabel}</strong>
                  <small>{formatDate(post?.createdAt)}</small>
                </div>
              </div>
              {post?.status && (
                <span className="pill">{toTitleCase(post.status)}</span>
              )}
            </header>

            <h2 className="post-details-title">{postTitle}</h2>

            {isJobPost && jobDetails && (
              <div className="post-detail-job-row">
                <span className="pill">Company: {jobDetails.companyName}</span>
                <span className="pill">Salary: {jobDetails.salaryRange}</span>
              </div>
            )}

            <p className="post-details-summary">{postSummary}</p>

            {imageRef?.metadata?.imageDataUrl && (
              <div className="post-detail-image-wrap">
                <img src={imageRef.metadata.imageDataUrl} alt={postTitle} loading="lazy" />
              </div>
            )}

            <div className="feed-card-actions social-actions reddit-action-row post-detail-actions">
              <div className="reddit-vote-group" role="group" aria-label={`Voting controls for ${postTitle}`}>
                <button
                  className={`reddit-action-btn vote-btn ${post?.userVote === 'up' ? 'is-active' : ''}`}
                  type="button"
                  aria-pressed={post?.userVote === 'up'}
                  disabled={actionBusy || post?.status === 'archived'}
                  onClick={() => handleVote('up')}
                >
                  Upvote
                </button>
                <span className="reddit-vote-count" aria-live="polite">{getBaseVoteScore(post)}</span>
                <button
                  className={`reddit-action-btn vote-btn ${post?.userVote === 'down' ? 'is-active' : ''}`}
                  type="button"
                  aria-pressed={post?.userVote === 'down'}
                  disabled={actionBusy || post?.status === 'archived'}
                  onClick={() => handleVote('down')}
                >
                  Downvote
                </button>
              </div>

              <button
                className="reddit-action-btn"
                type="button"
                onClick={() => document.getElementById('post-comments-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Comments {getCommentCount(post)}
              </button>

              <button
                className="reddit-action-btn"
                type="button"
                disabled={sharingLink}
                onClick={handleShare}
              >
                {sharingLink ? 'Sharing...' : 'Share'}
              </button>

              {isJobPost && !isOwner && (
                isAuthenticated ? (
                  <Link
                    className="btn btn-primary-solid"
                    to={`/job-portal/${post.id}/apply`}
                    state={{
                      fromJobPortal: true,
                      postId: post.id,
                      jobTitle: jobDetails?.jobTitle,
                      companyName: jobDetails?.companyName,
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
                  to={`/job-portal/${post.id}/applications`}
                  state={{ fromViewApplications: true, postId: post.id }}
                >
                  View Applications
                </Link>
              )}
            </div>

            <form className="post-join-form" onSubmit={handleCommentSubmit}>
              <input
                id="post-comments-anchor"
                type="text"
                placeholder={isAuthenticated ? 'Join the conversation' : 'Sign in to join the conversation'}
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                disabled={!isAuthenticated || actionBusy}
              />
              <button
                className="btn btn-primary-solid"
                type="submit"
                disabled={!isAuthenticated || actionBusy || !commentDraft.trim()}
              >
                Comment
              </button>
            </form>

            {loadingComments ? (
              <p className="post-comments-hint">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="post-comments-hint">No comments yet. Start the discussion.</p>
            ) : (
              <ul className="post-detail-comment-list" aria-label="Post comments">
                {comments.map((comment, index) => (
                  <li
                    key={comment.id || `${comment.authorId || 'comment'}-${index}`}
                    className={`post-detail-comment-item${index === 0 ? ' is-featured' : ''}`}
                  >
                    <div className="post-comment-head">
                      <strong>{getCommentAuthorLabel(comment, user)}</strong>
                      <small>{formatDate(comment.createdAt)}</small>
                    </div>
                    <p>{comment.content || 'No comment text provided.'}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
