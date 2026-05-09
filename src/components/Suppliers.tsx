import React, { useState, useEffect } from 'react';
import { db, auth, isFirebaseReady } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Plus, Search, Trash2, Edit2, Users, Phone, MapPin, User, Save, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Supplier } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { logActivity } from '../lib/logger';
import { useSettings } from '../hooks/useSettings';

export default function Suppliers() {
  const { t, isRTL } = useSettings();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!isFirebaseReady || !auth?.currentUser) {
      setLoading(false);
      return;
    }

    const path = 'suppliers';
    const q = query(collection(db!, path), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Supplier[];
      setSuppliers(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const path = 'suppliers';
    const supplierData = { name, contact, phone, address };

    try {
      if (editingId) {
        await updateDoc(doc(db!, path, editingId), supplierData);
        await logActivity(`Updated supplier: ${name}`, 'system');
      } else {
        await addDoc(collection(db!, path), supplierData);
        await logActivity(`Added supplier: ${name}`, 'system');
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const resetForm = () => {
    setName('');
    setContact('');
    setPhone('');
    setAddress('');
    setEditingId(null);
  };

  const handleEdit = (s: Supplier) => {
    setName(s.name);
    setContact(s.contact || '');
    setPhone(s.phone || '');
    setAddress(s.address || '');
    setEditingId(s.id || null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const supplier = suppliers.find(s => s.id === id);
    if (confirm(t('confirmDeleteSupplier').replace('{name}', supplier?.name || ''))) {
      const path = 'suppliers';
      try {
        await deleteDoc(doc(db!, path, id));
        if (supplier) await logActivity(`Deleted supplier: ${supplier.name}`, 'system');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const filtered = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contact?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return null;

  return (
    <div className={`space-y-8 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">{t('suppliers')}</h2>
          <p className="text-slate-400">Manage your wholesale partners and contacts.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all font-semibold"
        >
          <Plus className="w-5 h-5" />
          {t('addSupplier')}
        </button>
      </header>

      <div className="relative">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
        <input
          type="text"
          placeholder="Search suppliers..."
          className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filtered.map((s) => (
            <motion.div
              layout
              key={s.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-blue-500/30 transition-all"
            >
              <div className="flex justify-between items-start">
                <div className="bg-blue-600/10 p-3 rounded-xl text-blue-500">
                  <Users className="w-6 h-6" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(s)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => s.id && handleDelete(s.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">{s.name}</h3>
                {s.contact && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                    <User className="w-3 h-3" />
                    <span>{s.contact}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-2">
                {s.phone && (
                  <div className="flex items-center gap-3 text-slate-500 text-sm">
                    <Phone className="w-4 h-4" />
                    <span className="font-mono">{s.phone}</span>
                  </div>
                )}
                {s.address && (
                  <div className="flex items-center gap-3 text-slate-500 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>{s.address}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-20 opacity-50">
          <Users className="w-16 h-16 mx-auto mb-4" />
          <p>{t('noSuppliersFound')}</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold text-white">{editingId ? t('editSupplier') : t('addSupplier')}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">Supplier Name</label>
                <input required type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">Contact Person</label>
                <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">Phone Number</label>
                <input type="text" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">Address</label>
                <textarea rows={2} className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-blue-500/20 outline-none resize-none" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-xl font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"><Save className="w-5 h-5" /> {t('saveChanges')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
