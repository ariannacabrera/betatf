import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { ShoppingCart, Search, Filter, ChevronLeft, Trash2, Package, LogOut, Upload, History } from 'lucide-react';
/* =========================
   CSV helpers (no deps)
   ======================== */
function ordersToCSV(orders) {
  const rows = [];
  // add quantity after brand
  rows.push(['item_code', 'item_description', 'brand', 'quantity', 'uom'].join(','));

  orders.forEach(o => {
    (o.items || []).forEach(it => {
      const uomOut = it.uom === 'Each' ? 'EA' : (it.case_label || 'Case');
      const qtyOut = Number.isFinite(Number(it.quantity)) ? it.quantity : 1;

      rows.push([
        csv(it.item_code),
        csv(it.description),
        csv(it.brand ?? ''),
        csv(qtyOut),
        csv(uomOut)
      ].join(','));
    });
  });

  return rows.join('\n');

  function csv(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
/* =========================
   Minimal CSV -> rows of objects
   ========================= */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ''));
    return row;
  });
}
// Admin creds (keep simple for now)
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
/* =========================
   Tiny toast helper
   ========================= */
function showToast(message) {
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    background: 'rgba(16, 185, 129, 0.95)',
    color: 'white',
    padding: '12px 16px',
    borderRadius: '10px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
    fontSize: '14px',
    zIndex: 9999,
    maxWidth: '280px',
    wordBreak: 'break-word',
    opacity: '0',
    transition: 'opacity .25s ease',
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = '1'));
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2200);
}
function displayOrderId(o) {
  // Prefer your human-friendly order_number set at submit time.
  if (o.order_number) return o.order_number;
  // Fallback: short, readable slice of the UUID
  return `#${String(o.order_id).slice(0, 8).toUpperCase()}`;
}
// ---- Cart persistence helpers (Supabase) ----
const loadCartForUser = async (userId) => {
  const { data, error } = await supabase
    .from('carts')
    .select('items')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .maybeSingle();
  if (error) {
    console.error('loadCartForUser:', error);
    return {};
  }
  return (data?.items ?? {});
};
const persistCartForUser = async (userId, cartObj) => {
  // upsert one draft cart per user
  const payload = {
    user_id: userId,
    status: 'draft',
    items: cartObj,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase
    .from('carts')
    .upsert(payload, { onConflict: 'user_id, status' }); // uses the partial unique index
  if (error) console.error('persistCartForUser:', error);
};
const clearDraftCartForUser = async (userId) => {
  const { error } = await supabase
    .from('carts')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'draft');
  if (error) console.error('clearDraftCartForUser:', error);
};

/* =========================
   CSV & Validation Helpers
   ========================= */
const REQUIRED_HEADERS = [
  'item_code', 'description', 'brand', 'category',
  'allow_case', 'allow_each', 'image_path' // Note: Your CSV header must be 'image_path', not 'image_url'
];
const OPTIONAL_HEADERS = [
  'case_label', 'product_details', 'qty_available', 'image_url', 'image_case', 'image_each' // Added image_url here just in case
];
const ALLOWED = new Set([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);

const toBool = v => ['true', '1', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase());

const toIntOrNull = v => {
  const s = String(v ?? '').match(/-?\d+/)?.[0];
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) ? n : null;
};

// Tiny CSV splitter that respects quotes for commas inside fields
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/* ====================================================================
   PAGE & UI COMPONENTS (Moved outside the main app)
   ==================================================================== */
