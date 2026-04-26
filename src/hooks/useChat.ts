import { useEffect, useState } from 'react';
import { subscribeToChat } from '../firebase/chatService';
import type { ChatMessage } from '../types';

export function useChat(roomId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      return;
    }

    setError(null);
    return subscribeToChat(
      roomId,
      setMessages,
      (chatError) => setError(chatError)
    );
  }, [roomId]);

  return { messages, error };
}
