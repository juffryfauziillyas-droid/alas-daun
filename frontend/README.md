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

Backend Node.js dan database Neon tetap berada di repository. Untuk
menjalankan backend secara terpisah:

```bash
cd ../backend
npm install
npm run admin:create
npm run menu:seed
npm run dev
```

Sebelum menjalankan perintah tersebut, salin `backend/.env.example` ke
`backend/.env`, isi `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, dan
`ADMIN_PASSWORD`, lalu jalankan schema Neon. Buka `/` untuk melihat menu dari
database dan `/#/admin` untuk login serta mengelolanya. Panduan database lengkap tersedia di
[`../backend/neon/README.md`](../backend/neon/README.md).