/* ------------- Login Page ------------- */
const LoginPage = ({ tryCustomerLogin, handleAdminLogin }) => {
  const [activeTab, setActiveTab] = useState('customer');
  const [email, setEmail] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-teal-600 mb-2">Tany Foods</h1>
          <p className="text-gray-600 text-sm">Products you long for™</p>
          <p className="text-xs text-gray-400 mt-1">- Est. 2016 -</p>
        </div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Welcome Back!</h2>
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('customer')}
            className={`flex-1 py-3 font-medium ${activeTab === 'customer' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}>
            Customer Login
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-3 font-medium ${activeTab === 'admin' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}>
            Admin Login
          </button>
        </div>
        {activeTab === 'customer' ? (
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Authorized email"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              onClick={() => tryCustomerLogin(email)}
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700">
              Continue
            </button>
            <p className="text-xs text-gray-500 text-center"></p>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Admin Username"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
            />
            <input
              type="password"
              placeholder="Admin Password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
            />
            <button
              onClick={() => handleAdminLogin(adminUser, adminPass)}
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700">
              Admin Log In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
/* ------------- Product Card (for Catalog) ------------- */
const ProductCard = ({ product, setSelectedProduct, setCurrentPage }) => {
  const imgSrc = product.image_url || product.image_path || 'https://via.placeholder.com/600x400';
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
      <div className="h-40 bg-gray-100 flex items-center justify-center p-4">
        <img src={imgSrc} alt={product.description} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2 h-10">{product.description}</h3>
        <p className="text-xs text-gray-500 mb-3">{product.item_code}</p>
        <button
          onClick={() => { setSelectedProduct(product); setCurrentPage('product_detail'); }}
          className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          View Details
        </button>
      </div>
    </div>
  );
};
/* ------------- Catalog Page ------------- */
const CatalogPage = ({
  userData,
  handleLogout,
  searchQuery,
  setSearchQuery,
  showFilters,
  setShowFilters,
  selectedCategory,
  setSelectedCategory,
  categories,
  cart,
  setCurrentPage,
  filteredProducts,
  setSelectedProduct
}) => (
  <div className="min-h-screen bg-gray-50">
    <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Tany Foods</h1>
            <p className="text-teal-100 text-sm">Welcome, {userData.first_name || 'Guest'}!</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800">
            <LogOut size={18} /><span className="hidden sm:inline">Logout</span>
          </button>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by description, brand, or item code..."
              className="w-full pl-10 pr-4 py-2 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-300"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center gap-2">
            <Filter size={18} /><span className="hidden sm:inline">Filter</span>
          </button>
        </div>
        {showFilters && (
          <div className="mt-3">
            <select className="w-full px-4 py-2 rounded-lg text-gray-800"
              value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              {categories.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => setCurrentPage('order_history')}
            className="bg-white text-teal-700 py-2 rounded-lg font-medium hover:bg-teal-50 border border-teal-200 flex items-center justify-center gap-2">
            <History size={18} /> Order History
          </button>
          <button onClick={() => setCurrentPage('cart')}
            className="bg-amber-500 text-white py-2 rounded-lg font-medium hover:bg-amber-600 flex items-center justify-center gap-2">
            <ShoppingCart size={20} /> View Cart ({Object.keys(cart).length})
          </button>
        </div>
      </div>
    </header>
    <main className="container mx-auto px-4 py-6">
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <Package size={64} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No products found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.item_code || product.description}
              product={product}
              setSelectedProduct={setSelectedProduct}
              setCurrentPage={setCurrentPage}
            />
          ))}
        </div>
      )}
    </main>
  </div>
);
/* ------------- Product Detail Page ------------- */
const ProductDetailPage = ({ selectedProduct, setCurrentPage, cart, addToCart }) => {
  const [selectedUom, setSelectedUom] = useState('Case');
  const [quantity, setQuantity] = useState(1);

  if (!selectedProduct) return null;

  // Set default UOM based on product
  useEffect(() => {
    if (selectedProduct) {
      if (selectedProduct.allow_case) {
        setSelectedUom('Case');
      } else if (selectedProduct.allow_each) {
        setSelectedUom('Each');
      }
    }
  }, [selectedProduct]);

  let imgSrc =
    selectedProduct.image_url ||
    selectedProduct.image_path ||
    'https://via.placeholder.com/600x400';

  // 2) If a UOM is selected and we have a specific image for it, override
  if (selectedUom === 'Case' && selectedProduct.image_case) {
    imgSrc = selectedProduct.image_case;
  } else if (selectedUom === 'Each' && selectedProduct.image_each) {
    imgSrc = selectedProduct.image_each;
  }
    
  const uomOptions = [];
  if (selectedProduct.allow_case) uomOptions.push('Case');
  if (selectedProduct.allow_each) uomOptions.push('Each');

  // --- Stock message logic (reads from Supabase field `qty_available`) ---
  const qtyAvailable = Number(selectedProduct.qty_available ?? 0);
  let stockLine = '';
  let disclaimer = '';
  if (qtyAvailable === 0) {
    // single combined line only
    stockLine = "Out of stock — we'll confirm availability but we can't guarantee delivery.";
  } else if (qtyAvailable < 5) {
    stockLine = "Low stock — we'll confirm availability but we can't guarantee delivery.";
  } else {
    stockLine = 'In Stock';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage('catalog')}
              className="flex-1 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2"
            >
              <ChevronLeft size={20} /> Back to Catalog
            </button>
            <button
              onClick={() => setCurrentPage('cart')}
              className="flex-1 bg-amber-500 px-4 py-2 rounded-lg hover:bg-amber-600 flex items-center justify-center gap-2"
            >
              <ShoppingCart size={20} /> Cart ({Object.keys(cart).length})
            </button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {selectedProduct.description}
          </h1>
          <p className="text-gray-500 mb-4">{selectedProduct.item_code}</p>
          <div className="h-56 bg-gray-100 rounded-lg flex items-center justify-center mb-6">
            <img
              src={imgSrc}
              alt={selectedProduct.description}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">
                Category:{' '}
                <span className="font-medium text-gray-800">
                  {selectedProduct.category || 'N/A'}
                </span>
              </p>
              {selectedProduct.brand && (
                <p className="text-sm text-gray-600">
                  Brand:{' '}
                  <span className="font-medium text-gray-800">
                    {selectedProduct.brand}
                  </span>
                </p>
              )}
              {/* === START: ADD THIS NEW BLOCK === */}
              {selectedProduct.product_details && (
                <p className="text-sm text-gray-600">
                  Description:{' '}
                  <span className="font-medium text-gray-800">
                    {selectedProduct.product_details}
                  </span>
                </p>
              )}

            </div>

            {uomOptions.length > 0 ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit of Measure
                  </label>
                  <div className="flex gap-2">
                    {uomOptions.map((uom) => (
                      <button
                        key={uom}
                        onClick={() => setSelectedUom(uom)}
                        className={`flex-1 py-2 rounded-lg font-medium ${
                          selectedUom === uom
                            ? 'bg-teal-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {uom}
                      </button>
                    ))}
                  </div>
                </div>
                {/* --- Quantity picker with + / - and safe typing --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity
                  </label>
                  {/* Stock messaging (no qty number exposed) */}
                  {stockLine && <p className="text-xs text-gray-600 mb-1">{stockLine}</p>}
                  {disclaimer && <p className="text-xs text-gray-500 mb-2">{disclaimer}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, Number(q) - 1))}
                      className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(quantity)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') return setQuantity('');
                        if (/^\d+$/.test(v)) {
                          const n = parseInt(v, 10);
                          setQuantity(Number.isFinite(n) ? Math.max(1, n) : 1);
                        }
                      }}
                      onBlur={() => {
                        const n = parseInt(quantity, 10);
                        if (!Number.isFinite(n) || n < 1) setQuantity(1);
                      }}
                      className="w-20 text-center px-2 py-2 border border-gray-300 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, Number(q) + 1))}
                      className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const n = parseInt(quantity, 10);
                    const safeQty = Number.isFinite(n) && n > 0 ? n : 1;
                    addToCart(selectedProduct, selectedUom, safeQty);
                    setCurrentPage('catalog');
                  }}
                  className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 flex items-center justify-center gap-2"
                >
                  <ShoppingCart size={20} /> Add to Cart
                </button>
              </>
            ) : (
              <p className="text-red-600 text-center">
                This product is not available for purchase.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
/* ------------- Cart Page ------------- */
const CartPage = ({
  cart,
  setCurrentPage,
  updateCartQuantity,
  updateCartUom,
  removeFromCart,
  showOrderConfirmation,
  setShowOrderConfirmation,
  submitOrder,
  handleLogout,
  productByCode, 
  // REMOVED: updateCartField, item
}) => {
  const [editingQty, setEditingQty] = React.useState({});
  const cartIsEmpty = Object.keys(cart).length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCurrentPage('catalog')}
                className="bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2"
              >
                <ChevronLeft size={20} /> Back to Catalog
              </button>
              <button
                onClick={() => setCurrentPage('order_history')}
                className="bg-white text-teal-700 px-4 py-2 rounded-lg hover:bg-teal-50 border border-teal-200 flex items-center justify-center gap-2"
              >
                <History size={18} /> Order History
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800"
            >
              <LogOut size={18} /><span>Logout</span>
            </button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Shopping Cart</h1>
        {cartIsEmpty ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <ShoppingCart size={64} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Your cart is empty. Start shopping!</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-teal-600 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">Item Code</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Brand</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Qty</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">UOM</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(cart).map(([key, item]) => {
                      const p = productByCode.get(item.item_code) || {};
                      const allowCase = !!p.allow_case;
                      const allowEach = !!p.allow_each;
                      const caseLabel = p.case_label || 'Case';
                      const displayQty = editingQty[key] !== undefined ? editingQty[key] : String(item.quantity);

                      return (
                        <tr key={key}>
                          <td className="px-4 py-3 text-sm font-medium">{item.item_code}</td>
                          <td className="px-4 py-3 text-sm">
                            {p.description || item.description || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {p.brand || item.brand || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={displayQty}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditingQty((prev) => ({ ...prev, [key]: v }));
                              }}
                              onBlur={() => {
                                const v = editingQty[key];
                                const n = v ? parseInt(v, 10) : item.quantity;
                                const finalQty = !Number.isFinite(n) || n < 1 ? 1 : n;
                                updateCartQuantity(key, finalQty);
                                setEditingQty((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                              }}
                              className="w-16 text-center border border-gray-300 rounded-lg p-1 text-sm"
                            />
                          </td>
            
                          <td className="px-4 py-3 text-sm">
                            {allowCase && allowEach ? (
                              <select
                                value={item.uom}
                                onChange={(e) => updateCartUom(key, e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-sm"
                              >
                                <option value="Case">Case</option>
                                <option value="Each">Each</option>
                              </select>
                            ) : (
                              <span>{item.uom}</span>
                            )}
                          </td>
                          
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => removeFromCart(key)}
                              className="text-red-500 hover:text-red-700"
                              aria-label={`Remove ${p.description || item.description} from cart`}
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* START: SIMPLIFIED ORDER SUBMISSION BLOCK */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <p className="text-sm text-gray-600 mb-6 text-center">
                Your order contains {Object.keys(cart).length} unique items and will be confirmed by Tany Foods after submission.
              </p>
              <button
                onClick={() => setShowOrderConfirmation(true)}
                className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 flex items-center justify-center gap-2"
              >
                <Package size={24} /> Send Order
              </button>
            </div>
            {/* END: SIMPLIFIED ORDER SUBMISSION BLOCK */}

            {/* Confirmation Modal */}
            {showOrderConfirmation && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">
                    ⚠️ Confirm Order
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Are you sure you want to submit this order?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={submitOrder}
                      className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700"
                    >
                      ✅ Yes, Submit
                    </button>
                    <button
                      onClick={() => setShowOrderConfirmation(false)}
                      className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400"
                    >
                      ❌ Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

/* ------------- Order History Page (Customer) ------------- */
const OrderHistoryPage = ({ orders, setCurrentPage, cart, handleLogout }) => {
  const [expanded, setExpanded] = useState(() => new Set());
  
  const toggleExpand = (id) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCurrentPage('catalog')}
                className="bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <ChevronLeft size={20} /> <span className="hidden sm:inline">Back to Catalog</span><span className="sm:hidden">Back</span>
              </button>
              <button
                onClick={() => setCurrentPage('cart')}
                className="bg-white text-teal-700 px-4 py-2 rounded-lg hover:bg-teal-50 border border-teal-200 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <ShoppingCart size={18} /> Cart ({Object.keys(cart).length})
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800"
            >
              <LogOut size={18} /><span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">Order History</h1>
        {orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Package size={64} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No orders yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(o => {
              const id = o.order_id ?? o.id; // Handle fallback ID
              const isOpen = expanded.has(id);
              const itemCount = (o.items || []).length;
              const placed = o.timestamp || o.placed_at || o.created_at;

              return (
                <div key={id} className="bg-white rounded-lg shadow-lg p-4 md:p-6">
                  {/* Order Header Card */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Order Reference</p>
                        <p className="font-bold text-gray-800 text-lg">{displayOrderId(o)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Date Placed</p>
                        <p className="font-medium text-gray-800">
                            {placed ? new Date(placed).toLocaleString() : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Total Items</p>
                        <p className="font-medium text-gray-800">{itemCount}</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => toggleExpand(id)}
                      className="mt-2 md:mt-0 w-full md:w-auto text-sm px-4 py-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 flex items-center justify-center gap-2 transition-colors"
                    >
                      {isOpen ? 'Hide Items' : 'View Items'}
                    </button>
                  </div>

                  {/* Expandable Section */}
                  {isOpen && (
                    <div className="mt-6 border-t border-gray-100 pt-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-3">Items Ordered</h4>
                      
                      {/* 1. DESKTOP VIEW: Table (Hidden on Mobile) */}
                      <div className="hidden md:block bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 border-b border-gray-200">
                            <tr>
                              <th className="text-left py-2 px-4 font-medium text-gray-600">Item Code</th>
                              <th className="text-left py-2 px-4 font-medium text-gray-600">Description</th>
                              <th className="text-left py-2 px-4 font-medium text-gray-600">Brand</th>
                              <th className="text-left py-2 px-4 font-medium text-gray-600">UOM</th>
                              <th className="text-right py-2 px-4 font-medium text-gray-600">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {(o.items || []).map((it, idx) => (
                              <tr key={idx} className="hover:bg-white">
                                <td className="py-2 px-4 font-medium text-gray-800">{it.item_code}</td>
                                <td className="py-2 px-4">{it.description || '—'}</td>
                                <td className="py-2 px-4">{it.brand || '—'}</td>
                                <td className="py-2 px-4">{it.uom}</td>
                                <td className="py-2 px-4 text-right font-bold">{it.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* 2. MOBILE VIEW: Same Box Design, Just Smaller (Hidden on Desktop) */}
                      <div className="md:hidden space-y-2">
                        {(o.items || []).map((it, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-2 border border-gray-200 flex justify-between items-start">
                            <div className="flex-1 min-w-0 pr-2">
                              {/* Reduced font size (text-xs) and removed margin-top */}
                              <p className="font-bold text-gray-800 text-xs leading-tight mb-0.5">
                                {it.description || 'Unknown Item'}
                              </p>
                              {/* Reduced font size (text-[10px]) */}
                              <p className="text-[10px] text-gray-500">
                                {it.item_code} • {it.brand || 'No Brand'}
                              </p>
                            </div>
                            <div className="text-right pl-2 shrink-0">
                              {/* Reduced font size (text-sm instead of text-lg) */}
                              <span className="block font-bold text-teal-700 text-sm">
                                {it.quantity}
                              </span>
                              {/* Reduced font size (text-[10px]) */}
                              <span className="text-[10px] text-gray-500 uppercase">
                                {it.uom}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

/* ------------- Admin Orders Panel ------------- */
const AdminOrdersPanel = ({ orders, setOrders }) => {
  const [expanded, setExpanded] = React.useState(() => new Set());
  const [selected, setSelected] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);

  const allSelected = orders.length > 0 && selected.size === orders.length;

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(orders.map(o => o.id)));
  };

  const downloadSelected = () => {
    if (selected.size === 0) return alert('Select at least one order.');
    const subset = orders.filter(o => selected.has(o.id));
    const csv = ordersToCSV(subset);
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    downloadTextFile(`orders-${stamp}.csv`, csv);
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return alert('Select at least one order.');
    if (!confirm(`Delete ${selected.size} selected order(s)? This cannot be undone.`)) return;

    try {
      setBusy(true);
      const ids = Array.from(selected);

      // 1) Delete order_items for those orders
      const { error: itemsErr } = await supabase
        .from('order_items')
        .delete()
        .in('order_id', ids);
      if (itemsErr) throw itemsErr;

      // 2) Delete orders
      const { error: ordersErr } = await supabase
        .from('orders')
        .delete()
        .in('id', ids);
      if (ordersErr) throw ordersErr;

      // 3) Update local state
      setOrders(prev => prev.filter(o => !selected.has(o.id)));
      setSelected(new Set());
      showToast('🗑️ Deleted selected order(s).');
    } catch (e) {
      console.error(e);
      showToast('❌ Failed to delete: ' + (e?.message || 'Unknown error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-gray-800">All Orders</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm bg-white px-3 py-2 rounded border">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all
          </label>

          {/* NEW: Delete selected (before Download) */}
          <button
            onClick={handleDeleteSelected}
            disabled={busy || selected.size === 0}
            className={`px-4 py-2 rounded-lg font-medium text-white ${busy || selected.size === 0
              ? 'bg-red-300 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {busy ? 'Deleting…' : 'Delete selected'}
          </button>

          <button
            onClick={downloadSelected}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700"
          >
            Download selected (CSV)
          </button>
        </div>
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <p className="text-gray-500">No orders currently awaiting fulfillment.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const id = o.id;
            const isOpen = expanded.has(id);
            const itemCount = (o.items || []).length;
            const email = o.email || o.profiles?.email || '—';
            const companyName = o.company_name || o.profiles?.company_name || '—';

            return (
              <div key={id} className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(id)}
                      onChange={() => toggleSelect(id)}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <p>
                        <span className="text-sm text-gray-600">Order</span><br />
                        <span className="font-semibold text-gray-800">{displayOrderId(o)}</span>
                      </p>
                      <p>
                        <span className="text-sm text-gray-600">Timestamp</span><br />
                        <span className="font-semibold text-gray-800">
                          {(() => {const d = new Date(o.placed_at || o.created_at || o.timestamp);
    const [month, day, year] = d
      .toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      })
      .split("/");

    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${month}-${day}-${year} ${time}`;
  })()}
                        </span>
                      </p>
                      <p>
                        <span className="text-sm text-gray-600">Total Items</span><br />
                        <span className="font-semibold text-gray-800">{itemCount}</span>
                      </p>
                      <p>
                        <span className="text-sm text-gray-600">Company</span><br />
                        <span className="font-semibold text-gray-800">{companyName}</span>
                      </p>
                      <p>
                        <span className="text-sm text-gray-600">Email</span><br />
                        <span className="font-semibold text-gray-800">{email}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleExpand(id)}
                    className="text-sm px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
                  >
                    {isOpen ? 'Hide Items' : `Show Items (${itemCount})`}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-300">
                        <tr>
                          <th className="text-left py-2">Item Code</th>
                          <th className="text-left py-2">Description</th>
                          <th className="text-left py-2">Brand</th>
                          <th className="text-right py-2 pr-4">Qty</th>
                          <th className="text-left py-2">UOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(o.items || []).map((it, idx) => (
                          <tr key={idx} className="border-b border-gray-200">
                            <td className="py-2">{it.item_code}</td>
                            <td className="py-2">{it.description || '—'}</td>
                            <td className="py-2">{it.brand || '—'}</td>
                            <td className="py-2 text-right pr-4">{it.quantity}</td>
                            <td className="py-2">{it.uom === 'Each' ? 'EA' : (it.case_label || 'Case')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------- Admin Products Panel ------------- */
const AdminProductsPanel = ({ products, setProducts }) => {
  // Track which products have unsaved edits
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  // Save only dirty rows back to Supabase
  const saveAllChanges = async () => {
    if (dirtyIds.size === 0) {
      showToast('No changes to save.');
      return;
    }

    try {
      setSaving(true);
      const rowsToSave = products.filter(p => dirtyIds.has(p.item_code));

      const { error } = await supabase
        .from('products')
        .upsert(rowsToSave, { onConflict: 'item_code' });

      if (error) {
        console.error(error);
        showToast('❌ Save failed: ' + error.message);
        return;
      }

      showToast(`✅ Saved ${rowsToSave.length} product(s).`);
      setDirtyIds(new Set()); // clear dirty state
    } catch (err) {
      console.error(err);
      showToast('❌ Save failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // Update a field in the state before saving (mark row as dirty)
  const updateField = (item_code, field, value) => {
    setProducts(prev =>
      prev.map(p =>
        p.item_code === item_code ? { ...p, [field]: value } : p
      )
    );
    setDirtyIds(prev => {
      const next = new Set(prev);
      next.add(item_code);
      return next;
    });
  };

  // Delete a product (still deletes immediately)
  const deleteProduct = async (item_code, description) => {
    if (!window.confirm(`Are you sure you want to delete ${description} (${item_code})?`)) return;
    const { error } = await supabase.from('products').delete().eq('item_code', item_code);
    if (error) {
      console.error(error);
      return showToast('❌ Delete failed: ' + error.message);
    }
    setProducts(prev => prev.filter(p => p.item_code !== item_code));
    setDirtyIds(prev => {
      const next = new Set(prev);
      next.delete(item_code);
      return next;
    });
    showToast(' 🗑️ Deleted');
  };

  const toBool = v => ['true', '1', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase());
  const toIntOrNull = v => {
    const s = String(v ?? '').match(/-?\d+/)?.[0];
    const n = s ? parseInt(s, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  // --------- SAFER uploader -----------
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      if (lines.length < 2) {
        showToast('CSV seems empty.');
        return;
      }

      // Parse headers
      const headers = splitCsvLine(lines[0]).map(h => h.trim());
      const headerSet = new Set(headers);

      // Check for missing headers
      const missing = REQUIRED_HEADERS.filter(h => {
        if (h === 'image_path' && headerSet.has('image_url')) return false;
        return !headerSet.has(h);
      });

      const unknown = headers.filter(h => h && !ALLOWED.has(h));

      if (missing.length) {
        showToast(`⚠️ Missing required headers: ${missing.join(', ')}`);
        return;
      }
      if (unknown.length) {
        showToast(`ℹ️ Ignoring unknown headers: ${unknown.join(', ')}`);
      }

      // Build rows
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        if (!cols.length) continue;

        const raw = {};
        headers.forEach((h, j) => { raw[h] = cols[j] ?? ''; });

        // Keep only allowed headers
        const p = {};
        for (const k in raw) if (ALLOWED.has(k)) p[k] = raw[k];

        // Normalize strings
        if (p.item_code) p.item_code = String(p.item_code).trim();
        if (!p.item_code) continue; // skip row without item_code

        // Handle image path vs url compatibility
        if (p.image_url && !p.image_path) {
          p.image_path = p.image_url;
          delete p.image_url;
        }

        if (p.description) p.description = String(p.description).trim();
        if (p.brand) p.brand = String(p.brand).trim();
        if (p.category) p.category = String(p.category).trim();
        if (p.image_path) p.image_path = String(p.image_path).trim();
        if (p.case_label) p.case_label = String(p.case_label).trim();
        if (p.product_details) p.product_details = String(p.product_details).trim();

        // Booleans
        if (p.allow_case !== undefined) p.allow_case = toBool(p.allow_case);
        if (p.allow_each !== undefined) p.allow_each = toBool(p.allow_each);

        // Integers
        if (p.qty_available !== undefined) {
          const n = toIntOrNull(p.qty_available);
          if (n === null) delete p.qty_available; else p.qty_available = n;
        }

        rows.push(p);
      }

      if (rows.length === 0) {
        showToast('No valid rows to import.');
        return;
      }

      // Upsert to Supabase
      const { error } = await supabase
        .from('products')
        .upsert(rows, { onConflict: 'item_code' });

      if (error) {
        console.error(error);
        showToast('❌ Upload error: ' + (error.message || 'Unknown'));
        return;
      }

      // Refresh table
      const { data: refreshed, error: refErr } = await supabase
        .from('products')
        .select('*')
        .order('item_code', { ascending: true });

      if (!refErr) {
        setProducts(refreshed || []);
        setDirtyIds(new Set()); // freshly loaded from DB, so no unsaved changes
      }

      showToast(`✅ Uploaded ${rows.length} products successfully.`);

      // Clear the file input so the same file can be selected again if needed
      e.target.value = '';

    } catch (err) {
      console.error(err);
      showToast('❌ Failed to read CSV. Please check format.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Panel */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Product Database (CSV)</h3>
        <p className="text-sm text-gray-600 mb-4">
          Required columns: item_code, description, brand, category, allow_case, allow_each, image_url, qty_available
        </p>
        <label className="flex items-center justify-center gap-2 bg-teal-600 text-white py-3 px-6 rounded-lg cursor-pointer hover:bg-teal-700 transition-colors">
          <Upload size={20} />
          <span>Choose CSV File</span>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Product List Table */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            All Products ({products.length})
          </h3>
          <div className="flex items-center gap-3">
            {dirtyIds.size > 0 && (
              <span className="text-xs text-amber-600">
                {dirtyIds.size} product(s) with unsaved changes
              </span>
            )}
            <button
              onClick={saveAllChanges}
              disabled={saving || dirtyIds.size === 0}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                saving || dirtyIds.size === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Code</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Brand</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Category</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Case?</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Each?</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Qty Avail</th>
                <th className="px-4 py-3 text-sm font-medium">Image URL</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map((p) => (
                <tr key={p.item_code}>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={p.item_code || ''}
                      // item_code is key, so keep it read-only
                      disabled
                      className="w-20 border border-gray-300 rounded-lg p-1 text-sm bg-gray-100 text-gray-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={p.description || ''}
                      onChange={e => updateField(p.item_code, 'description', e.target.value)}
                      className="w-48 border border-gray-300 rounded-lg p-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={p.brand || ''}
                      onChange={e => updateField(p.item_code, 'brand', e.target.value)}
                      className="w-24 border border-gray-300 rounded-lg p-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={p.category || ''}
                      onChange={e => updateField(p.item_code, 'category', e.target.value)}
                      className="w-24 border border-gray-300 rounded-lg p-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!p.allow_case}
                      onChange={e => updateField(p.item_code, 'allow_case', e.target.checked)}
                      className="form-checkbox text-teal-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!p.allow_each}
                      onChange={e => updateField(p.item_code, 'allow_each', e.target.checked)}
                      className="form-checkbox text-teal-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      value={p.qty_available ?? ''}
                      onChange={e =>
                        updateField(
                          p.item_code,
                          'qty_available',
                          e.target.value === '' ? null : parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="w-16 border border-gray-300 rounded-lg p-1 text-sm text-right"
                      min="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {/* Default image (uses existing image_url / image_path behavior) */}
                      <input
                        type="text"
                        placeholder="Default image"
                        value={p.image_url || p.image_path || ''}
                        onChange={e => updateField(p.item_code, 'image_url', e.target.value)}
                        className="w-40 border border-gray-300 rounded-lg p-1 text-xs"
                      />
                      {/* Optional CASE image */}
                      <input
                        type="text"
                        placeholder="Case image (optional)"
                        value={p.image_case || ''}
                        onChange={e => updateField(p.item_code, 'image_case', e.target.value)}
                        className="w-40 border border-gray-300 rounded-lg p-1 text-xs"
                      />
                      {/* Optional EACH image */}
                      <input
                        type="text"
                        placeholder="Each image (optional)"
                        value={p.image_each || ''}
                        onChange={e => updateField(p.item_code, 'image_each', e.target.value)}
                        className="w-40 border border-gray-300 rounded-lg p-1 text-xs"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteProduct(p.item_code, p.description)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
            
/* ------------- Admin Customers Panel ------------- */
const AdminCustomersPanel = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '', first_name: '', last_name: '', company_name: '',
    is_admin: false, is_active: true
  });

  // Load customers on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, company_name, is_admin, is_active')
        .order('email', { ascending: true });
      if (error) {
        console.error(error);
        alert('Failed to load customers: ' + error.message);
        setLoading(false);
        return;
      }
      setRows(data || []);
      setLoading(false);
    })();
  }, []);

  const toBool = v => ['true', '1', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase());

  // Handle CSV upload for customers
  const handleCustomersCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Using the minimal splitter from above for the initial unedited version
      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      if (lines.length < 2) {
        showToast('CSV seems empty.');
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim());

      const uploads = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (!values.length || !values[0]) continue; // Skip empty rows or rows without email

        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

        // Basic normalization/validation
        row.email = String(row.email || '').trim().toLowerCase();
        if (!row.email) continue;
        
        // --- Manual type conversion/cleanup for the original code ---
        row.is_admin = toBool(row.is_admin);
        row.is_active = toBool(row.is_active);

        uploads.push({
          email: row.email,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          company_name: row.company_name || null,
          is_admin: row.is_admin,
          is_active: row.is_active,
        });
      }

      if (uploads.length === 0) {
        showToast('No valid customer rows to import.');
        return;
      }
      
      // Upsert
      const { data: updatedRows, error } = await supabase
        .from('profiles')
        .upsert(uploads, { onConflict: 'email' })
        .select('id, email, first_name, last_name, company_name, is_admin, is_active');

      if (error) {
        console.error(error);
        showToast('❌ Customer upload failed: ' + error.message);
        return;
      }

      // Update state
      setRows(prev => {
        const m = new Map(prev.map(r => [r.email, r]));
        updatedRows.forEach(d => m.set(d.email, d));
        return Array.from(m.values()).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      });
      showToast(` ✅ Uploaded ${uploads.length} customers (upserted).`);
      e.target.value = ''; // Clear file input
    } catch (err) {
      console.error(err);
      showToast('❌ Failed to read CSV. Please check the file and try again.');
    }
  };

  // Helper to save a single edited row back to Supabase
  const saveRow = async (row) => {
    if (!row || !row.email) return;
    const { error } = await supabase.from('profiles').upsert([row], { onConflict: 'email' });
    if (error) {
      console.error(error);
      return showToast('❌ Save failed: ' + error.message);
    }
    showToast(' ✅ Customer saved');
  };

  // Helper to update a field in the state before saving
  const updateField = (id, field, value) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, [field]: value } : r
    ));
  };
  
  // Add a new customer
  const addCustomer = async () => {
    if (!newUser.email || !newUser.email.includes('@')) {
      return alert('Enter a valid email');
    }
    setAdding(true);
    const payload = {
      email: newUser.email.trim().toLowerCase(),
      first_name: newUser.first_name || null,
      last_name: newUser.last_name || null,
      company_name: newUser.company_name || null,
      is_admin: !!newUser.is_admin,
      is_active: !!newUser.is_active
    };

    const { data, error } = await supabase.from('profiles').upsert([payload], { onConflict: 'email' }).select('*');
    setAdding(false);

    if (error) {
      console.error(error);
      return alert('Save failed: ' + error.message);
    }
    showToast(' ✅ Customer saved');
    setNewUser({ email: '', first_name: '', last_name: '', company_name: '', is_admin: false, is_active: true });
    
    // Update state and sort by email
    setRows(prev => {
      const m = new Map(prev.map(r => [r.email, r]));
      data.forEach(d => m.set(d.email, d));
      return Array.from(m.values()).sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    });
  };

  // Delete customer
  const deleteCustomer = async (id, email) => {
    if (!window.confirm(`Are you sure you want to delete customer ${email}?`)) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      console.error(error);
      return showToast('❌ Delete failed: ' + error.message);
    }
    setRows(prev => prev.filter(r => r.id !== id));
    showToast(' 🗑️ Deleted');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Upload Authorized Customers (CSV)</h3>
        <p className="text-sm text-gray-600 mb-4">
          Required headers: <code>email, first_name, last_name, company_name, is_admin, is_active</code>
        </p>
        <label className="inline-flex items-center justify-center gap-2 bg-teal-600 text-white py-2 px-4 rounded-lg cursor-pointer hover:bg-teal-700">
          <Upload size={18} />
          <span>Choose CSV File</span>
          <input type="file" accept=".csv" onChange={handleCustomersCsvUpload} className="hidden" />
        </label>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add New Customer</h3>
        <div className="grid grid-cols-2 gap-4">
          <input
            type="email"
            placeholder="Email (Key)"
            value={newUser.email}
            onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
            className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="First Name"
            value={newUser.first_name}
            onChange={e => setNewUser(prev => ({ ...prev, first_name: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Last Name"
            value={newUser.last_name}
            onChange={e => setNewUser(prev => ({ ...prev, last_name: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            placeholder="Company Name"
            value={newUser.company_name}
            onChange={e => setNewUser(prev => ({ ...prev, company_name: e.target.value }))}
            className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <div className="flex items-center gap-4 col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newUser.is_admin}
                onChange={e => setNewUser(prev => ({ ...prev, is_admin: e.target.checked }))}
                className="form-checkbox text-teal-600"
              />
              Admin
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newUser.is_active}
                onChange={e => setNewUser(prev => ({ ...prev, is_active: e.target.checked }))}
                className="form-checkbox text-teal-600"
              />
              Active
            </label>
          </div>
        </div>
        <button
          onClick={addCustomer}
          disabled={adding}
          className="mt-4 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">
          {adding ? 'Saving...' : 'Add / Update'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Authorized Customers</h3>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="email"
                        value={r.email || ''}
                        onChange={e => updateField(r.id, 'email', e.target.value)}
                        onBlur={() => saveRow(rows.find(x => x.id === r.id))}
                        className="w-48 border border-gray-300 rounded-lg p-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        value={`${r.first_name || ''} ${r.last_name || ''}`.trim()}
                        onChange={e => {
                          const parts = e.target.value.split(' ');
                          updateField(r.id, 'first_name', parts[0] || null);
                          updateField(r.id, 'last_name', parts.slice(1).join(' ') || null);
                        }}
                        onBlur={() => saveRow(rows.find(x => x.id === r.id))}
                        className="w-32 border border-gray-300 rounded-lg p-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        value={r.company_name || ''}
                        onChange={e => updateField(r.id, 'company_name', e.target.value)}
                        onBlur={() => saveRow(rows.find(x => x.id === r.id))}
                        className="w-32 border border-gray-300 rounded-lg p-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={!!r.is_admin}
                        onChange={e => { updateField(r.id, 'is_admin', e.target.checked); saveRow({ ...r, is_admin: e.target.checked }); }}
                        className="form-checkbox text-teal-600"
                      />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={!!r.is_active}
                        onChange={e => { updateField(r.id, 'is_active', e.target.checked); saveRow({ ...r, is_active: e.target.checked }); }}
                        className="form-checkbox text-teal-600"
                      />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => deleteCustomer(r.id, r.email)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------- Admin Dashboard (Main) ------------- */
const AdminDashboard = ({ handleLogout, orders, setOrders, products, setProducts }) => {
  const [activeTab, setActiveTab] = useState('orders');
  
  // Note: The handleFileUpload from the original file is now part of AdminProductsPanel
  // to properly utilize the state/setter for products.

  // Admin render
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800">
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>
      </header>
      
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold ${activeTab === 'orders' ? 'bg-teal-600 text-white' : 'bg-white text-teal-600 border border-teal-200 hover:bg-teal-50'}`}
          >
            Order Fulfiment
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold ${activeTab === 'products' ? 'bg-teal-600 text-white' : 'bg-white text-teal-600 border border-teal-200 hover:bg-teal-50'}`}
          >
            Product Management
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold ${activeTab === 'customers' ? 'bg-teal-600 text-white' : 'bg-white text-teal-600 border border-teal-200 hover:bg-teal-50'}`}
          >
            Customer Accounts
          </button>
        </div>
        {activeTab === 'orders' && <AdminOrdersPanel orders={orders} setOrders={setOrders} />}
        {activeTab === 'products' && <AdminProductsPanel products={products} setProducts={setProducts} />}
        {activeTab === 'customers' && <AdminCustomersPanel />}

      </div>
    </div>
  );
};

/* ====================================================================
   MAIN APP COMPONENT
   ==================================================================== */

function TanyFoodsApp() {
  // --- Auth State ---
  const [loggedIn, setLoggedIn] = useState(false);
  const [userData, setUserData] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  
  // --- Navigation State ---
  const [currentPage, setCurrentPage] = useState('catalog'); // 'catalog', 'product_detail', 'cart', 'order_history'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);

  // --- Data State ---
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [cartHydrated, setCartHydrated] = useState(false);
  
  // --- Filter State (Catalog) ---
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');

  // --- Initial Data Load ---
  useEffect(() => {
    (async () => {
      // 1. Load Products (always needed)
      const fetchProducts = async () => {
        const { data: products, error: prodErr } = await supabase
          .from('products')
          .select('*')
          .order('item_code', { ascending: true }); // Original sort order
        if (prodErr) {
          console.error(prodErr);
          showToast('❌ Failed to load products.');
        } else {
          setProducts(products || []);
        }
      };
      await fetchProducts();
    })();
  }, []);

  // --- Product Index (for fast cart lookup) ---
  const productByCode = useMemo(() => {
    return new Map((products || []).map(p => [p.item_code, p]));
  }, [products]);

  // --- Load Orders/Cart on Login ---
  useEffect(() => {
    if (!loggedIn || !userData?.id) return;

    // Load Cart
    loadCartForUser(userData.id).then(initialCart => {
      setCart(initialCart);
      setCartHydrated(true);
    });

    // Load Orders
    (async () => {
      const is_admin = userData.is_admin;
      let query = supabase
          .from('orders')
          .select(`
            *,
            profiles(company_name, email),
            order_items (
              item_code,
              quantity,
              uom,
              products (
                description,
                brand,
                case_label
              )
            )
          `)
        .order('placed_at', { ascending: false });

      if (!is_admin) {
        // Customer-specific filter
        query = query.eq('user_id', userData.id);
      } else {
        // Admin: clear existing orders when switching from customer view
        setOrders([]); 
      }

      const { data: orderData, error: orderErr } = await query;
      if (orderErr) {
        console.error('Failed to load orders:', orderErr);
        showToast('❌ Failed to load order history.');
        return;
      }

      // Format orders (map the JSONB items field into a proper array)
      const formatted = (orderData || []).map(o => ({
        ...o,
        // The items field comes as JSONB from Supabase (an array of objects)
        items: (o.order_items || []).map(it => ({
          item_code: it.item_code,
          uom: it.uom,
          quantity: it.quantity,
          
          // === FIX START: Read directly from 'it', not 'it.products' ===
          // The submitOrder function saves these fields directly to the JSON, 
          // so we don't need to look for a 'products' relation here.
          description: it.description || it.products?.description || '', 
          brand: it.brand || it.products?.brand || '',
          case_label: it.case_label || it.products?.case_label || null
          // === FIX END ===
        }))
      }));
      setOrders(formatted);
    })();
  }, [loggedIn, isAdmin, userData?.id]);

  // --- Auto-save cart to Supabase whenever it changes (debounced) ---
  useEffect(() => {
    if (!loggedIn || !userData?.id || !cartHydrated) return;

    const t = setTimeout(() => {
      // saves even when the cart is empty (useful to clear server copy)
      persistCartForUser(userData.id, cart);
    }, 400); // debounce ~400ms to avoid chatty writes

    return () => clearTimeout(t);
  }, [cart, loggedIn, userData?.id, cartHydrated]);


  /* ------------- Auth ------------- */
  // email-only customer login against profiles
  const tryCustomerLogin = async (rawEmail) => {
    const e = (rawEmail || "").trim().toLowerCase();
    if (!e) return alert("Enter your email");

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, company_name, is_admin, is_active")
      .eq("email", e)
      .maybeSingle();

    if (error || !data) {
      console.error(error);
      return alert("Login failed. Email not authorized, or server error.");
    }
    if (!data.is_active) {
      return alert("Your account is currently inactive. Please contact your administrator.");
    }

    setLoggedIn(true);
    setUserData(data);
    setIsAdmin(!!data.is_admin);
    setCurrentPage('catalog');
  };

  const handleAdminLogin = (user, pass) => {
    if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
      setLoggedIn(true);
      setIsAdmin(true);
      // Admin gets a mock user ID and all profile fields are null/false
      setUserData({ id: 'admin-session', is_admin: true, email: ADMIN_USERNAME }); 
      setCurrentPage('admin');
    } else {
      alert("Invalid admin credentials.");
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setUserData({});
    setCart({});
    setIsAdmin(false);
    setCurrentPage('catalog'); // Go to login page, which will be rendered
  };

  /* ------------- Cart ------------- */
  const addToCart = (product, uom, quantity) => {
    const cartKey = product.item_code;
    
    if (cart[cartKey]) {
      alert('This item is already in your cart. Edit the quantity in the cart.');
      return;
    }
    
    setCart({
      ...cart,
      [cartKey]: {
        item_code: product.item_code,
        description: product.description,
        brand: product.brand,
        quantity: quantity,
        uom: uom,
      }
    });
    showToast(`Added ${quantity} ${uom} of ${product.item_code} to cart.`);
  };

  const removeFromCart = (key) => {
    const { [key]: _, ...rest } = cart;
    setCart(rest);
    showToast('Item removed from cart.');
  };

  const updateCartQuantity = (key, quantity) => {
    setCart({
      ...cart,
      [key]: {
        ...cart[key],
        quantity: quantity,
      }
    });
  };

  const updateCartUom = (key, uom) => {
    setCart({
      ...cart,
      [key]: {
        ...cart[key],
        uom: uom,
      }
    });
  };

  const updateCartField = (field, value) => {
    // This is for the temporary draft cart entry in the DB, not the main cart object structure
    setUserData(prev => ({
      ...prev,
      [field]: value
    }));
  }

  const submitOrder = async () => {
    setShowOrderConfirmation(false);
  
    if (!userData?.id) return alert('Not logged in.');
    if (Object.keys(cart).length === 0) return alert('Your cart is empty.');
  
    try {
      const now = new Date();
      const order_number =
        `ORD-${now.toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;
  
      // 1) Insert order header
      const { data: orderRow, error: orderErr } = await supabase
        .from('orders')
        .insert([{
          order_number,
          user_id: userData.id,
          placed_at: now.toISOString(),
          customer_name: `${userData.first_name ?? ''} ${userData.last_name ?? ''}`.trim() || null,
          company_name: userData.company_name || null,
          email: userData.email || null,
        }])
        .select('id, order_number, placed_at, customer_name, company_name, email')
        .single();
  
      if (orderErr) throw orderErr;
  
      // 2) Insert line items into order_items
      const items = Object.values(cart).map(it => ({
        order_id: orderRow.id,
        item_code: it.item_code,
        uom: it.uom,
        quantity: Number(it.quantity) || 1
      }));
  
      const { error: itemsErr } = await supabase.from('order_items').insert(items);
      if (itemsErr) {
        // rollback header if line insert fails
        await supabase.from('orders').delete().eq('id', orderRow.id);
        throw itemsErr;
      }
  
      // 3) Clear cart (client + server draft)
      setCart({});
      await clearDraftCartForUser(userData.id);
  
      showToast(`🎉 Order ${order_number} submitted!`);
      setCurrentPage('order_history');
    } catch (e) {
      console.error(e);
      showToast('❌ Order failed to submit: ' + (e?.message || 'Unknown error'));
    }
  };

  /* ------------- Filtering & Memoization ------------- */
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    
    return (products || []).filter(p => {
      const itemCode = (p.item_code || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      
      const matchesSearch = q.length === 0 || 
        itemCode.includes(q) || 
        desc.includes(q) || 
        brand.includes(q); // <-- brand search added
      
      const matchesCategory = selectedCategory === 'All' || cat === selectedCategory.toLowerCase();
      
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const categories = useMemo(() => (
    ['All', ...new Set((products || []).map(p => p.category || 'Uncategorized'))].sort()
  ), [products]);


  /* ------------- Main Render ------------- */

  if (!loggedIn) {
    return <LoginPage 
      tryCustomerLogin={tryCustomerLogin} 
      handleAdminLogin={handleAdminLogin} 
    />
  }

  if (isAdmin) {
    return <AdminDashboard 
      handleLogout={handleLogout} 
      orders={orders} 
      setOrders={setOrders}
      products={products}
      setProducts={setProducts}
    />
  }

  if (currentPage === 'admin') { // Should only happen if a customer somehow lands on this page
    setCurrentPage('catalog');
  }

  if (currentPage === 'product_detail') {
    // guard if user navigated here without a selected product
    if (!selectedProduct) {
      setCurrentPage('catalog');
      return null;
    }
    return (
      <ProductDetailPage
        selectedProduct={selectedProduct}
        setCurrentPage={setCurrentPage}
        cart={cart}
        addToCart={addToCart}
      />
    );
  }
  
  if (currentPage === 'cart') {
    return <CartPage
      cart={cart}
      setCurrentPage={setCurrentPage}
      updateCartQuantity={updateCartQuantity}
      updateCartUom={updateCartUom}
      removeFromCart={removeFromCart}
      showOrderConfirmation={showOrderConfirmation}
      setShowOrderConfirmation={setShowOrderConfirmation}
      submitOrder={submitOrder}
      handleLogout={handleLogout} 
      productByCode={productByCode}
      updateCartField={updateCartField} // Pass down the field updater
      item={userData} // Pass userData to read temp fields
    />;
  }

  if (currentPage === 'order_history') {
    return <OrderHistoryPage
      orders={orders}
      setCurrentPage={setCurrentPage}
      cart={cart}
      handleLogout={handleLogout}  
    />;
  }

  // Default to CatalogPage
  return <CatalogPage
    userData={userData}
    handleLogout={handleLogout}
    searchQuery={searchQuery}
    setSearchQuery={setSearchQuery}
    showFilters={showFilters}
    setShowFilters={setShowFilters}
    selectedCategory={selectedCategory}
    setSelectedCategory={setSelectedCategory}
    categories={categories}
    cart={cart}
    setCurrentPage={setCurrentPage}
    filteredProducts={filteredProducts}
    setSelectedProduct={setSelectedProduct}
  />
}

export default TanyFoodsApp;