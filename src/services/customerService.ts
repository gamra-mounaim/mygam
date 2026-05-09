import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy,
  serverTimestamp,
  increment,
  where,
  type DocumentData
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Customer {
  id: string;
  name: string;
  debt: number;
  email?: string;
  phone?: string;
  address?: string;
}

export interface PaymentRecord {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  date: string;
  staffId: string;
}

export interface TransactionRecord {
  id: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  date: string;
  description: string;
  items?: { name: string; qty: number; price: number }[];
}

/**
 * Ported from: def add_customer(name, total_debt=0)
 */
export async function addCustomer(name: string, initialDebt: number = 0, email?: string, phone?: string, address?: string) {
  try {
    const docRef = await addDoc(collection(db, 'customers'), {
      name,
      debt: initialDebt,
      email: email || '',
      phone: phone || '',
      address: address || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding customer:", error);
    throw error;
  }
}

/**
 * Update an existing customer
 */
export async function updateCustomer(id: string, data: Partial<Omit<Customer, 'id' | 'debt'>>) {
  try {
    const customerRef = doc(db, 'customers', id);
    await updateDoc(customerRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error updating customer:", error);
    throw error;
  }
}

/**
 * Ported from: def get_payments(customer_id, month=None, year=None)
 */
export async function getPaymentsForCustomer(customerId: string, month?: number, year?: number): Promise<PaymentRecord[]> {
  try {
    let q = query(
      collection(db, 'payments'), 
      where('customerId', '==', customerId)
    );

    if (month && year) {
      // Create ISO range for the specific month
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 1).toISOString();
      
      q = query(q, 
        where('date', '>=', startDate),
        where('date', '<', endDate),
        orderBy('date', 'desc')
      );
    } else {
      q = query(q, orderBy('date', 'desc'));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as PaymentRecord));
  } catch (error) {
    console.error("Error getting customer payments:", error);
    throw error;
  }
}

/**
 * Ported from: def add_debt(customer_id, amount)
 */
export async function addDebt(customerId: string, amount: number, staffId?: string, description?: string) {
  try {
    const customerRef = doc(db, 'customers', customerId);
    await updateDoc(customerRef, {
      debt: increment(amount),
      updatedAt: serverTimestamp()
    });

    // Record the charge in history
    await addDoc(collection(db, 'charges'), {
      customerId,
      amount,
      staffId: staffId || 'system',
      date: new Date().toISOString(),
      description: description || 'Manual Debt Charge',
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error adding debt:", error);
    throw error;
  }
}

/**
 * Ported from: def get_customers()
 */
export async function getCustomers(): Promise<Customer[]> {
  try {
    const q = query(collection(db, 'customers'), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Customer));
  } catch (error) {
    console.error("Error getting customers:", error);
    throw error;
  }
}

/**
 * Deduction/Payment logic (Complementary to add_debt)
 */
export async function deductDebt(customerId: string, amount: number, staffId?: string, customerName?: string, description?: string) {
  try {
    const customerRef = doc(db, 'customers', customerId);
    await updateDoc(customerRef, {
      debt: increment(-amount),
      updatedAt: serverTimestamp()
    });

    // Record the payment in history
    await addDoc(collection(db, 'payments'), {
      customerId,
      customerName: customerName || 'Unknown',
      amount,
      staffId: staffId || 'system',
      date: new Date().toISOString(),
      description: description || 'Customer Payment',
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error deducting debt:", error);
    throw error;
  }
}

/**
 * Unified History (Debt + Payment)
 * Ported/Enhanced from: def get_history(customer_id)
 */
export async function getCustomerHistory(customerId: string): Promise<TransactionRecord[]> {
  try {
    // 1. Get Payments
    const paymentsQ = query(collection(db, 'payments'), where('customerId', '==', customerId));
    const paymentsSnap = await getDocs(paymentsQ);
    const payments = paymentsSnap.docs.map(doc => ({
      id: doc.id,
      type: 'PAYMENT' as const,
      amount: doc.data().amount,
      date: doc.data().date,
      description: doc.data().description || 'Customer Payment'
    }));

    // 2. Get Sales where paymentMethod is 'debt'
    const salesQ = query(
      collection(db, 'sales'), 
      where('customerId', '==', customerId),
      where('paymentMethod', '==', 'debt')
    );
    const salesSnap = await getDocs(salesQ);
    const sales = salesSnap.docs.map(doc => ({
      id: doc.id,
      type: 'DEBT' as const,
      amount: doc.data().total,
      date: doc.data().date,
      description: `Store Purchase #${doc.id.slice(0, 6).toUpperCase()}`,
      items: doc.data().items || []
    }));

    // 3. Get Manual Charges
    const chargesQ = query(collection(db, 'charges'), where('customerId', '==', customerId));
    const chargesSnap = await getDocs(chargesQ);
    const charges = chargesSnap.docs.map(doc => ({
      id: doc.id,
      type: 'DEBT' as const,
      amount: doc.data().amount,
      date: doc.data().date,
      description: doc.data().description || 'Manual Charge'
    }));

    // Combine and Sort
    return [...payments, ...sales, ...charges].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (error) {
    console.error("Error fetching full history:", error);
    throw error;
  }
}
