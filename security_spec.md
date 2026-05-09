# Security Specification - ShopMaster POS

## Data Invariants
- A Product must always have a name and non-negative quantity.
- A Sale must have at least one item and the total must match the sum of items (minus discount).
- A Customer's debt can only be modified by a successful Sale (increase) or Payment (decrease).
- Only Admins can modify product prices or delete categories.

## Detailed Payloads (Dirty Dozen)
1. **Unauthorized Write**: User without auth tries to update a product quantity.
2. **Identity Spoofing**: Staff A tries to create a sale record with Staff B's ID.
3. **Price Manipulation**: Staff tries to update a product's base price during checkout.
4. **Debt Injection**: Malicious user tries to set their own debt to 0.
5. **Orphaned Sale**: Sale record created without reducing product inventory (Batch sync check).
6. **Large Document Attack**: Injecting 1MB of garbage into the product name.
7. **Negative Price**: Creating a product with price -100.
8. **Invalid ID**: Using special characters in document IDs to break indexing.
9. **Role Escalation**: Staff member updating their own role to 'admin'.
10. **Terminal State Break**: Trying to modify a Sale record after it has been created.
11. **Negative Inventory**: Checking out more items than are in stock (handled at app level, rules enforce batch).
12. **PII Leak**: Non-admin user trying to list all customer phone numbers/emails (Restricted to relevant staff).

## Rules Logic
- `isSignedIn()`: Basic auth check.
- `isAdmin()`: Check `users/$(uid)` for 'admin' role.
- `isValidProduct()`: Schema validation for products.
- `isValidSale()`: Schema validation for sales.
- `isValidCustomer()`: Schema validation for customers.
- `canAccessCustomer()`: Read restriction for PII.
