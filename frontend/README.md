# Alas Daun Frontend

Frontend React dengan JavaScript (JS/JSX) untuk website RM Alas Daun. Vite
menjalankan development server dan Tailwind CSS menangani styling.

## Menjalankan

```bash
npm install
npm run dev
```

Untuk deploy ke Vercel, gunakan folder root project ini sebagai **Root
Directory**. Vercel akan membuild `frontend` dan menjalankan endpoint Neon
secara serverless.

Untuk development lokal, jalankan backend di terminal lain agar reservasi
tersimpan ke Neon:

```bash
cd ../backend
npm install
copy .env.example .env
npm run dev
```

Isi `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, dan `SESSION_SECRET` di
`backend/.env`. Schema Neon dan panduan lengkap tersedia di
[`../backend/neon/README.md`](../backend/neon/README.md).
