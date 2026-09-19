-- Run this in Supabase SQL Editor before running seed_supabase.py

-- Vector similarity search support (used by langchain_postgres.PGVector)
create extension if not exists vector;

create table if not exists categories (
  id text primary key,
  name text not null,
  description text
);

create table if not exists products (
  id text primary key,
  category_id text references categories(id),
  name text not null,
  brand text,
  price numeric(10, 2) not null,
  stock integer not null,
  rating numeric(3, 1),
  image text,
  description text,
  specs jsonb,
  reviews jsonb
);

create table if not exists orders (
  order_id text primary key,
  customer text not null,
  date date not null,
  status text not null,
  total numeric(10, 2) not null,
  shipping text
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists order_items (
  id serial primary key,
  order_id text references orders(order_id) on delete cascade,
  product_id text references products(id),
  quantity integer not null,
  price numeric(10, 2) not null
);
