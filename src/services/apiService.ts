const API_URL = '/api';

const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    let errorData;
    if (contentType && contentType.includes("application/json")) {
      errorData = await response.json();
    } else {
      errorData = { message: await response.text() };
    }
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }
  // If not JSON but OK, could be text
  return response.text();
};

const post = async (url: string, data: any) => handleResponse(await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
}));

const put = async (url: string, data: any) => handleResponse(await fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
}));

const del = async (url: string) => handleResponse(await fetch(url, { method: 'DELETE' }));

export const api = {
  // Auth
  login: async (username, password) => post(`${API_URL}/auth/login`, { username, password }),

  // Products
  getProducts: async () => handleResponse(await fetch(`${API_URL}/products`)),
  addProduct: async (product) => post(`${API_URL}/products`, product),
  updateProduct: async (id, product) => put(`${API_URL}/products/${id}`, product),
  adjustStock: async (id, data) => post(`${API_URL}/products/${id}/adjust`, data),
  deleteProduct: async (id) => del(`${API_URL}/products/${id}`),

  // Categories
  getCategories: async () => handleResponse(await fetch(`${API_URL}/categories`)),
  addCategory: async (name) => post(`${API_URL}/categories`, { name }),
  deleteCategory: async (id) => del(`${API_URL}/categories/${id}`),

  // Customers
  getCustomers: async () => handleResponse(await fetch(`${API_URL}/customers`)),
  addCustomer: async (customer) => post(`${API_URL}/customers`, customer),
  updateCustomer: async (id, customer) => put(`${API_URL}/customers/${id}`, customer),

  // Users
  getUsers: async () => handleResponse(await fetch(`${API_URL}/users`)),
  register: async (username, password, role, permissions) => post(`${API_URL}/auth/register`, { username, password, role, permissions }),
  updateUser: async (id, data) => put(`${API_URL}/users/${id}`, data),

  // Debt/Payments
  getPayments: async () => handleResponse(await fetch(`${API_URL}/payments`)),
  addPayment: async (customerId, paymentData) => post(`${API_URL}/customers/${customerId}/payment`, paymentData),
  addCharge: async (customerId, amount, description) => post(`${API_URL}/customers/${customerId}/charge`, { amount, description }),
  getCustomerHistory: async (customerId) => handleResponse(await fetch(`${API_URL}/customers/${customerId}/history`)),
  
  // Suppliers
  getSuppliers: async () => handleResponse(await fetch(`${API_URL}/suppliers`)),
  addSupplier: async (supplier) => post(`${API_URL}/suppliers`, supplier),
  updateSupplier: async (id, supplier) => put(`${API_URL}/suppliers/${id}`, supplier),
  addSupplierPayment: async (supplierId, paymentData) => post(`${API_URL}/suppliers/${supplierId}/payment`, paymentData),
  addSupplierCharge: async (supplierId, amount, description) => post(`${API_URL}/suppliers/${supplierId}/charge`, { amount, description }),
  getSupplierHistory: async (supplierId) => handleResponse(await fetch(`${API_URL}/suppliers/${supplierId}/history`)),

  // Sales
  getSales: async () => handleResponse(await fetch(`${API_URL}/sales`)),
  getChecks: async () => handleResponse(await fetch(`${API_URL}/checks`)),
  createSale: async (sale) => post(`${API_URL}/sales`, sale),

  // Stats
  getStats: async () => handleResponse(await fetch(`${API_URL}/stats`)),

  // Activity Logs
  getActivityLogs: async () => handleResponse(await fetch(`${API_URL}/activity`)),
  
  // Google Drive Backup
  getGoogleAuthUrl: async () => handleResponse(await fetch(`${API_URL}/auth/google/url`)),
  getGoogleDriveStatus: async () => handleResponse(await fetch(`${API_URL}/backup/drive/status`)),
  backupToGoogleDrive: async () => handleResponse(await fetch(`${API_URL}/backup/drive/upload`, { method: 'POST' })),

  // Communications
  sendEmail: async (data) => post(`${API_URL}/send-email`, data),
  sendWhatsApp: async (data) => post(`${API_URL}/send-whatsapp`, data),
  
  // Backup
  exportBackup: async () => handleResponse(await fetch(`${API_URL}/backup/export`)),
  importBackup: async (data: any) => post(`${API_URL}/backup/import`, { data }),
  
  // Settings
  getSettings: async () => handleResponse(await fetch(`${API_URL}/settings`)),
  updateSettings: async (settings) => post(`${API_URL}/settings`, settings)
};
