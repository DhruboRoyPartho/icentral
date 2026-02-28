import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const initialPostForm = {
  type: 'EVENT',
  title: '',
  summary: '',
  status: 'published',
  tagIds: [],
  pinned: false,
  expiresAt: '',
};

const postTypeOptions = [
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'JOB', label: 'Job' },
  { value: 'EVENT', label: 'Event' },
  { value: 'EVENT_RECAP', label: 'Event Recap' },
  { value: 'ACHIEVEMENT', label: 'Achievement' },
  { value: 'COLLAB', label: 'Collaboration' },
];

function canRoleCreateType(role, type) {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedType = String(type || '').toUpperCase();

  if (normalizedType === 'ANNOUNCEMENT') return normalizedRole === 'admin' || normalizedRole === 'faculty';
  if (normalizedType === 'JOB') return normalizedRole !== 'student';
  return true;
}

function getRoleTypeBlockMessage(role, type) {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedType = String(type || '').toUpperCase();
  if (normalizedType === 'ANNOUNCEMENT') {
    return normalizedRole === 'alumni'
      ? 'Alumni cannot create announcement posts.'
      : 'Students cannot create announcement posts.';
  }
  if (normalizedType === 'JOB') {
    return 'Students cannot create job posts.';
  }
  return 'You are not allowed to create this post type.';
}

const initialFilters = {
  type: '',
  status: 'published',
  tag: '',
  pinnedOnly: false,
};
const FEED_PAGE_LIMIT = 10;

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
  const imageInputRef = useRef(null);
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
  const [composerImage, setComposerImage] = useState(null);

  const deferredSearch = useDeferredValue(searchInput);
  const activeSearch = deferredSearch.trim();
  const normalizedRole = String(user?.role || '').toLowerCase();
  const allowedComposerTypeOptions = useMemo(
    () => postTypeOptions.filter((option) => canRoleCreateType(normalizedRole, option.value)),
    [normalizedRole],
  );
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
      if (filters.status === 'archived') baseParams.set('includeArchived', 'true');
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

  useEffect(() => {
    if (!allowedComposerTypeOptions.some((option) => option.value === postForm.type)) {
      const fallbackType = allowedComposerTypeOptions[0]?.value || 'EVENT';
      setPostForm((prev) => ({ ...prev, type: fallbackType }));
    }
  }, [allowedComposerTypeOptions, postForm.type]);

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function updatePostField(field, value) {
    setPostForm((prev) => ({ ...prev, [field]: value }));
  }

  function isPostOwner(post) {
    if (!post?.authorId || !user?.id) return false;
    return String(post.authorId) === String(user.id);
  }

  function canUpdatePostExpiry(post) {
    if (!isAuthenticated) return false;
    return isModerator || isPostOwner(post);
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

  function openImagePicker() {
    imageInputRef.current?.click();
  }

  function clearComposerImage() {
    setComposerImage(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function handleImageSelected(event) {
    const [file] = Array.from(event.target.files || []);
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setBanner({ type: 'error', message: 'Only image files are supported.' });
      return;
    }

    const maxBytes = 900 * 1024;
    if (file.size > maxBytes) {
      setBanner({ type: 'error', message: 'Image is too large. Please choose one under 900 KB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setBanner({ type: 'error', message: 'Could not read the selected image.' });
        return;
      }

      const entityId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `img-${Date.now()}`;

      setComposerImage({
        dataUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        entityId,
      });
    };
    reader.onerror = () => {
      setBanner({ type: 'error', message: 'Failed to load selected image.' });
    };
    reader.readAsDataURL(file);
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

    if (!canRoleCreateType(normalizedRole, postForm.type)) {
      setBanner({ type: 'error', message: getRoleTypeBlockMessage(normalizedRole, postForm.type) });
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
      ...(composerImage ? {
        ref: {
          service: 'image-upload',
          entityId: composerImage.entityId,
          metadata: {
            imageDataUrl: composerImage.dataUrl,
            fileName: composerImage.fileName,
            fileType: composerImage.fileType,
            fileSize: composerImage.fileSize,
          },
        },
      } : {}),
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
      clearComposerImage();
      setBanner({ type: 'success', message: 'Post created and added to the feed.' });
      refreshFeed();
    } catch (error) {
      setBanner({ type: 'error', message: `Could not create post: ${error.message}` });
    } finally {
      setSubmittingPost(false);
    }
  }

  async function patchPost(postId, payload, successMessage, options = {}) {
    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to update posts.' });
      return;
    }

    if (options.enforceExpiryPermission) {
      const targetPost = options.post || feedItems.find((item) => item.id === postId);
      if (!canUpdatePostExpiry(targetPost)) {
        setBanner({ type: 'error', message: 'Only moderators and the original author can update expiry.' });
        return;
      }
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

              <div className="composer-action-row">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="composer-image-input"
                  onChange={handleImageSelected}
                  disabled={!isAuthenticated}
                />
                <button
                  className="btn btn-soft composer-image-btn"
                  type="button"
                  onClick={openImagePicker}
                  disabled={!isAuthenticated}
                  aria-label="Add picture"
                  title="Add picture"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 5h4l1.2-1.8A2 2 0 0 1 10.9 2h2.2a2 2 0 0 1 1.7 1.2L16 5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm8 3.5A5.5 5.5 0 1 0 12 19a5.5 5.5 0 0 0 0-11zm0 2A3.5 3.5 0 1 1 8.5 14 3.5 3.5 0 0 1 12 10.5z" />
                  </svg>
                </button>
                <button className="btn btn-primary-solid composer-submit-btn" type="submit" disabled={submittingPost || !isAuthenticated}>
                  {submittingPost ? 'Creating...' : 'Create Post'}
                </button>
              </div>
            </div>

            {composerImage && (
              <div className="composer-image-preview">
                <img src={composerImage.dataUrl} alt={composerImage.fileName || 'Selected upload'} />
                <div className="composer-image-meta">
                  <p>{composerImage.fileName}</p>
                  <button type="button" className="btn btn-soft" onClick={clearComposerImage}>
                    Remove
                  </button>
                </div>
              </div>
            )}

            <div className="composer-details-row">
              <label className="composer-field field-type">
                <span>Type</span>
                <select value={postForm.type} onChange={(e) => updatePostField('type', e.target.value)} disabled={!isAuthenticated}>
                  {allowedComposerTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
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

                {Array.isArray(item.refs) && item.refs.length > 0 && (() => {
                  const imageRef = item.refs.find((ref) => ref?.service === 'image-upload' && ref?.metadata?.imageDataUrl);
                  if (!imageRef) return null;
                  return (
                    <div className="feed-image-wrap">
                      <img
                        src={imageRef.metadata.imageDataUrl}
                        alt={item.title || 'Post image'}
                        loading="lazy"
                      />
                    </div>
                  );
                })()}

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
                    disabled={actionBusyPostId === item.id || !isAuthenticated || item.status === 'archived' || !canUpdatePostExpiry(item)}
                    onClick={() => patchPost(
                      item.id,
                      { expiresAt: toLocalDateTimeInput(new Date(Date.now() + 3600_000).toISOString()) },
                      'Expiry updated (+1 hour).',
                      { enforceExpiryPermission: true, post: item },
                    )}
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

              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
