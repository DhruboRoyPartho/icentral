import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PostResultCard from '../components/posts/PostResultCard';
import { useAuth } from '../context/useAuth';
import { apiRequest } from '../utils/profileApi';

const EVENT_POST_TYPES = ['EVENT', 'EVENT_RECAP'];
const FEED_PAGE_LIMIT = 60;

const initialFilters = {
  type: '',
  tag: '',
  status: 'published',
  sort: 'new',
};

const initialComposerForm = {
  type: 'EVENT',
  title: '',
  summary: '',
  startsAt: '',
  endsAt: '',
  venue: '',
  rsvpUrl: '',
  tagIds: [],
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getCreatedAtTime(post) {
  const timestamp = Number(new Date(post?.createdAt || 0));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getUpvoteCount(post) {
  const value = Number(post?.upvoteCount ?? post?.score ?? post?.voteScore ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function sortEventPosts(items, sort = 'new') {
  const normalizedSort = String(sort || '').toLowerCase() === 'upvotes' ? 'upvotes' : 'new';
  const cloned = items.slice();

  cloned.sort((a, b) => {
    if (normalizedSort === 'upvotes') {
      const upvoteDelta = getUpvoteCount(b) - getUpvoteCount(a);
      if (upvoteDelta !== 0) return upvoteDelta;
    }

    const createdAtDelta = getCreatedAtTime(b) - getCreatedAtTime(a);
    if (createdAtDelta !== 0) return createdAtDelta;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });

  return cloned;
}

function getEventMetadata(post) {
  const refs = Array.isArray(post?.refs) ? post.refs : [];
  const eventRef = refs.find((ref) => normalizeText(ref?.service).toLowerCase() === 'event-details');
  const metadata = eventRef?.metadata && typeof eventRef.metadata === 'object'
    ? eventRef.metadata
    : {};

  return {
    startsAt: normalizeText(metadata.startsAt),
    endsAt: normalizeText(metadata.endsAt),
    venue: normalizeText(metadata.venue),
    rsvpUrl: normalizeText(metadata.rsvpUrl),
  };
}

function buildFeedParams({ type, filters, search }) {
  const params = new URLSearchParams();
  params.set('type', type);
  params.set('limit', String(FEED_PAGE_LIMIT));
  params.set('offset', '0');
  params.set('sort', filters.sort || 'new');

  const normalizedStatus = normalizeText(filters.status).toLowerCase();
  if (normalizedStatus && normalizedStatus !== 'all') {
    params.set('status', normalizedStatus);
  } else if (normalizedStatus === 'all') {
    params.set('status', 'all');
    params.set('includeArchived', 'true');
  }

  if (normalizedStatus === 'archived') {
    params.set('includeArchived', 'true');
  }

  if (filters.tag) params.set('tag', String(filters.tag));
  if (search) params.set('search', search);

  return params;
}

function isSupportedEventType(value) {
  return EVENT_POST_TYPES.includes(String(value || '').toUpperCase());
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function EventsPage() {
  const { isAuthenticated, user } = useAuth();
  const [feedItems, setFeedItems] = useState([]);
  const [tags, setTags] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [searchInput, setSearchInput] = useState('');
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [banner, setBanner] = useState({ type: 'idle', message: '' });
  const [refreshTick, setRefreshTick] = useState(0);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [composerForm, setComposerForm] = useState(initialComposerForm);
  const [composerTagSearchInput, setComposerTagSearchInput] = useState('');

  const deferredSearch = useDeferredValue(searchInput);
  const activeSearch = deferredSearch.trim();

  const composerSelectedTagIds = Array.isArray(composerForm.tagIds)
    ? composerForm.tagIds.map((value) => String(value)).filter(Boolean)
    : [];
  const composerSelectedTagSet = new Set(composerSelectedTagIds);
  const selectedComposerTags = tags.filter((tag) => composerSelectedTagSet.has(String(tag.id)));
  const normalizedComposerTagQuery = composerTagSearchInput.trim().toLowerCase();
  const filteredComposerTagResults = tags
    .filter((tag) => {
      if (composerSelectedTagSet.has(String(tag.id))) return false;
      if (!normalizedComposerTagQuery) return true;
      const name = String(tag.name || '').toLowerCase();
      const slug = String(tag.slug || '').toLowerCase();
      return name.includes(normalizedComposerTagQuery) || slug.includes(normalizedComposerTagQuery);
    })
    .slice(0, 8);

  const eventStats = useMemo(() => {
    const now = Date.now();
    let upcomingCount = 0;
    let recapCount = 0;
    let scheduledCount = 0;

    for (const post of feedItems) {
      const type = String(post?.type || '').toUpperCase();
      if (type === 'EVENT_RECAP') {
        recapCount += 1;
        continue;
      }

      if (type !== 'EVENT') continue;

      scheduledCount += 1;
      const startsAt = getEventMetadata(post).startsAt;
      if (!startsAt) continue;
      const startTime = Number(new Date(startsAt));
      if (Number.isNaN(startTime)) continue;
      if (startTime >= now) {
        upcomingCount += 1;
      }
    }

    return {
      total: feedItems.length,
      scheduled: scheduledCount,
      upcoming: upcomingCount,
      recaps: recapCount,
    };
  }, [feedItems]);

  useEffect(() => {
    let isMounted = true;

    async function loadTags() {
      try {
        const result = await apiRequest('/posts/tags');
        if (!isMounted) return;
        startTransition(() => {
          setTags(Array.isArray(result?.data) ? result.data : []);
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

    async function fetchEventPostsByType(type) {
      const params = buildFeedParams({
        type,
        filters,
        search: activeSearch,
      });

      const result = await apiRequest(`/posts/feed?${params.toString()}`, {
        signal: controller.signal,
      });

      return Array.isArray(result?.data)
        ? result.data.filter((item) => String(item?.type || '').toUpperCase() === type)
        : [];
    }

    async function loadEventFeed() {
      setLoadingFeed(true);
      setFeedError('');

      try {
        const normalizedType = String(filters.type || '').toUpperCase();
        const requestedTypes = isSupportedEventType(normalizedType)
          ? [normalizedType]
          : EVENT_POST_TYPES;

        const results = await Promise.all(
          requestedTypes.map((type) => fetchEventPostsByType(type))
        );

        if (!isMounted) return;

        const seen = new Set();
        const merged = [];
        for (const list of results) {
          for (const item of list) {
            const id = String(item?.id || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            merged.push(item);
          }
        }

        const sorted = sortEventPosts(merged, filters.sort).slice(0, FEED_PAGE_LIMIT);
        startTransition(() => {
          setFeedItems(sorted);
        });
      } catch (error) {
        if (!isMounted || error.name === 'AbortError') return;
        setFeedError(error.message || 'Could not load event posts.');
        setFeedItems([]);
      } finally {
        if (isMounted) setLoadingFeed(false);
      }
    }

    loadEventFeed();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [filters, activeSearch, refreshTick]);

  useEffect(() => {
    if (!isCreateModalOpen) return undefined;

    function handleEscapeKey(event) {
      if (event.key !== 'Escape') return;
      if (submittingPost) return;
      setIsCreateModalOpen(false);
    }

    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isCreateModalOpen, submittingPost]);

  function refreshFeed() {
    setRefreshTick((prev) => prev + 1);
  }

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function clearFilters() {
    setFilters(initialFilters);
    setSearchInput('');
  }

  function updateComposerField(field, value) {
    setComposerForm((prev) => ({ ...prev, [field]: value }));
  }

  function addTagToComposer(tagId) {
    updateComposerField('tagIds', [...new Set([...composerSelectedTagIds, String(tagId)])]);
    setComposerTagSearchInput('');
  }

  function removeTagFromComposer(tagId) {
    updateComposerField('tagIds', composerSelectedTagIds.filter((id) => id !== String(tagId)));
  }

  async function handleCreatePost(event) {
    event.preventDefault();

    if (!isAuthenticated) {
      setBanner({ type: 'error', message: 'Sign in to create event posts.' });
      return;
    }

    const type = String(composerForm.type || '').toUpperCase();
    if (!isSupportedEventType(type)) {
      setBanner({ type: 'error', message: 'Choose EVENT or EVENT_RECAP.' });
      return;
    }

    const title = normalizeText(composerForm.title);
    const summary = normalizeText(composerForm.summary);
    const venue = normalizeText(composerForm.venue);
    const rsvpUrl = normalizeText(composerForm.rsvpUrl);

    if (!title) {
      setBanner({ type: 'error', message: 'Title is required.' });
      return;
    }
    if (!summary) {
      setBanner({ type: 'error', message: 'Summary is required.' });
      return;
    }

    let startsAt = null;
    let startsAtTs = null;
    const startsAtInput = normalizeText(composerForm.startsAt);
    if (startsAtInput) {
      const parsed = new Date(startsAtInput);
      if (Number.isNaN(parsed.getTime())) {
        setBanner({ type: 'error', message: 'Start date/time is invalid.' });
        return;
      }
      startsAt = parsed.toISOString();
      startsAtTs = parsed.getTime();
    }

    let endsAt = null;
    let endsAtTs = null;
    const endsAtInput = normalizeText(composerForm.endsAt);
    if (endsAtInput) {
      const parsed = new Date(endsAtInput);
      if (Number.isNaN(parsed.getTime())) {
        setBanner({ type: 'error', message: 'End date/time is invalid.' });
        return;
      }
      endsAt = parsed.toISOString();
      endsAtTs = parsed.getTime();
    }

    if (startsAtTs !== null && endsAtTs !== null && endsAtTs < startsAtTs) {
      setBanner({ type: 'error', message: 'End date/time must be after start date/time.' });
      return;
    }

    if (rsvpUrl && !isHttpUrl(rsvpUrl)) {
      setBanner({ type: 'error', message: 'RSVP URL must start with http:// or https://.' });
      return;
    }

    const maybeAuthorId = user?.id && /^[0-9a-fA-F-]{32,36}$/.test(String(user.id))
      ? user.id
      : undefined;
    const refEntityId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `event-details-${Date.now()}`;

    const payload = {
      type,
      title,
      summary,
      status: 'published',
      tags: [...new Set(composerSelectedTagIds)],
      ref: {
        service: 'event-details',
        entityId: refEntityId,
        metadata: {
          startsAt,
          endsAt,
          venue: venue || null,
          rsvpUrl: rsvpUrl || null,
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

      setComposerForm(initialComposerForm);
      setComposerTagSearchInput('');
      setBanner({ type: 'success', message: 'Event post published.' });
      setIsCreateModalOpen(false);
      refreshFeed();
    } catch (error) {
      setBanner({ type: 'error', message: `Could not create event post: ${error.message}` });
    } finally {
      setSubmittingPost(false);
    }
  }

  return (
    <div className="home-feed-page collab-page">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel collab-overview-panel">
        <div className="collab-overview-head">
          <div>
            <p className="eyebrow">Events</p>
            <h2>Events and Event Recaps</h2>
            <p>Track upcoming campus activities and publish recap posts in one feed.</p>
          </div>
          <div className="collab-overview-stats">
            <div className="collab-overview-stat-card">
              <span>Visible cards</span>
              <strong>{eventStats.total}</strong>
            </div>
            <div className="collab-overview-stat-card">
              <span>Upcoming events</span>
              <strong>{eventStats.upcoming}</strong>
            </div>
            <div className="collab-overview-stat-card">
              <span>Recaps</span>
              <strong>{eventStats.recaps}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="collab-top-grid">
        <section className="panel composer-panel collab-composer-panel collab-composer-compact">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Create</p>
              <h3>Publish an Event or Recap</h3>
            </div>
            <span className="pill pill-ghost">POST /posts/posts</span>
          </div>

          <p className="collab-mini-summary">
            Open a compact modal form to create EVENT and EVENT_RECAP posts with event metadata.
          </p>

          <ul className="collab-mini-points">
            <li>Supports title, summary, optional schedule, venue, and RSVP link</li>
            <li>Stores metadata in post refs as service: event-details</li>
            <li>Reuses existing post feed and details flow</li>
          </ul>

          <div className="feed-card-actions collab-create-actions">
            <button className="btn btn-primary-solid" type="button" onClick={() => setIsCreateModalOpen(true)}>
              Open Event Form
            </button>
          </div>

          {!isAuthenticated && (
            <div className="inline-alert warn-alert">
              <p>
                Guest mode is active. You can browse events, but publishing requires authentication.
                <Link to="/login"> Sign in</Link> or <Link to="/signup"> create an account</Link>.
              </p>
            </div>
          )}
        </section>
      </section>

      {isCreateModalOpen && (
        <div
          className="profile-edit-backdrop collab-create-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Create event post"
          onClick={() => {
            if (submittingPost) return;
            setIsCreateModalOpen(false);
          }}
        >
          <section className="panel profile-edit-modal collab-create-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Create</p>
                <h3>New Event Post</h3>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={submittingPost}
              >
                Close
              </button>
            </div>

            {!isAuthenticated && (
              <div className="inline-alert warn-alert">
                <p>
                  Guest mode is active. You can browse events, but publishing requires authentication.
                  <Link to="/login"> Sign in</Link> or <Link to="/signup"> create an account</Link>.
                </p>
              </div>
            )}

            <form className="stacked-form collab-create-form" onSubmit={handleCreatePost}>
              <div className="job-form-block">
                <div className="job-form-block-head">
                  <p className="eyebrow">Core Information</p>
                  <h4>Post Basics</h4>
                </div>

                <div className="field-row two-col">
                  <label>
                    <span>Type <strong className="required-marker">*</strong></span>
                    <select
                      value={composerForm.type}
                      onChange={(event) => updateComposerField('type', event.target.value)}
                      disabled={!isAuthenticated || submittingPost}
                    >
                      <option value="EVENT">EVENT</option>
                      <option value="EVENT_RECAP">EVENT_RECAP</option>
                    </select>
                  </label>

                  <label>
                    <span>Venue (optional)</span>
                    <input
                      type="text"
                      placeholder="e.g. ICE Seminar Room"
                      value={composerForm.venue}
                      onChange={(event) => updateComposerField('venue', event.target.value)}
                      disabled={!isAuthenticated || submittingPost}
                    />
                  </label>
                </div>

                <label>
                  <span>Title <strong className="required-marker">*</strong></span>
                  <input
                    type="text"
                    placeholder="e.g. Alumni Networking Night 2026"
                    value={composerForm.title}
                    onChange={(event) => updateComposerField('title', event.target.value)}
                    disabled={!isAuthenticated || submittingPost}
                  />
                </label>

                <label>
                  <span>Summary <strong className="required-marker">*</strong></span>
                  <textarea
                    rows={4}
                    placeholder="Brief event context, key highlights, agenda, or recap details."
                    value={composerForm.summary}
                    onChange={(event) => updateComposerField('summary', event.target.value)}
                    disabled={!isAuthenticated || submittingPost}
                  />
                </label>
              </div>

              <div className="job-form-block">
                <div className="job-form-block-head">
                  <p className="eyebrow">Event Metadata</p>
                  <h4>Schedule, RSVP, and Tags</h4>
                </div>

                <div className="field-row two-col">
                  <label>
                    <span>Starts At (optional)</span>
                    <input
                      type="datetime-local"
                      value={composerForm.startsAt}
                      onChange={(event) => updateComposerField('startsAt', event.target.value)}
                      disabled={!isAuthenticated || submittingPost}
                    />
                  </label>

                  <label>
                    <span>Ends At (optional)</span>
                    <input
                      type="datetime-local"
                      value={composerForm.endsAt}
                      onChange={(event) => updateComposerField('endsAt', event.target.value)}
                      disabled={!isAuthenticated || submittingPost}
                    />
                  </label>
                </div>

                <label>
                  <span>RSVP URL (optional)</span>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={composerForm.rsvpUrl}
                    onChange={(event) => updateComposerField('rsvpUrl', event.target.value)}
                    disabled={!isAuthenticated || submittingPost}
                  />
                </label>

                <label>
                  <span>Tags</span>
                  <div className="composer-tag-search-shell">
                    <input
                      className="composer-tag-search-input"
                      type="search"
                      placeholder={tags.length === 0 ? 'No tags available' : 'Search tags and press Enter'}
                      value={composerTagSearchInput}
                      onChange={(event) => setComposerTagSearchInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        if (!normalizedComposerTagQuery || filteredComposerTagResults.length === 0) return;
                        event.preventDefault();
                        addTagToComposer(filteredComposerTagResults[0].id);
                      }}
                      disabled={!isAuthenticated || submittingPost || tags.length === 0}
                    />

                    {isAuthenticated && normalizedComposerTagQuery && filteredComposerTagResults.length > 0 && (
                      <ul className="composer-tag-results" role="listbox" aria-label="Matching tags">
                        {filteredComposerTagResults.map((tag) => (
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
                          <strong aria-hidden="true">x</strong>
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
              </div>

              <div className="feed-card-actions collab-create-actions">
                <button
                  className="btn btn-soft"
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={submittingPost}
                >
                  Cancel
                </button>
                <button className="btn btn-primary-solid" type="submit" disabled={!isAuthenticated || submittingPost}>
                  {submittingPost ? 'Publishing...' : 'Publish Event Post'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="panel feed-panel collab-feed-panel">
        <div className="panel-header feed-header">
          <div>
            <p className="eyebrow">Discover</p>
            <h3>Events Feed</h3>
          </div>
          <div className="header-actions">
            <span className="pill">{loadingFeed ? 'Loading...' : `${feedItems.length} card(s)`}</span>
            <button className="btn btn-soft" type="button" onClick={refreshFeed}>Refresh</button>
          </div>
        </div>

        <form className="feed-filters collab-feed-filters" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Search</span>
            <input
              type="search"
              placeholder="Search title or summary"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>

          <label>
            <span>Type</span>
            <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
              <option value="">All Event Types</option>
              <option value="EVENT">EVENT</option>
              <option value="EVENT_RECAP">EVENT_RECAP</option>
            </select>
          </label>

          <label>
            <span>Tag</span>
            <select value={filters.tag} onChange={(event) => updateFilter('tag', event.target.value)}>
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
          </label>

          <label>
            <span>Sort By</span>
            <select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}>
              <option value="new">Newest</option>
              <option value="upvotes">Most upvoted</option>
            </select>
          </label>

          <div className="collab-filter-actions">
            <button className="btn btn-soft" type="button" onClick={clearFilters}>Reset</button>
          </div>
        </form>

        {feedError && (
          <div className="inline-alert" role="alert">
            <p>{feedError}</p>
          </div>
        )}

        {loadingFeed ? (
          <div className="skeleton-grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="feed-card skeleton-card" key={`events-skeleton-${index}`} />
            ))}
          </div>
        ) : feedItems.length === 0 ? (
          <div className="empty-state">
            <h4>No event posts match the current filters</h4>
            <p>Try adjusting filters or publish a new event from the composer above.</p>
          </div>
        ) : (
          <div className="feed-grid search-results-grid">
            {feedItems.map((item, index) => (
              <PostResultCard key={item.id || `event-post-${index}`} post={item} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
