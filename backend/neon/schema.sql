-- Alas Daun - Neon PostgreSQL schema
-- Run this file in the Neon SQL Editor or with:
-- psql "$DATABASE_URL" -f neon/schema.sql
--
-- Keep DATABASE_URL on a server or serverless function. Never expose it as a
-- VITE_* variable because the Vite bundle is public.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admins_email_not_empty CHECK (char_length(btrim(email)) BETWEEN 3 AND 254)
);

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_lower_idx
  ON admins (lower(email));

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  price integer NOT NULL CHECK (price > 0),
  description_id text NOT NULL CHECK (char_length(btrim(description_id)) BETWEEN 1 AND 1000),
  description_en text NOT NULL CHECK (char_length(btrim(description_en)) BETWEEN 1 AND 1000),
  image_url text NOT NULL CONSTRAINT menu_items_image_url_check
    CHECK (image_url ~ '^https?://' OR image_url ~ '^/asset/images/menu/[0-9a-f-]+\.(jpg|png|webp|gif)$'),
  is_best_seller boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  promo integer CHECK (promo IS NULL OR promo BETWEEN 1 AND 99),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_items_public_order_idx
  ON menu_items (is_active, sort_order, name);

CREATE OR REPLACE FUNCTION set_menu_items_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS menu_items_set_updated_at ON menu_items;

CREATE TRIGGER menu_items_set_updated_at
BEFORE UPDATE ON menu_items
FOR EACH ROW
EXECUTE FUNCTION set_menu_items_updated_at();

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  phone text NOT NULL CHECK (char_length(btrim(phone)) BETWEEN 8 AND 30),
  date date NOT NULL,
  time time NOT NULL,
  guests integer NOT NULL CHECK (guests BETWEEN 1 AND 100),
  area text CHECK (area IS NULL OR char_length(btrim(area)) BETWEEN 1 AND 120),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservations_date_time_idx
  ON reservations (date, time);

CREATE INDEX IF NOT EXISTS reservations_status_created_at_idx
  ON reservations (status, created_at DESC);

CREATE OR REPLACE FUNCTION set_reservations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_set_updated_at ON reservations;

CREATE TRIGGER reservations_set_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW
EXECUTE FUNCTION set_reservations_updated_at();
