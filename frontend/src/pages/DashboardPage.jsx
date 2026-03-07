import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PostResultCard from '../components/posts/PostResultCard';
import { useAuth } from '../context/useAuth';
import {
  apiRequest,
  fetchCurrentUserProfile,
  fetchUserPosts,
  updateCurrentUserAvatar,
  updateCurrentUserProfile,
} from '../utils/profileApi';

const EDITABLE_VISIBILITY_FIELDS = ['bio', 'location', 'education', 'work'];
const DEFAULT_VISIBILITY = {
  bio: true,
  location: true,
  education: true,
  work: true,
};
const PROFILE_SORT_OPTIONS = [
  { value: 'new', label: 'Newest' },
  { value: 'upvotes', label: 'Most upvoted' },
];
const COMPOSER_TYPE_OPTIONS = [
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'JOB', label: 'Job' },
  { value: 'EVENT', label: 'Event' },
  { value: 'EVENT_RECAP', label: 'Event Recap' },
  { value: 'ACHIEVEMENT', label: 'Achievement' },
  { value: 'COLLAB', label: 'Collaboration' },
];
const INITIAL_COMPOSER_FORM = {
  type: 'EVENT',
  title: '',
  summary: '',
};

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

function getInitials(value) {
  const parts = String(value || '')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'U';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'U';
}

function safeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function normalizeVisibility(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_VISIBILITY };
  return {
    bio: value.bio !== false,
    location: value.location !== false,
    education: value.education !== false,
    work: value.work !== false,
  };
}

