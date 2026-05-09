import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { LogIn, ShieldCheck, Mail, Lock, User as UserIcon, AlertCircle, ArrowRight, Chrome } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../hooks/useSettings';

interface AuthProps {
  onSuccess: () => void;
}

export default function Auth({ onSuccess }: AuthProps) {
  const { t, isRTL } = useSettings();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await createProfileIfNew(result.user.uid, result.user.email!, result.user.displayName || '');
      onSuccess();
    } catch (err: any) {
      console.error("Google login failed:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await createProfileIfNew(result.user.uid, result.user.email!, result.user.displayName || '');
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
        await createProfileIfNew(result.user.uid, email, displayName, true);
      }
      onSuccess();
    } catch (err: any) {
      console.error("Email auth failed:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createProfileIfNew = async (uid: string, email: string, name: string, isNew: boolean = false) => {
    if (!db) return;
    const userDocRef = doc(db, 'users', uid);
    
    if (isNew) {
      const isPrimaryAdmin = email === 'gamragb@gmail.com';
      await setDoc(userDocRef, {
        email,
        displayName: name,
        role: isPrimaryAdmin ? 'admin' : 'user',
        createdAt: new Date().toISOString()
      });
    } else {
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        const isPrimaryAdmin = email === 'gamragb@gmail.com';
        await setDoc(userDocRef, {
          email,
          displayName: name,
          role: isPrimaryAdmin ? 'admin' : 'user',
          createdAt: new Date().toISOString()
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans" dir={isRTL ? 'rtl' : 'ltr'}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          {/* Abstract Bg */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -mr-16 -mt-16" />
          
          <div className="relative text-center mb-8">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center text-3xl font-black text-white mb-6 shadow-xl shadow-blue-900/40">
              EP
            </div>
            <h1 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase leading-none">ElecPro</h1>
            <p className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.3em] font-bold">{t('secureEntry')}</p>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-bold px-2">{t('userName')}</label>
                  <div className="relative">
                    <UserIcon className="absolute top-1/2 left-4 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-bold px-2">{t('email')}</label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-4 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="admin@elecpro.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-bold px-2">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute top-1/2 left-4 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-xs font-bold"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="line-clamp-2">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-blue-500 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? t('login') : t('register')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-4 bg-slate-900 text-slate-500 font-mono uppercase tracking-widest text-[10px]">OR CONTINUE WITH</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-slate-950 border border-slate-800 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95"
          >
            <Chrome className="w-5 h-5" />
            <span className="text-xs uppercase tracking-widest">Google Account</span>
          </button>

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-slate-400 text-xs font-bold hover:text-white transition-colors"
            >
              {mode === 'login' ? t('dontHaveAccount') : t('alreadyHaveAccount')}
              <span className="text-blue-400 ml-1 underline">{mode === 'login' ? t('register') : t('login')}</span>
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 justify-center text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
          <ShieldCheck className="w-4 h-4" />
          <span>{t('restrictedPersonnel')}</span>
        </div>
      </motion.div>
    </div>
  );
}
