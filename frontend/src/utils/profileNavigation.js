export function getProfilePathForUser(targetUserId, currentUserId) {
  const normalizedTarget = String(targetUserId || '').trim();
  if (!normalizedTarget) return '';

  const normalizedCurrent = String(currentUserId || '').trim();
  if (normalizedCurrent && normalizedTarget === normalizedCurrent) {
    return '/dashboard';
  }

  return `/profile/${encodeURIComponent(normalizedTarget)}`;
}

export function openUserProfile(navigate, targetUserId, currentUserId, options = {}) {
  const path = getProfilePathForUser(targetUserId, currentUserId);
  if (!path) return;
  navigate(path, options);
}

