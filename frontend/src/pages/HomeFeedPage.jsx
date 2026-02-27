import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const initialPostForm = {
  type: 'ANNOUNCEMENT',
  title: '',
  summary: '',
  status: 'published',
  tagIds: [],
  pinned: false,
  expiresAt: '',
};

const initialFilters = {
  type: '',
  status: 'all',
  tag: '',
  pinnedOnly: false,
};
const FEED_PAGE_LIMIT = 10;

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
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

function statusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'published') return 'ok';
  if (normalized === 'archived') return 'muted';
  if (normalized === 'draft') return 'warn';
  return 'neutral';
}

function toLocalDateTimeInput(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function HomeFeedPage() {
  const { isAuthenticated, isModerator, user } = useAuth();
  const [feedItems, setFeedItems] = useState([]);
  const [tags, setTags] = useState([]);
  const [postForm, setPostForm] = useState(initialPostForm);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [actionBusyPostId, setActionBusyPostId] = useState(null);
  const [banner, setBanner] = useState({ type: 'idle', message: '' });
  const [feedError, setFeedError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [tagSearchInput, setTagSearchInput] = useState('');

  const deferredSearch = useDeferredValue(searchInput);
  const activeSearch = deferredSearch.trim();
  const composerAvatar = String(user?.full_name || user?.name || user?.email || 'G').trim().charAt(0).toUpperCase() || 'G';
  const composerSelectedTagIds = Array.isArray(postForm.tagIds)
    ? postForm.tagIds.map((value) => String(value)).filter(Boolean)
    : [];
  const composerSelectedTagIdSet = new Set(composerSelectedTagIds);
  const selectedComposerTags = tags.filter((tag) => composerSelectedTagIdSet.has(String(tag.id)));
  const normalizedTagQuery = tagSearchInput.trim().toLowerCase();
  const filteredTagResults = tags
    .filter((tag) => {
      if (composerSelectedTagIdSet.has(String(tag.id))) return false;
      if (!normalizedTagQuery) return true;
      const name = String(tag.name || '').toLowerCase();
      const slug = String(tag.slug || '').toLowerCase();
      return name.includes(normalizedTagQuery) || slug.includes(normalizedTagQuery);
    })
    .slice(0, 8);

  useEffect(() => {
    let isMounted = true;

    async function loadTags() {
      try {
        const result = await apiRequest('/posts/tags');
        if (!isMounted) return;
        startTransition(() => {
          setTags(Array.isArray(result.data) ? result.data : []);
        });
      } catch (error) {
        if (!isMounted) return;
        setBanner({ type: 'error', message: `Failed to load tags: ${error.message}` });
      }
    }

    loadTags();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    async function loadFeed() {
      setLoadingFeed(true);
      setFeedError('');

      const baseParams = new URLSearchParams();
      if (filters.type) baseParams.set('type', filters.type);
      if (filters.status) baseParams.set('status', filters.status);
      if (filters.status === 'all') baseParams.set('includeArchived', 'true');
      if (filters.tag) baseParams.set('tag', filters.tag);
      if (filters.pinnedOnly) baseParams.set('pinnedOnly', 'true');
      if (activeSearch) baseParams.set('search', activeSearch);

      try {
        const params = new URLSearchParams(baseParams);
        params.set('limit', String(FEED_PAGE_LIMIT));
        params.set('offset', '0');

        const result = await apiRequest(`/posts/feed?${params.toString()}`, {
          signal: controller.signal,
        });
        const items = Array.isArray(result.data) ? result.data : [];

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
  }, [filters, activeSearch, refreshTick]);

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function updatePostField(field, value) {
    setPostForm((prev) => ({ ...prev, [field]: value }));
  }

  function addTagToComposer(tagId) {
    updatePostField('tagIds', [...new Set([...composerSelectedTagIds, String(tagId)])]);
    setTagSearchInput('');
  }

  function removeTagFromComposer(tagId) {
    updatePostField('tagIds', composerSelectedTagIds.filter((id) => id !== String(tagId)));
  }

  function refreshFeed() {
    setRefreshTick((prev) => prev + 1);
  }

  async function handleCreatePost(event) {
    event.preventDefault();
    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to create posts.' });
      return;
    }

    if (!postForm.type || !postForm.summary.trim()) {
      setBanner({ type: 'error', message: 'Type and summary are required to create a post.' });
      return;
    }

    const maybeAuthorId = user?.id && /^[0-9a-fA-F-]{32,36}$/.test(String(user.id)) ? user.id : undefined;

    const payload = {
      type: postForm.type,
      title: postForm.title.trim() || null,
      summary: postForm.summary.trim(),
      status: postForm.status,
      pinned: postForm.pinned,
      tags: [...new Set(composerSelectedTagIds)],
      expiresAt: postForm.expiresAt || null,
      ...(maybeAuthorId ? { authorId: maybeAuthorId } : {}),
    };

    setSubmittingPost(true);
    try {
      await apiRequest('/posts/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setPostForm(initialPostForm);
      setTagSearchInput('');
      setBanner({ type: 'success', message: 'Post created and added to the feed.' });
      refreshFeed();
    } catch (error) {
      setBanner({ type: 'error', message: `Could not create post: ${error.message}` });
    } finally {
      setSubmittingPost(false);
    }
  }

  async function patchPost(postId, payload, successMessage) {
    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to update posts.' });
      return;
    }

    setActionBusyPostId(postId);
    try {
      await apiRequest(`/posts/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setBanner({ type: 'success', message: successMessage });
      refreshFeed();
    } catch (error) {
      setBanner({ type: 'error', message: `Post update failed: ${error.message}` });
    } finally {
      setActionBusyPostId(null);
    }
  }

  return (
    <div className="home-feed-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="home-composer-grid">
        <section className="panel composer-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Create</p>
              <h3>New Feed Post</h3>
            </div>
            <span className="pill pill-ghost">POST /posts/posts</span>
          </div>

          {!isAuthenticated && (
            <div className="inline-alert warn-alert">
              <p>
                Guest mode is active. You can browse the feed, but posting requires authentication.
                <Link to="/login"> Sign in</Link> or <Link to="/signup"> create an account</Link>.
              </p>
            </div>
          )}

          <form className="composer-horizontal-form" onSubmit={handleCreatePost}>
            <div className="composer-quick-row">
              <span className="composer-avatar-badge" aria-hidden="true">{composerAvatar}</span>

              <label className="sr-only" htmlFor="new-post-summary">Summary</label>
              <input
                id="new-post-summary"
                className="composer-summary-input"
                type="text"
                placeholder={isAuthenticated ? "What's on your mind?" : 'Sign in to write a post summary'}
                value={postForm.summary}
                onChange={(e) => updatePostField('summary', e.target.value)}
                disabled={!isAuthenticated}
              />

              <button className="btn btn-primary-solid composer-submit-btn" type="submit" disabled={submittingPost || !isAuthenticated}>
                {submittingPost ? 'Creating...' : 'Create Post'}
              </button>
            </div>

            <div className="composer-details-row">
              <label className="composer-field field-type">
                <span>Type</span>
                <select value={postForm.type} onChange={(e) => updatePostField('type', e.target.value)} disabled={!isAuthenticated}>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="JOB">Job</option>
                  <option value="EVENT">Event</option>
                  <option value="EVENT_RECAP">Event Recap</option>
                  <option value="ACHIEVEMENT">Achievement</option>
                  <option value="COLLAB">Collaboration</option>
                </select>
              </label>

              <label className="composer-field field-status">
                <span>Status</span>
                <select value={postForm.status} onChange={(e) => updatePostField('status', e.target.value)} disabled={!isAuthenticated}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label className="composer-field field-title">
                <span>Title</span>
                <input
                  type="text"
                  placeholder="Optional headline"
                  value={postForm.title}
                  onChange={(e) => updatePostField('title', e.target.value)}
                  disabled={!isAuthenticated}
                />
              </label>

              <label className="composer-field field-tags">
                <span>Tags</span>
                <div className="composer-tag-search-shell">
                  <input
                    className="composer-tag-search-input"
                    type="search"
                    placeholder={tags.length === 0 ? 'No tags available' : 'Search tags and press Enter'}
                    value={tagSearchInput}
                    onChange={(e) => setTagSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      if (!normalizedTagQuery || filteredTagResults.length === 0) return;
                      e.preventDefault();
                      addTagToComposer(filteredTagResults[0].id);
                    }}
                    disabled={!isAuthenticated || tags.length === 0}
                  />

                  {isAuthenticated && normalizedTagQuery && filteredTagResults.length > 0 && (
                    <ul className="composer-tag-results" role="listbox" aria-label="Matching tags">
                      {filteredTagResults.map((tag) => (
                        <li key={tag.id}>
                          <button type="button" onClick={() => addTagToComposer(tag.id)}>
                            <span>{tag.name}</span>
                            <small>{tag.slug}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selectedComposerTags.length > 0 && (
                  <div className="composer-selected-tags" aria-label="Selected tags">
                    {selectedComposerTags.map((tag) => (
                      <button
                        type="button"
                        className="composer-tag-chip"
                        key={tag.id}
                        onClick={() => removeTagFromComposer(tag.id)}
                        aria-label={`Remove tag ${tag.name}`}
                        title={`Remove ${tag.name}`}
                      >
                        <span>{tag.name}</span>
                        <strong aria-hidden="true">×</strong>
                      </button>
                    ))}
                  </div>
                )}

                <small className="composer-tag-hint">
                  {tags.length === 0
                    ? 'No tags available yet.'
                    : `${composerSelectedTagIds.length} tag(s) selected.`}
                </small>
              </label>

              <label className="composer-field field-expires">
                <span>Expires</span>
                <input
                  type="datetime-local"
                  value={postForm.expiresAt}
                  onChange={(e) => updatePostField('expiresAt', e.target.value)}
                  disabled={!isAuthenticated}
                />
              </label>
            </div>
          </form>
        </section>

      </section>

      <section className="panel feed-panel">
        <div className="panel-header feed-header">
          <div>
            <p className="eyebrow">Explore</p>
            <h3>Unified Feed</h3>
          </div>
          <div className="header-actions">
            <span className="pill">{loadingFeed ? 'Refreshing...' : `${feedItems.length} card(s)`}</span>
            <button className="btn btn-soft" type="button" onClick={refreshFeed}>Refresh</button>
          </div>
        </div>

        <form className="feed-filters" onSubmit={(e) => e.preventDefault()}>
          <label>
            <span>Search</span>
            <input
              type="search"
              placeholder="Search title or summary"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <label>
            <span>Type</span>
            <select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)}>
              <option value="">All</option>
              <option value="ANNOUNCEMENT">Announcement</option>
              <option value="JOB">Job</option>
              <option value="EVENT">Event</option>
              <option value="EVENT_RECAP">Event Recap</option>
              <option value="ACHIEVEMENT">Achievement</option>
              <option value="COLLAB">Collaboration</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
          <label>
            <span>Tag</span>
            <select value={filters.tag} onChange={(e) => updateFilter('tag', e.target.value)}>
              <option value="">All tags</option>
              {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          </label>
          <label className="check-row compact">
            <input
              type="checkbox"
              checked={filters.pinnedOnly}
              onChange={(e) => updateFilter('pinnedOnly', e.target.checked)}
            />
            <span>Pinned only</span>
          </label>
        </form>

        {feedError && (
          <div className="inline-alert" role="alert">
            <p>{feedError}</p>
          </div>
        )}

        {loadingFeed ? (
          <div className="skeleton-grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="feed-card skeleton-card" key={index} />
            ))}
          </div>
        ) : feedItems.length === 0 ? (
          <div className="empty-state">
            <h4>No posts match the current filters</h4>
            <p>Create a post above, or relax the filters to repopulate the feed.</p>
          </div>
        ) : (
          <div className="feed-grid">
            {feedItems.map((item, index) => (
              <article className="feed-card social-post-card" key={item.id} style={{ '--card-index': index }}>
                <div className="social-post-header">
                  <div className="post-author-chip">
                    <span className="post-avatar">{(item.type || 'P').slice(0, 1)}</span>
                    <div>
                      <strong>{item.title || `${item.type} update`}</strong>
                      <small>{formatDate(item.createdAt)}</small>
                    </div>
                  </div>

                  <div className="pill-row">
                    <span className={`pill tone-${statusTone(item.status)}`}>{item.status || 'unknown'}</span>
                    {item.pinned && <span className="pill tone-pin">Pinned</span>}
                  </div>
                </div>

                <p className="feed-summary">{item.summary || 'No summary provided.'}</p>

                {Array.isArray(item.tags) && item.tags.length > 0 && (
                  <ul className="mini-tag-row" aria-label="Post tags">
                    {item.tags.map((tag) => (
                      <li key={`${item.id}-${tag.id}`}>
                        <button type="button" className="mini-tag" onClick={() => updateFilter('tag', tag.id)}>
                          #{tag.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="post-utility-bar">
                  <span className="pill">{item.type || 'UNKNOWN'}</span>
                  {item.expiresAt && <span className="pill">Expires {formatDate(item.expiresAt)}</span>}
                  {item.authorId && <span className="pill monospace">Author {String(item.authorId).slice(0, 8)}</span>}
                </div>

                <div className="feed-card-actions social-actions">
                  {isModerator && (
                    <button
                      className="btn btn-soft"
                      type="button"
                      disabled={actionBusyPostId === item.id || !isAuthenticated}
                      onClick={() => patchPost(item.id, { pinned: !item.pinned }, item.pinned ? 'Post unpinned.' : 'Post pinned.')}
                    >
                      {item.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  <button
                    className="btn btn-soft"
                    type="button"
                    disabled={actionBusyPostId === item.id || !isAuthenticated || item.status === 'archived'}
                    onClick={() => patchPost(item.id, { expiresAt: toLocalDateTimeInput(new Date(Date.now() + 3600_000).toISOString()) }, 'Expiry updated (+1 hour).')}
                  >
                    Set +1h Expiry
                  </button>
                  <button
                    className="btn btn-danger-soft"
                    type="button"
                    disabled={actionBusyPostId === item.id || !isAuthenticated || (!isModerator && item.status === 'archived')}
                    onClick={() => patchPost(item.id, { archive: true }, 'Post archived.')}
                  >
                    Archive
                  </button>
                </div>

                {Array.isArray(item.refs) && item.refs.length > 0 && (
                  <div className="ref-box">
                    <p className="eyebrow">Linked module record</p>
                    <ul>
                      {item.refs.map((ref, refIndex) => (
                        <li key={`${item.id}-ref-${refIndex}`}>
                          <code>{ref.service}</code> / <code>{ref.entityId}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
