import React, { useState, useEffect } from 'react';
import { db, auth, isFirebaseReady } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Wallet, Search, Trash2, Edit2, Plus, User, DollarSign, Save, X, ArrowUpRight, Calendar, FileText, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Debt } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { logActivity } from '../lib/logger';
import { useSettings } from '../hooks/useSettings';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function Debts() {
  const { settings, t, isRTL } = useSettings();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [customer, setCustomer] = useState('');
  const [amount, setAmount] = useState('');
  const [debtDate, setDebtDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [installmentDate, setInstallmentDate] = useState('');

  useEffect(() => {
    if (!isFirebaseReady || !auth?.currentUser) {
      setLoading(false);
      return;
    }

    const path = 'debts';
    const q = query(collection(db!, path), orderBy('customer', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Debt[];
      setDebts(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !amount) return;

    const path = 'debts';
    const debtData = {
      customer,
      amount: parseFloat(amount),
      debtDate,
      dueDate,
      installmentDate,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db!, path, editingId), debtData);
        await logActivity(`Updated debt for: ${customer}`, 'debt');
        setEditingId(null);
      } else {
        await addDoc(collection(db!, path), debtData);
        await logActivity(`Recorded new debt for: ${customer}`, 'debt');
      }
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const resetForm = () => {
    setCustomer('');
    setAmount('');
    setDebtDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setInstallmentDate('');
    setEditingId(null);
  };

  const handleEdit = (debt: Debt) => {
    setCustomer(debt.customer);
    setAmount(debt.amount.toString());
    setDebtDate(debt.debtDate || new Date().toISOString().split('T')[0]);
    setDueDate(debt.dueDate || '');
    setInstallmentDate(debt.installmentDate || '');
    setEditingId(debt.id || null);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    const debt = debts.find(d => d.id === id);
    if (confirm(`${t('deleteDebt')} ${debt?.customer || ''}?`)) {
      const path = 'debts';
      try {
        await deleteDoc(doc(db!, path, id));
        if (debt) {
          await logActivity(`Deleted debt record for: ${debt.customer}`, 'debt');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const filteredDebts = debts.filter(d => 
    d.customer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDebt = debts.reduce((acc, d) => acc + d.amount, 0);

  const generatePDF = async (debt: Debt) => {
    const element = document.getElementById(`invoice-${debt.id}`);
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#0f172a',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`invoice-${debt.customer}-${new Date().toLocaleDateString()}.pdf`);
      await logActivity(`Generated invoice for: ${debt.customer}`, 'debt');
    } catch (error) {
      console.error('PDF generation failed:', error);
    }
  };

  return (
    <div className={`space-y-8 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">{t('debts')}</h2>
          <p className="text-slate-400">{t('trackDebtsDesc')}</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
        >
          <Plus className="w-5 h-5" />
          <span className="font-semibold">{t('registerNewDebt')}</span>
        </button>
      </header>

      <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <Wallet className="w-8 h-8" />
        </div>
        <div>
          <p className="text-sm text-slate-500 uppercase tracking-widest font-mono">{t('totalOutstandingDebt')}</p>
          <p className="text-3xl font-bold text-amber-400 font-mono">{settings.currency}{totalDebt.toLocaleString()}</p>
        </div>
      </div>

      <div className="relative">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
        <input
          type="text"
          placeholder={t('searchDebts')}
          className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-4 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className={`w-full border-collapse ${isRTL ? 'text-right' : 'text-left'}`}>
          <thead>
            <tr className="bg-slate-950/50 border-bottom border-slate-800">
              <th className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest font-mono ${isRTL ? 'text-right' : 'text-left'}`}>{t('customer')}</th>
              <th className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest font-mono ${isRTL ? 'text-right' : 'text-left'}`}>{t('amountOwed')}</th>
              <th className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest font-mono ${isRTL ? 'text-right' : 'text-left'}`}>{t('debtDate')}</th>
              <th className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest font-mono ${isRTL ? 'text-right' : 'text-left'}`}>{t('installmentDate')}</th>
              <th className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest font-mono ${isRTL ? 'text-right' : 'text-left'}`}>{t('dueDate')}</th>
              <th className={`px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest font-mono ${isRTL ? 'text-left' : 'text-right'}`}>{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            <AnimatePresence mode="popLayout">
              {filteredDebts.map((debt) => (
                <motion.tr
                  layout
                  key={debt.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  <td className="px-6 py-5">
                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-slate-200">{debt.customer}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-amber-400 font-mono font-bold">{settings.currency}{debt.amount.toLocaleString()}</span>
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-300 font-mono">
                    {debt.debtDate || t('na')}
                  </td>
                  <td className="px-6 py-5 text-sm font-mono">
                    {debt.installmentDate ? (
                      <span className="text-blue-400 font-medium">{debt.installmentDate}</span>
                    ) : (
                      <span className="text-slate-500">{t('na')}</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-sm font-mono">
                    {debt.dueDate ? (
                      <span className={new Date(debt.dueDate) < new Date() ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                        {debt.dueDate}
                      </span>
                    ) : (
                      <span className="text-slate-500">{t('na')}</span>
                    )}
                  </td>
                  <td className={`px-6 py-5 ${isRTL ? 'text-left' : 'text-right'}`}>
                    <div className={`flex gap-2 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                      <button 
                        onClick={() => generatePDF(debt)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-emerald-600/20 hover:text-emerald-400 transition-colors"
                        title={t('generateInvoice')}
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                       <button 
                        onClick={() => handleEdit(debt)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-blue-600/20 hover:text-blue-400 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => debt.id && handleDelete(debt.id)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        
        {!loading && filteredDebts.length === 0 && (
          <div className="p-20 flex flex-col items-center justify-center text-center">
            <Wallet className="w-12 h-12 text-slate-800 mb-4" />
            <p className="text-slate-500">{t('noDebtRecordsFound')}</p>
          </div>
        )}
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
            <div className={`flex justify-between items-center mb-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-2xl font-bold text-white tracking-tight">{editingId ? t('updateDebt') : t('newDebtRecord')}</h3>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-2 rounded-full hover:bg-slate-800 transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('customerName')}</label>
                <div className="relative">
                  <User className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
                  <input
                    autoFocus
                    required
                    type="text"
                    placeholder={t('johnDoe')}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('amountOwed')} ({settings.currency})</label>
                <div className="relative">
                  <DollarSign className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
                  <input
                    required
                    type="number"
                    placeholder="0.00"
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('debtDate')}</label>
                  <div className="relative">
                    <Calendar className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
                    <input
                      required
                      type="date"
                      className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
                      value={debtDate}
                      onChange={(e) => setDebtDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('dueDate')}</label>
                  <div className="relative">
                    <Calendar className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
                    <input
                      type="date"
                      className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('installmentDate')}</label>
                <div className="relative">
                  <Calendar className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
                  <input
                    type="date"
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
                    value={installmentDate}
                    onChange={(e) => setInstallmentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className={`pt-4 flex gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-6 py-4 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-750 transition-colors font-semibold"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all font-semibold shadow-lg flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingId ? t('updateRecord') : t('recordDebt')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Hidden Invoice Templates for Export */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none">
        {debts.map(debt => (
          <div 
            key={debt.id} 
            id={`invoice-${debt.id}`}
            className="w-[800px] p-12 bg-slate-950 text-white font-sans"
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="flex justify-between items-start mb-12 border-b border-slate-800 pb-8">
              <div>
                <h1 className="text-4xl font-bold text-blue-500 mb-2">{settings.storeName}</h1>
                <p className="text-slate-400 font-mono tracking-widest text-sm uppercase">{t('invoice')}</p>
              </div>
              <div className="text-right">
                <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold ml-auto">EP</div>
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-12 mb-12 ${isRTL ? 'text-right' : 'text-left'}`}>
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 font-mono">{t('billTo')}</h4>
                <div className="space-y-1">
                  <p className="text-xl font-bold text-white">{debt.customer}</p>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 font-mono">{t('information')}</h4>
                <div className="space-y-1 text-slate-300">
                  <p className="flex justify-between border-b border-slate-800/50 py-1">
                    <span className="text-slate-500">{t('date')}:</span>
                    <span className="font-mono">{new Date().toLocaleDateString()}</span>
                  </p>
                  <p className="flex justify-between border-b border-slate-800/50 py-1">
                    <span className="text-slate-500">{t('debtDate')}:</span>
                    <span className="font-mono">{debt.debtDate || t('na')}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-8 mb-12 border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs font-mono uppercase tracking-widest">
                    <th className={`pb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('description')}</th>
                    <th className={`pb-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('total')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-white text-lg">
                    <td className={`pt-6 pb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('outstandingDebt')}</td>
                    <td className={`pt-6 pb-2 font-mono font-bold ${isRTL ? 'text-left' : 'text-right'}`}>
                      {settings.currency}{debt.amount.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-8 border-t border-slate-800">
              <div className="w-64 space-y-2">
                <div className="flex justify-between items-center text-2xl font-bold text-white">
                  <span>{t('total')}:</span>
                  <span className="text-blue-500 font-mono italic underline">{settings.currency}{debt.amount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-24 text-center text-slate-500 text-[10px] uppercase font-mono tracking-[0.3em]">
              *** {settings.storeName} - {t('secureEntry')} ***
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
