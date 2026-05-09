import React, { useState, useEffect } from 'react';
import { TrendingUp, Package, Users, Wallet, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../hooks/useSettings';
import { db, auth, isFirebaseReady } from '../firebase';
import { collection, onSnapshot, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { Product, Debt, Supplier, Sale } from '../types';
import { predictSales, PredictionResult } from '../services/aiService';
import { Brain, Sparkles, CheckCircle2 } from 'lucide-react';
import { logActivity } from '../lib/logger';

export default function Dashboard() {
  const { t, isRTL, settings } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    if (!isFirebaseReady || !auth?.currentUser) {
      setLoading(false);
      return;
    }

    const unsubProducts = onSnapshot(collection(db!, 'products'), (s) => {
      setProducts(s.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
    });

    const unsubDebts = onSnapshot(collection(db!, 'debts'), (s) => {
      setDebts(s.docs.map(d => ({ id: d.id, ...d.data() })) as Debt[]);
    });

    const unsubSuppliers = onSnapshot(collection(db!, 'suppliers'), (s) => {
      setSuppliers(s.docs.map(d => ({ id: d.id, ...d.data() })) as Supplier[]);
    });

    const salesQuery = query(collection(db!, 'sales'), orderBy('timestamp', 'desc'), limit(50));
    const unsubSales = onSnapshot(salesQuery, (s) => {
      setSales(s.docs.map(d => ({ id: d.id, ...d.data() })) as Sale[]);
    });

    setLoading(false);
    return () => {
      unsubProducts();
      unsubDebts();
      unsubSuppliers();
      unsubSales();
    };
  }, []);

  const handlePredict = async () => {
    setPredicting(true);
    try {
      const result = await predictSales(products, sales, settings);
      setPrediction(result);
      await logActivity('Generated AI Sales Forecast', 'system');
    } catch (error) {
      console.error(error);
    } finally {
      setPredicting(false);
    }
  };

  const totalInventoryValue = products.reduce((acc, p) => acc + (p.cost * p.qty), 0);
  const totalExpectedProfit = products.reduce((acc, p) => acc + ((p.sell - p.cost) * p.qty), 0);
  const totalDebt = debts.reduce((acc, d) => acc + d.amount, 0);
  const lowStockProducts = products.filter(p => p.qty <= settings.lowStockThreshold);

  const getUpcomingDebts = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    return debts.filter(d => {
      if (!d.dueDate) return false;
      const dueDate = new Date(d.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate <= threeDaysFromNow;
    }).sort((a, b) => new Date(a.dueDate || '').getTime() - new Date(b.dueDate || '').getTime());
  };

  const upcomingDebts = getUpcomingDebts();

  const stats = [
    { label: t('inventoryValue'), value: totalInventoryValue.toLocaleString(), unit: settings.currency, icon: Package, color: 'text-blue-400' },
    { label: t('expectedProfit'), value: totalExpectedProfit.toLocaleString(), unit: settings.currency, icon: TrendingUp, color: 'text-emerald-400' },
    { label: t('totalDebt'), value: totalDebt.toLocaleString(), unit: settings.currency, icon: Wallet, color: 'text-amber-400' },
    { label: t('customersWithDebt'), value: debts.length.toString(), unit: '', icon: Users, color: 'text-purple-400' },
  ];

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
        <h2 className="text-3xl font-bold text-white tracking-tight">{t('overview')}</h2>
        <p className="text-slate-400">{t('realTimeStatus')}</p>
      </header>

      {upcomingDebts.some(d => {
        const dDate = new Date(d.dueDate || '');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dDate.setHours(0, 0, 0, 0);
        return dDate <= today;
      }) && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-4 text-red-400"
        >
          <div className="bg-red-500/20 p-2 rounded-lg">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm tracking-wide uppercase">{t('overdue')} / {t('dueToday')}</h4>
            <p className="text-xs text-red-500/80 mt-0.5">
              {upcomingDebts.filter(d => {
                const dDate = new Date(d.dueDate || '');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                dDate.setHours(0, 0, 0, 0);
                return dDate <= today;
              }).length} {t('upcomingDebtPayments')}
            </p>
          </div>
          <button 
            onClick={() => window.location.hash = 'debts'} // Assuming routing uses hash or similar, but just a nudge
            className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-colors"
          >
            {t('view')}
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition-colors"
            >
              <div className={`flex items-start mb-4 ${isRTL ? 'justify-start' : 'justify-between'}`}>
                <div className={`p-3 rounded-xl bg-slate-950/50 border border-slate-800 ${stat.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
                <div className={`flex items-baseline gap-2 mt-1 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                  <span className="text-2xl font-bold text-white font-mono">{stat.value}</span>
                  <span className="text-xs font-mono text-slate-500 uppercase">{stat.unit}</span>
                </div>
              </div>
              <div className={`absolute -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity ${isRTL ? '-left-4' : '-right-4'}`}>
                <Icon className="w-24 h-24" />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Low Stock Alerts */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className={`flex items-center gap-2 mb-6 text-amber-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">{t('lowStockAlerts')}</h3>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {lowStockProducts.length > 0 ? (
              lowStockProducts.map((product) => (
                <div key={product.id} className={`flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-slate-800/50 hover:border-amber-500/30 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : 'text-left'}>
                    <p className="text-sm font-bold text-slate-200">{product.name}</p>
                    <p className="text-xs text-amber-500 font-bold uppercase tracking-tighter mt-1">
                      {t('onlyLeft').replace('{qty}', product.qty.toString())}
                    </p>
                  </div>
                  <div className="text-xs font-mono bg-slate-900 px-2 py-1 rounded text-slate-500 border border-slate-800">
                    ID: {product.barcode || product.id?.slice(0, 5)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-600 italic text-sm">
                No low stock alerts.
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Debts */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className={`flex items-center gap-2 mb-6 text-red-400 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Wallet className="w-5 h-5" />
            <h3 className="font-semibold">{t('upcomingDebtPayments')}</h3>
          </div>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {upcomingDebts.length > 0 ? (
              upcomingDebts.map((debt) => {
                const isOverdue = new Date(debt.dueDate || '') < new Date();
                const isToday = new Date(debt.dueDate || '').toDateString() === new Date().toDateString();
                
                return (
                  <div key={debt.id} className={`flex items-center justify-between p-4 rounded-xl bg-slate-950/50 border border-slate-800/50 hover:border-red-500/30 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className={isRTL ? 'text-right' : 'text-left'}>
                      <p className="text-sm font-bold text-slate-200">{debt.customer}</p>
                      <p className={`text-xs font-bold uppercase tracking-tighter mt-1 flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''} ${isOverdue ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-blue-500'}`}>
                        {isOverdue ? t('overdue') : isToday ? t('dueToday') : t('debtDueSoon')}
                        <span className="text-slate-500 font-normal">({debt.dueDate})</span>
                      </p>
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-400">
                      {settings.currency}{debt.amount.toLocaleString()}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-600 italic text-sm">
                {t('noUpcomingDebts')}
              </div>
            )}
          </div>
        </div>

        {/* AI Sales Prediction */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden flex flex-col">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 via-blue-600 to-emerald-600"></div>
          
          <div className={`flex justify-between items-start mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div>
              <div className={`flex items-center gap-2 text-purple-400 mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Brain className="w-5 h-5" />
                <h3 className="font-bold uppercase tracking-widest text-xs">{t('aiPrediction')}</h3>
              </div>
              <h4 className="text-xl font-bold text-white tracking-tight">{t('predictionTitle')}</h4>
            </div>
            {!prediction && !predicting && (
              <button 
                onClick={handlePredict}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-purple-900/20 active:scale-95 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {t('generateForecast')}
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {predicting ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-mono text-slate-500 animate-pulse">{t('analyzingData')}</p>
              </div>
            ) : prediction ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-2">{t('predictNextMonth')}</p>
                    <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                      <span className="text-4xl font-black text-white font-mono">{settings.currency}{prediction.nextMonthTotal.toLocaleString()}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${prediction.confidence * 100}%` }}
                          className="h-full bg-emerald-500"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 font-mono">{(prediction.confidence * 100).toFixed(0)}% {t('confidenceLevel')}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {t('aiRecommendations')}
                  </p>
                  <div className="space-y-3">
                    {prediction.recommendations.map((rec, i) => (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={i} 
                        className={`text-sm text-slate-300 p-3 rounded-xl bg-slate-950/30 border border-slate-800/50 flex gap-3 ${isRTL ? 'text-right flex-row-reverse' : ''}`}
                      >
                        <span className="text-purple-500 font-bold font-mono">0{i+1}.</span>
                        {rec}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                <p className="text-slate-500 text-sm max-w-xs mx-auto">{t('profitTrendsDesc')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
