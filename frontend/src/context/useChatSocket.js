import { useContext } from 'react';
import { ChatSocketContext } from './ChatSocketContext';

export function useChatSocket() {
  const context = useContext(ChatSocketContext);
  if (!context) {
    throw new Error('useChatSocket must be used within ChatProvider');
  }
  return context;
}
