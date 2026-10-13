import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { defineAbilityFor } from './abilities.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export const authRouter = Router();

function issueToken(user) {
  const payload = { id: user.id, username: user.username, displayName: user.display_name };
  return { token: jwt.sign(payload, SECRET, { expiresIn: '12h' }), user: payload };
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [String(username ?? '').trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password ?? '', user.password_hash))) {
      return res.status(401).json({ error: 'שם משתמשת או סיסמה שגויים' });
    }
    res.json(issueToken(user));
  } catch (err) {
    next(err);
  }
});

// הרשמה: כל משתמשת חדשה בוחרת שם משתמשת וסיסמה
authRouter.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const displayName = String(req.body?.displayName ?? '').trim();

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'שם משתמשת: 3-30 תווים באנגלית, ספרות או _ . -' });
    }
    if (password.length < 4) return res.status(400).json({ error: 'הסיסמה צריכה להכיל לפחות 4 תווים' });
    if (!displayName) return res.status(400).json({ error: 'יש למלא שם לתצוגה' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING RETURNING *`,
      [username, hash, displayName]
    );
    if (!rows[0]) return res.status(409).json({ error: 'שם המשתמשת הזה כבר תפוס' });
    res.status(201).json(issueToken(rows[0]));
  } catch (err) {
    next(err);
  }
});

// middleware: כל בקשה ל-API חייבת טוקן תקף.
// התפקיד נקרא מה-DB בכל בקשה, כך ששינוי תפקיד נכנס לתוקף מיד.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'נדרשת התחברות' });
  }
  try {
    const { rows } = await pool.query('SELECT id, username, display_name, role FROM users WHERE id = $1', [payload.id]);
    if (!rows[0]) return res.status(401).json({ error: 'נדרשת התחברות' });
    const u = rows[0];
    req.user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
    req.ability = defineAbilityFor(req.user);
    next();
  } catch (err) {
    next(err);
  }
}

// המשתמשת המחוברת + כללי ההרשאה שלה (האתר בונה מהם את אותן הרשאות עם CASL)
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user, rules: req.ability.rules }));
