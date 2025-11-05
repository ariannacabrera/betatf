import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { ShoppingCart, Search, Filter, ChevronLeft, Trash2, Package, LogOut, Upload } from 'lucide-react';

// Admin credentials
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const TanyFoodsApp = () => {
  // State management
  const [users, setUsers] = useState({});
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState({});
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userData, setUserData] = useState({});
  const [currentPage, setCurrentPage] = useState('catalog');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showSignup, setShowSignup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);

useEffect(() => {
  (async () => {
    console.log('ENV URL ->', import.meta.env.VITE_SUPABASE_URL);
    console.log('ENV KEY present ->', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('description', { ascending: true });

    if (error) {
      console.error('SUPABASE ERROR:', error);
      alert('Supabase error: ' + (error.message || JSON.stringify(error)));
      return;
    }

    console.log('Products loaded:', data?.length || 0);
    setProducts(data || []);
  })();
}, []);



  // Save data to localStorage
  const saveUsers = (newUsers) => {
    localStorage.setItem('tany_users', JSON.stringify(newUsers));
    setUsers(newUsers);
  };

  const saveProducts = (newProducts) => {
    localStorage.setItem('tany_products', JSON.stringify(newProducts));
    setProducts(newProducts);
  };

  const saveOrders = (newOrders) => {
    localStorage.setItem('tany_orders', JSON.stringify(newOrders));
    setOrders(newOrders);
  };

  // Authentication
  const handleSignup = (formData) => {
    const { firstName, lastName, companyName, email, password, confirmPassword } = formData;
    
    if (!firstName || !lastName || !companyName || !email || !password) {
      alert('Please fill in all required fields');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    if (users[email]) {
      alert('Email already registered. Please log in.');
      return;
    }

    const newUsers = {
      ...users,
      [email]: { first_name: firstName, last_name: lastName, company_name: companyName, password }
    };
    saveUsers(newUsers);
    alert('Account created successfully! Please log in.');
    setShowSignup(false);
  };

  const handleLogin = (email, password) => {
    if (users[email] && users[email].password === password) {
      setLoggedIn(true);
      setUserData({ ...users[email], email });
      setIsAdmin(false);
    } else {
      alert('Invalid credentials');
    }
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

  // Cart operations
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
    alert('✅ Added to cart!');
  };

  const updateCartQuantity = (cartKey, newQuantity) => {
    setCart({
      ...cart,
      [cartKey]: { ...cart[cartKey], quantity: parseInt(newQuantity) }
    });
  };

  const removeFromCart = (cartKey) => {
    const newCart = { ...cart };
    delete newCart[cartKey];
    setCart(newCart);
  };

  const submitOrder = () => {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const orderId = `ORD-${now.toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;

    const order = {
      order_id: orderId,
      timestamp,
      customer_name: `${userData.first_name} ${userData.last_name}`,
      company_name: userData.company_name,
      email: userData.email,
      items: Object.values(cart)
    };

    saveOrders([...orders, order]);
    setCart({});
    setShowOrderConfirmation(false);
    alert(`✅ Order ${orderId} submitted successfully!`);
    setCurrentPage('catalog');
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = searchQuery === '' || 
      p.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['All', ...new Set(products.map(p => p.category || 'Uncategorized'))];

  // Components
  const SignupPage = () => {
    const [formData, setFormData] = useState({
      firstName: '', lastName: '', companyName: '', email: '', password: '', confirmPassword: ''
    });

    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-teal-600 mb-2">Tany Foods</h1>
            <p className="text-gray-600 text-sm">Products you long for™</p>
            <p className="text-xs text-gray-400 mt-1">— Est. 2016 —</p>
          </div>
          
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Create Your Account</h2>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="First Name*"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={formData.firstName}
              onChange={(e) => setFormData({...formData, firstName: e.target.value})}
            />
            <input
              type="text"
              placeholder="Last Name*"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={formData.lastName}
              onChange={(e) => setFormData({...formData, lastName: e.target.value})}
            />
            <input
              type="text"
              placeholder="Company Name*"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={formData.companyName}
              onChange={(e) => setFormData({...formData, companyName: e.target.value})}
            />
            <input
              type="email"
              placeholder="Email*"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
            <input
              type="password"
              placeholder="Password*"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
            <input
              type="password"
              placeholder="Confirm Password*"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
            />
            
            <button
              onClick={() => handleSignup(formData)}
              className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
            >
              Sign Up
            </button>
            
            <button
              onClick={() => setShowSignup(false)}
              className="w-full text-teal-600 py-2 text-sm hover:underline"
            >
              Already have an account? Log In
            </button>
          </div>
        </div>
      </div>
    );
  };

  const LoginPage = () => {
    const [activeTab, setActiveTab] = useState('customer');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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
              className={`flex-1 py-3 font-medium ${activeTab === 'customer' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}
            >
              Customer Login
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex-1 py-3 font-medium ${activeTab === 'admin' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500'}`}
            >
              Admin Login
            </button>
          </div>
          
          {activeTab === 'customer' ? (
            <div className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                onClick={() => handleLogin(email, password)}
                className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
              >
                Log In
              </button>
              <button
                onClick={() => setShowSignup(true)}
                className="w-full text-teal-600 py-2 text-sm hover:underline"
              >
                Don't have an account? Sign Up
              </button>
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
                className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
              >
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
            onClick={() => {
              setSelectedProduct(product);
              setCurrentPage('product_detail');
            }}
            className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
          >
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
              <p className="text-teal-100 text-sm">Welcome, {userData.first_name}!</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800">
              <LogOut size={18} />
              <span className="hidden sm:inline">Logout</span>
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
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center gap-2"
            >
              <Filter size={18} />
              <span className="hidden sm:inline">Filter</span>
            </button>
          </div>
          
          {showFilters && (
            <div className="mt-3">
              <select
                className="w-full px-4 py-2 rounded-lg text-gray-800"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
          
          <button
            onClick={() => setCurrentPage('cart')}
            className="w-full mt-3 bg-amber-500 text-white py-2 rounded-lg font-medium hover:bg-amber-600 flex items-center justify-center gap-2"
          >
            <ShoppingCart size={20} />
            View Cart ({Object.keys(cart).length})
          </button>
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
            {filteredProducts.map((product, idx) => (
              <ProductCard key={idx} product={product} />
            ))}
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
    if (selectedProduct.allow_case !== false) uomOptions.push('Case');
    if (selectedProduct.allow_each !== false) uomOptions.push('Each');

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage('catalog')}
                className="flex-1 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2"
              >
                <ChevronLeft size={20} />
                Back to Catalog
              </button>
              <button
                onClick={() => setCurrentPage('cart')}
                className="flex-1 bg-amber-500 px-4 py-2 rounded-lg hover:bg-amber-600 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={20} />
                Cart ({Object.keys(cart).length})
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
                {selectedProduct.brand && (
                  <p className="text-sm text-gray-600">Brand: <span className="font-medium text-gray-800">{selectedProduct.brand}</span></p>
                )}
              </div>

              {uomOptions.length > 0 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Unit of Measure</label>
                    <div className="flex gap-2">
                      {uomOptions.map(uom => (
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                  </div>

                  <button
                    onClick={() => {
                      addToCart(selectedProduct, selectedUom, quantity);
                      setCurrentPage('catalog');
                    }}
                    className="w-full bg-teal-600 text-white py-3 rounded-lg font-semibold hover:bg-teal-700 flex items-center justify-center gap-2"
                  >
                    <ShoppingCart size={20} />
                    Add to Cart
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

  const CartPage = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-teal-600 text-white shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <button
            onClick={() => setCurrentPage('catalog')}
            className="w-full bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800 flex items-center justify-center gap-2"
          >
            <ChevronLeft size={20} />
            Back to Catalog
          </button>
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
                    {Object.entries(cart).map(([key, item]) => (
                      <tr key={key}>
                        <td className="px-4 py-3 text-sm font-medium">{item.item_code}</td>
                        <td className="px-4 py-3 text-sm">{item.description}</td>
                        <td className="px-4 py-3 text-sm">{item.brand || '—'}</td>
                        <td className="px-4 py-3 text-sm">{item.uom}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(key, e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => removeFromCart(key)}
                            className="text-red-600 hover:text-red-800"
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

            <button
              onClick={() => setShowOrderConfirmation(true)}
              className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Package size={24} />
              Send Order
            </button>

            {showOrderConfirmation && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">⚠️ Confirm Order</h3>
                  <p className="text-gray-600 mb-6">Are you sure you want to submit this order?</p>
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

  const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('orders');
    const [fileData, setFileData] = useState(null);

    const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target.result;
          const lines = text.split('\n');
          const headers = lines[0].split(',').map(h => h.trim());
          
          const newProducts = [];
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim());
            const product = {};
            headers.forEach((header, idx) => {
              product[header] = values[idx] || '';
            });
            newProducts.push(product);
          }
          
          saveProducts(newProducts);
          alert(`✅ Uploaded ${newProducts.length} products successfully!`);
          setFileData(newProducts);
        } catch (err) {
          alert('Error parsing file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-teal-600 text-white shadow-lg">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
              <button onClick={handleLogout} className="flex items-center gap-2 bg-teal-700 px-4 py-2 rounded-lg hover:bg-teal-800">
                <LogOut size={18} />
                Logout
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
              }`}
            >
              <Package size={20} />
              Orders
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
                activeTab === 'products' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700'
              }`}
            >
              <Upload size={20} />
              Products
            </button>
          </div>

          {activeTab === 'orders' ? (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">All Orders</h2>
              
              {orders.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <Package size={64} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No orders received yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-teal-600 text-white rounded-lg p-4">
                    <p className="text-2xl font-bold">{orders.length}</p>
                    <p className="text-sm">Total Orders</p>
                  </div>

                  {orders.map((order, idx) => (
                    <div key={idx} className="bg-white rounded-lg shadow-lg p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-gray-600">Order ID</p>
                          <p className="font-semibold text-gray-800">{order.order_id}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Timestamp</p>
                          <p className="font-semibold text-gray-800">{order.timestamp}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Customer</p>
                          <p className="font-semibold text-gray-800">{order.customer_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Company</p>
                          <p className="font-semibold text-gray-800">{order.company_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Email</p>
                          <p className="font-semibold text-gray-800">{order.email}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total Items</p>
                          <p className="font-semibold text-gray-800">{order.items.length}</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Order Items:</p>
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
                              {order.items.map((item, itemIdx) => (
                                <tr key={itemIdx} className="border-b border-gray-200">
                                  <td className="py-2">{item.item_code}</td>
                                  <td className="py-2">{item.description}</td>
                                  <td className="py-2">{item.brand || '—'}</td>
                                  <td className="py-2">{item.uom}</td>
                                  <td className="py-2 text-right">{item.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Product Database Management</h2>
              
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Product Database (CSV)</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Required columns: item_code, description, brand, category, allow_case, allow_each, image_url
                </p>
                
                <label className="flex items-center justify-center gap-2 bg-teal-600 text-white py-3 px-6 rounded-lg cursor-pointer hover:bg-teal-700 transition-colors">
                  <Upload size={20} />
                  <span>Choose CSV File</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
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
                        {products.slice(0, 10).map((product, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3">{product.item_code}</td>
                            <td className="px-4 py-3">{product.description}</td>
                            <td className="px-4 py-3">{product.category}</td>
                            <td className="px-4 py-3">{product.brand}</td>
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
            </div>
          )}
        </div>
      </div>
    );
  };

  // Main render
  if (!loggedIn) {
    return showSignup ? <SignupPage /> : <LoginPage />;
  }

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (currentPage === 'catalog') {
    return <CatalogPage />;
  }

  if (currentPage === 'product_detail') {
    return <ProductDetailPage />;
  }

  if (currentPage === 'cart') {
    return <CartPage />;
  }

  return <CatalogPage />;
};

export default TanyFoodsApp
