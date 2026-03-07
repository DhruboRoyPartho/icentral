const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export async function apiRequest(path, options = {}) {
  const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
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

export async function fetchCurrentUserProfile() {
  const result = await apiRequest('/users/me');
  return result?.data || null;
}

export async function fetchPublicUserProfile(userId) {
  const result = await apiRequest(`/users/${encodeURIComponent(userId)}`);
  return result?.data || null;
}

export async function updateCurrentUserProfile(payload) {
  const result = await apiRequest('/users/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return result?.data || null;
}

export async function updateCurrentUserAvatar({ file, avatarUrl }) {
  if (file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const result = await apiRequest('/users/me/avatar', {
      method: 'POST',
      body: formData,
    });
    return result?.data || null;
  }

  const result = await apiRequest('/users/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ avatarUrl }),
  });
  return result?.data || null;
}

function normalizePostsPayload(result) {
  if (!result || !Array.isArray(result.data)) return null;
  return {
    items: result.data,
    nextCursor: typeof result?.nextCursor === 'string' ? result.nextCursor : null,
    pagination: result?.pagination || null,
  };
}

export async function fetchUserPosts({ authorId, sort = 'new', status = 'published', limit = 50, cursor = '', includeArchived }) {
  const params = new URLSearchParams();
  params.set('authorId', String(authorId));
  params.set('sort', sort);
  params.set('limit', String(limit));
  if (status) params.set('status', status);
  const shouldIncludeArchived = typeof includeArchived === 'boolean' ? includeArchived : status === 'all';
  if (shouldIncludeArchived) params.set('includeArchived', 'true');
  if (cursor) params.set('cursor', cursor);

  const queryString = params.toString();
  const candidates = [
    `/posts/feed?${queryString}`,
    `/posts?${queryString}`,
  ];

  let lastError = null;

  for (const path of candidates) {
    try {
      const result = await apiRequest(path);
      const normalized = normalizePostsPayload(result);
      if (normalized) return normalized;
      lastError = new Error('Unexpected posts response payload.');
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      if (!/route not found|unexpected posts response payload/i.test(message)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Could not load posts.');
}
