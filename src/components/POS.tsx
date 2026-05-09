import React, { useState, useEffect, useRef } from 'react';
import { db, auth, isFirebaseReady } from '../firebase';
import { collection, onSnapshot, doc, writeBatch, increment, addDoc } from 'firebase/firestore';
import { ShoppingCart, Barcode, Trash2, Plus, Minus, CreditCard, Banknote, CheckCircle2, AlertCircle, Search, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product, Sale } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { logActivity } from '../lib/logger';
import { useSettings } from '../hooks/useSettings';
import ProfessionalInvoice from './ProfessionalInvoice';

interface CartItem extends Product {
  cartQty: number;
}

export default function POS() {
  const { settings, t, isRTL } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [processing, setProcessing] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFirebaseReady) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(collection(db!, 'products'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    return () => unsubscribe();
  }, []);

  const addToCart = (product: Product) => {
    setError(null);
    const existing = cart.find(item => item.id === product.id);
    
    if (existing) {
      if (existing.cartQty + 1 > product.qty) {
        setError(t('insufficientStock'));
        return;
      }
      setCart(cart.map(item => 
        item.id === product.id ? { ...item, cartQty: item.cartQty + 1 } : item
      ));
    } else {
      if (product.qty < 1) {
        setError(t('insufficientStock'));
        return;
      }
      setCart([...cart, { ...product, cartQty: 1 }]);
    }
    setBarcode('');
    barcodeInputRef.current?.focus();
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQty = item.cartQty + delta;
        const originalProduct = products.find(p => p.id === productId);
        if (newQty > 0 && originalProduct && newQty <= originalProduct.qty) {
          return { ...item, cartQty: newQty };
        }
      }
      return item;
    }));
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find(p => p.barcode === barcode || p.name.toLowerCase() === barcode.toLowerCase());
    if (product) {
      addToCart(product);
    } else {
      setError('Product not found');
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.sell * item.cartQty), 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || processing) return;
    setProcessing(true);
    setError(null);

    const batch = writeBatch(db!);
    const path = 'sales';

    try {
      // 1. Create Sale Record
      const saleData: Omit<Sale, 'id'> = {
        items: cart.map(item => ({
          productId: item.id!,
          name: item.name,
          qty: item.cartQty,
          price: item.sell
        })),
        total: cartTotal,
        paymentMethod,
        timestamp: new Date().toISOString(),
        actor: auth?.currentUser?.email || 'unknown'
      };

      const salesRef = collection(db!, 'sales');
      const docRef = await addDoc(salesRef, saleData);
      
      const finishedSale: Sale = {
        id: docRef.id,
        ...saleData
      };

      // 2. Adjust Stock
      cart.forEach(item => {
        const productRef = doc(db!, 'products', item.id!);
        batch.update(productRef, {
          qty: increment(-item.cartQty)
        });
      });

      await batch.commit();

      // 3. Log Stock Movements
      const movementPromises = cart.map(item => 
        addDoc(collection(db!, 'stock_movements'), {
          productId: item.id!,
          productName: item.name,
          type: 'sale',
          quantity: item.cartQty,
          reason: `POS Sale - ${paymentMethod}`,
          timestamp: new Date().toISOString(),
          actor: auth?.currentUser?.email || 'unknown'
        })
      );
      await Promise.all(movementPromises);

      await logActivity(`Processed POS sale: ${settings.currency}${cartTotal}`, 'system');

      setCart([]);
      setCurrentSale(finishedSale);
      setShowInvoice(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      setError('Checkout failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const closeInvoice = () => {
    setShowInvoice(false);
    setCurrentSale(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 h-[calc(100vh-12rem)] ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Left: Product Selection */}
      <div className="lg:col-span-2 space-y-6 overflow-hidden flex flex-col">
        <header>
          <h2 className="text-3xl font-bold text-white tracking-tight">{t('pos')}</h2>
          <p className="text-slate-400">{t('posDesc')}</p>
        </header>

        <form onSubmit={handleBarcodeSubmit} className="relative">
          <Barcode className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 ${isRTL ? 'right-4' : 'left-4'}`} />
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder={t('scanBarcode')}
            className={`w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'}`}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />
        </form>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {products.filter(p => p.qty > 0).map((product) => (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-left hover:border-blue-500/50 transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-2 bg-blue-600/10 text-blue-400 text-[10px] font-bold rounded-bl-xl opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-tighter">
                  {t('addToCart')}
                </div>
                <h4 className="font-bold text-white mb-1 line-clamp-1">{product.name}</h4>
                <p className="text-blue-400 font-mono font-bold">{settings.currency}{product.sell.toLocaleString()}</p>
                <div className="mt-2 flex items-center justify-between text-[10px] uppercase font-mono tracking-widest text-slate-500">
                  <span>{t('qty')}: {product.qty}</span>
                  {product.barcode && <span className="opacity-50">{product.barcode}</span>}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Cart & Checkout */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl relative">
        <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <ShoppingCart className="w-5 h-5 text-blue-500" />
            <h3 className="text-xl font-bold text-white">{t('cart')}</h3>
          </div>
          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-lg">
            {cart.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <AnimatePresence mode="popLayout">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 opacity-50">
                <ShoppingCart className="w-12 h-12 mb-4" />
                <p>{t('emptyCart')}</p>
              </div>
            ) : (
              cart.map((item) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  key={item.id}
                  className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className={isRTL ? 'text-right' : 'text-left'}>
                      <h4 className="font-bold text-white text-sm">{item.name}</h4>
                      <p className="text-xs text-slate-500 font-mono">{settings.currency}{item.sell.toLocaleString()} / unit</p>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id!)}
                      className="text-slate-600 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-1 bg-slate-900 rounded-xl p-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <button 
                        onClick={() => updateCartQty(item.id!, -1)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-white text-sm">{item.cartQty}</span>
                      <button 
                        onClick={() => updateCartQty(item.id!, 1)}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-bold text-blue-400 font-mono">
                      {settings.currency}{(item.sell * item.cartQty).toLocaleString()}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 bg-slate-950 border-t border-slate-800 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest font-mono block">{t('paymentMethod')}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all font-bold ${
                  paymentMethod === 'cash' 
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-900/10' 
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                }`}
              >
                <Banknote className="w-4 h-4" />
                {t('cash')}
              </button>
              <button
                onClick={() => setPaymentMethod('card')}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all font-bold ${
                  paymentMethod === 'card' 
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-900/10' 
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                {t('card')}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className={`flex justify-between items-end ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span className="text-slate-500 font-mono text-sm">{t('total')}</span>
              <span className="text-3xl font-bold text-white font-mono tracking-tighter">
                {settings.currency}{cartTotal.toLocaleString()}
              </span>
            </div>
            <button
              disabled={cart.length === 0 || processing}
              onClick={handleCheckout}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-500 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3 shadow-xl shadow-blue-900/20"
            >
              {processing ? (
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5" />
                  {t('checkout')}
                </>
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showInvoice && currentSale && (
            <ProfessionalInvoice 
              sale={currentSale}
              settings={settings}
              onClose={closeInvoice}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
