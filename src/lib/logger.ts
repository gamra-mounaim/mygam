import { db, auth } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

export type LogType = 'inventory' | 'debt' | 'auth' | 'system';

export async function logActivity(action: string, type: LogType) {
  if (!db || !auth?.currentUser) return;

  try {
    await addDoc(collection(db, 'system_logs'), {
      action,
      type,
      user: auth.currentUser.email,
      userId: auth.currentUser.uid,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
