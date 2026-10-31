import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'alasdaun_session';
const SESSION_MAX_AGE = 8 * 60 * 60;
const MAX_MENU_IMAGE_BYTES = 3 * 1024 * 1024;
const MENU_IMAGE_DIRECTORY = fileURLToPath(
  new URL('../frontend/public/asset/images/menu/', import.meta.url),
);
const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', matches: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/png': { extension: 'png', matches: (data) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', matches: (data) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
  'image/gif': { extension: 'gif', matches: (data) => ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)) },
};
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  pool ||= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

function sessionSecret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return process.env.SESSION_SECRET;
}

function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function sessionCookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function createSession(adminId) {
  const payload = Buffer.from(JSON.stringify({
    adminId,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getSessionToken(headers) {
  const cookies = headers.cookie?.split(';') ?? [];
  const session = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`));
  return session?.trim().slice(SESSION_COOKIE.length + 1);
}

function verifySession(token) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() && typeof data.adminId === 'string' ? data.adminId : null;
  } catch {
    return null;
  }
}

export async function isAdminRequest(headers) {
  const adminId = verifySession(getSessionToken(headers));
  if (!adminId) return false;
  const result = await getPool().query('SELECT 1 FROM admins WHERE id = $1', [adminId]);
  return result.rowCount > 0;
}

function response(status, body, headers = {}) {
  return { status, body, headers };
}

function normalizeMenuItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    descriptionId: row.descriptionId,
    descriptionEn: row.descriptionEn,
    image: row.image,
    isBestSeller: row.isBestSeller,
    isNew: row.isNew,
    promo: row.promo,
    sortOrder: row.sortOrder,
  };
}

const menuFields = `id, name, category, price, description_id AS "descriptionId",
  description_en AS "descriptionEn", image_url AS image,
  is_best_seller AS "isBestSeller", is_new AS "isNew", promo,
  sort_order AS "sortOrder"`;

function validateMenuItem(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Data menu tidak valid.';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  const descriptionId = typeof body.descriptionId === 'string' ? body.descriptionId.trim() : '';
  const descriptionEn = typeof body.descriptionEn === 'string' ? body.descriptionEn.trim() : '';
  const image = typeof body.image === 'string' ? body.image.trim() : '';
  const price = Number(body.price);
  const promo = body.promo === '' || body.promo === null || body.promo === undefined
    ? null
    : Number(body.promo);

  if (!name || name.length > 120) return 'Nama menu wajib diisi (maksimal 120 karakter).';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category) || category.length > 60) {
    return 'Kategori harus berupa slug, misalnya paket-makanan.';
  }
  if (!Number.isSafeInteger(price) || price < 1) return 'Harga harus berupa bilangan bulat lebih dari 0.';
  if (!descriptionId || descriptionId.length > 1000) return 'Deskripsi Bahasa Indonesia wajib diisi (maksimal 1000 karakter).';
  if (!descriptionEn || descriptionEn.length > 1000) return 'Deskripsi Bahasa Inggris wajib diisi (maksimal 1000 karakter).';
  const isUploadedImage = /^\/asset\/images\/menu\/[0-9a-f-]+\.(?:jpg|png|webp|gif)$/i.test(image);
  if (!isUploadedImage) {
    try {
      const imageUrl = new URL(image);
      if (!['http:', 'https:'].includes(imageUrl.protocol)) throw new Error('invalid protocol');
    } catch {
      return 'Pilih file gambar atau gunakan URL gambar http/https yang valid.';
    }
  }
  if (promo !== null && (!Number.isInteger(promo) || promo < 1 || promo > 99)) {
    return 'Promo harus berupa persentase bilangan bulat dari 1 sampai 99.';
  }
  if (typeof body.isBestSeller !== 'boolean' || typeof body.isNew !== 'boolean') {
    return 'Status best seller dan menu baru harus berupa boolean.';
  }
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return 'Status tampil harus berupa boolean.';
  }
  const sortOrder = body.sortOrder === '' || body.sortOrder === null || body.sortOrder === undefined
    ? 0
    : Number(body.sortOrder);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) return 'Urutan harus berupa bilangan bulat 0 atau lebih.';

  return {
    name,
    category,
    price,
    descriptionId,
    descriptionEn,
    image,
    isBestSeller: body.isBestSeller,
    isNew: body.isNew,
    promo,
    sortOrder,
  };
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, hash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function handleMenuApi(request, path, body = {}) {
  const { method, headers } = request;
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};

  if (method === 'POST' && path === '/api/auth/login') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 254 || password.length > 256) {
      return response(400, { error: 'Email dan password wajib diisi.' });
    }

    const result = await getPool().query(
      'SELECT id, email, password_hash FROM admins WHERE lower(email) = $1',
      [email],
    );
    const admin = result.rows[0];
    if (!admin || !(await verifyPassword(password, admin.password_hash))) {
      return response(401, { error: 'Email atau password salah.' });
    }

    return response(200, { authenticated: true, email: admin.email }, {
      'Set-Cookie': sessionCookie(createSession(admin.id), SESSION_MAX_AGE),
    });
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    return response(200, { authenticated: false }, { 'Set-Cookie': cookieOptions(0) });
  }

  if (method === 'GET' && path === '/api/auth/session') {
    const adminId = verifySession(getSessionToken(headers));
    if (!adminId) {
      return response(200, { authenticated: false }, { 'Set-Cookie': cookieOptions(0) });
    }
    const result = await getPool().query('SELECT email FROM admins WHERE id = $1', [adminId]);
    if (!result.rows[0]) {
      return response(200, { authenticated: false }, { 'Set-Cookie': cookieOptions(0) });
    }
    return response(200, { authenticated: true, email: result.rows[0].email });
  }

  if (method === 'GET' && path === '/api/menu') {
    const result = await getPool().query(
      `SELECT ${menuFields} FROM menu_items
       WHERE is_active = TRUE ORDER BY sort_order, name`,
    );
    return response(200, { data: result.rows.map(normalizeMenuItem) });
  }

  if (method === 'POST' && path === '/api/admin/menu/image') {
    if (!(await isAdminRequest(headers))) return response(401, { error: 'Unauthorized' });
    if (process.env.VERCEL) {
      return response(503, {
        error: 'Upload file ke folder lokal tidak tersedia di Vercel. Simpan file di frontend/public/asset/images/menu lalu deploy ulang.',
      });
    }

    const contentType = typeof body.contentType === 'string' ? body.contentType.toLowerCase() : '';
    const imageType = IMAGE_TYPES[contentType];
    if (!imageType || typeof body.data !== 'string') {
      return response(400, { error: 'Format gambar harus JPEG, PNG, WebP, atau GIF.' });
    }
    if (body.data.length > Math.ceil(MAX_MENU_IMAGE_BYTES * 4 / 3) + 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data)) {
      return response(400, { error: 'Data gambar tidak valid atau ukurannya terlalu besar.' });
    }

    const imageData = Buffer.from(body.data, 'base64');
    if (imageData.length === 0 || imageData.length > MAX_MENU_IMAGE_BYTES || !imageType.matches(imageData)) {
      return response(400, { error: 'Isi file tidak cocok dengan format gambar atau ukurannya melebihi 3 MB.' });
    }

    await mkdir(MENU_IMAGE_DIRECTORY, { recursive: true });
    const filename = `${randomUUID()}.${imageType.extension}`;
    await writeFile(join(MENU_IMAGE_DIRECTORY, filename), imageData, { flag: 'wx' });
    return response(201, { data: { image: `/asset/images/menu/${filename}` } });
  }

  if (path === '/api/admin/menu' || path.startsWith('/api/admin/menu/')) {
    if (!(await isAdminRequest(headers))) return response(401, { error: 'Unauthorized' });

    if (method === 'GET' && path === '/api/admin/menu') {
      const result = await getPool().query(
        `SELECT ${menuFields}, is_active AS "isActive" FROM menu_items
         ORDER BY sort_order, name`,
      );
      return response(200, { data: result.rows.map(normalizeMenuItem).map((item, index) => ({
        ...item,
        isActive: result.rows[index].isActive,
      })) });
    }

    if (method === 'POST' && path === '/api/admin/menu') {
      const item = validateMenuItem(body);
      if (typeof item === 'string') return response(400, { error: item });
      const result = await getPool().query(
        `INSERT INTO menu_items
          (name, category, price, description_id, description_en, image_url,
           is_best_seller, is_new, promo, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${menuFields}`,
        [item.name, item.category, item.price, item.descriptionId, item.descriptionEn,
          item.image, item.isBestSeller, item.isNew, item.promo, item.sortOrder],
      );
      return response(201, { data: normalizeMenuItem(result.rows[0]) });
    }

    const id = path.slice('/api/admin/menu/'.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return response(400, { error: 'ID menu tidak valid.' });
    }

    if (method === 'PUT') {
      const item = validateMenuItem(body);
      if (typeof item === 'string') return response(400, { error: item });
      const result = await getPool().query(
        `UPDATE menu_items SET
           name = $2, category = $3, price = $4, description_id = $5,
           description_en = $6, image_url = $7, is_best_seller = $8,
           is_new = $9, promo = $10, sort_order = $11, is_active = $12
         WHERE id = $1
         RETURNING ${menuFields}, is_active AS "isActive"`,
        [id, item.name, item.category, item.price, item.descriptionId,
          item.descriptionEn, item.image, item.isBestSeller, item.isNew,
          item.promo, item.sortOrder, body.isActive !== false],
      );
      if (!result.rows[0]) return response(404, { error: 'Menu tidak ditemukan.' });
      return response(200, { data: { ...normalizeMenuItem(result.rows[0]), isActive: result.rows[0].isActive } });
    }

    if (method === 'DELETE') {
      const result = await getPool().query('DELETE FROM menu_items WHERE id = $1 RETURNING id', [id]);
      if (!result.rows[0]) return response(404, { error: 'Menu tidak ditemukan.' });
      return response(200, { deleted: true });
    }
  }

  return null;
}

export function writeApiResponse(responseObject, result) {
  responseObject.status(result.status);
  for (const [name, value] of Object.entries(result.headers)) {
    responseObject.setHeader(name, value);
  }
  responseObject.setHeader('Cache-Control', 'no-store');
  responseObject.json(result.body);
}

export function newPasswordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Password admin harus memiliki panjang 12 sampai 256 karakter.');
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
