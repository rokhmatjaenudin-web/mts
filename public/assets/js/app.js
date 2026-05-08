const state = {
  settings: null,
  lastStudent: null,
  timer: null
};

const $ = (selector) => document.querySelector(selector);
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const response = await fetch(url);

const contentType = response.headers.get('content-type');

if (!contentType || !contentType.includes('application/json')) {
  const text = await response.text();
  throw new Error(`Response bukan JSON: ${text.slice(0,100)}`);
}

const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Request gagal.'), { status: response.status, data });
  return data;
};

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  localStorage.setItem('theme', mode);
  $('#themeToggle i').className = mode === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function formatCountdown(target) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return 'Dibuka';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff % 86400000 / 3600000);
  const minutes = Math.floor(diff % 3600000 / 60000);
  const seconds = Math.floor(diff % 60000 / 1000);
  return `${days}h ${hours}j ${minutes}m ${seconds}d`;
}

function startClock() {
  const tick = () => {
    const now = new Date();
    $('#clock').textContent = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
    $('#date').textContent = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(now);
    if (state.settings) {
      const count = formatCountdown(state.settings.announcementOpenAt);
      $('#countdown').textContent = count;
      $('#lockedCountdown').textContent = count;
      const open = Date.now() >= new Date(state.settings.announcementOpenAt).getTime() || !state.settings.locked;
      $('#lockedOverlay').classList.toggle('hidden', open);
      $('#announcementMessage').textContent = open ? 'Pengumuman sudah dibuka. Silakan cek kelulusan dengan NISN.' : 'Akses hasil kelulusan mengikuti waktu resmi yang ditentukan sekolah.';
      $('#pengumuman h2').textContent = open ? 'Pengumuman sudah dibuka' : 'Pengumuman belum dibuka';
    }
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

function debounce(fn, wait = 350) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function statusClass(status = '') {
  if (/TIDAK/i.test(status)) return 'fail';
  if (/BERSYARAT/i.test(status)) return 'conditional';
  return 'pass';
}

function motivation(status = '') {
  if (/TIDAK/i.test(status)) return 'Tetap kuat dan terus bertumbuh. Perjalanan belajar tidak berhenti di satu hasil.';
  if (/BERSYARAT/i.test(status)) return 'Selamat, lengkapi ketentuan sekolah dengan tenang dan tepat waktu.';
  return 'Selamat atas kelulusanmu. Semoga ilmu menjadi bekal kebaikan dan masa depan yang gemilang.';
}

function renderResult(student) {
  state.lastStudent = student;
  $('#downloadLast').disabled = false;
  const status = student['Status Kelulusan'];
  $('#resultCard').classList.remove('hidden');
  $('#resultCard').innerHTML = `
    <div class="badge ${statusClass(status)}"><i class="fa-solid fa-certificate"></i>${status}</div>
    <h3>${student.Nama}</h3>
    <div class="result-grid">
      <div><span>Nomor SKTL</span><strong>${student['Nomor SKTL']}</strong></div>
      <div><span>NISN</span><strong>${student.NISN}</strong></div>
      <div><span>NIS</span><strong>${student.NIS}</strong></div>
      <div><span>Nomor Peserta</span><strong>${student['Nomor peserta']}</strong></div>
      <div><span>Status Siswa</span><strong>${student.Status}</strong></div>
      <div><span>Verifikasi</span><strong>Valid</strong></div>
    </div>
    <p>${motivation(status)}</p>
    <div id="qrBox"></div>
    <div class="result-actions">
      <button class="btn primary small" id="pdfBtn"><i class="fa-solid fa-file-arrow-down"></i>Download PDF</button>
      <button class="btn ghost small" id="printBtn"><i class="fa-solid fa-print"></i>Cetak</button>
      <a class="btn ghost small" href="https://wa.me/?text=${encodeURIComponent(`Hasil kelulusan ${student.Nama}: ${status}`)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>Share</a>
    </div>
  `;
  new QRCode($('#qrBox'), { text: `${location.origin}/?verify=${student.NISN}`, width: 100, height: 100 });
  $('#pdfBtn').addEventListener('click', () => generatePdf(student, true));
  $('#printBtn').addEventListener('click', () => generatePdf(student, false));
}

async function searchStudent(nisn) {
  $('#searchState').textContent = 'Mencari data siswa...';
  $('#resultCard').classList.add('hidden');
  try {
    const student = await api(`/api/students/search?nisn=${encodeURIComponent(nisn)}`);
    $('#searchState').textContent = 'Data ditemukan dan terverifikasi.';
    renderResult(student);
  } catch (error) {
    $('#searchState').textContent = '';
    Swal.fire({ icon: error.status === 423 ? 'info' : 'warning', title: error.message, confirmButtonColor: '#0F8B6D' });
  }
}

async function generatePdf(student, save = true) {
  const template = $('#letterTemplate').content.cloneNode(true);
  const wrapper = document.createElement('div');
  wrapper.appendChild(template);
  document.body.appendChild(wrapper);
  const letter = wrapper.querySelector('.letter');
  letter.querySelectorAll('[data-field]').forEach((node) => node.textContent = student[node.dataset.field] || '-');
  letter.querySelector('#letterDate').textContent = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
  new QRCode(letter.querySelector('#letterQr'), { text: `${location.origin}/?verify=${student.NISN}`, width: 96, height: 96 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const canvas = await html2canvas(letter, { scale: 2, backgroundColor: '#ffffff' });
  const img = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'pt', 'a4');
  const width = pdf.internal.pageSize.getWidth();
  const height = canvas.height * width / canvas.width;
  pdf.addImage(img, 'PNG', 0, 0, width, height);
  document.body.removeChild(wrapper);
  if (save) pdf.save(`SKL-${student.NISN}-${student.Nama}.pdf`);
  else window.open(pdf.output('bloburl'), '_blank');
}

async function initSettings() {
  state.settings = await api('/api/settings');
  $('#runningText').textContent = state.settings.runningText;
  $('#waContact').href = `https://wa.me/${String(state.settings.contact || '').replace(/\D/g, '')}`;
  $('#waContact').textContent = state.settings.contact || '+62';
  $('#schoolAddress').textContent = state.settings.address || 'Indonesia';
}

function initInteractions() {
  $('#menuBtn').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
  $('#themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  $('#searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const nisn = $('#nisnInput').value.replace(/\D/g, '');
    if (!/^\d{8,12}$/.test(nisn)) return Swal.fire({ icon: 'warning', title: 'NISN harus 8-12 digit angka.', confirmButtonColor: '#0F8B6D' });
    searchStudent(nisn);
  });
  $('#nisnInput').addEventListener('input', debounce((event) => {
    const value = event.target.value.replace(/\D/g, '');
    event.target.value = value;
    $('#suggestions').textContent = value.length >= 4 ? 'Tekan tombol Cek setelah NISN lengkap.' : '';
  }));
  $('#downloadLast').addEventListener('click', () => state.lastStudent && generatePdf(state.lastStudent, true));
  document.addEventListener('contextmenu', (event) => {
    if (localStorage.getItem('disableRightClick') === 'true') event.preventDefault();
  });
}

async function boot() {
  setTheme(localStorage.getItem('theme') || 'dark');
  AOS.init({ once: true, duration: 760, easing: 'ease-out-cubic' });
  gsap.from('.hero-content > *', { y: 22, opacity: 0, duration: .8, stagger: .08, ease: 'power3.out' });
  initInteractions();
  await initSettings();
  startClock();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  setTimeout(() => $('#loader').classList.add('hidden'), 500);
}

boot().catch((error) => {
  $('#loader').classList.add('hidden');
  Swal.fire({ icon: 'error', title: 'Sistem belum siap', text: error.message, confirmButtonColor: '#0F8B6D' });
});
