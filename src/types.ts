export interface Product {
  id?: string;
  name: string;
  barcode?: string;
  qty: number;
  cost: number;
  sell: number;
  purchaseMethod?: 'cash' | 'card';
  supplierId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  id?: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
}

export interface StockMovement {
  id?: string;
  productId: string;
  productName: string;
  type: 'in' | 'out' | 'adjustment' | 'sale';
  quantity: number;
  reason?: string;
  timestamp: string;
  actor: string;
}

export interface Debt {
  id?: string;
  customer: string;
  amount: number;
  debtDate?: string;
  dueDate?: string;
  installmentDate?: string;
  updatedAt?: string;
}

export interface Profile {
  id: string;
  email: string;
  displayName?: string | null;
  role: 'admin' | 'user';
  language?: 'en' | 'ar';
  createdAt?: string;
}

export interface Sale {
  id?: string;
  items: {
    productId: string;
    name: string;
    qty: number;
    price: number;
  }[];
  total: number;
  paymentMethod: 'cash' | 'card';
  timestamp: string;
  actor?: string;
}

export interface AppSettings {
  storeName: string;
  currency: string;
  lowStockThreshold: number;
  language: 'en' | 'ar';
  storeAddress?: string;
  storePhone?: string;
  storeLogo?: string;
  updatedBy?: string;
}

export type View = 'dashboard' | 'inventory' | 'debts' | 'admin-dashboard' | 'settings' | 'pos' | 'suppliers' | 'stock-history';
