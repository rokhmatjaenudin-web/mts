const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const loginAttempts = new Map();
const fallbackSecret = 'local-dev-only-change-before-production';
const fallbackAdminHash = '$2a$12$ZouoJOqIVlLHIgg98QMkKuGuLfIS.0rTCuGaCo/XpMV3ar/kjmXNe';

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
 if (process.env.NODE_ENV === 'production')
  throw new Error('JWT_SECRET wajib diatur...');
  return fallbackSecret;
}

function createCaptcha() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  return { question: `${a} + ${b}`, answer: String(a + b) };
}

function signToken(user) {
  return jwt.sign(user, jwtSecret(), { expiresIn: '8h' });
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token tidak tersedia.' });

  try {
    req.user = jwt.verify(token, jwtSecret());
    next();
  } catch {
    res.status(401).json({ message: 'Sesi tidak valid atau kedaluwarsa.' });
  }
}

function isBlocked(ip) {
  const item = loginAttempts.get(ip);
  return item && item.blockUntil && item.blockUntil > Date.now();
}

function recordFailedLogin(ip) {
  const item = loginAttempts.get(ip) || { count: 0, blockUntil: 0 };
  item.count += 1;
  if (item.count >= 5) item.blockUntil = Date.now() + 10 * 60 * 1000;
  loginAttempts.set(ip, item);
}

function clearFailedLogin(ip) {
  loginAttempts.delete(ip);
}

async function login(req, res) {
  const { username, password, captcha, captchaAnswer, remember } = req.body || {};
  const ip = req.ip;

  if (isBlocked(ip)) return res.status(429).json({ message: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
  if (!captcha || !captchaAnswer || String(captcha).trim() !== String(captchaAnswer).trim()) {
    recordFailedLogin(ip);
    return res.status(400).json({ message: 'Captcha tidak valid.' });
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || fallbackAdminHash;
  const validUser = username === adminUsername;
  const validPassword = validUser && await bcrypt.compare(password || '', adminPasswordHash);

  if (!validUser || !validPassword) {
    recordFailedLogin(ip);
    return res.status(401).json({ message: 'Username atau password salah.' });
  }

  clearFailedLogin(ip);
  const token = jwt.sign({ username, role: 'admin' }, jwtSecret(), { expiresIn: remember ? '7d' : '8h' });
  res.json({ token, user: { username, role: 'admin' } });
}

module.exports = { createCaptcha, login, signToken, verifyToken };
