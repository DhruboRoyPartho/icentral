import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth';
import {
  API_BASE_URL,
  chatRequest,
  extractConversationItems,
  normalizeConversations,
  upsertConversation,
} from '../utils/chatClient';

const CHAT_SOCKET_PATH = '/chat/socket.io';
const DISCONNECTED_POLL_INTERVAL_MS = 8000;
const SOCKET_ACK_TIMEOUT_MS = 5000;

const ChatSocketContext = createContext(null);

function createSocketAckError(message) {
  return new Error(message || 'Socket acknowledgement failed');
}

export function ChatProvider({ children }) {
  const { token, isAuthenticated, user } = useAuth();
  const socketRef = useRef(null);
  const joinedConversationCountsRef = useRef(new Map());
  const messageListenersRef = useRef(new Set());
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState('');
  const [socketStatus, setSocketStatus] = useState('idle');
  const [lastSocketError, setLastSocketError] = useState('');
  const [lastDisconnectReason, setLastDisconnectReason] = useState('');

  const applyConversationUpdate = useCallback((payload) => {
    setConversations((prev) => upsertConversation(prev, payload));
  }, []);

  const emitMessageEvent = useCallback((message) => {
    for (const listener of messageListenersRef.current) {
      try {
        listener(message);
      } catch (error) {
        console.warn('[chat] message listener failed', error);
      }
    }
  }, []);

  const refreshConversations = useCallback(async ({ showLoading = true, signal } = {}) => {
    if (!token) {
      setConversations([]);
      setLoadingConversations(false);
      setConversationsError('');
      return [];
    }

    if (showLoading) {
      setLoadingConversations(true);
    }
    setConversationsError('');

    try {
      const result = await chatRequest(token, '/chat/conversations', { signal });
      const items = normalizeConversations(extractConversationItems(result));
      setConversations(items);
      return items;
    } catch (error) {
      if (error.name === 'AbortError') {
        return [];
      }

      const message = error.message || 'Could not load conversations';
      setConversationsError(message);
      console.warn('[chat] failed to refresh conversations', error);
      return [];
    } finally {
      if (showLoading) {
        setLoadingConversations(false);
      }
    }
  }, [token]);

  const emitWithAck = useCallback((eventName, payload) => new Promise((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      reject(createSocketAckError('Chat socket is not connected'));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      reject(createSocketAckError(`${eventName} timed out`));
    }, SOCKET_ACK_TIMEOUT_MS);

    socket.emit(eventName, payload, (response) => {
      window.clearTimeout(timeoutId);

      if (!response?.ok) {
        reject(createSocketAckError(response?.error || `${eventName} failed`));
        return;
      }

      resolve(response);
    });
  }), []);

  const sendJoinRequest = useCallback(async (conversationId) => {
    try {
      return await emitWithAck('conversation:join', { conversationId });
    } catch (error) {
      console.warn(`[chat] failed to join room ${conversationId}`, error);
      return { ok: false, error: error.message || 'Failed to join conversation room' };
    }
  }, [emitWithAck]);

  const sendLeaveRequest = useCallback(async (conversationId) => {
    try {
      return await emitWithAck('conversation:leave', { conversationId });
    } catch (error) {
      console.warn(`[chat] failed to leave room ${conversationId}`, error);
      return { ok: false, error: error.message || 'Failed to leave conversation room' };
    }
  }, [emitWithAck]);

  const joinConversation = useCallback(async (conversationId) => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) {
      return { ok: false, error: 'conversationId is required' };
    }

    const currentCount = joinedConversationCountsRef.current.get(normalizedConversationId) || 0;
    joinedConversationCountsRef.current.set(normalizedConversationId, currentCount + 1);

    const socket = socketRef.current;
    if (!socket?.connected) {
      console.info(`[chat] queued room join for ${normalizedConversationId} until socket reconnects`);
      return { ok: false, queued: true };
    }

    return sendJoinRequest(normalizedConversationId);
  }, [sendJoinRequest]);

  const leaveConversation = useCallback(async (conversationId) => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) {
      return { ok: false, error: 'conversationId is required' };
    }

    const currentCount = joinedConversationCountsRef.current.get(normalizedConversationId) || 0;
    if (currentCount <= 1) {
      joinedConversationCountsRef.current.delete(normalizedConversationId);
    } else {
      joinedConversationCountsRef.current.set(normalizedConversationId, currentCount - 1);
      return { ok: true };
    }

    const socket = socketRef.current;
    if (!socket?.connected) {
      return { ok: false, queued: true };
    }

    return sendLeaveRequest(normalizedConversationId);
  }, [sendLeaveRequest]);

  const subscribeToMessages = useCallback((listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }

    messageListenersRef.current.add(listener);
    return () => {
      messageListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      joinedConversationCountsRef.current.clear();
      messageListenersRef.current.clear();
      setConversations([]);
      setLoadingConversations(false);
      setConversationsError('');
      setSocketStatus('idle');
      setLastSocketError('');
      setLastDisconnectReason('');
      return undefined;
    }

    const controller = new AbortController();
    refreshConversations({ showLoading: true, signal: controller.signal });

    setSocketStatus('connecting');
    setLastSocketError('');
    setLastDisconnectReason('');

    const socket = io(API_BASE_URL, {
      path: CHAT_SOCKET_PATH,
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketRef.current = socket;

    const rejoinTrackedConversations = async () => {
      const trackedConversationIds = Array.from(joinedConversationCountsRef.current.keys());
      if (trackedConversationIds.length === 0) return;

      await Promise.all(trackedConversationIds.map((conversationId) => sendJoinRequest(conversationId)));
    };

    socket.on('connect', async () => {
      console.info(`[chat] socket connected user=${user?.id || 'unknown'} socket=${socket.id}`);
      setSocketStatus('connected');
      setLastSocketError('');
      await rejoinTrackedConversations();
      refreshConversations({ showLoading: false });
    });

    socket.on('conversation:updated', (payload) => {
      if (!payload?.conversationId) return;
      applyConversationUpdate(payload);
    });

    socket.on('message:new', (message) => {
      if (!message?.conversationId || !message?.id) return;
      emitMessageEvent(message);
    });

    socket.on('connect_error', (error) => {
      const message = error?.message || 'Socket connection failed';
      setSocketStatus('reconnecting');
      setLastSocketError(message);
      console.warn('[chat] socket connect_error', message);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setSocketStatus('reconnecting');
      console.info(`[chat] socket reconnect attempt ${attempt}`);
    });

    socket.io.on('reconnect_error', (error) => {
      const message = error?.message || 'Socket reconnect failed';
      setLastSocketError(message);
      console.warn('[chat] socket reconnect_error', message);
    });

    socket.io.on('reconnect_failed', () => {
      setLastSocketError('Socket reconnect failed');
      console.warn('[chat] socket reconnect_failed');
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        setSocketStatus('disconnected');
      } else {
        setSocketStatus('reconnecting');
      }

      setLastDisconnectReason(reason || '');
      console.warn(`[chat] socket disconnected reason=${reason || 'unknown'}`);
    });

    return () => {
      controller.abort();
      socket.removeAllListeners();
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [applyConversationUpdate, emitMessageEvent, isAuthenticated, refreshConversations, sendJoinRequest, token, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;
    if (socketStatus === 'connected' || socketStatus === 'idle') return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      refreshConversations({ showLoading: false });
    };

    refreshIfVisible();
    const intervalId = window.setInterval(refreshIfVisible, DISCONNECTED_POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [isAuthenticated, refreshConversations, socketStatus, token]);

  const value = useMemo(() => ({
    conversations,
    loadingConversations,
    conversationsError,
    socketConnected: socketStatus === 'connected',
    socketStatus,
    isReconnecting: isAuthenticated && socketStatus !== 'connected' && socketStatus !== 'idle',
    lastSocketError,
    lastDisconnectReason,
    refreshConversations,
    applyConversationUpdate,
    joinConversation,
    leaveConversation,
    subscribeToMessages,
  }), [
    applyConversationUpdate,
    conversations,
    conversationsError,
    isAuthenticated,
    joinConversation,
    lastDisconnectReason,
    lastSocketError,
    leaveConversation,
    loadingConversations,
    refreshConversations,
    socketStatus,
    subscribeToMessages,
  ]);

  return (
    <ChatSocketContext.Provider value={value}>
      {children}
    </ChatSocketContext.Provider>
  );
}

export { ChatSocketContext };
