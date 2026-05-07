# Website Pengumuman Kelulusan MTs Arrobiyah Azzain

Sistem pengumuman kelulusan modern untuk Tahun Ajaran 2025/2026. Proyek ini berisi frontend publik, dashboard admin, backend Express, integrasi Google Spreadsheet, import Excel, export/backup, QR verifikasi, dan cetak PDF.

## Fitur Utama

- Beranda premium dengan glassmorphism, animasi, jam realtime, tanggal realtime, running text, dan countdown pengumuman.
- Sistem lock pengumuman berdasarkan tanggal dan jam aktif.
- Pencarian NISN dengan validasi, loading state, QR verifikasi, share WhatsApp, cetak dan download PDF.
- Dashboard admin dengan statistik Chart.js, aktivitas terbaru, CRUD siswa, import Excel, export Excel/CSV, backup JSON, restore JSON, dan pengaturan website.
- Login admin menggunakan JWT, bcrypt, captcha sederhana, remember me, rate limiter, Helmet, dan sanitasi input.
- Google Spreadsheet API sebagai database utama, dengan fallback data demo dan cache Firestore opsional.
- PWA, SEO meta, lazy-ready assets, dark/light mode, dan struktur siap deploy.

## Struktur Project

```text
public/
  assets/css/
  assets/js/
  assets/img/
  uploads/
  admin/
backend/
  server.js
  auth.js
  spreadsheet.js
  firebase.js
database/
templates/
```

## Menjalankan Lokal

```bash
npm install
cp .env.example .env
npm run dev
```

Buka `http://localhost:3000`.

## Login Admin

Atur `.env`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<hash bcrypt>
JWT_SECRET=<secret panjang>
```

Buat hash password:

```bash
node -e "require('bcryptjs').hash('PasswordKuat123!', 12).then(console.log)"
```

Untuk uji lokal cepat, `.env.example` menyediakan hash demo untuk username `admin` dan password `Admin123!`. Ganti sebelum production.

## Google Spreadsheet

1. Buat Google Spreadsheet.
2. Buat sheet bernama `Students`.
3. Salin header dari [database/spreadsheet-template.csv](database/spreadsheet-template.csv).
4. Buat service account di Google Cloud, aktifkan Google Sheets API, lalu share spreadsheet ke email service account.
5. Isi `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, dan `GOOGLE_PRIVATE_KEY` di `.env`.

Kolom wajib:

```text
Nomor SKTL, NISN, NIS, Nama, Nomor peserta, Status, Status Kelulusan, Foto
```

## Template Import

Gunakan [templates/import-template.csv](templates/import-template.csv) atau file `.xlsx` dengan header yang sama. Dashboard admin mendukung preview, validasi dasar, deteksi duplikasi NISN, dan update massal.

## Deployment

Siap deploy ke Vercel, Netlify Functions/Node adapter, Firebase Hosting + Cloud Run/Functions, shared hosting Node, atau VPS.

Pastikan environment production memakai HTTPS, `JWT_SECRET` kuat, password admin diganti, dan kredensial service account tidak pernah dipublikasikan.
# mts
