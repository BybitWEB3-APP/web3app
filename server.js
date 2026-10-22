/**
 * Админ-бэкенд для крипто-кошелька (Telegram Mini App).
 * Хранит ТОЛЬКО публичные данные пользователей: telegram id/username,
 * публичный адрес кошелька, баланс. Никаких seed-фраз/ключей.
 *
 * Запуск:
 *   npm init -y && npm install express
 *   BOT_TOKEN=123456:ABC...  node server.js
 *
 * В index.html впишите адрес этого сервера в константу API_BASE.
 */
const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');

const app = express();
app.use(express.json());

const BOT_TOKEN      = process.env.BOT_TOKEN || 'PUT-YOUR-BOT-TOKEN-HERE';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'S1monov_A').toLowerCase();
const DB_FILE        = process.env.DB_FILE || './users.json';
const PORT           = process.env.PORT || 3000;

const readDB  = () => { try { return JSON.parse(fs.readFileSync(DB_FILE)); } catch (e) { return {}; } };
const writeDB = (o) => fs.writeFileSync(DB_FILE, JSON.stringify(o, null, 2));

// Проверка подписи Telegram WebApp initData. Возвращает объект user или null.
function checkInitData(initData) {
  try {
    const u = new URLSearchParams(initData);
    const hash = u.get('hash');
    if (!hash) return null;
    u.delete('hash');
    const dcs = [...u.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const sign = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (sign !== hash) return null;
    // (опционально) проверка свежести: auth_date не старше суток
    const authDate = Number(u.get('auth_date')) * 1000;
    if (authDate && Date.now() - authDate > 86400000) return null;
    return JSON.parse(u.get('user') || 'null');
  } catch (e) { return null; }
}

// CORS — чтобы Mini App мог обращаться к серверу
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Init-Data');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Клиент регистрирует/обновляет свои публичные данные
app.post('/register', (req, res) => {
  const user = checkInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'bad initData' });
  const db = readDB();
  db[user.id] = {
    id:         user.id,
    username:   user.username || '',
    first_name: user.first_name || '',
    address:    String(req.body.address || ''),
    usd:        req.body.usd  != null ? Number(req.body.usd)  : null,
    ton:        req.body.ton  != null ? Number(req.body.ton)  : null,
    usdt:       req.body.usdt != null ? Number(req.body.usdt) : null,
    updated:    Date.now(),
  };
  writeDB(db);
  res.json({ ok: true });
});

// Админ видит список пользователей. Доступ только аккаунту ADMIN_USERNAME.
app.get('/admin/users', (req, res) => {
  const user = checkInitData(req.get('X-Init-Data') || '');
  if (!user || (user.username || '').toLowerCase() !== ADMIN_USERNAME) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const db = readDB();
  const list = Object.values(db)
    .sort((a, b) => b.updated - a.updated)
    .map(u => ({ id: u.id, username: u.username, address: u.address, balance: u.usd, updated: u.updated }));
  res.json(list);
});

app.get('/', (_req, res) => res.send('wallet admin backend is running'));

app.listen(PORT, () => console.log('Admin backend listening on port', PORT));
