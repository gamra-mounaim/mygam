import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// We try to import the config. If it doesn't exist yet, we'll handle it gracefully.
let firebaseConfig: any = null;
try {
  // @ts-ignore
  firebaseConfig = await import('../firebase-applet-config.json').then(m => m.default);
} catch (e) {
  console.warn("Firebase configuration not found. Please set up Firebase in the AI Studio settings.");
}

const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app, firebaseConfig?.firestoreDatabaseId) : null;

export const isFirebaseReady = !!app;
