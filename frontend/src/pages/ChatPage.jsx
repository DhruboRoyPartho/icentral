import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useChatSocket } from '../context/useChatSocket';
import { openUserProfile } from '../utils/profileNavigation';
import { chatRequest, mergeMessages } from '../utils/chatClient';

const PAGE_SIZE = 30;
const DISCONNECTED_REFETCH_INTERVAL_MS = 8000;

function formatConversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function formatMessageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getAvatarLabel(text) {
  const raw = String(text || '').trim();
  if (!raw) return '?';

  const source = raw.includes('@') ? raw.split('@')[0] : raw;
  const parts = source.split(/[\s._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export default function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, isAuthenticated } = useAuth();
  const {
    conversations,
    loadingConversations,
    conversationsError,
    socketConnected,
    socketStatus,
    isReconnecting,
    lastSocketError,
    refreshConversations,
    applyConversationUpdate,
    joinConversation,
    leaveConversation,
    subscribeToMessages,
  } = useChatSocket();
  const selectedConversationRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const messagesViewportRef = useRef(null);
  const latestLoadedMessageAtRef = useRef(0);
  const locationStateConversationId = location.state?.preferredConversationId
    ? String(location.state.preferredConversationId)
    : '';

  const [selectedConversationId, setSelectedConversationId] = useState(locationStateConversationId);
  const [messages, setMessages] = useState([]);
  const [messagesError, setMessagesError] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const [draftBody, setDraftBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const [emailQuery, setEmailQuery] = useState('');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);

  const [chatListQuery, setChatListQuery] = useState('');
  const [conversationFilter, setConversationFilter] = useState('all');

  const [startingConversation, setStartingConversation] = useState(false);
  const [startConversationError, setStartConversationError] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(max-width: 960px)').matches;
  });

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.conversationId === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  const currentUserId = String(user?.id || '');

  const visibleConversations = useMemo(() => {
    const query = chatListQuery.trim().toLowerCase();

    return conversations.filter((item) => {
      if (conversationFilter === 'unread' && item.unreadCount <= 0) {
        return false;
      }

      if (!query) return true;

      const haystacks = [
        item.otherUserFullName,
        item.otherUserEmail,
        item.otherUserId,
        item.lastMessage,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      return haystacks.some((value) => value.includes(query));
    });
  }, [chatListQuery, conversationFilter, conversations]);

  const unreadConversationCount = useMemo(
    () => conversations.filter((item) => item.unreadCount > 0).length,
    [conversations],
  );

  const selectedConversationName = selectedConversation
    ? (selectedConversation.otherUserFullName || selectedConversation.otherUserEmail || selectedConversation.otherUserId)
    : '';
  const selectedConversationUserId = String(selectedConversation?.otherUserId || '').trim();
  const isMobileThreadActive = isMobileViewport && Boolean(selectedConversation);

  function navigateToMessageProfile(event, targetUserId) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openUserProfile(navigate, targetUserId, currentUserId);
  }

  const scrollMessagesToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (!messagesViewportRef.current) return;
      messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
    });
  }, []);

  const markConversationRead = useCallback(async (
    conversationId,
    {
      conversationSnapshot = null,
      force = false,
    } = {},
  ) => {
    if (!conversationId || !token) return;

    const snapshot = conversationSnapshot
      || conversationsRef.current.find((item) => item.conversationId === conversationId)
      || null;

    if (!force && Number(snapshot?.unreadCount || 0) <= 0) {
      return;
    }

    try {
      await chatRequest(token, `/chat/conversations/${conversationId}/read`, {
        method: 'POST',
      });
      if (snapshot) {
        applyConversationUpdate({
          ...snapshot,
          unreadCount: 0,
        });
      }
    } catch (error) {
      console.warn('[chat] failed to mark conversation read', error);
    }
  }, [applyConversationUpdate, token]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1] || null;
    const latestMessageAt = latestMessage?.createdAt
      ? new Date(latestMessage.createdAt).getTime()
      : 0;

    latestLoadedMessageAtRef.current = Number.isNaN(latestMessageAt) ? 0 : latestMessageAt;
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 960px)');
    const handleMediaChange = (event) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  useEffect(() => {
    if (isMobileViewport || selectedConversationId || conversations.length === 0) return;
    setSelectedConversationId(conversations[0].conversationId);
  }, [conversations, isMobileViewport, selectedConversationId]);

  useEffect(() => {
    if (!locationStateConversationId) return;
    setSelectedConversationId(locationStateConversationId);
  }, [locationStateConversationId]);

  useEffect(() => {
    if (!selectedConversationRef.current) {
      if (!isMobileViewport && conversations.length > 0) {
        setSelectedConversationId((currentValue) => currentValue || conversations[0].conversationId);
      } else if (conversations.length === 0) {
        setSelectedConversationId('');
      }
      return;
    }

    if (!conversations.some((item) => item.conversationId === selectedConversationRef.current)) {
      setSelectedConversationId(isMobileViewport ? '' : (conversations[0]?.conversationId || ''));
    }
  }, [conversations, isMobileViewport]);

  const loadMessages = useCallback(async ({
    conversationId,
    cursor = null,
    mode = 'replace',
    silent = false,
    scrollOnSuccess = false,
  }) => {
    if (!token || !conversationId) return;

    if (mode === 'prepend') {
      setLoadingOlder(true);
    } else if (!silent) {
      setLoadingMessages(true);
      setMessagesError('');
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (cursor) params.set('cursor', cursor);

      const result = await chatRequest(token, `/chat/conversations/${conversationId}/messages?${params.toString()}`);
      const incomingItems = Array.isArray(result?.items) ? result.items : [];

      if (mode === 'replace' && selectedConversationRef.current !== conversationId) {
        return;
      }

      setNextCursor(result?.nextCursor || null);

      if (mode === 'prepend') {
        setMessages((prev) => mergeMessages(prev, incomingItems, 'prepend'));
      } else {
        setMessages(incomingItems);
        const conversationSnapshot = conversationsRef.current.find((item) => item.conversationId === conversationId) || null;
        await markConversationRead(conversationId, { conversationSnapshot });

        if (scrollOnSuccess) {
          scrollMessagesToBottom();
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') return;

      if (!silent) {
        setMessagesError(error.message || 'Could not load messages');
      } else {
        console.warn(`[chat] failed to refetch messages for ${conversationId}`, error);
      }
    } finally {
      if (mode === 'prepend') {
        setLoadingOlder(false);
      } else if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [markConversationRead, scrollMessagesToBottom, token]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      navigate('/login');
      return;
    }
  }, [isAuthenticated, navigate, token]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setNextCursor(null);
      return;
    }

    loadMessages({
      conversationId: selectedConversationId,
      mode: 'replace',
      scrollOnSuccess: true,
    });
  }, [loadMessages, selectedConversationId]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const unsubscribe = subscribeToMessages(async (message) => {
      if (!message?.conversationId || message.conversationId !== selectedConversationRef.current) return;

      setMessages((prev) => mergeMessages(prev, [message], 'append'));

      if (String(message.senderId) !== currentUserId) {
        const conversationSnapshot = conversationsRef.current.find((item) => item.conversationId === message.conversationId) || null;
        await markConversationRead(message.conversationId, {
          conversationSnapshot,
          force: true,
        });
      }

      scrollMessagesToBottom();
    });

    return unsubscribe;
  }, [currentUserId, isAuthenticated, markConversationRead, scrollMessagesToBottom, subscribeToMessages]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;

    let isActive = true;
    joinConversation(selectedConversationId);

    return () => {
      if (!isActive) return;
      isActive = false;
      leaveConversation(selectedConversationId);
    };
  }, [joinConversation, leaveConversation, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || !socketConnected) return;

    loadMessages({
      conversationId: selectedConversationId,
      mode: 'replace',
      silent: true,
    });
  }, [loadMessages, selectedConversationId, socketConnected]);

  useEffect(() => {
    if (!token || !selectedConversationId || socketConnected) return undefined;

    const refetchWhileDisconnected = () => {
      if (document.visibilityState === 'hidden') return;

      refreshConversations({ showLoading: false });
      loadMessages({
        conversationId: selectedConversationId,
        mode: 'replace',
        silent: true,
      });
    };

    refetchWhileDisconnected();
    const intervalId = window.setInterval(refetchWhileDisconnected, DISCONNECTED_REFETCH_INTERVAL_MS);
    window.addEventListener('focus', refetchWhileDisconnected);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refetchWhileDisconnected);
    };
  }, [loadMessages, refreshConversations, selectedConversationId, socketConnected, token]);

  useEffect(() => {
    if (!selectedConversationId || !selectedConversation?.lastMessageAt) return;

    const conversationLastMessageAt = new Date(selectedConversation.lastMessageAt).getTime();
    if (Number.isNaN(conversationLastMessageAt)) return;

    if (conversationLastMessageAt <= latestLoadedMessageAtRef.current) {
      return;
    }

    loadMessages({
      conversationId: selectedConversationId,
      mode: 'replace',
      silent: true,
    });
  }, [loadMessages, selectedConversation?.lastMessageAt, selectedConversationId]);

  useEffect(() => {
    if (!token) return undefined;

    const normalizedQuery = emailQuery.trim();

    if (selectedRecipient && selectedRecipient.email !== normalizedQuery) {
      setSelectedRecipient(null);
    }

    if (normalizedQuery.length < 2) {
      setUserSearchResults([]);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearchingUsers(true);
        const params = new URLSearchParams({ query: normalizedQuery });
        const result = await chatRequest(token, `/chat/users/search?${params.toString()}`, {
          signal: controller.signal,
        });
        setUserSearchResults(Array.isArray(result?.items) ? result.items : []);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setUserSearchResults([]);
        }
      } finally {
        setSearchingUsers(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [emailQuery, selectedRecipient, token]);

  async function handleStartConversation(event) {
    event.preventDefault();

    const trimmedEmail = emailQuery.trim();
    if (!trimmedEmail || !token) return;

    setStartingConversation(true);
    setStartConversationError('');

    try {
      const payload = selectedRecipient?.id
        ? { otherUserId: selectedRecipient.id }
        : { otherUserEmail: trimmedEmail };

      const result = await chatRequest(token, '/chat/conversations/dm', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const conversationId = result?.conversationId;
      if (!conversationId) {
        throw new Error('Conversation was not created');
      }

      setEmailQuery('');
      setUserSearchResults([]);
      setSelectedRecipient(null);
      await refreshConversations({ showLoading: false });
      setSelectedConversationId(conversationId);
    } catch (error) {
      setStartConversationError(error.message || 'Could not start conversation');
    } finally {
      setStartingConversation(false);
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();

    if (!token || !selectedConversationId || sendingMessage) return;

    const trimmedBody = draftBody.trim();
    if (!trimmedBody) return;

    setSendingMessage(true);
    setMessagesError('');

    try {
      const createdMessage = await chatRequest(token, `/chat/conversations/${selectedConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmedBody }),
      });

      setDraftBody('');
      setMessages((prev) => mergeMessages(prev, [createdMessage], 'append'));
      applyConversationUpdate({
        conversationId: selectedConversationId,
        otherUserId: selectedConversation?.otherUserId,
        otherUserEmail: selectedConversation?.otherUserEmail,
        otherUserFullName: selectedConversation?.otherUserFullName,
        lastMessage: createdMessage.body,
        lastMessageAt: createdMessage.createdAt,
        unreadCount: 0,
      });
      scrollMessagesToBottom();
    } catch (error) {
      setMessagesError(error.message || 'Could not send message');
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleLoadOlderMessages() {
    if (!selectedConversationId || !nextCursor || loadingOlder) return;

    await loadMessages({
      conversationId: selectedConversationId,
      cursor: nextCursor,
      mode: 'prepend',
    });
  }

  return (
    <div className="chat-page">
      <div className={`chat-layout${isMobileThreadActive ? ' is-mobile-thread-active' : ''}`}>
        <aside className="chat-sidebar" aria-label="Conversations">
          <header className="chat-sidebar-top">
            <h2>Chats</h2>
            <div className="chat-sidebar-actions">
              <button type="button" className="chat-icon-btn" aria-label="Options">
                <span>...</span>
              </button>
              <button type="button" className="chat-icon-btn" aria-label="New message">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M4 17.25V20h2.75L17.8 8.94l-2.75-2.75L4 17.25zm16.71-9.04a1 1 0 0 0 0-1.41l-1.5-1.5a1 1 0 0 0-1.41 0l-1.17 1.17l2.75 2.75l1.33-1.01z" />
                </svg>
              </button>
            </div>
          </header>

          <label className="chat-list-search" htmlFor="chat-list-search-input">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M10 3a7 7 0 1 1 0 14a7 7 0 0 1 0-14zm0 2a5 5 0 1 0 .001 10.001A5 5 0 0 0 10 5zm8.707 11.293l2 2a1 1 0 0 1-1.414 1.414l-2-2a1 1 0 0 1 1.414-1.414z" />
              </svg>
            </span>
            <input
              id="chat-list-search-input"
              type="search"
              placeholder="Search chats"
              value={chatListQuery}
              onChange={(event) => setChatListQuery(event.target.value)}
            />
          </label>

          <div className="chat-filter-tabs" role="tablist" aria-label="Conversation filters">
            <button
              type="button"
              className={`chat-filter-tab${conversationFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setConversationFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`chat-filter-tab${conversationFilter === 'unread' ? ' is-active' : ''}`}
              onClick={() => setConversationFilter('unread')}
            >
              Unread
              {unreadConversationCount > 0 ? <span>{unreadConversationCount}</span> : null}
            </button>
          </div>

          <form className="chat-start-form" onSubmit={handleStartConversation}>
            <label htmlFor="chat-user-email">Start new chat by email</label>
            <div className="chat-start-row">
              <input
                id="chat-user-email"
                type="email"
                placeholder="user@example.com"
                value={emailQuery}
                onChange={(event) => setEmailQuery(event.target.value)}
              />
              <button className="btn btn-accent" type="submit" disabled={startingConversation || !emailQuery.trim()}>
                {startingConversation ? 'Starting...' : 'Start'}
              </button>
            </div>
            {searchingUsers ? <p className="chat-empty-text">Searching users...</p> : null}
            {userSearchResults.length > 0 ? (
              <div className="chat-search-list">
                {userSearchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-search-item${selectedRecipient?.id === item.id ? ' is-selected' : ''}`}
                    onClick={() => {
                      setSelectedRecipient(item);
                      setEmailQuery(item.email || '');
                    }}
                  >
                    <strong>{item.email}</strong>
                    <small>{item.fullName || item.id}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {startConversationError ? <p className="chat-inline-error">{startConversationError}</p> : null}
          </form>

          <div className="chat-conversation-list">
            {loadingConversations ? (
              <p className="chat-empty-text">Loading conversations...</p>
            ) : conversationsError ? (
              <p className="chat-inline-error">{conversationsError}</p>
            ) : visibleConversations.length === 0 ? (
              <p className="chat-empty-text">No conversations found.</p>
            ) : (
              visibleConversations.map((conversation) => {
                const displayName = conversation.otherUserFullName || conversation.otherUserEmail || conversation.otherUserId;
                return (
                  <button
                    key={conversation.conversationId}
                    type="button"
                    className={`chat-conversation-item${selectedConversationId === conversation.conversationId ? ' is-active' : ''}`}
                    onClick={() => setSelectedConversationId(conversation.conversationId)}
                  >
                    <span className="chat-conversation-avatar" aria-hidden="true">{getAvatarLabel(displayName)}</span>
                    <div className="chat-conversation-main">
                      <div className="chat-conversation-head">
                        <strong>{displayName}</strong>
                        <small>{formatConversationTime(conversation.lastMessageAt)}</small>
                      </div>
                      <div className="chat-conversation-foot">
                        <p>{conversation.lastMessage || 'No messages yet'}</p>
                        {conversation.unreadCount > 0 ? (
                          <span className="chat-unread-badge">{conversation.unreadCount}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="chat-thread-panel" aria-label="Messages">
          {selectedConversation ? (
            <>
              <header className="chat-thread-header">
                <div className="chat-thread-identity">
                  {isMobileViewport ? (
                    <button
                      type="button"
                      className="chat-icon-btn chat-mobile-back-btn"
                      aria-label="Back to conversations"
                      onClick={() => setSelectedConversationId('')}
                    >
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="M14.7 5.3L8 12l6.7 6.7l1.4-1.4L10.8 12l5.3-5.3z" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="chat-thread-avatar chat-profile-trigger"
                    aria-label="View profile"
                    onClick={(event) => navigateToMessageProfile(event, selectedConversationUserId)}
                    disabled={!selectedConversationUserId}
                  >
                    {getAvatarLabel(selectedConversationName)}
                  </button>
                  <div>
                    <h3>
                      {selectedConversationUserId ? (
                        <button
                          type="button"
                          className="chat-profile-name-btn"
                          onClick={(event) => navigateToMessageProfile(event, selectedConversationUserId)}
                        >
                          {selectedConversationName}
                        </button>
                      ) : (
                        selectedConversationName
                      )}
                    </h3>
                    <small>
                      {socketConnected ? 'Active now' : (
                        socketStatus === 'connecting'
                          ? 'Connecting...'
                          : 'Reconnecting...'
                      )}
                    </small>
                  </div>
                </div>
                <div className="chat-thread-actions">
                  <button type="button" className="chat-icon-btn" aria-label="Call">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M6.6 10.79a15.05 15.05 0 0 0 6.61 6.61l2.2-2.2a1 1 0 0 1 1.03-.24c1.12.37 2.31.57 3.56.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.47a1 1 0 0 1 1 1c0 1.25.2 2.44.57 3.56a1 1 0 0 1-.24 1.03l-2.2 2.2z" />
                    </svg>
                  </button>
                  <button type="button" className="chat-icon-btn" aria-label="Video call">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M3 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.38l4.45-2.58A1 1 0 0 1 21 6.66v10.68a1 1 0 0 1-1.55.86L15 15.62V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                    </svg>
                  </button>
                  <button type="button" className="chat-icon-btn" aria-label="Conversation info">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M11 10h2v7h-2v-7zm0-3h2v2h-2V7zm1-5a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2z" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="chat-messages-viewport" ref={messagesViewportRef}>
                {nextCursor ? (
                  <div className="chat-load-older-wrap">
                    <button
                      type="button"
                      className="btn btn-soft"
                      onClick={handleLoadOlderMessages}
                      disabled={loadingOlder}
                    >
                      {loadingOlder ? 'Loading...' : 'Load older messages'}
                    </button>
                  </div>
                ) : null}

                {loadingMessages ? (
                  <p className="chat-empty-text">Loading messages...</p>
                ) : messages.length === 0 ? (
                  <p className="chat-empty-text">No messages yet. Say hello.</p>
                ) : (
                  <div className="chat-message-list">
                    {messages.map((message) => {
                      const isOwn = String(message.senderId) === currentUserId;
                      return (
                        <article key={message.id} className={`chat-message-row${isOwn ? ' is-own' : ''}`}>
                          {!isOwn ? (
                            <button
                              type="button"
                              className="chat-message-avatar chat-profile-trigger"
                              onClick={(event) => navigateToMessageProfile(event, message.senderId)}
                              disabled={!message.senderId}
                              aria-label="View sender profile"
                            >
                              {getAvatarLabel(selectedConversationName)}
                            </button>
                          ) : null}
                          <div className={`chat-message-bubble${isOwn ? ' is-own' : ''}`}>
                            <p>{message.body}</p>
                            <small>{formatMessageTime(message.createdAt)}</small>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              <form className="chat-compose-form" onSubmit={handleSendMessage}>
                <div className="chat-compose-tools" aria-hidden="true">
                  <button type="button" className="chat-icon-btn">+</button>
                  <button type="button" className="chat-icon-btn">GIF</button>
                </div>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  maxLength={2000}
                />
                <button type="submit" className="btn btn-primary-solid chat-send-btn" disabled={sendingMessage || !draftBody.trim()}>
                  {sendingMessage ? '...' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty-state">
              <h3>Select a conversation</h3>
              <p>Pick one from the left or start a new chat by email.</p>
            </div>
          )}

          {messagesError ? <p className="chat-inline-error chat-thread-error">{messagesError}</p> : null}
          {!socketConnected && selectedConversation ? (
            <p className="chat-empty-text chat-thread-error">
              {isReconnecting
                ? `Live updates are reconnecting${lastSocketError ? `: ${lastSocketError}` : ''}.`
                : 'Live updates are temporarily unavailable.'}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
