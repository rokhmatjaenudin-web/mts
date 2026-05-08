const { google } = require('googleapis');
const XLSX = require('xlsx');
const { getCache, setCache } = require('./firebase');

const HEADERS = ['Nomor SKTL', 'NISN', 'NIS', 'Nama', 'Nomor peserta', 'Status', 'Status Kelulusan', 'Foto'];
let memoryRows = [
  {
    'Nomor SKTL': '421.3/001/MTs-AA/VI/2026',
    NISN: '0098765432',
    NIS: '2324001',
    Nama: 'Ahmad Fadli',
    'Nomor peserta': '25-026-001',
    Status: 'Aktif',
    'Status Kelulusan': 'LULUS',
    Foto: ''
  },
  {
    'Nomor SKTL': '421.3/002/MTs-AA/VI/2026',
    NISN: '0098765433',
    NIS: '2324002',
    Nama: 'Siti Nabila',
    'Nomor peserta': '25-026-002',
    Status: 'Aktif',
    'Status Kelulusan': 'LULUS BERSYARAT',
    Foto: ''
  }
];

function hasSheetsConfig() {
  return Boolean(process.env.GOOGLE_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function rowToObject(row) {
  return HEADERS.reduce((acc, header, index) => {
    acc[header] = row[index] || '';
    return acc;
  }, {});
}

function objectToRow(item) {
  return HEADERS.map((header) => item[header] || '');
}

async function ensureHeader(sheets) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Students';
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:H1` }).catch(() => null);
  if (!result || !result.data.values || !result.data.values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] }
    });
  }
}

async function readStudents({ force = false } = {}) {
  const cached = !force && await getCache('students');
  if (cached && Array.isArray(cached.rows)) return cached.rows;
  if (!hasSheetsConfig()) return memoryRows;

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  await ensureHeader(sheets);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Students';
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A2:H` });
  const rows = (response.data.values || []).map(rowToObject).filter((item) => item.NISN);
  await setCache('students', { rows });
  return rows;
}

async function writeStudents(rows) {
  memoryRows = rows;
  await setCache('students', { rows });
  if (!hasSheetsConfig()) return rows;

  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  await ensureHeader(sheets);
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Students';
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A2:H` });
  if (rows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A2:H${rows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: rows.map(objectToRow) }
    });
  }
  return rows;
}

async function findByNisn(nisn) {
  const rows = await readStudents();
  return rows.find((item) => String(item.NISN).trim() === String(nisn).trim()) || null;
}

async function upsertStudent(student) {
  const rows = await readStudents({ force: true });
  const index = rows.findIndex((item) => item.NISN === student.NISN);
  if (index >= 0) rows[index] = { ...rows[index], ...student };
  else rows.push(student);
  return writeStudents(rows);
}

async function deleteStudent(nisn) {
  const rows = await readStudents({ force: true });
  return writeStudents(rows.filter((item) => item.NISN !== nisn));
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' }).map((row) => {
    const normalized = {};
    HEADERS.forEach((header) => normalized[header] = String(row[header] || '').trim());
    return normalized;
  }).filter((row) => row.NISN && row.Nama);
}

async function importStudents(buffer) {
  const incoming = parseWorkbook(buffer);
  const rows = await readStudents({ force: true });
  const byNisn = new Map(rows.map((item) => [item.NISN, item]));
  let created = 0;
  let updated = 0;

  incoming.forEach((item) => {
    if (byNisn.has(item.NISN)) updated += 1;
    else created += 1;
    byNisn.set(item.NISN, { ...byNisn.get(item.NISN), ...item });
  });

  const merged = Array.from(byNisn.values());
  await writeStudents(merged);
  return { rows: merged, created, updated, imported: incoming.length };
}

module.exports = {
  HEADERS,
  readStudents,
  writeStudents,
  findByNisn,
  upsertStudent,
  deleteStudent,
  importStudents
};
