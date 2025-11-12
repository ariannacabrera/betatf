import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import { ShoppingCart, Search, Filter, ChevronLeft, Trash2, Package, LogOut, Upload, History } from 'lucide-react';

/* =========================
   CSV helpers (no deps)
   ========================= */
function ordersToCSV(orders) {
  const rows = [];
  rows.push([
    'order_id','timestamp','customer_name','company_name','email',
    'item_code','description','brand','uom','quantity'
  ].join(','));

  orders.forEach(o => {
    const base = [
      csv(o.order_id),
      csv(o.timestamp),
      csv(o.customer_name),
      csv(o.company_name),
      csv(o.email),
    ];
    (o.items || []).forEach(it => {
      rows.push([
        ...base,
        csv(it.item_code),
        csv(it.description),
        csv(it.brand ?? ''),
        csv(it.uom),
        it.quantity ?? ''
      ].join(','));
    });
  });

  return rows.join('\n');

  function csv(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
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

/* =========================
   App
   ========================= */
const TanyFoodsApp = () => {
  // State
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userData, setUserData] = useState({});
  const [currentPage, setCurrentPage] = useState('catalog');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);

  // Fast lookup for product details (used to enrich optimistic order items)
  const productByCode = useMemo(
    () => new Map((products || []).map(p => [p.item_code, p])),
    [products]
  );

  // Load products from Supabase
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('description', { ascending: true });

      if (error) {
        console.error('SUPABASE ERROR:', error);
        alert('Supabase error: ' + (error.message || JSON.stringify(error)));
        return;
      }
      setProducts(data || []);
    })();
  }, []);

  // === Load recent orders (admin = all, customer = own) ===
  useEffect(() => {
    if (!loggedIn) return;

    (async () => {
      // Join to products for description/brand via FK
      const baseSelect = `
        id, order_number, placed_at, customer_name, company_name, email, user_id,
        order_items (
          item_code, uom, quantity,
          products:products!order_items_item_code_fkey (description, brand)
        )
      `;

      let q = supabase
        .from('orders')
        .select(baseSelect)
        .order('placed_at', { ascending: false })
        .limit(50);

      if (!isAdmin && userData?.id) {
        q = q.eq('user_id', userData.id);
      }

      const { data, error } = await q;

      if (error) {
        console.error('Load orders error:', error);
        alert('Failed to load orders: ' + error.message);
        return;
      }

      const formatted = (data || []).map(o => ({
        order_id: o.id,
        order_number: o.order_number || null,
        timestamp: new Date(o.placed_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }),
        customer_name: o.customer_name,
        company_name: o.company_name,
        email: o.email,
        items: (o.order_items || []).map(it => ({
          item_code: it.item_code,
          uom: it.uom,
          quantity: it.quantity,
          // join-provided fields; may be empty if the product row doesn't exist
          description: it.products?.description || '',
          brand: it.products?.brand || ''
        }))
      }));

      setOrders(formatted);
    })();
  }, [loggedIn, isAdmin, userData?.id]);

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

    if (error) {
      console.error("Supabase error:", error);
      return alert("Error checking access: " + (error.message || "unknown"));
    }
    if (!data || data.is_active === false) {
      return alert("This email is not authorized.");
    }

    setLoggedIn(true);
    setIsAdmin(Boolean(data.is_admin));
    setUserData({
      id: data.id,
      email: data.email,
      first_name: data.first_name || "",
      last_name: data.last_name || "",
      company_name: data.company_name || ""
    });
  };

  const handleAdminLogin = (username, password) => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setLoggedIn(true);
      setIsAdmin(true);
      setUserData({ first_name: 'Admin' });
    } else {
      alert('Invalid admin credentials');
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setUserData({});
    setCart({});
    setIsAdmin(false);
    setCurrentPage('catalog');
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
        brand: product.brand || '',
        uom,
        quantity: parseInt(quantity)
      }
    });
    showToast('✅ Added to cart!');
  };

  const updateCartQuantity = (cartKey, newQuantity) => {
    setCart(prev => ({
      ...prev,
      [cartKey]: { ...prev[cartKey], quantity: Math.max(1, parseInt(newQuantity, 10) || 1) }
    }));
  };

  const removeFromCart = (cartKey) => {
    const next = { ...cart };
    delete next[cartKey];
    setCart(next);
  };

  const submitOrder = async () => {
    if (!userData?.id) return alert('Not logged in.');
    if (Object.keys(cart).length === 0) return alert('Your cart is empty.');

    const now = new Date();
    const order_number = `ORD-${now.toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;

    // 1) Insert order header
    const { data: orderRow, error: orderErr } = await supabase
      .from('orders')
      .insert([{
        order_number,
        user_id: userData.id,
        placed_at: now.toISOString(),
        customer_name: `${userData.first_name ?? ''} ${userData.last_name ?? ''}`.trim() || null,
        company_name: userData.company_name || null,
        email: userData.email || null
      }])
      .select('id, order_number, placed_at, customer_name, company_name, email')
      .single();

    if (orderErr) {
      console.error(orderErr);
      return alert('Order create failed: ' + orderErr.message);
    }

    // 2) Insert line items
    const items = Object.values(cart).map(it => ({
      order_id: orderRow.id,
      item_code: it.item_code,
      uom: it.uom,
      quantity: Number(it.quantity) || 1
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(items);

    if (itemsErr) {
      console.error(itemsErr);
      await supabase.from('orders').delete().eq('id', orderRow.id);
      return alert('Order items insert failed: ' + itemsErr.message);
    }

    // 3) Update UI and clear cart
    // ENRICH: pull description/brand for the optimistic UI row so it matches DB-loaded rows
    const enrichedItems = items.map(it => {
      const p = productByCode.get(it.item_code);
      return {
        ...it,
        description: p?.description || '',
        brand: p?.brand || ''
      };
    });

    const newOrderForUI = {
      order_id: orderRow.id,
      timestamp: new Date(orderRow.placed_at).toLocaleString('en-US', { timeZone: 'America/Chicago' }),
      customer_name: orderRow.customer_name,
      company_name: orderRow.company_name,
      email: orderRow.email,
      items: enrichedItems
    };

    setOrders(prev => [newOrderForUI, ...prev]);
    setCart({});
    setShowOrderConfirmation(false);
    alert(`✅ Order ${order_number} submitted!`);
    setCurrentPage('catalog');
  };

  /* ------------- Filters ------------- */
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      searchQuery === '' ||
      p.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const categories = ['All', ...new Set(products.map(p => p.category || 'Uncategorized'))];

  /* ------------- Pages ------------- */
  const LoginPage = () => {
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
            <p className="text-xs text-gray-400 mt-1">— Est. 2016 —</p>
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

  const ProductCard = ({ product }) => {
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

  const CatalogPage = () => (
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
                placeholder="Search by item code or description..."
                className="w-full pl-10 pr-4 py-2 rounded-lg text-gray-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            <button onClick={() => setCurrentPage('cart')}
              className="bg-amber-500 text-white py-2 rounded-lg font-medium hover:bg-amber-600 flex items-center justify-center gap-2">
              <ShoppingCart size={20} /> View Cart ({Object.keys(cart).length})
            </button>
            <button onClick={() => setCurrentPage('order_history')}
              className="bg-white text-teal-700 py-2 rounded-lg font-medium hover:bg-teal-50 border border-teal-200 flex items-center justify-center gap-2">
              <History size={18} /> Order History
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
            {filteredProducts.map((product, idx) => (<ProductCard key={idx} product={product} />))}
          </div>
        )}
      </main>
    </div>
  );

  const ProductDetailPage = () => {
    const [selectedUom, setSelectedUom] = useState('Case');
    const [quantity, setQuantity] = useState(1);
    if (!selectedProduct) return null;

    const imgSrc = selectedProduct.image_url || selectedProduct.image_path || 'https://via.placeholder.com/600x400';
    const uomOptions = [];
    if (selectedProduct.allow_case) uomOptions.push('Case');
    if (selectedProduct.allow_each) uomOptions.push('Each');

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex gap-2">
              <button onClick={() => setCurrentPage('catalog')}
                className="flex-1 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2">
                <ChevronLeft size={20} /> Back to Catalog
              </button>
              <button onClick={() => setCurrentPage('cart')}
                className="flex-1 bg-amber-500 px-4 py-2 rounded-lg hover:bg-amber-600 flex items-center justify-center gap-2">
                <ShoppingCart size={20} /> Cart ({Object.keys(cart).length})
              </button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 max-w-2xl">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{selectedProduct.description}</h1>
            <p className="text-gray-500 mb-4">{selectedProduct.item_code}</p>
            <div className="h-56 bg-gray-100 rounded-lg flex items-center justify-center mb-6">
              <img src={imgSrc} alt={selectedProduct.description} className="max-h-full max-w-full object-contain" />
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Category: <span className="font-medium text-gray-800">{selectedProduct.category || 'N/A'}</span></p>
                {selectedProduct.brand && <p className="text-sm text-gray-600">Brand: <span className="font-medium text-gray-800">{selectedProduct.brand}</span></p>}
              </div>

              {uomOptions.length > 0 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Unit of Measure</label>
                    <div className="flex gap-2">
                      {uomOptions.map(uom => (
                        <button key={uom} onClick={() => setSelectedUom(uom)}
                          className={`flex-1 py-2 rounded-lg font-medium ${selectedUom === uom ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                          {uom}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* --- Quantity picker with + / - and safe typing --- */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(q => Math.max(1, Number(q) - 1))}
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
                        onClick={() => setQuantity(q => Math.max(1, Number(q) + 1))}
                        className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button onClick={() => { 
                      const n = parseInt(quantity, 10);
                      const safeQty = Number.isFinite(n) && n > 0 ? n : 1;
                      addToCart(selectedProduct, selectedUom, safeQty); 
                      setCurrentPage('catalog'); 
                    }}
                    className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 flex items-center justify-center gap-2">
                    <ShoppingCart size={20} /> Add to Cart
                  </button>
                </>
              ) : (
                <p className="text-red-600 text-center">This product is not available for purchase.</p>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  };

  const CartPage = () => {
    // Local state for quantity editing to prevent focus loss.
    const [editingQty, setEditingQty] = useState({});

    return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCurrentPage('catalog')}
              className="bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2">
              <ChevronLeft size={20} /> Back to Catalog
            </button>
            <button onClick={() => setCurrentPage('order_history')}
              className="bg-white text-teal-700 px-4 py-2 rounded-lg hover:bg-teal-50 border border-teal-200 flex items-center justify-center gap-2">
              <History size={18} /> Order History
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Shopping Cart</h1>
        {Object.keys(cart).length === 0 ? (
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
                      <th className="px-4 py-3 text-left text-sm font-medium">UOM</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Qty</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {Object.entries(cart).map(([key, item]) => {
                      const displayValue = editingQty[key] !== undefined ? editingQty[key] : String(item.quantity);
                      
                      return (
                      <tr key={key}>
                        <td className="px-4 py-3 text-sm font-medium">{item.item_code}</td>
                        <td className="px-4 py-3 text-sm">{item.description}</td>
                        <td className="px-4 py-3 text-sm">{item.brand || '—'}</td>
                        <td className="px-4 py-3 text-sm">{item.uom}</td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={displayValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditingQty(prev => ({ ...prev, [key]: v }));
                            }}
                            onBlur={() => {
                              const v = editingQty[key];
                              const n = v ? parseInt(v, 10) : item.quantity;
                              const finalQty = (!Number.isFinite(n) || n < 1) ? 1 : n;
                              updateCartQuantity(key, finalQty);
                              setEditingQty(prev => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => removeFromCart(key)} className="text-red-600 hover:text-red-800">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
            
            <button onClick={() => setShowOrderConfirmation(true)}
              className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 flex items-center justify-center gap-2">
              <Package size={24} /> Send Order
            </button>

            {showOrderConfirmation && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">⚠️ Confirm Order</h3>
                  <p className="text-gray-600 mb-6">Are you sure you want to submit this order?</p>
                  <div className="flex gap-3">
                    <button onClick={submitOrder} className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700">✅ Yes, Submit</button>
                    <button onClick={() => setShowOrderConfirmation(false)} className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400">❌ Cancel</button>
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
  // -------- Customers' Order History (non-admin) --------
  const OrderHistoryPage = () => {
    // reuse the `orders` state already loaded by your effect
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
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setCurrentPage('catalog')}
                className="bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2"
              >
                <ChevronLeft size={20} /> Back to Catalog
              </button>
              <button
                onClick={() => setCurrentPage('cart')}
                className="bg-white text-teal-700 px-4 py-2 rounded-lg hover:bg-teal-50 border border-teal-200 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} /> Cart ({Object.keys(cart).length})
              </button>
            </div>
          </div>
        </header>
  
        <main className="container mx-auto px-4 py-6 max-w-4xl">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Order History</h1>
  
          {orders.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Package size={64} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No orders yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map(o => {
                const isOpen = expanded.has(o.order_id);
                const itemCount = (o.items || []).length;
  
                return (
                  <div key={o.order_id} className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <p>
                            <span className="text-sm text-gray-600">Order</span><br/>
                            <span className="font-semibold text-gray-800">{displayOrderId(o)}</span>
                          </p>
                          <p>
                            <span className="text-sm text-gray-600">Placed</span><br/>
                            <span className="font-semibold text-gray-800">{o.timestamp}</span>
                          </p>
                          <p>
                            <span className="text-sm text-gray-600">Customer</span><br/>
                            <span className="font-semibold text-gray-800">{o.customer_name || '—'}</span>
                          </p>
                          <p>
                            <span className="text-sm text-gray-600">Company</span><br/>
                            <span className="font-semibold text-gray-800">{o.company_name || '—'}</span>
                          </p>
                          <p>
                            <span className="text-sm text-gray-600">Email</span><br/>
                            <span className="font-semibold text-gray-800">{o.email || '—'}</span>
                          </p>
                          <p>
                            <span className="text-sm text-gray-600">Total Items</span><br/>
                            <span className="font-semibold text-gray-800">{itemCount}</span>
                          </p>
                        </div>
                      </div>
  
                      <button
                        onClick={() => toggleExpand(o.order_id)}
                        className="text-sm px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
                      >
                        {isOpen ? 'Hide items' : `Show items (${itemCount})`}
                      </button>
                    </div>
  
                    {isOpen && (
                      <div className="mt-4">
                        <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-300">
                              <tr>
                                <th className="text-left py-2">Item Code</th>
                                <th className="text-left py-2">Description</th>
                                <th className="text-left py-2">Brand</th>
                                <th className="text-left py-2">UOM</th>
                                <th className="text-right py-2">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items || []).map((it, idx) => (
                                <tr key={idx} className="border-b border-gray-200">
                                  <td className="py-2">{it.item_code}</td>
                                  <td className="py-2">{it.description || '—'}</td>
                                  <td className="py-2">{it.brand || '—'}</td>
                                  <td className="py-2">{it.uom}</td>
                                  <td className="py-2 text-right">{it.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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


  /* ------------- Admin Dashboard ------------- */
  const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('orders');

    // CSV -> upsert products
    const handleFileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim());

      const newProducts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (!values.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
        newProducts.push(row);
      }

      const toBool = v => ['true','1','yes','y'].includes(String(v).trim().toLowerCase());
      newProducts.forEach(p => {
        if (p.allow_case !== undefined) p.allow_case = toBool(p.allow_case);
        if (p.allow_each !== undefined) p.allow_each = toBool(p.allow_each);
        if (p.image_url && !p.image_path) { p.image_path = p.image_url; delete p.image_url; }
        if (p.item_code) p.item_code = String(p.item_code).trim();
      });

      const { error: upsertErr } = await supabase
        .from('products')
        .upsert(newProducts, { onConflict: 'item_code' });

      if (upsertErr) {
        console.error(upsertErr);
        alert('Error saving to Supabase: ' + upsertErr.message);
        return;
      }

      const { data: refreshed, error: refErr } = await supabase
        .from('products')
        .select('*')
        .order('description', { ascending: true });

      if (refErr) {
        console.error(refErr);
        alert('Reload error: ' + refErr.message);
        return;
      }

      setProducts(refreshed || []);
      showToast(`✅ Uploaded ${newProducts.length} products (upserted).`);
    };

    // Orders panel (select + collapse + CSV)
    const OrdersPanel = ({ orders }) => {
      const [selected, setSelected] = React.useState(() => new Set());
      const [expanded, setExpanded] = React.useState(() => new Set());
      const allSelected = orders.length > 0 && selected.size === orders.length;

      const toggleSelect = (id) => {
        const next = new Set(selected);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelected(next);
      };
      const toggleAll = () => {
        if (allSelected) setSelected(new Set());
        else setSelected(new Set(orders.map(o => o.order_id)));
      };
      const toggleExpand = (id) => {
        const next = new Set(expanded);
        next.has(id) ? next.delete(id) : next.add(id);
        setExpanded(next);
      };
      const downloadSelected = () => {
        if (selected.size === 0) {
          alert('Please select at least one order to download.');
          return;
        }
        const selectedOrders = orders.filter(o => selected.has(o.order_id));
        const csv = ordersToCSV(selectedOrders);
        const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
        downloadTextFile(`orders-${stamp}.csv`, csv);
      };

      return (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">All Orders</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-2 rounded border">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                Select all
              </label>
              <button onClick={downloadSelected} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700">
                Download selected (CSV)
              </button>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Package size={64} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No orders received yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-teal-600 text-white rounded-lg p-4 flex items-center gap-6">
                <div>
                  <p className="text-2xl font-bold">{orders.length}</p>
                  <p className="text-sm">Total Orders</p>
                </div>
                <div className="h-6 w-px bg-white/30" />
                <div>
                  <p className="text-lg font-semibold">{selected.size}</p>
                  <p className="text-sm">Selected</p>
                </div>
              </div>

              {orders.map((o) => {
                const id = o.order_id;
                const itemCount = (o.items || []).length;
                const isOpen = expanded.has(id);

                return (
                  <div key={id} className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1" checked={selected.has(id)} onChange={() => toggleSelect(id)} />
                        <div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <p><span className="text-sm text-gray-600">Order ID</span><br/>
                              <span className="font-semibold text-gray-800">{o.order_id}</span></p>
                            <p><span className="text-sm text-gray-600">Timestamp</span><br/>
                              <span className="font-semibold text-gray-800">{o.timestamp}</span></p>
                            <p><span className="text-sm text-gray-600">Customer</span><br/>
                              <span className="font-semibold text-gray-800">{o.customer_name}</span></p>
                            <p><span className="text-sm text-gray-600">Company</span><br/>
                              <span className="font-semibold text-gray-800">{o.company_name}</span></p>
                            <p><span className="text-sm text-gray-600">Email</span><br/>
                              <span className="font-semibold text-gray-800">{o.email}</span></p>
                            <p><span className="text-sm text-gray-600">Total Items</span><br/>
                              <span className="font-semibold text-gray-800">{itemCount}</span></p>
                          </div>
                        </div>
                      </div>

                      <button onClick={() => toggleExpand(id)} className="text-sm px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">
                        {isOpen ? 'Hide items' : `Show items (${itemCount})`}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="mt-4">
                        <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-300">
                              <tr>
                                <th className="text-left py-2">Item Code</th>
                                <th className="text-left py-2">Description</th>
                                <th className="text-left py-2">Brand</th>
                                <th className="text-left py-2">UOM</th>
                                <th className="text-right py-2">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items || []).map((it, idx) => (
                                <tr key={idx} className="border-b border-gray-200">
                                  <td className="py-2">{it.item_code}</td>
                                  <td className="py-2">{it.description}</td>
                                  <td className="py-2">{it.brand || '—'}</td>
                                  <td className="py-2">{it.uom}</td>
                                  <td className="py-2 text-right">{it.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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

    // -------- Customers Panel (profiles table) --------
    const CustomersPanel = () => {
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [adding, setAdding] = useState(false);
      const [newUser, setNewUser] = useState({
        email: '', first_name: '', last_name: '', company_name: '',
        is_admin: false, is_active: true
      });

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

      const toBool = v => ['true','1','yes','y','on'].includes(String(v).trim().toLowerCase());

      const handleCustomersCsvUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parseCsv(text);

        const payload = parsed
          .filter(r => r.email && String(r.email).includes('@'))
          .map(r => ({
            email: String(r.email).trim().toLowerCase(),
            first_name: r.first_name?.trim() || null,
            last_name: r.last_name?.trim() || null,
            company_name: r.company_name?.trim() || null,
            is_admin: r.is_admin !== undefined ? toBool(r.is_admin) : false,
            is_active: r.is_active !== undefined ? toBool(r.is_active) : true,
          }));

        if (payload.length === 0) return alert('CSV has no valid rows.');

        const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'email' });
        if (error) {
          console.error(error);
          return alert('Upsert failed: ' + error.message);
        }

        showToast(`✅ Saved ${payload.length} customers`);
        const { data, error: refErr } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, company_name, is_admin, is_active')
          .order('email', { ascending: true });
        if (!refErr) setRows(data || []);
      };

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
        showToast('✅ Customer saved');
        setNewUser({ email: '', first_name: '', last_name: '', company_name: '', is_admin: false, is_active: true });
        setRows(prev => {
          const m = new Map(prev.map(r => [r.email, r]));
          data.forEach(d => m.set(d.email, d));
          return Array.from(m.values()).sort((a,b)=>a.email.localeCompare(b.email));
        });
      };

      const updateField = (id, key, value) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));
      };

      const saveRow = async (row) => {
        const payload = {
          id: row.id,
          email: row.email?.trim().toLowerCase(),
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          company_name: row.company_name || null,
          is_admin: !!row.is_admin,
          is_active: !!row.is_active
        };
        const { error } = await supabase.from('profiles').update(payload).eq('id', row.id);
        if (error) {
          console.error(error);
          alert('Update failed: ' + error.message);
        } else {
          showToast('✅ Saved');
        }
      };

      const deleteRow = async (id) => {
        if (!confirm('Delete this customer?')) return;
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) {
          console.error(error);
          return alert('Delete failed: ' + error.message);
        }
        setRows(prev => prev.filter(r => r.id !== id));
        showToast('🗑️ Deleted');
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
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Customer</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Email *" value={newUser.email}
                    onChange={e=>setNewUser({...newUser, email: e.target.value})}/>
              <input className="border rounded px-3 py-2" placeholder="First name" value={newUser.first_name}
                    onChange={e=>setNewUser({...newUser, first_name: e.target.value})}/>
              <input className="border rounded px-3 py-2" placeholder="Last name" value={newUser.last_name}
                    onChange={e=>setNewUser({...newUser, last_name: e.target.value})}/>
              <input className="border rounded px-3 py-2" placeholder="Company" value={newUser.company_name}
                    onChange={e=>setNewUser({...newUser, company_name: e.target.value})}/>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newUser.is_admin}
                        onChange={e=>setNewUser({...newUser, is_admin: e.target.checked})}/>
                  Admin
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newUser.is_active}
                        onChange={e=>setNewUser({...newUser, is_active: e.target.checked})}/>
                  Active
                </label>
              </div>
            </div>
            <button
              onClick={addCustomer}
              disabled={adding}
              className="mt-4 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700">
              {adding ? 'Saving…' : 'Add / Update'}
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Authorized Customers</h3>

            {loading ? (
              <p className="text-gray-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-gray-500">No customers yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-teal-600 text-white">
                    <tr>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">First</th>
                      <th className="px-3 py-2 text-left">Last</th>
                      <th className="px-3 py-2 text-left">Company</th>
                      <th className="px-3 py-2 text-center">Admin</th>
                      <th className="px-3 py-2 text-center">Active</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">
                          <input
                            className="border rounded px-2 py-1 w-full"
                            value={r.email || ''}
                            onChange={e=>updateField(r.id, 'email', e.target.value)}
                            onBlur={()=>saveRow(rows.find(x=>x.id===r.id))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input className="border rounded px-2 py-1 w-full"
                                value={r.first_name || ''}
                                onChange={e=>updateField(r.id, 'first_name', e.target.value)}
                                onBlur={()=>saveRow(rows.find(x=>x.id===r.id))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input className="border rounded px-2 py-1 w-full"
                                value={r.last_name || ''}
                                onChange={e=>updateField(r.id, 'last_name', e.target.value)}
                                onBlur={()=>saveRow(rows.find(x=>x.id===r.id))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input className="border rounded px-2 py-1 w-full"
                                value={r.company_name || ''}
                                onChange={e=>updateField(r.id, 'company_name', e.target.value)}
                                onBlur={()=>saveRow(rows.find(x=>x.id===r.id))}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox"
                                checked={!!r.is_admin}
                                onChange={e=>{
                                  updateField(r.id, 'is_admin', e.target.checked);
                                  saveRow({ ...r, is_admin: e.target.checked });
                                }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox"
                                checked={!!r.is_active}
                                onChange={e=>{
                                  updateField(r.id, 'is_active', e.target.checked);
                                  saveRow({ ...r, is_active: e.target.checked });
                                }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={()=>deleteRow(r.id)} className="text-red-600 hover:text-red-800">
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
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                activeTab === 'orders' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700'
              }`}>
              <Package size={20} /> Orders
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                activeTab === 'products' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700'
              }`}>
              <Upload size={20} /> Products
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                activeTab === 'customers' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700'
              }`}>
              Customers
            </button>
          </div>

          {activeTab === 'orders' ? (
            <OrdersPanel orders={orders} />
          ) : activeTab === 'products' ? (
            <>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Product Database Management</h2>

              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Product Database (CSV)</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Required columns: item_code, description, brand, category, allow_case, allow_each, image_url
                </p>
                <label className="flex items-center justify-center gap-2 bg-teal-600 text-white py-3 px-6 rounded-lg cursor-pointer hover:bg-teal-700 transition-colors">
                  <Upload size={20} />
                  <span>Choose CSV File</span>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {products.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Current Products: {products.length}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-teal-600 text-white">
                        <tr>
                          <th className="px-4 py-3 text-left">Item Code</th>
                          <th className="px-4 py-3 text-left">Description</th>
                          <th className="px-4 py-3 text-left">Category</th>
                          <th className="px-4 py-3 text-left">Brand</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {products.slice(0, 10).map((p, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3">{p.item_code}</td>
                            <td className="px-4 py-3">{p.description}</td>
                            <td className="px-4 py-3">{p.category}</td>
                            <td className="px-4 py-3">{p.brand}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {products.length > 10 && (
                      <p className="text-sm text-gray-500 mt-4 text-center">
                        Showing 10 of {products.length} products
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <CustomersPanel />
          )}
        </div>
      </div>
    );
  };

  /* ------------- Main Render ------------- */
  if (!loggedIn) return <LoginPage />;
  if (isAdmin) return <AdminDashboard />;
  if (currentPage === 'catalog') return <CatalogPage />;
  if (currentPage === 'product_detail') return <ProductDetailPage />;
  if (currentPage === 'cart') return <CartPage />;
  if (currentPage === 'order_history') return <OrderHistoryPage />;
  return <CatalogPage />;
};

export default TanyFoodsApp;
