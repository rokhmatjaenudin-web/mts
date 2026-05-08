const HEADERS = ['Nomor SKTL', 'NISN', 'NIS', 'Nama', 'Nomor peserta', 'Status', 'Status Kelulusan', 'Foto'];
let captchaAnswer = '';
let students = [];
let chart = null;

const $ = (selector) => document.querySelector(selector);
const token = () => localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

async function api(url, options = {}) {
  const isForm = options.body instanceof FormData;
  const headers = isForm ? { ...authHeaders(), ...options.headers } : { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request gagal.');
  return data;
}

async function loadCaptcha() {
  const data = await fetch('/api/auth/captcha').then((r) => r.json());
  $('#captchaQuestion').textContent = data.question;
  captchaAnswer = data.answer;
}

function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#adminApp').classList.remove('hidden');
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.remember = form.get('remember') === 'on';
  body.captchaAnswer = captchaAnswer;
  const data = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async (response) => {
    const json = await response.json();
    if (!response.ok) throw new Error(json.message);
    return json;
  });
  (body.remember ? localStorage : sessionStorage).setItem('adminToken', data.token);
  showApp();
  await refreshAll();
}

function setDownloadAuth() {
  $('#exportExcel').addEventListener('click', async (event) => {
    event.preventDefault();
    const response = await fetch('/api/export.xlsx', { headers: authHeaders() });
    const blob = await response.blob();
    downloadBlob(blob, 'data-kelulusan.xlsx');
  });
  $('#backupBtn').addEventListener('click', async (event) => {
    event.preventDefault();
    const response = await fetch('/api/backup.json', { headers: authHeaders() });
    const blob = await response.blob();
    downloadBlob(blob, 'backup-kelulusan.json');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderDashboard(data) {
  $('#totalStudents').textContent = data.total;
  $('#passedStudents').textContent = data.passed;
  $('#conditionalStudents').textContent = data.conditional;
  $('#failedStudents').textContent = data.failed;
  $('#activityList').innerHTML = (data.activityLog || []).map((item) => `<div>${item.message}<br><small>${new Date(item.time).toLocaleString('id-ID')}</small></div>`).join('') || '<div>Belum ada aktivitas.</div>';
  const chartData = [data.passed, data.conditional, data.failed];
  if (chart) chart.destroy();
  chart = new Chart($('#graduationChart'), {
    type: 'doughnut',
    data: {
      labels: ['Lulus', 'Lulus Bersyarat', 'Tidak Lulus'],
      datasets: [{ data: chartData, backgroundColor: ['#0F8B6D', '#D4AF37', '#ef4444'], borderWidth: 0 }]
    },
    options: { plugins: { legend: { labels: { color: '#f8fafc' } } } }
  });
}

function renderStudents(rows = students) {
  const query = ($('#studentSearch').value || '').toLowerCase();
  const filtered = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  $('#studentRows').innerHTML = filtered.map((item) => `
    <tr>
      <td>${item.NISN || ''}</td>
      <td>${item.Nama || ''}</td>
      <td>${item['Nomor peserta'] || ''}</td>
      <td>${item.Status || ''}</td>
      <td>${item['Status Kelulusan'] || ''}</td>
      <td class="row-actions">
        <button class="icon-mini edit" data-nisn="${item.NISN}" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-mini delete" data-nisn="${item.NISN}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
  document.querySelectorAll('.edit').forEach((button) => button.addEventListener('click', () => openStudent(students.find((item) => item.NISN === button.dataset.nisn))));
  document.querySelectorAll('.delete').forEach((button) => button.addEventListener('click', () => removeStudent(button.dataset.nisn)));
}

async function refreshAll() {
  const [dashboard, rows, settings] = await Promise.all([
    api('/api/dashboard'),
    api('/api/students'),
    api('/api/settings', { headers: {} })
  ]);
  students = rows;
  renderDashboard(dashboard);
  renderStudents();
  fillSettings(settings);
}

function openStudent(item = {}) {
  HEADERS.forEach((header) => {
    const field = $(`#studentForm [name="${CSS.escape(header)}"]`);
    if (field) field.value = item[header] || '';
  });
  $('#studentModal').showModal();
}

async function saveStudent(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api('/api/students', { method: 'POST', body: JSON.stringify(body) });
  $('#studentModal').close();
  Swal.fire({ icon: 'success', title: 'Data tersimpan', timer: 1200, showConfirmButton: false });
  await refreshAll();
}

async function removeStudent(nisn) {
  const confirm = await Swal.fire({ icon: 'warning', title: 'Hapus data siswa?', showCancelButton: true, confirmButtonText: 'Hapus', confirmButtonColor: '#ef4444' });
  if (!confirm.isConfirmed) return;
  await api(`/api/students/${encodeURIComponent(nisn)}`, { method: 'DELETE' });
  await refreshAll();
}

function previewExcel(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const workbook = XLSX.read(event.target.result, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }).slice(0, 8);
    const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    const seen = new Set();
    const duplicates = allRows.filter((row) => {
      const nisn = String(row.NISN || '').trim();
      if (!nisn) return false;
      if (seen.has(nisn) || students.some((student) => student.NISN === nisn)) return true;
      seen.add(nisn);
      return false;
    }).length;
    $('#importPreview').innerHTML = `
      <p class="import-note">${allRows.length} baris terbaca. ${duplicates} NISN duplikat akan diperbarui otomatis.</p>
      <table><thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${HEADERS.map((h) => `<td>${row[h] || ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  reader.readAsArrayBuffer(file);
}

async function importExcel(file) {
  previewExcel(file);
  $('#importProgress').style.width = '45%';
  const form = new FormData();
  form.append('file', file);
  const result = await api('/api/import', { method: 'POST', body: form });
  $('#importProgress').style.width = '100%';
  Swal.fire({ icon: 'success', title: 'Import selesai', text: `${result.imported} baris diproses. ${result.created} baru, ${result.updated} diperbarui.` });
  await refreshAll();
  setTimeout(() => $('#importProgress').style.width = '0', 1200);
}

function exportCsv() {
  const csv = [HEADERS.join(','), ...students.map((item) => HEADERS.map((h) => `"${String(item[h] || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'data-kelulusan.csv');
}

async function restoreBackup() {
  const file = $('#restoreInput').files[0];
  if (!file) return Swal.fire({ icon: 'warning', title: 'Pilih file backup JSON dulu.' });
  const form = new FormData();
  form.append('file', file);
  const result = await api('/api/restore', { method: 'POST', body: form });
  Swal.fire({ icon: 'success', title: 'Restore selesai', text: `${result.restored} baris dipulihkan.` });
  await refreshAll();
}

function fillSettings(settings) {
  const form = $('#settingsForm');
  Object.entries(settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else if (key === 'announcementOpenAt') field.value = new Date(value).toISOString().slice(0, 16);
    else field.value = value || '';
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.locked = form.get('locked') === 'on';
  if (body.announcementOpenAt) body.announcementOpenAt = new Date(body.announcementOpenAt).toISOString();
  await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
  Swal.fire({ icon: 'success', title: 'Pengaturan tersimpan', timer: 1200, showConfirmButton: false });
}

function init() {
  $('#loginForm').addEventListener('submit', (event) => login(event).catch((error) => Swal.fire({ icon: 'error', title: error.message })));
  $('#showPassword').addEventListener('click', () => $('#password').type = $('#password').type === 'password' ? 'text' : 'password');
  $('#logoutBtn').addEventListener('click', () => { localStorage.removeItem('adminToken'); sessionStorage.removeItem('adminToken'); location.reload(); });
  $('#refreshBtn').addEventListener('click', refreshAll);
  $('#addStudentBtn').addEventListener('click', () => openStudent());
  $('#cancelStudent').addEventListener('click', () => $('#studentModal').close());
  $('#studentForm').addEventListener('submit', saveStudent);
  $('#studentSearch').addEventListener('input', () => renderStudents());
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#restoreBtn').addEventListener('click', restoreBackup);
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#excelInput').addEventListener('change', (event) => event.target.files[0] && importExcel(event.target.files[0]));
  $('#dropzone').addEventListener('click', () => $('#excelInput').click());
  $('#dropzone').addEventListener('dragover', (event) => event.preventDefault());
  $('#dropzone').addEventListener('drop', (event) => { event.preventDefault(); if (event.dataTransfer.files[0]) importExcel(event.dataTransfer.files[0]); });
  document.querySelectorAll('.sidebar nav a').forEach((link) => link.addEventListener('click', () => {
    document.querySelectorAll('.sidebar nav a').forEach((item) => item.classList.remove('active'));
    link.classList.add('active');
  }));
  setDownloadAuth();
  loadCaptcha();
  if (token()) { showApp(); refreshAll().catch(() => { localStorage.removeItem('adminToken'); sessionStorage.removeItem('adminToken'); location.reload(); }); }
}

init();
