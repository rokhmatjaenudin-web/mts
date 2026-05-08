require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const multer = require('multer');
const validator = require('validator');
const XLSX = require('xlsx');
const { createCaptcha, login, verifyToke } = require('./auth');
const {
  HEADERS,
  readStudents,
  writeStudents,
  findByNisn,
  upsertStudent,
  deleteStudent,
  importStudents
} = require('./spreadsheet');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const publicDir = path.join(__dirname, '..', 'public');
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(express.static(publicDir, {
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15 });
app.use('/api', apiLimiter);

const schoolSettings = {
  schoolName: 'MTs Arrobiyah Azzain',
  academicYear: '2025/2026',
  announcementOpenAt: process.env.ANNOUNCEMENT_OPEN_AT || '2026-06-01T10:00:00+07:00',
  timezone: process.env.SCHOOL_TIMEZONE || 'Asia/Jakarta',
  runningText: 'Pengumuman kelulusan dapat diakses sesuai jadwal resmi sekolah. Pastikan NISN yang dimasukkan benar.',
  locked: true,
  principal: 'Kepala MTs Arrobiyah Azzain',
  contact: '+6281234567890',
  address: 'Indonesia'
};

const activityLog = [];

function sanitizeStudent(input) {
  const item = {};
  HEADERS.forEach((header) => {
    item[header] = validator.escape(String(input[header] || '').trim());
  });
  return item;
}

function isAnnouncementOpen() {
  return !schoolSettings.locked || Date.now() >= new Date(schoolSettings.announcementOpenAt).getTime();
}

function graduationStatus(item) {
  return String(item['Status Kelulusan'] || '').trim().toUpperCase();
}

function pushActivity(message) {
  activityLog.unshift({ message, time: new Date().toISOString() });
  activityLog.splice(20);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/settings', (req, res) => {
  res.json({ ...schoolSettings, isOpen: isAnnouncementOpen(), serverTime: new Date().toISOString() });
});

app.put('/api/settings', verifyToken, (req, res) => {
  Object.assign(schoolSettings, {
    ...req.body,
    locked: Boolean(req.body.locked)
  });
  pushActivity('Pengaturan website diperbarui.');
  res.json(schoolSettings);
});

app.get('/api/auth/captcha', (req, res) => {
  res.json(createCaptcha());
});

app.post('/api/auth/login', loginLimiter, login);

app.get('/api/students', verifyToken, async (req, res, next) => {
  try {
    res.json(await readStudents({ force: req.query.force === 'true' }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/search', async (req, res, next) => {
  try {
    const nisn = String(req.query.nisn || '').replace(/\D/g, '');
    if (!/^\d{8,12}$/.test(nisn)) return res.status(400).json({ message: 'NISN harus berupa 8-12 digit angka.' });
    if (!isAnnouncementOpen()) {
      return res.status(423).json({ message: 'Pengumuman belum dibuka.', settings: schoolSettings });
    }
    const student = await findByNisn(nisn);
    if (!student) return res.status(404).json({ message: 'Data siswa tidak ditemukan.' });
    res.json(student);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', verifyToken, async (req, res, next) => {
  try {
    const student = sanitizeStudent(req.body);
    if (!student.NISN || !student.Nama) return res.status(400).json({ message: 'NISN dan Nama wajib diisi.' });
    await upsertStudent(student);
    pushActivity(`Data siswa ${student.Nama} disimpan.`);
    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/students/:nisn', verifyToken, async (req, res, next) => {
  try {
    await deleteStudent(req.params.nisn);
    pushActivity(`Data NISN ${req.params.nisn} dihapus.`);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/import', verifyToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File Excel belum diunggah.' });
    const result = await importStudents(req.file.buffer);
    pushActivity(`Import Excel selesai: ${result.imported} baris.`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/export.xlsx', verifyToken, async (req, res, next) => {
  try {
    const rows = await readStudents({ force: true });
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="data-kelulusan-mts-arrobiyah-azzain.xlsx"');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/backup.json', verifyToken, async (req, res, next) => {
  try {
    const rows = await readStudents({ force: true });
    res.setHeader('Content-Disposition', 'attachment; filename="backup-kelulusan.json"');
    res.json({ version: 1, exportedAt: new Date().toISOString(), settings: schoolSettings, rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/restore', verifyToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File backup JSON belum diunggah.' });
    const backup = JSON.parse(req.file.buffer.toString('utf8'));
    if (!Array.isArray(backup.rows)) return res.status(400).json({ message: 'Format backup tidak valid.' });
    await writeStudents(backup.rows.map(sanitizeStudent));
    pushActivity(`Restore backup selesai: ${backup.rows.length} baris.`);
    res.json({ restored: backup.rows.length });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', verifyToken, async (req, res, next) => {
  try {
    const rows = await readStudents();
    const passed = rows.filter((item) => graduationStatus(item) === 'LULUS').length;
    const conditional = rows.filter((item) => graduationStatus(item) === 'LULUS BERSYARAT').length;
    const failed = rows.filter((item) => graduationStatus(item) === 'TIDAK LULUS').length;
    res.json({ total: rows.length, passed, conditional, failed, activityLog, settings: schoolSettings });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/admin')) return res.sendFile(path.join(publicDir, 'admin', 'dashboard.html'));
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: 'Terjadi kesalahan server.', detail: process.env.NODE_ENV === 'production' ? undefined : error.message });
});

app.listen(port, () => {
  console.log(`Graduation system ready at http://localhost:${port}`);
});
