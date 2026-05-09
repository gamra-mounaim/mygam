import React, { useState, useEffect } from 'react';
import { db, isFirebaseReady } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { ShieldAlert, Users, History, ArrowUpRight, ArrowDownRight, Activity, Package, Wallet, Download, Calendar, FileJson, FileSpreadsheet, LogOut, Trash2, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Debt, Profile } from '../types';
import { logActivity } from '../lib/logger';
import { useSettings } from '../hooks/useSettings';

export default function AdminDashboard() {
  const { settings, t, isRTL } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState({
    totalInventoryValue: 0,
    totalDebt: 0,
    productCount: 0,
    debtorCount: 0
  });
  const [loading, setLoading] = useState(true);

  // View States
  const [activeQuickOp, setActiveQuickOp] = useState<'users' | 'backup' | null>(null);

  // Export State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');

  useEffect(() => {
    if (!isFirebaseReady) return;

    // Fetch Inventory Stats
    const unsubProducts = onSnapshot(collection(db!, 'products'), (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Product);
      setProducts(prods);
      const value = prods.reduce((acc, p) => acc + (p.qty * p.cost), 0);
      setStats(prev => ({
        ...prev,
        totalInventoryValue: value,
        productCount: prods.length
      }));
    });

    // Fetch Debt Stats
    const unsubDebts = onSnapshot(collection(db!, 'debts'), (snapshot) => {
      const debtList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Debt);
      setDebts(debtList);
      const total = debtList.reduce((acc, d) => acc + d.amount, 0);
      setStats(prev => ({
        ...prev,
        totalDebt: total,
        debtorCount: debtList.length
      }));
    });

    // Fetch Recent Logs
    const logsQuery = query(collection(db!, 'system_logs'), orderBy('timestamp', 'desc'), limit(10));
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(logData);
    });

    // Fetch Profiles
    const unsubProfiles = onSnapshot(collection(db!, 'users'), (snapshot) => {
      const profileData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Profile);
      setProfiles(profileData);
      setLoading(false);
    });

    return () => {
      unsubProducts();
      unsubDebts();
      unsubLogs();
      unsubProfiles();
    };
  }, []);

  const handleExport = (type: 'inventory' | 'debts') => {
    const dataToExport = type === 'inventory' ? products : debts;
    const dateField = type === 'inventory' ? 'createdAt' : 'updatedAt';

    // Filter by date range if specified
    const filteredData = dataToExport.filter(item => {
      const itemDate = (item as any)[dateField];
      if (!itemDate) return true;
      const date = new Date(itemDate);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (start && date < start) return false;
      if (end) {
        // Set end to end of day
        const endDay = new Date(end);
        endDay.setHours(23, 59, 59, 999);
        if (date > endDay) return false;
      }
      return true;
    });

    const filename = `elecpro_${type}_export_${new Date().toISOString().split('T')[0]}.${exportFormat}`;

    if (exportFormat === 'json') {
      const blob = new Blob([JSON.stringify(filteredData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV Export
      if (filteredData.length === 0) {
        alert("No data found for the selected range.");
        return;
      }
      const headers = Object.keys(filteredData[0]).filter(k => k !== 'id').join(',');
      const rows = filteredData.map(obj => 
        Object.entries(obj)
          .filter(([k]) => k !== 'id')
          .map(([, v]) => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v)
          .join(',')
      ).join('\n');
      const csvContent = headers + '\n' + rows;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleBackup = async () => {
    const fullData = {
      inventory: products,
      debts: debts,
      timestamp: new Date().toISOString(),
      version: "1.0"
    };
    
    const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `elecpro_full_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    await logActivity('Full system backup generated', 'system');
    alert("System backup generated and downloaded successfully.");
    setActiveQuickOp(null);
  };

  const toggleUserRole = async (profile: Profile) => {
    if (profile.email === 'gamragb@gmail.com') {
      alert("Cannot change the primary administrador's role.");
      return;
    }

    const newRole = profile.role === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(doc(db!, 'users', profile.id), { role: newRole });
      await logActivity(`Changed role for ${profile.email} to ${newRole}`, 'auth');
    } catch (error) {
      console.error("Failed to update role:", error);
      alert("Permission denied or system error.");
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'inventory': return Package;
      case 'debt': return Wallet;
      case 'auth': return Users;
      default: return Activity;
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'inventory': return 'text-blue-400';
      case 'debt': return 'text-amber-400';
      case 'auth': return 'text-emerald-400';
      default: return 'text-purple-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const adminStats = [
    { label: t('assetValue'), value: `${settings.currency}${stats.totalInventoryValue.toLocaleString()}`, icon: Package, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: t('outstandingDebt'), value: `${settings.currency}${stats.totalDebt.toLocaleString()}`, icon: Wallet, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: t('registeredPersonnel'), value: profiles.length.toString(), icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: t('systemUptime'), value: '99.9%', icon: Activity, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`space-y-8 font-sans pb-20 ${isRTL ? 'text-right' : 'text-left'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className={`flex items-end justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">{t('adminTerminal')}</h2>
          <p className="text-slate-500 mt-1 uppercase tracking-[0.2em] text-[10px] font-mono">{t('restrictedCommandCenter')}</p>
        </div>
        <div className={`px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <ShieldAlert className="w-3 h-3 text-red-500" />
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">{t('levelClearance')}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {adminStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className={`p-6 bg-slate-900/50 border border-slate-800 rounded-3xl group hover:border-slate-700 transition-all ${isRTL ? 'text-right' : 'text-left'}`}
          >
            <div className={`w-12 h-12 ${stat.bg} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${isRTL ? 'mr-0 ml-auto' : ''}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-bold text-white mt-1 font-mono">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Data Export Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl h-full">
            <h3 className={`text-lg font-bold text-white mb-6 flex items-center gap-2 font-sans tracking-tight ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Download className="w-5 h-5 text-blue-500" />
              {t('intelligenceExport')}
            </h3>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <label className={`text-[10px] uppercase tracking-widest text-slate-500 font-mono flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                   <Calendar className="w-3 h-3" /> {t('dateRangeFilter')}
                </label>
                <div className={`grid grid-cols-2 gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">{t('formatConfiguration')}</label>
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <button 
                    onClick={() => setExportFormat('csv')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold transition-all ${
                      exportFormat === 'csv' 
                      ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" /> CSV
                  </button>
                  <button 
                    onClick={() => setExportFormat('json')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold transition-all ${
                      exportFormat === 'json' 
                      ? 'bg-blue-600/10 border-blue-500 text-blue-400' 
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                    }`}
                  >
                    <FileJson className="w-4 h-4" /> JSON
                  </button>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button 
                  onClick={() => handleExport('inventory')}
                  className={`w-full group relative overflow-hidden flex items-center justify-between p-4 bg-blue-600 text-white rounded-2xl font-bold transition-all hover:bg-blue-500 active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.3)] ${isRTL ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Package className="w-5 h-5" />
                    <span className="text-sm">{t('exportInventory')}</span>
                  </div>
                  <Download className={`w-4 h-4 transition-transform ${isRTL ? '-translate-y-0.5' : 'group-hover:translate-y-0.5'}`} />
                </button>

                <button 
                  onClick={() => handleExport('debts')}
                  className={`w-full group relative overflow-hidden flex items-center justify-between p-4 bg-slate-100 text-slate-950 rounded-2xl font-bold transition-all hover:bg-white active:scale-95 shadow-xl ${isRTL ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Wallet className="w-5 h-5" />
                    <span className="text-sm">{t('exportDebtData')}</span>
                  </div>
                  <Download className={`w-4 h-4 transition-transform ${isRTL ? '-translate-y-0.5' : 'group-hover:translate-y-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log & Quick Operations */}
        <div className="lg:col-span-2 space-y-8">
          <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl">
             <h3 className="text-lg font-bold text-white mb-6">{t('securityTerminalLogs')}</h3>
             <div className="space-y-4">
                {logs.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">{t('noRecentActivity')}</p>
                ) : (
                  logs.map((log) => {
                    const Icon = getLogIcon(log.type);
                    const color = getLogColor(log.type);
                    return (
                      <div key={log.id} className={`flex items-center justify-between p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800">
                            <Icon className={`w-5 h-5 ${color}`} />
                          </div>
                          <div className={isRTL ? 'text-right' : 'text-left'}>
                            <p className="text-sm font-bold text-white">{log.action}</p>
                            <p className="text-xs text-slate-500">{t('node')}: {log.user.split('@')[0]}</p>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-slate-600">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
             </div>
          </div>
          
          <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl">
            <h3 className={`text-lg font-bold text-white mb-6 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <History className="w-5 h-5 text-blue-500" />
              {t('quickOps')}
            </h3>
            <div className={`grid grid-cols-2 gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button 
                onClick={() => setActiveQuickOp('users')}
                className={`flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:border-blue-500/50 transition-all text-xs group ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <span className="text-slate-300">{t('userAccess')}</span>
                <Users className={`w-3 h-3 text-slate-500 group-hover:text-blue-500 ${isRTL ? 'rotate-180' : ''}`} />
              </button>
              <button 
                onClick={() => setActiveQuickOp('backup')}
                className={`flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:border-blue-500/50 transition-all text-xs group ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <span className="text-slate-300">{t('cloudSyncBackup')}</span>
                <Download className="w-3 h-3 text-slate-500 group-hover:text-blue-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeQuickOp === 'users' && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[60] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className={`p-8 border-b border-slate-800 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className={isRTL ? 'text-right' : 'text-left'}>
                  <h3 className="text-2xl font-bold text-white tracking-tight">{t('personnelAuthorization')}</h3>
                  <p className="text-slate-500 text-xs font-mono uppercase mt-1 tracking-widest">{t('databaseAcl')}</p>
                </div>
                <button 
                  onClick={() => setActiveQuickOp(null)}
                  className="p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto space-y-3">
                {profiles.map((profile) => (
                  <div key={profile.id} className={`group p-4 bg-slate-950/50 border border-slate-800/50 rounded-2xl flex items-center justify-between transition-all hover:border-slate-700 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${
                        profile.role === 'admin' ? 'bg-blue-600/10 border-blue-500/30 text-blue-500' : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}>
                        <Users className="w-6 h-6" />
                      </div>
                      <div className={isRTL ? 'text-right' : 'text-left'}>
                        <p className="font-bold text-white text-sm">{profile.displayName || profile.email.split('@')[0]}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{profile.email}</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        profile.role === 'admin' ? 'bg-blue-600/20 text-blue-400' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {profile.role === 'admin' ? t('admin') : t('user')}
                      </div>
                      <button 
                        onClick={() => toggleUserRole(profile)}
                        className={`p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-all flex items-center gap-2 text-xs font-bold ${isRTL ? 'flex-row-reverse' : ''}`}
                      >
                        {profile.role === 'admin' ? t('demote') : t('promote')}
                        <ChevronRight className={`w-3 h-3 ${isRTL ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {activeQuickOp === 'backup' && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[60] flex items-center justify-center p-6 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 space-y-8"
            >
              <div className="w-20 h-20 bg-blue-600/10 border border-blue-500/20 rounded-3xl mx-auto flex items-center justify-center">
                <ShieldAlert className="w-10 h-10 text-blue-500" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{t('systemSnapshot')}</h3>
                <p className="text-slate-400 mt-2 text-sm">{t('systemSnapshotDesc')}</p>
              </div>
              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={handleBackup}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/40 flex items-center justify-center gap-3"
                >
                  <Download className="w-5 h-5" />
                  {t('initiateFullBackup')}
                </button>
                <button 
                  onClick={() => setActiveQuickOp(null)}
                  className="w-full py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-750 transition-colors"
                >
                  {t('abortSystemAction')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
