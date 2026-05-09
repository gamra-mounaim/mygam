import React, { useState, useEffect } from 'react';
import { db, auth, isFirebaseReady } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { History, ArrowUpCircle, ArrowDownCircle, Info, User, Package, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StockMovement } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { useSettings } from '../hooks/useSettings';
import { format } from 'date-fns';

export default function StockHistory() {
  const { t, isRTL } = useSettings();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseReady || !auth?.currentUser) {
      setLoading(false);
      return;
    }

    const path = 'stock_movements';
    const q = query(
      collection(db!, path), 
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StockMovement[];
      setMovements(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header>
        <h2 className="text-3xl font-bold text-white tracking-tight">{t('stockHistory')}</h2>
        <p className="text-slate-400">Chronological log of all inventory changes and sales.</p>
      </header>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono">
            <thead className="bg-slate-950/50 border-b border-slate-800">
              <tr className={isRTL ? 'text-right' : 'text-left'}>
                <th className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{t('movementType')}</th>
                <th className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{t('productName')}</th>
                <th className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{t('quantityChange')}</th>
                <th className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{t('reason')}</th>
                <th className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">{t('actor')}</th>
                <th className="px-6 py-4 text-[10px] text-slate-500 uppercase tracking-widest">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              <AnimatePresence mode="popLayout">
                {movements.map((m) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={m.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        {m.type === 'in' ? (
                          <div className="bg-emerald-500/10 text-emerald-500 p-1.5 rounded-lg"><ArrowUpCircle className="w-4 h-4" /></div>
                        ) : m.type === 'out' || m.type === 'sale' ? (
                          <div className="bg-red-500/10 text-red-500 p-1.5 rounded-lg"><ArrowDownCircle className="w-4 h-4" /></div>
                        ) : (
                          <div className="bg-blue-500/10 text-blue-500 p-1.5 rounded-lg"><Info className="w-4 h-4" /></div>
                        )}
                        <span className="text-xs font-bold uppercase">{t(m.type) || m.type}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-white font-sans font-bold text-sm">
                        <Package className="w-3 h-3 text-slate-500" />
                        {m.productName}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-bold ${m.type === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {m.type === 'in' ? '+' : '-'}{m.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {m.reason || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <User className="w-3 h-3" />
                        {m.actor?.split('@')[0]}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-[10px] text-slate-500">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(new Date(m.timestamp), 'yyyy-MM-dd')}</div>
                        <span>{format(new Date(m.timestamp), 'HH:mm')}</span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {movements.length === 0 && (
          <div className="py-20 text-center text-slate-600 flex flex-col items-center">
            <History className="w-12 h-12 mb-4 opacity-20" />
            <p>No stock movements recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
