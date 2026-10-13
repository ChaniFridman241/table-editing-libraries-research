import { Router } from 'express';
import { pool, withTransaction } from './db.js';
import { ROLES, visibleEmployee } from './abilities.js';
import {
  ApiError,
  EDITABLE_FIELDS,
  SELECT_EMPLOYEE,
  createEmployee,
  deleteEmployee,
  restoreEmployee,
  updateEmployee,
} from './employeesService.js';

export const apiRouter = Router();

// Express 4 לא תופס שגיאות של פונקציות async, אז עוטפים
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// בדיקת הרשאה (CASL) לפני הפעולה
const requireCan = (action, subjectType) => (req, res, next) =>
  req.ability.can(action, subjectType) ? next() : next(new ApiError(403, 'אין לך הרשאה לפעולה הזו'));

const actorOf = (req) => ({ id: req.user.id, ability: req.ability });

const SORTABLE = new Set(['id', 'updated_at', ...EDITABLE_FIELDS]);

// רשימת עובדים עם דפדוף, חיפוש ומיון בצד השרת
apiRouter.get('/employees', requireCan('read', 'Employee'), h(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const search = String(req.query.search ?? '').trim();
  let sortField = SORTABLE.has(req.query.sortField) ? req.query.sortField : 'id';
  // אי אפשר למיין לפי שדה שאסור לראות
  if (!req.ability.can('read', 'Employee', sortField)) sortField = 'id';
  const sortDir = req.query.sortDir === 'desc' ? 'DESC' : 'ASC';

  const params = [];
  let where = 'WHERE e.deleted_at IS NULL';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR e.email ILIKE $1
                    OR e.department ILIKE $1 OR e.position ILIKE $1)`;
  }

  const total = (await pool.query(`SELECT count(*)::int AS n FROM employees e ${where}`, params)).rows[0].n;
  const { rows } = await pool.query(
    `${SELECT_EMPLOYEE} ${where} ORDER BY e.${sortField} ${sortDir}, e.id ASC
     LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );
  res.json({ rows: rows.map((r) => visibleEmployee(req.ability, r)), total, page, pageSize });
}));

apiRouter.get('/employees/:id', requireCan('read', 'Employee'), h(async (req, res) => {
  const { rows } = await pool.query(`${SELECT_EMPLOYEE} WHERE e.id = $1`, [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'העובד לא נמצא');
  res.json(visibleEmployee(req.ability, rows[0]));
}));

apiRouter.post('/employees', h(async (req, res) => {
  const row = await withTransaction((c) => createEmployee(c, actorOf(req), req.body));
  res.status(201).json(row);
}));

apiRouter.patch('/employees/:id', h(async (req, res) => {
  const { version, changes } = req.body ?? {};
  const row = await withTransaction((c) => updateEmployee(c, actorOf(req), Number(req.params.id), version, changes));
  res.json(row);
}));

apiRouter.delete('/employees/:id', h(async (req, res) => {
  const row = await withTransaction((c) => deleteEmployee(c, actorOf(req), Number(req.params.id), req.query.version));
  res.json(row);
}));

// ביטול מחיקה
apiRouter.post('/employees/:id/restore', h(async (req, res) => {
  const row = await withTransaction((c) => restoreEmployee(c, actorOf(req), Number(req.params.id), req.body?.version));
  res.json(row);
}));

// הגדרות תצוגת עמודות של המשתמשת המחוברת
apiRouter.get('/settings/grid', h(async (req, res) => {
  const { rows } = await pool.query('SELECT grid_settings FROM users WHERE id = $1', [req.user.id]);
  res.json({ columns: rows[0]?.grid_settings ?? null });
}));

apiRouter.put('/settings/grid', h(async (req, res) => {
  const columns = Array.isArray(req.body?.columns) ? req.body.columns : null;
  await pool.query('UPDATE users SET grid_settings = $1 WHERE id = $2', [columns && JSON.stringify(columns), req.user.id]);
  res.json({ columns });
}));

// יומן פעולות
apiRouter.get('/audit', requireCan('read', 'AuditLog'), h(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 20;
  const params = [];
  let where = '';
  if (req.query.employeeId) {
    params.push(Number(req.query.employeeId));
    where = 'WHERE a.employee_id = $1';
  }
  const total = (await pool.query(`SELECT count(*)::int AS n FROM audit_log a ${where}`, params)).rows[0].n;
  const { rows } = await pool.query(
    `SELECT a.*, u.display_name AS user_name, e.first_name || ' ' || e.last_name AS employee_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN employees e ON e.id = a.employee_id
     ${where}
     ORDER BY a.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params
  );
  // שדות שאסור לראות (למשל שכר) לא מוצגים גם ביומן
  const hide = (obj) => obj && Object.fromEntries(Object.entries(obj).filter(([k]) => req.ability.can('read', 'Employee', k)));
  res.json({ rows: rows.map((a) => ({ ...a, before: hide(a.before), after: hide(a.after) })), total, page, pageSize });
}));

// ---------- ניהול משתמשות (רק מנהלת) ----------
apiRouter.get('/users', requireCan('read', 'User'), h(async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, display_name, role FROM users ORDER BY id');
  res.json(rows);
}));

apiRouter.patch('/users/:id/role', requireCan('update', 'User'), h(async (req, res) => {
  const id = Number(req.params.id);
  const role = req.body?.role;
  if (!ROLES.includes(role)) throw new ApiError(400, 'תפקיד לא מוכר');
  if (id === req.user.id) throw new ApiError(400, 'אי אפשר לשנות את התפקיד של עצמך');
  const { rows } = await pool.query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, display_name, role',
    [role, id]
  );
  if (!rows[0]) throw new ApiError(404, 'המשתמשת לא נמצאה');
  res.json(rows[0]);
}));
