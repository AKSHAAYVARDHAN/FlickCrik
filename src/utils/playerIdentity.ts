export const PLAYER_NAME_STORAGE_KEY = 'playerName';
export const LEGACY_PLAYER_NAME_STORAGE_KEY = 'handcrik_name';
export const PLAYER_ID_STORAGE_PREFIX = 'handcrik_player_';
export const PENDING_JOIN_NAME_PREFIX = 'handcrik_pending_join_';
export const ROOM_EXIT_NOTICE_STORAGE_KEY = 'handcrik_room_exit_notice';
export const PLAYER_NAME_MAX_LENGTH = 24;

export function sanitizePlayerName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, PLAYER_NAME_MAX_LENGTH);
}

export function isValidPlayerName(value: string | null | undefined): value is string {
  return sanitizePlayerName(value ?? '').length > 0;
}

export function getStoredPlayerName(): string {
  const rawValue =
    localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_PLAYER_NAME_STORAGE_KEY) ??
    '';

  return sanitizePlayerName(rawValue);
}

export function persistPlayerName(name: string): string {
  const nextName = sanitizePlayerName(name);
  localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextName);
  localStorage.setItem(LEGACY_PLAYER_NAME_STORAGE_KEY, nextName);
  return nextName;
}

export function getRoomPlayerStorageKey(roomId: string): string {
  return `${PLAYER_ID_STORAGE_PREFIX}${roomId}`;
}

export function getPendingJoinStorageKey(roomId: string): string {
  return `${PENDING_JOIN_NAME_PREFIX}${roomId}`;
}

export function getStoredRoomPlayerId(roomId: string): string | null {
  const storageKey = getRoomPlayerStorageKey(roomId);
  return sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey);
}

export function persistRoomPlayerId(roomId: string, playerId: string): void {
  const storageKey = getRoomPlayerStorageKey(roomId);
  sessionStorage.setItem(storageKey, playerId);
  localStorage.removeItem(storageKey);
}

export function clearRoomPlayerId(roomId: string): void {
  const storageKey = getRoomPlayerStorageKey(roomId);
  sessionStorage.removeItem(storageKey);
  localStorage.removeItem(storageKey);
}

export function clearPendingJoinStorageKey(roomId: string): void {
  sessionStorage.removeItem(getPendingJoinStorageKey(roomId));
}

export function setRoomExitNotice(message: string): void {
  sessionStorage.setItem(ROOM_EXIT_NOTICE_STORAGE_KEY, message.trim());
}

export function consumeRoomExitNotice(): string {
  const message = sessionStorage.getItem(ROOM_EXIT_NOTICE_STORAGE_KEY) ?? '';
  sessionStorage.removeItem(ROOM_EXIT_NOTICE_STORAGE_KEY);
  return message;
}
