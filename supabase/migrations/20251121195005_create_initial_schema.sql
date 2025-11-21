/*
  # Create Initial Database Schema

  1. New Tables
    - `profiles` - User profiles with authentication and metadata
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `first_name` (text)
      - `last_name` (text)
      - `company_name` (text)
      - `is_admin` (boolean)
      - `is_active` (boolean)
      - `role` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `products` - Product catalog
      - `item_code` (text, primary key)
      - `description` (text)
      - `brand` (text)
      - `category` (text)
      - `case_label` (text)
      - `allow_case` (boolean)
      - `allow_each` (boolean)
      - `image_path` (text)
      - `image_case` (text)
      - `image_each` (text)
      - `qty_available` (int4)
      - `product_details` (text)
      - `inserted_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `orders` - Customer orders
      - `id` (uuid, primary key)
      - `order_number` (text, unique)
      - `user_id` (uuid, foreign key to profiles)
      - `customer_name` (text)
      - `company_name` (text)
      - `email` (text)
      - `placed_at` (timestamptz)

    - `order_items` - Individual items in orders
      - `id` (int8, primary key)
      - `order_id` (uuid, foreign key to orders)
      - `item_code` (text, foreign key to products)
      - `uom` (text)
      - `quantity` (int4)

    - `carts` - Shopping carts
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `status` (text)
      - `items` (jsonb)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can view and manage their own data
    - Admins have elevated permissions

  3. Relationships
    - orders.user_id → profiles.id
    - order_items.order_id → orders.id
    - order_items.item_code → products.item_code
    - carts.user_id → profiles.id
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  company_name text,
  is_admin boolean DEFAULT false,
  is_active boolean DEFAULT true,
  role text DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  item_code text PRIMARY KEY,
  description text,
  brand text,
  category text,
  case_label text,
  allow_case boolean DEFAULT false,
  allow_each boolean DEFAULT false,
  image_path text,
  image_case text,
  image_each text,
  qty_available int4 DEFAULT 0,
  product_details text,
  inserted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id),
  customer_name text,
  company_name text,
  email text,
  placed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_code text NOT NULL REFERENCES products(item_code),
  uom text,
  quantity int4 DEFAULT 1
);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'active',
  items jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Anyone can view products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view order items for own orders"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (orders.user_id = auth.uid() OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true)
    )
  );

CREATE POLICY "Users can manage own cart"
  ON carts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own cart"
  ON carts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own cart"
  ON carts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_item_code ON order_items(item_code);
CREATE INDEX idx_carts_user_id ON carts(user_id);
