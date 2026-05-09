import { useState, useEffect, useCallback } from 'react';
import { db, isFirebaseReady } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { AppSettings } from '../types';
import { translations, TranslationKey } from '../lib/translations';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    storeName: 'ElecPro Manager',
    currency: '$',
    lowStockThreshold: 5,
    language: 'ar'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseReady) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db!, 'settings', 'app'), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as AppSettings;
        setSettings({
           ...data,
           language: data.language || 'ar'
        });
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const t = useCallback((key: TranslationKey, params?: Record<string, any>) => {
    let text = translations[settings.language][key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  }, [settings.language]);

  return { settings, loadingSettings: loading, t, isRTL: settings.language === 'ar' };
}
