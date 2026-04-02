const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

function extractConversationItems(result) {
  if (Array.isArray(result?.items)) return result.items;
  return Array.isArray(result) ? result : [];
}

function normalizeConversations(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      conversationId: item?.conversationId ? String(item.conversationId) : '',
      otherUserId: item?.otherUserId || 'Unknown user',
      otherUserEmail: item?.otherUserEmail || null,
      otherUserFullName: item?.otherUserFullName || null,
      lastMessage: item?.lastMessage || null,
      lastMessageAt: item?.lastMessageAt || null,
      unreadCount: Number(item?.unreadCount || 0),
    }))
    .filter((item) => item.conversationId)
    .sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
}

function upsertConversation(list, update) {
  if (!update?.conversationId) return list;

  const existing = list.find((item) => item.conversationId === String(update.conversationId)) || null;
  const normalized = {
    conversationId: String(update.conversationId),
    otherUserId: update.otherUserId || existing?.otherUserId || 'Unknown user',
    otherUserEmail: update.otherUserEmail || existing?.otherUserEmail || null,
    otherUserFullName: update.otherUserFullName || existing?.otherUserFullName || null,
    lastMessage: update.lastMessage || existing?.lastMessage || null,
    lastMessageAt: update.lastMessageAt || existing?.lastMessageAt || null,
    unreadCount: Number(update.unreadCount ?? existing?.unreadCount ?? 0),
  };

  const others = list.filter((item) => item.conversationId !== normalized.conversationId);
  return normalizeConversations([normalized, ...others]);
}

function mergeMessages(baseItems, nextItems, mode = 'append') {
  const combined = mode === 'prepend'
    ? [...nextItems, ...baseItems]
    : [...baseItems, ...nextItems];

  const seen = new Set();
  const deduped = [];

  for (const item of combined) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function chatRequest(token, path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export {
  API_BASE_URL,
  chatRequest,
  extractConversationItems,
  mergeMessages,
  normalizeConversations,
  upsertConversation,
};
