import { createServer } from 'node:http';
import { config } from 'dotenv';
import pg from 'pg';
import { handleMenuApi } from './menu-api.js';

config();

const { Pool } = pg;
const port = Number(process.env.PORT || 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const MAX_JSON_BODY_BYTES = 4.25 * 1024 * 1024;

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('DATABASE_URL and a SESSION_SECRET of at least 32 characters are required');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': frontendOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...extraHeaders,
    Vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      const error = new Error('Ukuran request terlalu besar.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 204, {});

  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const body = ['POST', 'PUT'].includes(request.method) ? await readJson(request) : {};
    const menuApiResponse = await handleMenuApi(request, url.pathname, body);
    if (menuApiResponse) {
      return sendJson(response, menuApiResponse.status, menuApiResponse.body, menuApiResponse.headers);
    }

    if (request.method === 'GET' && url.pathname === '/api/health/db') {
      const result = await pool.query('SELECT current_database() AS database, now() AS server_time');
      return sendJson(response, 200, { connected: true, ...result.rows[0] });
    }

    return sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return sendJson(response, error.statusCode || 500, {
      error: error.statusCode === 413 ? error.message : 'Terjadi kesalahan pada server',
    });
  }
});

server.listen(port, () => {
  console.log(`Alas Daun API listening on http://localhost:${port}`);
});