function toEditForm(profile) {
  return {
    fullName: safeText(profile?.fullName),
    bio: safeText(profile?.bio),
    location: safeText(profile?.location),
    education: safeText(profile?.education),
    work: safeText(profile?.work),
    visibility: normalizeVisibility(profile?.visibility),
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, token, setAuthSession } = useAuth();
  const avatarFileInputRef = useRef(null);

  const currentUserId = String(user?.id || '').trim();
  const normalizedRole = String(user?.role || '').toLowerCase();

  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sort, setSort] = useState('new');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [pageError, setPageError] = useState('');
  const [banner, setBanner] = useState({ type: 'idle', message: '' });

  const [composerForm, setComposerForm] = useState(INITIAL_COMPOSER_FORM);
  const [submittingPost, setSubmittingPost] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(toEditForm(null));
  const [editAvatarFile, setEditAvatarFile] = useState(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const allowedComposerTypeOptions = useMemo(
    () => COMPOSER_TYPE_OPTIONS.filter((option) => canRoleCreateType(normalizedRole, option.value)),
    [normalizedRole],
  );

  const displayName = safeText(profile?.fullName) || safeText(user?.full_name) || safeText(user?.name) || 'User';
  const avatarUrl = safeText(profile?.avatarUrl);
  const profileInitials = getInitials(displayName);
  const visibility = normalizeVisibility(profile?.visibility);
  const headerDetails = [
    visibility.location ? safeText(profile?.location) : '',
    visibility.education ? safeText(profile?.education) : '',
    visibility.work ? safeText(profile?.work) : '',
  ].filter(Boolean);

  function syncAuthUser(nextProfile) {
    if (!token || !user || !nextProfile) return;

    const nextFullName = safeText(nextProfile.fullName) || safeText(user.full_name);
    const nextAvatarUrl = safeText(nextProfile.avatarUrl);
    const previousAvatarUrl = safeText(user.avatar_url);

    if (nextFullName === safeText(user.full_name) && nextAvatarUrl === previousAvatarUrl) {
      return;
    }

    setAuthSession({
      token,
      user: {
        ...user,
        full_name: nextFullName || user.full_name || user.name,
        avatar_url: nextAvatarUrl || null,
      },
    });
  }

  async function loadProfile() {
    setLoadingProfile(true);
    setPageError('');
    try {
      const profileResult = await fetchCurrentUserProfile();
      setProfile(profileResult);
      syncAuthUser(profileResult);
    } catch (error) {
      setPageError(error.message || 'Could not load your profile.');
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadPosts(activeSort) {
    if (!currentUserId) return;

    setLoadingPosts(true);
    try {
      const result = await fetchUserPosts({
        authorId: currentUserId,
        sort: activeSort,
        status: 'all',
        limit: 120,
      });
      setPosts(result.items);
    } catch (error) {
      setBanner({ type: 'error', message: `Could not load posts: ${error.message}` });
    } finally {
      setLoadingPosts(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated) return;
    navigate('/login', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId) return;
    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUserId]);

  useEffect(() => {
    if (!allowedComposerTypeOptions.some((option) => option.value === composerForm.type)) {
      setComposerForm((prev) => ({
        ...prev,
        type: allowedComposerTypeOptions[0]?.value || 'EVENT',
      }));
    }
  }, [allowedComposerTypeOptions, composerForm.type]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId) return;
    loadPosts(sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, currentUserId, sort]);

  function openEditProfileModal() {
    setEditForm(toEditForm(profile));
    setEditAvatarFile(null);
    setEditAvatarUrl('');
    setIsEditOpen(true);
  }

  function closeEditProfileModal() {
    if (savingProfile) return;
    setIsEditOpen(false);
  }

  async function handleCreatePost(event) {
    event.preventDefault();
    const summary = safeText(composerForm.summary);

    if (!summary) {
      setBanner({ type: 'error', message: 'Post summary is required.' });
      return;
    }

    if (!canRoleCreateType(normalizedRole, composerForm.type)) {
      setBanner({ type: 'error', message: getRoleTypeBlockMessage(normalizedRole, composerForm.type) });
      return;
    }

    setSubmittingPost(true);
    try {
      await apiRequest('/posts/posts', {
        method: 'POST',
        body: JSON.stringify({
          type: composerForm.type,
          title: safeText(composerForm.title) || null,
          summary,
          status: 'published',
          authorId: currentUserId || undefined,
        }),
      });
      setComposerForm((prev) => ({ ...prev, title: '', summary: '' }));
      setBanner({ type: 'success', message: 'Post created.' });
      await loadPosts(sort);
    } catch (error) {
      setBanner({ type: 'error', message: `Could not create post: ${error.message}` });
    } finally {
      setSubmittingPost(false);
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);

    try {
      let latestProfile = profile;

      if (editAvatarFile) {
        latestProfile = await updateCurrentUserAvatar({ file: editAvatarFile });
      } else if (safeText(editAvatarUrl)) {
        latestProfile = await updateCurrentUserAvatar({ avatarUrl: safeText(editAvatarUrl) });
      }

      const updatedProfile = await updateCurrentUserProfile({
        fullName: safeText(editForm.fullName),
        bio: safeText(editForm.bio),
        location: safeText(editForm.location),
        education: safeText(editForm.education),
        work: safeText(editForm.work),
        visibility: editForm.visibility,
      });

      const finalProfile = updatedProfile || latestProfile;
      setProfile(finalProfile);
      syncAuthUser(finalProfile);
      setBanner({ type: 'success', message: 'Profile updated.' });
      setIsEditOpen(false);
    } catch (error) {
      setBanner({ type: 'error', message: `Could not update profile: ${error.message}` });
    } finally {
      setSavingProfile(false);
    }
  }

  const pageReady = !loadingProfile && !loadingPosts;

  return (
    <div className="dashboard-page profile-page-shell">
      {banner.message && (
        <section className={`banner banner-${banner.type === 'error' ? 'error' : 'success'}`} aria-live="polite">
          <p>{banner.message}</p>
          <button type="button" onClick={() => setBanner({ type: 'idle', message: '' })}>Dismiss</button>
        </section>
      )}

      {pageError && (
        <section className="inline-alert" role="alert">
          <p>{pageError}</p>
        </section>
      )}

      <section className="panel profile-hero-panel">
        <div className="profile-cover-block" aria-hidden="true" />

        <div className="profile-hero-content">
          <button
            type="button"
            className="profile-hero-avatar profile-avatar-action"
            onClick={openEditProfileModal}
            aria-label="Edit profile photo"
          >
            {avatarUrl ? <img src={avatarUrl} alt={`${displayName} avatar`} /> : <span>{profileInitials}</span>}
          </button>

          <div className="profile-hero-text">
            <h1>{displayName}</h1>
            {headerDetails.length > 0 ? (
              <div className="profile-highlights">
                {headerDetails.map((detail) => (
                  <span key={detail}>{detail}</span>
                ))}
              </div>
            ) : (
              <p className="profile-muted-line">Add details from Edit profile to complete this header.</p>
            )}
          </div>

          <div className="profile-hero-actions">
            <button type="button" className="btn btn-soft" onClick={openEditProfileModal}>
              Edit profile
            </button>
          </div>
        </div>
      </section>

      <div className="profile-layout-grid">
        <section className="panel profile-personal-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Profile</p>
              <h3>Personal details</h3>
            </div>
          </div>

          <div className="profile-detail-list">
            <article>
              <h4>Name</h4>
              <p>{displayName}</p>
            </article>
            <article>
              <h4>Bio</h4>
              <p>{safeText(profile?.bio) || 'Not provided'}</p>
              <small>{visibility.bio ? 'Visible' : 'Hidden from others'}</small>
            </article>
            <article>
              <h4>Location</h4>
              <p>{safeText(profile?.location) || 'Not provided'}</p>
              <small>{visibility.location ? 'Visible' : 'Hidden from others'}</small>
            </article>
            <article>
              <h4>Education</h4>
              <p>{safeText(profile?.education) || 'Not provided'}</p>
              <small>{visibility.education ? 'Visible' : 'Hidden from others'}</small>
            </article>
            <article>
              <h4>Work</h4>
              <p>{safeText(profile?.work) || 'Not provided'}</p>
              <small>{visibility.work ? 'Visible' : 'Hidden from others'}</small>
            </article>
          </div>
        </section>

        <section className="profile-main-column">
          <section className="panel profile-create-post-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Create</p>
                <h3>Create post</h3>
              </div>
            </div>

            <form className="profile-create-post-form" onSubmit={handleCreatePost}>
              <label>
                <span>Type</span>
                <select
                  value={composerForm.type}
                  onChange={(event) => setComposerForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  {allowedComposerTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Title</span>
                <input
                  type="text"
                  placeholder="Optional title"
                  value={composerForm.title}
                  onChange={(event) => setComposerForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>

              <label>
                <span>Summary</span>
                <textarea
                  rows={3}
                  placeholder="Share an update..."
                  value={composerForm.summary}
                  onChange={(event) => setComposerForm((prev) => ({ ...prev, summary: event.target.value }))}
                />
              </label>

              <div className="profile-create-post-actions">
                <button type="submit" className="btn btn-primary-solid" disabled={submittingPost}>
                  {submittingPost ? 'Posting...' : 'Post'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel profile-posts-panel">
            <div className="panel-header profile-posts-head">
              <div>
                <p className="eyebrow">Posts</p>
                <h3>Your posts</h3>
              </div>
              <label className="profile-sort-control">
                <span>Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  {PROFILE_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {!pageReady ? (
              <p className="post-comments-hint">Loading profile data...</p>
            ) : loadingPosts ? (
              <p className="post-comments-hint">Loading posts...</p>
            ) : posts.length === 0 ? (
              <div className="empty-state">
                <h4>No posts yet</h4>
                <p>Create your first post from the card above.</p>
              </div>
            ) : (
              <div className="feed-grid profile-post-grid">
                {posts.map((item, index) => (
                  <PostResultCard key={item.id || `dashboard-post-${index}`} post={item} index={index} />
                ))}
              </div>
            )}
          </section>
        </section>
      </div>

      {isEditOpen && (
        <div className="profile-edit-backdrop" role="dialog" aria-modal="true" aria-label="Edit profile">
          <section className="panel profile-edit-modal">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Profile</p>
                <h3>Edit profile</h3>
              </div>
              <button type="button" className="btn btn-soft" onClick={closeEditProfileModal} disabled={savingProfile}>
                Close
              </button>
            </div>

            <form className="profile-edit-form" onSubmit={handleSaveProfile}>
              <div className="profile-edit-avatar-row">
                <button
                  type="button"
                  className="profile-hero-avatar profile-avatar-action"
                  onClick={() => avatarFileInputRef.current?.click()}
                  aria-label="Upload avatar"
                >
                  {editAvatarFile ? (
                    <span>{getInitials(editAvatarFile.name)}</span>
                  ) : avatarUrl ? (
                    <img src={avatarUrl} alt={`${displayName} avatar`} />
                  ) : (
                    <span>{profileInitials}</span>
                  )}
                </button>
                <div className="profile-edit-avatar-controls">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const [file] = Array.from(event.target.files || []);
                      if (!file) {
                        setEditAvatarFile(null);
                        return;
                      }
                      setEditAvatarFile(file);
                    }}
                  />
                  <label>
                    <span>Avatar URL (fallback)</span>
                    <input
                      type="url"
                      placeholder="https://example.com/avatar.jpg"
                      value={editAvatarUrl}
                      onChange={(event) => setEditAvatarUrl(event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  required
                />
              </label>

              <label>
                <span>Bio</span>
                <textarea
                  rows={3}
                  value={editForm.bio}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, bio: event.target.value }))}
                />
              </label>

              <label>
                <span>Location</span>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, location: event.target.value }))}
                />
              </label>

              <label>
                <span>Education</span>
                <input
                  type="text"
                  value={editForm.education}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, education: event.target.value }))}
                />
              </label>

              <label>
                <span>Work</span>
                <input
                  type="text"
                  value={editForm.work}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, work: event.target.value }))}
                />
              </label>

              <div className="profile-visibility-grid">
                {EDITABLE_VISIBILITY_FIELDS.map((field) => (
                  <label key={field} className="check-row compact">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.visibility[field])}
                      onChange={(event) => setEditForm((prev) => ({
                        ...prev,
                        visibility: {
                          ...prev.visibility,
                          [field]: event.target.checked,
                        },
                      }))}
                    />
                    <span>Show {field}</span>
                  </label>
                ))}
              </div>

              <div className="profile-edit-actions">
                <button type="submit" className="btn btn-primary-solid" disabled={savingProfile}>
                  {savingProfile ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

