import { startTransition, useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

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

export default function ModerationPage() {
  const { isAuthenticated, isModerator } = useAuth();
  const [tags, setTags] = useState([]);
  const [tagName, setTagName] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [loadingTags, setLoadingTags] = useState(true);
  const [submittingTag, setSubmittingTag] = useState(false);
  const [banner, setBanner] = useState({ type: 'idle', message: '' });

  const selectedTagName = (() => {
    if (!selectedTagId) return 'All tags';
    const match = tags.find((tag) => tag.id === selectedTagId || tag.slug === selectedTagId);
    return match ? match.name : selectedTagId;
  })();

  useEffect(() => {
    let isMounted = true;

    async function loadTags() {
      setLoadingTags(true);
      try {
        const result = await apiRequest('/posts/tags');
        if (!isMounted) return;
        startTransition(() => {
          setTags(Array.isArray(result.data) ? result.data : []);
        });
      } catch (error) {
        if (!isMounted) return;
        setBanner({ type: 'error', message: `Failed to load tags: ${error.message}` });
      } finally {
        if (isMounted) setLoadingTags(false);
      }
    }

    loadTags();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreateTag(event) {
    event.preventDefault();
    if (!isAuthenticated || !isModerator) {
      setBanner({ type: 'error', message: 'Only moderators can add tags.' });
      return;
    }

    const name = tagName.trim();
    if (!name) return;

    setSubmittingTag(true);
    try {
      await apiRequest('/posts/tags', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setTagName('');
      setBanner({ type: 'success', message: `Tag "${name}" is ready.` });

      const result = await apiRequest('/posts/tags');
      startTransition(() => {
        setTags(Array.isArray(result.data) ? result.data : []);
      });
    } catch (error) {
      setBanner({ type: 'error', message: `Could not create tag: ${error.message}` });
    } finally {
      setSubmittingTag(false);
    }
  }

  return (
    <div className="moderation-page">
      <section className="panel placeholder-panel">
        <div className="placeholder-hero">
          <p className="eyebrow">Moderator Console</p>
          <h2>Moderation</h2>
          <p>Manage taxonomy and moderation controls. Tag creation is restricted to moderator roles.</p>
        </div>
      </section>

      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      <section className="panel tag-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Taxonomy</p>
            <h3>Tags</h3>
          </div>
          <span className="pill pill-ghost">POST /posts/tags</span>
        </div>

        <form className="inline-form" onSubmit={handleCreateTag}>
          <label className="sr-only" htmlFor="new-tag-name">Tag name</label>
          <input
            id="new-tag-name"
            type="text"
            placeholder="Create a tag (e.g. Research)"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            disabled={!isModerator}
          />
          <button className="btn btn-accent" type="submit" disabled={submittingTag || !isModerator}>
            {submittingTag ? 'Adding...' : 'Add Tag'}
          </button>
        </form>

        <div className="tag-list-wrap">
          {loadingTags ? (
            <p className="muted-line">Loading tags...</p>
          ) : tags.length === 0 ? (
            <p className="muted-line">No tags yet. Add one to organize feeds.</p>
          ) : (
            <ul className="tag-cloud" aria-label="Existing tags">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    className={`tag-chip ${selectedTagId && (selectedTagId === tag.id || selectedTagId === tag.slug) ? 'is-active' : ''}`}
                    onClick={() => setSelectedTagId(selectedTagId === tag.id ? '' : tag.id)}
                    title={`Select ${tag.name}`}
                  >
                    <span>{tag.name}</span>
                    <small>{tag.slug}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="api-note">
          <p>API Base: <code>{API_BASE_URL}</code></p>
          <p>Selected Tag Filter: <strong>{selectedTagName}</strong></p>
          <p>Role-aware actions: {isModerator ? 'Moderator controls enabled' : 'Standard controls'}</p>
        </div>
      </section>
    </div>
  );
}
