import Database from 'better-sqlite3';
import path from 'path';

let userDataPath = process.env.USER_DATA_PATH || process.cwd();

const dbPath = path.resolve(userDataPath, 'shop.db');
const db = new Database(dbPath);

// Initialize tables
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'staff',
      email TEXT,
      permissions TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT,
      price REAL,
      cost_price REAL,
      qty INTEGER,
      min_stock INTEGER DEFAULT 5,
      barcode TEXT,
      category_id TEXT,
      supplier TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      debt REAL DEFAULT 0,
      due_date TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      total REAL,
      subtotal REAL,
      discount REAL DEFAULT 0,
      payment_method TEXT,
      customer_id TEXT,
      staff_id TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (staff_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id TEXT,
      product_id TEXT,
      name TEXT,
      price REAL,
      qty INTEGER,
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      amount REAL,
      staff_id TEXT,
      payment_method TEXT DEFAULT 'CASH',
      check_number TEXT,
      check_due_date DATETIME,
      check_owner TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (staff_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      product_name TEXT,
      type TEXT, -- 'in', 'out', 'adjustment', 'sale'
      quantity INTEGER,
      reason TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      actor TEXT,
      FOREIGN KEY (product_id) REFERENCES products (id)
    );

    CREATE TABLE IF NOT EXISTS customer_history (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      type TEXT,
      amount REAL,
      description TEXT,
      payment_method TEXT DEFAULT 'CASH',
      check_number TEXT,
      check_due_date DATETIME,
      check_owner TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      type TEXT, -- 'SALE', 'PAYMENT', 'PRODUCT', 'CUSTOMER', 'STAFF', 'STOCK'
      action TEXT, -- 'create', 'update', 'delete', 'login'
      details TEXT,
      actor_id TEXT,
      actor_name TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      shop_name TEXT,
      shop_address TEXT,
      shop_phone TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      debt REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_history (
      id TEXT PRIMARY KEY,
      supplier_id TEXT,
      type TEXT,
      amount REAL,
      description TEXT,
      payment_method TEXT DEFAULT 'CASH',
      check_number TEXT,
      check_due_date DATETIME,
      check_owner TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
    );

    CREATE TABLE IF NOT EXISTS google_auth (
      id TEXT PRIMARY KEY,
      tokens TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Handle migrations
  try {
    db.prepare('ALTER TABLE supplier_history ADD COLUMN payment_method TEXT DEFAULT "CASH"').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE supplier_history ADD COLUMN check_number TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE supplier_history ADD COLUMN check_due_date DATETIME').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE supplier_history ADD COLUMN check_owner TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE customer_history ADD COLUMN payment_method TEXT DEFAULT "CASH"').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE customer_history ADD COLUMN check_number TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE customer_history ADD COLUMN check_due_date DATETIME').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE customer_history ADD COLUMN check_owner TEXT').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE payments ADD COLUMN payment_method TEXT DEFAULT "CASH"').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE payments ADD COLUMN check_number TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE payments ADD COLUMN check_due_date DATETIME').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE payments ADD COLUMN check_owner TEXT').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE customers ADD COLUMN address TEXT').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE customers ADD COLUMN due_date TEXT').run();
  } catch (e) {}
  
  try {
    db.prepare('ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  } catch (e) {}
  
  try {
    db.prepare('ALTER TABLE categories ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE products ADD COLUMN supplier TEXT').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE products ADD COLUMN cost_price REAL').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 5').run();
  } catch (e) {}

  try {
    db.prepare('ALTER TABLE sales ADD COLUMN check_number TEXT').run();
  } catch (e) {}
  try {
    db.prepare('ALTER TABLE sales ADD COLUMN check_owner TEXT').run();
  } catch (e) {}

  // Initialize settings
  const settings = db.prepare('SELECT * FROM settings WHERE id = ?').get('main') as any;
  if (!settings) {
    db.prepare(`
      INSERT INTO settings (id, shop_name, shop_address, shop_phone)
      VALUES (?, ?, ?, ?)
    `).run('main', 'Mon Magasin', 'Adresse du Magasin', '06XXXXXXXX');
  }

  // Bootstrap admin definitively
  const adminHash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // SHA-256 for '1234'
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as any;
  
  const adminPerms = JSON.stringify({ 
    stock: true, 
    customers: true, 
    history: true, 
    profits: true, 
    editStock: true 
  });

  if (!admin) {
    db.prepare(`
      INSERT INTO users (id, username, password, role, email, permissions) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'admin', 
      'admin', 
      adminHash, 
      'admin', 
      'admin@pos.local',
      adminPerms
    );
  } else {
    // Update permissions and forcefully fix the password hash which was corrupted
    db.prepare('UPDATE users SET username = ?, permissions = ?, password = ? WHERE id = ?').run('admin', adminPerms, adminHash, admin.id || 'admin');
  }
}

export default db;
