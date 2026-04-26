import {
  doc,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from './config';
import type { ChatMessage } from '../types';

const ROOMS_COLLECTION = 'rooms';
const MAX_CHAT_MESSAGES = 50;

function makeMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeChat(chat: unknown): ChatMessage[] {
  if (!Array.isArray(chat)) return [];

  return chat
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Partial<ChatMessage>;
      return (
        typeof value.id === 'string' &&
        typeof value.senderName === 'string' &&
        typeof value.message === 'string' &&
        typeof value.timestamp === 'number' &&
        Number.isFinite(value.timestamp)
      );
    })
    .slice(-MAX_CHAT_MESSAGES);
}

export async function sendMessage(
  roomId: string,
  message: string,
  senderName: string
): Promise<void> {
  const trimmedMessage = message.trim();
  const trimmedSender = senderName.trim();

  if (!roomId || !trimmedMessage) return;

  const chatMessage: ChatMessage = {
    id: makeMessageId(),
    senderName: trimmedSender || 'Player',
    message: trimmedMessage,
    timestamp: Date.now(),
  };

  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  await runTransaction(db, async (transaction) => {
    const roomSnap = await transaction.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Room not found');
    }

    const currentChat = normalizeChat(roomSnap.data()?.chat);
    const nextChat = [...currentChat, chatMessage].slice(-MAX_CHAT_MESSAGES);

    transaction.update(roomRef, { chat: nextChat });
  });
}

export function subscribeToChat(
  roomId: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
) {
  if (!roomId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    doc(db, ROOMS_COLLECTION, roomId),
    (snap) => {
      if (!snap.exists()) {
        callback([]);
        return;
      }

      callback(normalizeChat(snap.data()?.chat));
    },
    (error) => {
      onError?.(error);
    }
  );
}
