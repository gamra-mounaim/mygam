import React, { useState, useEffect } from 'react';
import { db, isFirebaseReady, auth } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Settings as SettingsIcon, Store, DollarSign, AlertTriangle, Save, CheckCircle2, Languages } from 'lucide-react';
import { motion } from 'motion/react';
import { AppSettings } from '../types';
import { logActivity } from '../lib/logger';
import { useSettings } from '../hooks/useSettings';

interface SettingsProps {
  isAdmin: boolean;
}

export default function Settings({ isAdmin }: SettingsProps) {
  const { t, isRTL } = useSettings();
  const [settings, setSettings] = useState<AppSettings>({
    storeName: 'ElecPro Manager',
    currency: '$',
    lowStockThreshold: 5,
    language: 'ar',
    storeAddress: '',
    storePhone: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isFirebaseReady) return;

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    try {
      await setDoc(doc(db!, 'settings', 'app'), {
        ...settings,
        updatedBy: auth?.currentUser?.email
      });
      await logActivity('System settings updated', 'system');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save settings. Check permissions.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      dir={isRTL ? 'rtl' : 'ltr'}
      className="max-w-4xl space-y-8 font-sans"
    >
      <div className={isRTL ? 'text-right' : 'text-left'}>
        <h2 className="text-3xl font-bold text-white tracking-tight">{t('systemConfig')}</h2>
        <p className="text-slate-500 mt-1 uppercase tracking-[0.2em] text-[10px] font-mono">{t('globalParams')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <form onSubmit={handleSave} className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 space-y-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-2">
                  <Store className="w-3 h-3" /> {t('storeIdentity')}
                </label>
                <input 
                  disabled={!isAdmin}
                  type="text"
                  value={settings.storeName}
                  onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
                  placeholder="ElecPro Manager"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('storeLogoUrl')}</label>
                <input 
                  disabled={!isAdmin}
                  type="text"
                  value={settings.storeLogo || ''}
                  onChange={(e) => setSettings({ ...settings, storeLogo: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('address')}</label>
                  <input 
                    disabled={!isAdmin}
                    type="text"
                    value={settings.storeAddress || ''}
                    onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white hover:border-slate-700 transition-all outline-none"
                    placeholder="123 Street Name, City"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('phone')}</label>
                  <input 
                    disabled={!isAdmin}
                    type="text"
                    value={settings.storePhone || ''}
                    onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white hover:border-slate-700 transition-all outline-none"
                    placeholder="+212 6... / +33 6..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-2">
                    <DollarSign className="w-3 h-3" /> {t('currencyLocale')}
                  </label>
                  <input 
                    disabled={!isAdmin}
                    type="text"
                    value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 font-mono"
                    placeholder="$"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" /> {t('lowStockWarning')}
                  </label>
                  <input 
                    disabled={!isAdmin}
                    type="number"
                    value={settings.lowStockThreshold}
                    onChange={(e) => setSettings({ ...settings, lowStockThreshold: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50 font-mono"
                    placeholder="5"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-2">
                  <Languages className="w-3 h-3" /> {t('language')}
                </label>
                <select
                  disabled={!isAdmin}
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value as 'en' | 'ar' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"
                >
                  <option value="en">English</option>
                  <option value="ar">العربية (Arabic)</option>
                </select>
              </div>
            </div>

            {isAdmin && (
              <div className={`pt-6 border-t border-slate-800 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-blue-900/20"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {t('applyChanges')}
                </button>

                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 text-emerald-400 text-sm font-bold"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {t('settingsSynchronized')}
                  </motion.div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl">
            <h4 className={`text-sm font-bold text-white mb-4 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <SettingsIcon className="w-4 h-4 text-blue-500" /> {t('information')}
            </h4>
            <p className={`text-xs text-slate-500 leading-relaxed ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('settingsDesc')}
              {isAdmin ? t('adminOnlySettings') : t('readOnlySettings')}
            </p>
          </div>

          <div className="p-6 bg-blue-600/5 border border-blue-500/10 rounded-3xl">
            <p className={`text-[10px] text-blue-400 uppercase tracking-widest font-mono mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('primaryNode')}</p>
            <p className={`text-xs text-slate-300 font-mono truncate ${isRTL ? 'text-right' : 'text-left'}`}>{auth?.currentUser?.email}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
