
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || '(default)');
export const auth = getAuth(app);

let authInitPromise: Promise<void> | null = null;

function getFirebaseAuthErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}

function canContinueWithoutAnonymousAuth(error: unknown): boolean {
  const code = getFirebaseAuthErrorCode(error);
  return code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed';
}

export function ensureAnonymousSession(): Promise<void> {
  if (auth.currentUser) {
    return Promise.resolve();
  }

  if (!authInitPromise) {
    authInitPromise = signInAnonymously(auth)
      .then(() => undefined)
      .catch((error) => {
        if (canContinueWithoutAnonymousAuth(error)) {
          console.warn('Anonymous Firebase Auth is unavailable; continuing with local player ids.', error);
          return;
        }

        authInitPromise = null;
        throw error;
      });
  }

  return authInitPromise;
}
