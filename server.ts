import express from "express";
import "dotenv/config";

import path from "path";
import cors from "cors";
import nodemailer from "nodemailer";
import twilio from "twilio";
import db, { initDb } from "./src/server/database";
import { v4 as uuidv4 } from 'uuid';
import crypto from "node:crypto";
import { google } from "googleapis";

const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// Initialize SQLite database
// initDb is now called inside startServer for better error handling

async function startServer() {
  console.log("Starting server process...");
  const app = express();
  const PORT = process.env.PORT || 3000;

  try {
    initDb();
    console.log("SQLite Database initialized.");
  } catch (dbError) {
    console.error("CRITICAL: Database initialization failed:", dbError);
  }

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/test", (req, res) => {
    res.json({ status: "ok", message: "API is reachable" });
  });

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // --- Utilities ---
  const logActivity = (type: string, action: string, details: string, actorId: string = 'system', actorName: string = 'System') => {
    try {
      db.prepare(`
        INSERT INTO activity_log (id, type, action, details, actor_id, actor_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), type, action, details, actorId, actorName);
    } catch (e) {
      console.error("Activity logging failed:", e);
    }
  };

  const toCamel = (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(toCamel);
    const newObj: any = {};
    for (const key in obj) {
      const camelKey = key.replace(/(_\w)/g, (m) => m[1].toUpperCase());
      newObj[camelKey] = toCamel(obj[key]);
    }
    return newObj;
  };

  // --- Auth API ---
  app.get("/api/auth/reset-admin", (req, res) => {
    const adminHash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
    const adminPerms = JSON.stringify({ 
      stock: true, 
      customers: true, 
      history: true, 
      profits: true, 
      editStock: true 
    });
    try {
      db.prepare('DELETE FROM users WHERE username = ?').run('admin');
      db.prepare(`
        INSERT INTO users (id, username, password, role, email, permissions) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('admin', 'admin', adminHash, 'admin', 'admin@pos.local', adminPerms);
      res.send("Admin password reset to '1234'. You can now login.");
    } catch (e: any) {
      res.status(500).send("Reset failed: " + e.message);
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password: rawPassword } = req.body;
    if (!username || !rawPassword) {
      return res.status(400).json({ status: "error", message: "Username and password required" });
    }

    const usernameLower = username.trim().toLowerCase();
    const rawLower = rawPassword.trim().toLowerCase();
    const hashedPassword = hashPassword(rawPassword.trim());
    
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(usernameLower) as any;

    if (user && (user.password === hashedPassword || user.password === rawPassword.trim())) {
      const { password: _p, ...userWithoutPassword } = user;
      logActivity('STAFF', 'login', `User logged in: ${usernameLower}`, userWithoutPassword.id, userWithoutPassword.username);
      res.json({ status: "success", user: userWithoutPassword });
    } else {
      if (!user) {
        console.log(`Login failed: User not found [${usernameLower}]`);
      } else {
        console.log(`Login failed for user: ${usernameLower}`);
        console.log(`Received password (raw): ${rawPassword.trim()}`);
        console.log(`Hashed received: ${hashedPassword}`);
        console.log(`Stored hash:   ${user.password}`);
      }
      res.status(401).json({ status: "error", message: "Invalid username or password" });
    }
  });

  app.post("/api/auth/register", (req, res) => {
    const { username, password: rawPassword, role, permissions } = req.body;
    const usernameLower = username.trim().toLowerCase();
    const hashedPassword = hashPassword(rawPassword.trim());
    
    try {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(usernameLower);
      if (existing) {
        return res.status(400).json({ status: "error", message: "Username already exists" });
      }

      db.prepare(`
        INSERT INTO users (id, username, password, role, permissions)
        VALUES (?, ?, ?, ?, ?)
      `).run(usernameLower, usernameLower, hashedPassword, role, JSON.stringify(permissions));
      
      logActivity('STAFF', 'create', `Created new user: ${usernameLower} (${role})`, 'system', 'System');
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Users API ---
  app.get("/api/users", (req, res) => {
    const users = db.prepare('SELECT id, username, role, permissions, created_at FROM users').all();
    const formattedUsers = users.map((u: any) => ({
      ...toCamel(u),
      permissions: u.permissions ? JSON.parse(u.permissions) : {}
    }));
    res.json(formattedUsers);
  });

  app.put("/api/users/:id", (req, res) => {
    const { id } = req.params;
    const { role, permissions } = req.body;
    try {
      db.prepare(`
        UPDATE users 
        SET role = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(role, JSON.stringify(permissions), id);
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Products API ---
  app.get("/api/products", (req, res) => {
    const products = db.prepare('SELECT p.*, c.name as categoryName FROM products p LEFT JOIN categories c ON p.category_id = c.id').all();
    res.json(toCamel(products));
  });

  app.post("/api/products", (req, res) => {
    const { name, price, costPrice, qty, minStock, barcode, categoryId, supplier } = req.body;
    const id = uuidv4();
    try {
      db.prepare(`
        INSERT INTO products (id, name, price, cost_price, qty, min_stock, barcode, category_id, supplier)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, price, costPrice, qty, minStock, barcode, categoryId, supplier);
      
      logActivity('PRODUCT', 'create', `Added product: ${name} (Qty: ${qty})`, 'system', 'System');
      res.json({ status: "success", id });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.put("/api/products/:id", (req, res) => {
    const { id } = req.params;
    const { name, price, costPrice, qty, minStock, barcode, categoryId, supplier } = req.body;
    try {
      db.prepare(`
        UPDATE products 
        SET name = ?, price = ?, cost_price = ?, qty = ?, min_stock = ?, barcode = ?, category_id = ?, supplier = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, price, costPrice, qty, minStock, barcode, categoryId, supplier, id);
      
      logActivity('PRODUCT', 'update', `Updated product: ${name}`, 'system', 'System');
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.delete("/api/products/:id", (req, res) => {
    try {
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/products/:id/adjust", (req, res) => {
    const { id } = req.params;
    const { type, quantity, reason, actor } = req.body;
    const movementId = uuidv4();

    const transaction = db.transaction(() => {
      const product = db.prepare('SELECT name, qty FROM products WHERE id = ?').get(id) as any;
      if (!product) throw new Error("Product not found");

      const newQty = type === 'in' ? product.qty + quantity : product.qty - quantity;
      
      db.prepare('UPDATE products SET qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newQty, id);
      
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, product_name, type, quantity, reason, actor)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(movementId, id, product.name, type, quantity, reason, actor);

      logActivity('STOCK', 'update', `Stock ${type}: ${product.name} (${quantity} units)`, actor || 'system', actor || 'System');
    });

    try {
      transaction();
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Categories API ---
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare('SELECT * FROM categories').all();
    res.json(toCamel(categories));
  });

  app.post("/api/categories", (req, res) => {
    const { name } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(id, name);
      logActivity('CATEGORY', 'create', `Created category: ${name}`, 'system', 'System');
      res.json({ status: "success", id });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.delete("/api/categories/:id", (req, res) => {
    try {
      db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Customers API ---
  app.get("/api/customers", (req, res) => {
    const customers = db.prepare('SELECT * FROM customers').all();
    res.json(toCamel(customers));
  });

  app.post("/api/customers", (req, res) => {
    const { name, email, phone, address, debt, due_date } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO customers (id, name, email, phone, address, debt, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, name, email || '', phone || '', address || '', debt || 0, due_date || null);
      logActivity('CUSTOMER', 'create', `Added customer: ${name} (Initial Debt: ${debt || 0})`, 'system', 'System');
      res.json({ status: "success", id });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/customers/:id/payment", (req, res) => {
    const { id } = req.params;
    const { amount, payment_method, check_number, check_due_date, check_owner } = req.body;
    const paymentId = uuidv4();
    
    const transaction = db.transaction(() => {
      const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(id) as any;
      db.prepare('UPDATE customers SET debt = debt - ? WHERE id = ?').run(amount, id);
      db.prepare(`
        INSERT INTO customer_history (id, customer_id, type, amount, description, payment_method, check_number, check_due_date, check_owner)
        VALUES (?, ?, 'PAYMENT', ?, 'Payment Received', ?, ?, ?, ?)
      `).run(paymentId, id, amount, payment_method || 'CASH', check_number || null, check_due_date || null, check_owner || null);
      
      db.prepare(`
        INSERT INTO payments (id, customer_id, amount, date, payment_method, check_number, check_due_date, check_owner)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
      `).run(paymentId, id, amount, payment_method || 'CASH', check_number || null, check_due_date || null, check_owner || null);

      logActivity('PAYMENT', 'create', `Payment of ${amount} from ${customer?.name || 'Customer'} (${payment_method || 'CASH'})`, 'system', 'System');
    });

    try {
      transaction();
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/customers/:id/charge", (req, res) => {
    const { id } = req.params;
    const { amount, description } = req.body;
    const chargeId = uuidv4();
    
    const transaction = db.transaction(() => {
      db.prepare('UPDATE customers SET debt = debt + ? WHERE id = ?').run(amount, id);
      db.prepare(`
        INSERT INTO customer_history (id, customer_id, type, amount, description)
        VALUES (?, ?, 'DEBT', ?, ?)
      `).run(chargeId, id, amount, description || 'Manual Charge');
    });

    try {
      transaction();
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.get("/api/customers/:id/history", (req, res) => {
    const history = db.prepare('SELECT * FROM customer_history WHERE customer_id = ? ORDER BY date DESC').all(req.params.id);
    res.json(toCamel(history));
  });

  app.get("/api/payments", (req, res) => {
    try {
      const payments = db.prepare('SELECT p.*, c.name as customerName FROM payments p LEFT JOIN customers c ON p.customer_id = c.id ORDER BY p.date DESC').all();
      res.json(toCamel(payments));
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.put("/api/customers/:id", (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address, debt, due_date } = req.body;
    try {
      db.prepare(`
        UPDATE customers 
        SET name = ?, email = ?, phone = ?, address = ?, debt = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, email, phone, address, debt, due_date || null, id);
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Suppliers API ---
  app.get("/api/suppliers", (req, res) => {
    const suppliers = db.prepare('SELECT * FROM suppliers').all();
    res.json(toCamel(suppliers));
  });

  app.post("/api/suppliers", (req, res) => {
    const { name, email, phone, address, debt } = req.body;
    const id = uuidv4();
    try {
      db.prepare('INSERT INTO suppliers (id, name, email, phone, address, debt) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, email || '', phone || '', address || '', debt || 0);
      logActivity('SUPPLIER', 'create', `Added supplier: ${name} (Initial Debt: ${debt || 0})`, 'system', 'System');
      res.json({ status: "success", id });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.put("/api/suppliers/:id", (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address, debt } = req.body;
    try {
      db.prepare(`
        UPDATE suppliers 
        SET name = ?, email = ?, phone = ?, address = ?, debt = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, email, phone, address, debt, id);
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/suppliers/:id/payment", (req, res) => {
    const { id } = req.params;
    const { amount, payment_method, check_number, check_due_date, check_owner } = req.body;
    const historyId = uuidv4();
    
    const transaction = db.transaction(() => {
      const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(id) as any;
      db.prepare('UPDATE suppliers SET debt = debt - ? WHERE id = ?').run(amount, id);
      db.prepare(`
        INSERT INTO supplier_history (id, supplier_id, type, amount, description, payment_method, check_number, check_due_date, check_owner)
        VALUES (?, ?, 'PAYMENT', ?, 'Payment to Supplier', ?, ?, ?, ?)
      `).run(historyId, id, amount, payment_method || 'CASH', check_number || null, check_due_date || null, check_owner || null);
      
      logActivity('SUPPLIER_PAYMENT', 'create', `Paid ${amount} to ${supplier?.name || 'Supplier'} (${payment_method || 'CASH'})`, 'system', 'System');
    });

    try {
      transaction();
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/suppliers/:id/charge", (req, res) => {
    const { id } = req.params;
    const { amount, description } = req.body;
    const historyId = uuidv4();
    
    const transaction = db.transaction(() => {
      db.prepare('UPDATE suppliers SET debt = debt + ? WHERE id = ?').run(amount, id);
      db.prepare(`
        INSERT INTO supplier_history (id, supplier_id, type, amount, description)
        VALUES (?, ?, 'CHARGE', ?, ?)
      `).run(historyId, id, amount, description || 'New Credit Purchase');
    });

    try {
      transaction();
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.get("/api/suppliers/:id/history", (req, res) => {
    const history = db.prepare('SELECT * FROM supplier_history WHERE supplier_id = ? ORDER BY date DESC').all(req.params.id);
    res.json(toCamel(history));
  });

  // --- Sales API ---
  app.get("/api/sales", (req, res) => {
    const sales = db.prepare('SELECT * FROM sales ORDER BY date DESC').all();
    // In a real app, join with sale_items
    res.json(toCamel(sales));
  });

  app.get("/api/checks", (req, res) => {
    try {
      const checks = db.prepare(`
        SELECT 
          s.id, 
          s.total as total, 
          s.check_number, 
          s.check_owner, 
          s.date, 
          'sale' as type,
          c.name as customer_name 
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.payment_method = 'check'
        
        UNION ALL
        
        SELECT 
          p.id, 
          p.amount as total, 
          p.check_number, 
          p.check_owner, 
          p.date, 
          'payment' as type,
          c.name as customer_name 
        FROM payments p
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.payment_method = 'check'
        
        ORDER BY date DESC
      `).all();
      res.json(toCamel(checks));
    } catch (error) {
      console.error("Fetch checks error:", error);
      res.status(500).json({ error: "Failed to fetch checks" });
    }
  });

  app.post("/api/sales", (req, res) => {
    const { total, subtotal, discount, paymentMethod, customerId, staffId, items, checkNumber, checkOwner } = req.body;
    const saleId = uuidv4();

    const transaction = db.transaction(() => {
      // 1. Create Sale Record
      db.prepare(`
        INSERT INTO sales (id, total, subtotal, discount, payment_method, customer_id, staff_id, check_number, check_owner)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(saleId, total, subtotal, discount, paymentMethod, customerId, staffId, checkNumber, checkOwner);

      // 2. Create Items & Update Stock
      for (const item of items) {
        db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, name, price, qty)
          VALUES (?, ?, ?, ?, ?)
        `).run(saleId, item.productId, item.name, item.price, item.qty);

        db.prepare('UPDATE products SET qty = qty - ? WHERE id = ?').run(item.qty, item.productId);
      }

      // 3. Update Customer Debt if payment is 'debt'
      if (paymentMethod === 'debt' && customerId) {
        db.prepare('UPDATE customers SET debt = debt + ? WHERE id = ?').run(total, customerId);
      }

      logActivity('SALE', 'create', `New sale #${saleId.slice(0, 8)} - Total: ${total}`, staffId, 'Staff');
    });

    try {
      transaction();
      res.json({ status: "success", id: saleId });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Stats API ---
  app.get("/api/stats", (req, res) => {
    const totalSales = (db.prepare('SELECT SUM(total) as total FROM sales').get() as any).total || 0;
    const transactions = (db.prepare('SELECT COUNT(*) as count FROM sales').get() as any).count || 0;
    const totalStock = (db.prepare('SELECT SUM(qty) as total FROM products').get() as any).total || 0;
    const inventoryValue = (db.prepare('SELECT SUM(cost_price * qty) as total FROM products').get() as any).total || 0;
    const expectedProfit = (db.prepare('SELECT SUM((price - cost_price) * qty) as total FROM products').get() as any).total || 0;
    const activeSuppliers = (db.prepare('SELECT COUNT(DISTINCT supplier) as count FROM products WHERE supplier IS NOT NULL').get() as any).count || 0;
    const outstandingDebt = (db.prepare('SELECT SUM(debt) as total FROM customers').get() as any).total || 0;
    const supplierDebt = (db.prepare('SELECT SUM(debt) as total FROM suppliers').get() as any).total || 0;
 
    res.json(toCamel({
      totalSales,
      transactions,
      totalStock,
      inventoryValue,
      expectedProfit,
      activeSuppliers,
      outstandingDebt,
      supplierDebt
    }));
  });

  // --- Communications API (Preserved) ---
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, body, filename, fileBase64 } = req.body;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return res.status(500).json({ status: "error", message: "SMTP credentials not configured." });

    try {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
      const mailOptions = {
        from: user, to, subject, text: body,
        attachments: filename && fileBase64 ? [{ filename, content: fileBase64, encoding: 'base64' }] : []
      };
      await transporter.sendMail(mailOptions);
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/send-whatsapp", async (req, res) => {
    const { to, body, mediaUrl } = req.body;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    if (!sid || !token || !from) return res.status(500).json({ status: "error", message: "Twilio credentials not configured." });

    try {
      const client = twilio(sid, token);
      await client.messages.create({ from, to: `whatsapp:${to}`, body, mediaUrl: mediaUrl ? [mediaUrl] : undefined });
      res.json({ status: "success" });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.get("/api/activity", (req, res) => {
    try {
      const logs = db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 100').all();
      res.json(toCamel(logs));
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // --- Settings API ---
  app.get("/api/settings", (req, res) => {
    try {
      const settings = db.prepare('SELECT * FROM settings WHERE id = ?').get('main');
      res.json(toCamel(settings || {}));
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.post("/api/settings", (req, res) => {
    const { shopName, shopAddress, shopPhone } = req.body;
    try {
      db.prepare(`
        UPDATE settings 
        SET shop_name = ?, shop_address = ?, shop_phone = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(shopName, shopAddress, shopPhone, 'main');
      
      logActivity('SETTINGS', 'update', `Shop settings updated: ${shopName}`, 'admin', 'Admin');
      res.json({ status: "success" });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // --- Backup & Recovery API ---
  app.get("/api/auth/google/url", (req, res) => {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.APP_URL}/api/auth/google/callback`
      );

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/drive.file',
          'profile',
          'email'
        ],
        prompt: 'consent'
      });
      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.APP_URL}/api/auth/google/callback`
      );

      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Store tokens in DB
      db.prepare('DELETE FROM google_auth WHERE id = ?').run('main');
      db.prepare('INSERT INTO google_auth (id, tokens) VALUES (?, ?)').run('main', JSON.stringify(tokens));

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f4f8;">
            <div style="background: white; padding: 2rem; border-radius: 1rem; shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <h2 style="color: #10b981;">Connetion Réussie !</h2>
              <p>Votre compte Google Drive est maintenant lié. Vous pouvez fermer cette fenêtre.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                  setTimeout(() => window.close(), 2000);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (e: any) {
      res.status(500).send("Auth failed: " + e.message);
    }
  });

  app.get("/api/backup/drive/status", (req, res) => {
    try {
      const auth = db.prepare('SELECT tokens FROM google_auth WHERE id = ?').get('main') as any;
      res.json({ connected: !!auth });
    } catch (e: any) {
      res.json({ connected: false });
    }
  });

  app.post("/api/backup/drive/upload", async (req, res) => {
    try {
      const authData = db.prepare('SELECT tokens FROM google_auth WHERE id = ?').get('main') as any;
      if (!authData) return res.status(401).json({ status: "error", message: "Google Drive non connecté" });

      const tokens = JSON.parse(authData.tokens);
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.APP_URL}/api/auth/google/callback`
      );
      oauth2Client.setCredentials(tokens);

      // Refresh token if needed
      oauth2Client.on('tokens', (newTokens) => {
        const row = db.prepare('SELECT tokens FROM google_auth WHERE id = ?').get('main') as any;
        const currentTokens = JSON.parse(row.tokens);
        const merged = { ...currentTokens, ...newTokens };
        db.prepare('UPDATE google_auth SET tokens = ? WHERE id = ?').run(JSON.stringify(merged), 'main');
      });

      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Gather data (similar to export backup)
      const tables = [
        'users', 'categories', 'products', 'customers', 
        'sales', 'sale_items', 'payments', 'stock_movements', 
        'customer_history', 'activity_log', 'suppliers', 'supplier_history',
        'settings'
      ];
      const data: any = {};
      for (const table of tables) {
        data[table] = db.prepare(`SELECT * FROM ${table}`).all();
      }
      const backupContent = JSON.stringify({ data, timestamp: new Date().toISOString() }, null, 2);

      const fileName = `POS_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

      const fileMetadata = {
        name: fileName,
        parents: [], // Root directory if empty
      };
      
      const media = {
        mimeType: 'application/json',
        body: backupContent,
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });

      logActivity('SYSTEM', 'backup', `Database backed up to Google Drive: ${fileName}`, 'system', 'System');
      res.json({ status: "success", fileId: response.data.id });
    } catch (e: any) {
      console.error("Drive upload failed:", e);
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/backup/export", (req, res) => {
    try {
      const tables = [
        'users', 'categories', 'products', 'customers', 
        'sales', 'sale_items', 'payments', 'stock_movements', 
        'customer_history', 'activity_log', 'suppliers', 'supplier_history',
        'settings'
      ];
      const data: any = {};
      for (const table of tables) {
        data[table] = db.prepare(`SELECT * FROM ${table}`).all();
      }
      res.json({ status: "success", data, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/backup/import", (req, res) => {
    const { data } = req.body;
    if (!data) return res.status(400).json({ status: "error", message: "No data provided" });

    const transaction = db.transaction(() => {
      // Disable FKs during import to avoid constraint violations during intermediate steps
      db.prepare('PRAGMA foreign_keys = OFF').run();

      const tables = [
        'sale_items', 
        'stock_movements', 
        'customer_history', 
        'supplier_history', 
        'payments', 
        'sales', 
        'products', 
        'categories', 
        'customers', 
        'suppliers', 
        'activity_log', 
        'users',
        'settings'
      ];
      
      // Clean up existing data
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table}`).run();
      }

      // Re-insert data in reverse order (parents first)
      const insertOrder = [...tables].reverse();
      for (const table of insertOrder) {
        const rows = data[table] || [];
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(',');
        const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
        
        for (const row of rows) {
          const values = columns.map(col => row[col]);
          stmt.run(...values);
        }
      }

      db.prepare('PRAGMA foreign_keys = ON').run();
    });

    try {
      transaction();
      // Re-initialize DB to ensure defaults exist if they were missing in the backup
      initDb();
      logActivity('SYSTEM', 'import', 'Database restored from backup', 'system', 'System');
      res.json({ status: "success", message: "Backup restored successfully" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Fallback for API routes
  app.all("/api/*", (req, res) => {
    console.log(`404 API: ${req.method} ${req.url}`);
    res.status(404).json({ status: "error", message: `API route not found: ${req.method} ${req.url}` });
  });

  // --- Vite Middleware / Static Serving ---
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    // __dirname is dist-server in production, so dist is ../dist
    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Express Error:", err);
    res.status(500).json({ status: "error", message: err.message || "Internal Server Error" });
  });
}

startServer().catch(err => {
  console.error("Critical server startup failure:", err);
  process.exit(1);
});
