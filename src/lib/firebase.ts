import { initializeApp } from 'firebase/app';
import { 
  initializeAuth,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  initializeFirestore, 
  getFirestore,
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Auth with cross-origin friendly resolvers
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
});

// Use initializeFirestore to enable forceLongPolling for better stability in iframe environments
let firestoreDb;
try {
  const settings = {
    experimentalForceLongPolling: true,
  };
  
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
    firestoreDb = initializeFirestore(app, settings, firebaseConfig.firestoreDatabaseId);
  } else {
    firestoreDb = initializeFirestore(app, settings);
  }
} catch (e) {
  console.warn("Firestore initialization failed, falling back to default.", e);
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;

// Helper for hashing passwords (SHA-256)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Test Connection Helper
export async function verifyFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'system', 'ping'));
    return true;
  } catch (error: any) {
    if (!error.message?.includes('offline')) {
      console.warn("Firestore connection check failed.", error);
    }
    return false;
  }
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export function handleFirestoreError(error: any, operation: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  const user = auth.currentUser;
  const errorInfo: FirestoreErrorInfo = {
    error: error.message || String(error),
    operationType: operation,
    path: path,
    authInfo: {
      userId: user?.uid || 'unauthenticated',
      email: user?.email || '',
      emailVerified: user?.emailVerified || false,
      isAnonymous: user?.isAnonymous || false,
      providerInfo: user?.providerData.map(p => ({
        providerId: p.providerId,
        displayName: p.displayName || '',
        email: p.email || ''
      })) || []
    }
  };
  throw new Error(JSON.stringify(errorInfo));
}
