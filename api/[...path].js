import pg from 'pg';
import { handleMenuApi, isAdminRequest, writeApiResponse } from '../backend/menu-api.js';

const { Pool } = pg;
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  pool ||= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

function json(response, status, body) {
  response.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export default async function handler(request, response) {
  const path = `/api/${Array.isArray(request.query.path) ? request.query.path.join('/') : request.query.path || ''}`;

  try {
    const menuApiResponse = await handleMenuApi(request, path, request.body || {});
    if (menuApiResponse) return writeApiResponse(response, menuApiResponse);

    if (request.method === 'GET' && path === '/api/health/db') {
      const result = await getPool().query('SELECT current_database() AS database, now() AS server_time');
      return json(response, 200, { connected: true, ...result.rows[0] });
    }

    if (request.method === 'POST' && path === '/api/reservations') {
      const body = request.body || {};
      const result = await getPool().query(
        `INSERT INTO reservations (name, phone, date, time, guests, area, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, phone, date, time, guests, area, notes, status, created_at`,
        [body.name, body.phone, body.date, body.time, body.guests, body.area || null, body.notes || null],
      );
      return json(response, 201, { data: result.rows[0] });
    }

    if (request.method === 'GET' && path === '/api/reservations') {
      if (!(await isAdminRequest(request.headers))) return json(response, 401, { error: 'Unauthorized' });
      const result = await getPool().query(
        `SELECT id, name, phone, date, time, guests, area, notes, status, created_at
         FROM reservations ORDER BY created_at DESC`,
      );
      return json(response, 200, { data: result.rows });
    }

    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: 'Terjadi kesalahan pada server' });
  }
}
