import React from 'react';
import { LayoutDashboard, Package, Receipt, LogOut, Shield, Settings, ShoppingCart, Users, History } from 'lucide-react';
import { motion } from 'motion/react';
import { View } from '../types';
import { User } from 'firebase/auth';
import { useSettings } from '../hooks/useSettings';

interface LayoutProps {
  children: React.ReactNode;
  activeView: View;
  onViewChange: (view: View) => void;
  onLogout: () => void;
  user: User;
  isAdmin?: boolean;
}

export default function Layout({ children, activeView, onViewChange, onLogout, user, isAdmin }: LayoutProps) {
  const { settings, t, isRTL } = useSettings();
  const menuItems = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'inventory', label: t('inventory'), icon: Package },
    { id: 'debts', label: t('debts'), icon: Receipt },
    { id: 'pos', label: t('pos'), icon: ShoppingCart },
    { id: 'suppliers', label: t('suppliers'), icon: Users },
    { id: 'stock-history', label: t('stockHistory'), icon: History },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  if (isAdmin) {
    menuItems.push({ id: 'admin-dashboard', label: t('adminTerminal'), icon: Shield });
  }

  return (
    <div className={`flex h-screen bg-slate-950 text-slate-100 font-sans technical-grid ${isRTL ? 'flex-row-reverse text-right' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <aside className={`w-64 border-slate-800 bg-slate-900/50 backdrop-blur-sm flex flex-col ${isRTL ? 'border-l' : 'border-r'}`}>
        <div className="p-8">
          <h1 className={`text-xl font-bold tracking-tight text-white flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <span className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-sm shadow-[0_0_15px_rgba(37,99,235,0.4)]">
              {settings.storeName.charAt(0)}
            </span>
            {settings.storeName}
          </h1>
          <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest font-mono">{t('missionControl')}</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id as View)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isRTL ? 'flex-row-reverse text-right' : ''} ${
                  isActive 
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className="font-medium text-sm">{item.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className={`${isRTL ? 'mr-auto' : 'ml-auto'} w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]`}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 space-y-4">
          <div className={`bg-slate-950/50 border border-slate-800 p-3 rounded-xl flex items-center gap-3 ${isRTL ? 'flex-row-reverse text-right' : ''}`}>
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full border border-slate-700" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                {user.displayName?.charAt(0) || 'U'}
              </div>
            )}
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.displayName || 'Member'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          
          <button 
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors border border-transparent hover:border-red-500/20 ${isRTL ? 'flex-row-reverse text-right' : ''}`}
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">{t('signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
