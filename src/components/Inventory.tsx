import React, { useState, useEffect } from 'react';
import { db, auth, isFirebaseReady } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Plus, Search, Trash2, Edit2, Package, Calculator, Save, X, ArrowUpCircle, ArrowDownCircle, History, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Supplier, StockMovement } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { logActivity } from '../lib/logger';
import { useSettings } from '../hooks/useSettings';

export default function Inventory() {
  const { settings, t, isRTL } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Stock Adjustment State
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState<'in' | 'out'>('in');
  const [adjReason, setAdjReason] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [sell, setSell] = useState('');
  const [purchaseMethod, setPurchaseMethod] = useState<'cash' | 'card'>('cash');
  const [supplierId, setSupplierId] = useState('');

  useEffect(() => {
    if (!isFirebaseReady || !auth?.currentUser) {
      setLoading(false);
      return;
    }

    const path = 'products';
    const q = query(collection(db!, path), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(prods);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    // Fetch Suppliers
    const suppliersUnsubscribe = onSnapshot(collection(db!, 'suppliers'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Supplier[];
      setSuppliers(data);
    });

    return () => {
      unsubscribe();
      suppliersUnsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !qty || !cost || !sell) return;

    const path = 'products';
    const productData = {
      name,
      barcode,
      qty: parseInt(qty),
      cost: parseFloat(cost),
      sell: parseFloat(sell),
      purchaseMethod,
      supplierId,
      updatedAt: new Date().toISOString()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db!, path, editingId), productData);
        await logActivity(`Updated product: ${name}`, 'inventory');
        setEditingId(null);
      } else {
        const docRef = await addDoc(collection(db!, path), {
          ...productData,
          createdAt: new Date().toISOString()
        });
        
        // Log movement
        if (productData.qty > 0) {
          await addDoc(collection(db!, 'stock_movements'), {
            productId: docRef.id,
            productName: name,
            type: 'in',
            quantity: productData.qty,
            reason: 'Initial Stock',
            timestamp: new Date().toISOString(),
            actor: auth?.currentUser?.email || 'system'
          } as Omit<StockMovement, 'id'>);
        }

        await logActivity(`Added new product: ${name}`, 'inventory');
      }
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const resetForm = () => {
    setName('');
    setBarcode('');
    setQty('');
    setCost('');
    setSell('');
    setPurchaseMethod('cash');
    setSupplierId('');
    setEditingId(null);
  };

  const handleEdit = (product: Product) => {
    setName(product.name);
    setBarcode(product.barcode || '');
    setQty(product.qty.toString());
    setCost(product.cost.toString());
    setSell(product.sell.toString());
    setPurchaseMethod(product.purchaseMethod || 'cash');
    setSupplierId(product.supplierId || '');
    setEditingId(product.id || null);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (confirm(`${t('deleteProduct')} ${product?.name || ''}?`)) {
      const path = 'products';
      try {
        await deleteDoc(doc(db!, path, id));
        if (product) {
          await logActivity(`Deleted product: ${product.name}`, 'inventory');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentProduct || !adjQty || !db) return;

    const quantity = parseInt(adjQty);
    const docRef = doc(db, 'products', adjustmentProduct.id!);
    const newQty = adjType === 'in' ? adjustmentProduct.qty + quantity : adjustmentProduct.qty - quantity;

    if (newQty < 0) {
      alert(t('insufficientStock'));
      return;
    }

    try {
      await updateDoc(docRef, { qty: newQty });
      
      // Log movement
      await addDoc(collection(db, 'stock_movements'), {
        productId: adjustmentProduct.id!,
        productName: adjustmentProduct.name,
        type: adjType,
        quantity: quantity,
        reason: adjReason || (adjType === 'in' ? 'Restock' : 'Removal'),
        timestamp: new Date().toISOString(),
        actor: auth?.currentUser?.email || 'system'
      } as Omit<StockMovement, 'id'>);

      logActivity(`${adjType === 'in' ? 'Added' : 'Removed'} ${quantity} units of ${adjustmentProduct.name}`, 'inventory');
      setShowAdjustmentModal(false);
      setAdjQty('');
      setAdjReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'products');
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const isLowStock = p.qty <= settings.lowStockThreshold;
    return matchesSearch && (filterLowStock ? isLowStock : true);
  });

  const totalPossibleProfit = products.reduce((acc, p) => acc + (p.sell - p.cost) * p.qty, 0);

  return (
    <div className={`space-y-8 ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">{t('inventoryProfit')}</h2>
          <p className="text-slate-400">{t('manageInventoryDesc')}</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(true);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span className="font-semibold">{t('registerNewProduct')}</span>
        </button>
      </header>

      {/* Stats Summary */}
      <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <Calculator className="w-8 h-8" />
        </div>
        <div>
          <p className="text-sm text-slate-500 uppercase tracking-widest font-mono">{t('totalExpectedProfit')}</p>
          <p className="text-3xl font-bold text-emerald-400 font-mono">{settings.currency}{totalPossibleProfit.toLocaleString()}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`flex flex-col md:flex-row gap-4 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
        <div className="relative flex-1">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
          <input
            type="text"
            placeholder={t('searchProducts')}
            className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-4 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={() => setFilterLowStock(!filterLowStock)}
          className={`flex items-center justify-center gap-2 px-6 py-4 rounded-xl border transition-all font-bold ${
            filterLowStock 
              ? 'bg-red-500/10 border-red-500 text-red-500 shadow-lg shadow-red-900/10' 
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
          } ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <AlertTriangle className={`w-5 h-5 ${filterLowStock ? 'text-red-500' : 'text-slate-500'}`} />
          <span>{t('lowStockOnly')}</span>
        </button>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredProducts.map((product) => (
            <motion.div
              layout
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col group relative"
            >
              <div className="p-6 flex-1">
                <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse text-right' : ''}`}>
                  <div className="flex-1 overflow-hidden">
                    <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight truncate">
                      {product.name}
                    </h3>
                    {product.barcode && (
                      <p className="text-[10px] text-slate-500 font-mono tracking-widest">{product.barcode}</p>
                    )}
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-mono border whitespace-nowrap ${isRTL ? 'mr-4' : 'ml-4'} ${
                    product.qty <= settings.lowStockThreshold ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    {t('quantity').charAt(0).toUpperCase()}: {product.qty}
                  </div>
                </div>

                <div className={`grid grid-cols-2 gap-4 ${isRTL ? 'flex-row-reverse text-right' : ''}`}>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">{t('unitCost')}</p>
                    <p className="text-lg font-bold text-slate-300 font-mono">{settings.currency}{product.cost.toLocaleString()}</p>
                  </div>
                  <div className={`space-y-1 border-slate-800 ${isRTL ? 'border-r pr-4' : 'border-l pl-4'}`}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">{t('retailPrice')}</p>
                    <p className="text-lg font-bold text-blue-400 font-mono">{settings.currency}{product.sell.toLocaleString()}</p>
                  </div>
                </div>

                <div className={`mt-6 pt-4 border-t border-slate-800/50 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="flex flex-col gap-2">
                    <div className="px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 w-fit">
                      <span className="text-xs font-semibold text-emerald-400 font-mono">{t('margin')}: {settings.currency}{ (product.sell - product.cost).toLocaleString() }</span>
                    </div>
                    {product.purchaseMethod && (
                      <div className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 w-fit">
                        <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">
                          {t('purchaseMethod')}: {t(product.purchaseMethod)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      title={t('stockAdjustment')}
                      onClick={() => {
                        setAdjustmentProduct(product);
                        setAdjType('in');
                        setShowAdjustmentModal(true);
                      }}
                      className="p-2 rounded-lg bg-slate-800 text-emerald-400 hover:bg-emerald-600/20 transition-colors"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleEdit(product)}
                      className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-blue-600/20 hover:text-blue-400 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => product.id && handleDelete(product.id)}
                      className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {!loading && filteredProducts.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 border-dashed rounded-3xl p-20 flex flex-col items-center justify-center text-center">
          <Package className="w-16 h-16 text-slate-800 mb-6" />
          <h3 className="text-xl font-medium text-slate-400">{t('noProductsFound')}</h3>
          <p className="text-slate-600 mt-2">{t('startAddingInventory')}</p>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustmentModal && adjustmentProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl ${isRTL ? 'text-right' : 'text-left'}`}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{t('stockAdjustment')}: {adjustmentProduct.name}</h3>
              <button onClick={() => setShowAdjustmentModal(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleStockAdjustment} className="space-y-6">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjType('in')}
                  className={`py-2 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${adjType === 'in' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}
                >
                  <ArrowUpCircle className="w-4 h-4" /> {t('stockIn')}
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType('out')}
                  className={`py-2 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${adjType === 'out' ? 'bg-red-600 text-white' : 'text-slate-500'}`}
                >
                  <ArrowDownCircle className="w-4 h-4" /> {t('stockOut')}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('quantity')}</label>
                <input required type="number" min="1" className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-blue-500/20 outline-none font-mono" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('reason')}</label>
                <input type="text" placeholder="e.g. New shipment, Damage..." className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:ring-2 focus:ring-blue-500/20 outline-none" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
              </div>

              <button type="submit" className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl ${adjType === 'in' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white transition-all`}>
                <Save className="w-5 h-5" /> Confirm {adjType === 'in' ? 'Stock In' : 'Stock Out'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-lg shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
            <div className={`flex justify-between items-center mb-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-2xl font-bold text-white tracking-tight">{editingId ? t('editProduct') : t('registerNewProduct')}</h3>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-2 rounded-full hover:bg-slate-800 transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('productName')}</label>
                  <input
                    autoFocus
                    required
                    type="text"
                    placeholder={t('sonyDualSense')}
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'text-right' : 'text-left'}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('barcode')}</label>
                  <input
                    type="text"
                    placeholder="EAN-13, SKU..."
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'text-right' : 'text-left'}`}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('initialQty')}</label>
                  <input
                    required
                    type="number"
                    placeholder="0"
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'text-right' : 'text-left'}`}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('unitCost')} ({settings.currency})</label>
                  <input
                    required
                    type="number"
                    placeholder="0.00"
                    className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'text-right' : 'text-left'}`}
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('retailsFor')} ({settings.currency})</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'text-right' : 'text-left'}`}
                  value={sell}
                  onChange={(e) => setSell(e.target.value)}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('purchaseMethod')}</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPurchaseMethod('cash')}
                        className={`py-2 px-4 rounded-xl border text-sm font-bold transition-all ${
                          purchaseMethod === 'cash' 
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        {t('cash')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurchaseMethod('card')}
                        className={`py-2 px-4 rounded-xl border text-sm font-bold transition-all ${
                          purchaseMethod === 'card' 
                            ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        {t('card')}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">{t('supplier')}</label>
                    <select
                      className={`w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono ${isRTL ? 'text-right' : 'text-left'}`}
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
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
                  className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all font-semibold shadow-lg shadow-blue-900/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingId ? t('saveChanges') : t('addToInventory')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
