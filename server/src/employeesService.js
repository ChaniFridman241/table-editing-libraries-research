// לוגיקת עבודה מול טבלת העובדים.
// כל פונקציה מקבלת client (חיבור בתוך טרנזקציה) ו-actor: המשתמשת המחוברת וההרשאות שלה (CASL).
import { asEmployee, visibleEmployee } from './abilities.js';

export const EDITABLE_FIELDS = ['first_name', 'last_name', 'email', 'department', 'position', 'salary', 'start_date'];

export const SELECT_EMPLOYEE = `
  SELECT e.*, u.display_name AS updated_by_name
  FROM employees e
  LEFT JOIN users u ON u.id = e.updated_by`;

export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const FIELD_LABELS = {
  first_name: 'שם פרטי', last_name: 'שם משפחה', email: 'אימייל', department: 'מחלקה',
  position: 'תפקיד', salary: 'שכר', start_date: 'תאריך התחלה',
};

const forbidden = (text) => new ApiError(403, `אין לך הרשאה ${text}`);

function pickEditable(data = {}) {
  const out = {};
  for (const f of EDITABLE_FIELDS) {
    if (!(f in data)) continue;
    let v = data[f];
    if (f === 'start_date' && v === '') v = null;
    if (f === 'salary') v = Number(v) || 0;
    if (f !== 'start_date' && f !== 'salary') v = v ?? '';
    out[f] = v;
  }
  return out;
}

async function getById(client, id) {
  const { rows } = await client.query(`${SELECT_EMPLOYEE} WHERE e.id = $1`, [id]);
  return rows[0];
}

// נועל את השורה ובודק שהגרסה שהלקוחה מחזיקה היא העדכנית
async function lockAndCheck(client, actor, id, version, { expectDeleted = false } = {}) {
  const { rows } = await client.query('SELECT * FROM employees WHERE id = $1 FOR UPDATE', [id]);
  const row = rows[0];
  if (!row) throw new ApiError(404, 'העובד לא נמצא');

  const isDeleted = row.deleted_at !== null;
  if (isDeleted !== expectDeleted || row.version !== Number(version)) {
    const current = await getById(client, id);
    const who = current.updated_by_name ? ` על ידי ${current.updated_by_name}` : '';
    const message = isDeleted && !expectDeleted
      ? `העובד נמחק בינתיים${who}`
      : `השורה עודכנה בינתיים${who}. רעננו את הנתונים ונסו שוב.`;
    throw new ApiError(409, message, { current: visibleEmployee(actor.ability, current) });
  }
  return row;
}

async function audit(client, userId, employeeId, action, before, after) {
  await client.query(
    `INSERT INTO audit_log (user_id, employee_id, action, before, after) VALUES ($1, $2, $3, $4, $5)`,
    [userId, employeeId, action, before && JSON.stringify(before), after && JSON.stringify(after)]
  );
}

export async function createEmployee(client, actor, data) {
  const fields = pickEditable(data);
  const cols = Object.keys(fields);
  if (!actor.ability.can('create', 'Employee')) throw forbidden('להוסיף עובדים');
  for (const f of cols) {
    if (!actor.ability.can('create', 'Employee', f)) throw forbidden(`למלא את השדה "${FIELD_LABELS[f]}"`);
  }

  const allCols = [...cols, 'updated_by', 'created_by'];
  const values = [...Object.values(fields), actor.id, actor.id];
  const sql = `INSERT INTO employees (${allCols.join(', ')})
     VALUES (${allCols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`;
  const { rows } = await client.query(sql, values);
  const created = await getById(client, rows[0].id);
  await audit(client, actor.id, created.id, 'create', null, fields);
  return visibleEmployee(actor.ability, created);
}

export async function updateEmployee(client, actor, id, version, changes) {
  const fields = pickEditable(changes);
  const cols = Object.keys(fields);
  if (!cols.length) throw new ApiError(400, 'אין שדות לעדכון');

  const before = await lockAndCheck(client, actor, id, version);
  for (const f of cols) {
    if (!actor.ability.can('update', asEmployee(before), f)) throw forbidden(`לערוך את השדה "${FIELD_LABELS[f]}"`);
  }

  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await client.query(
    `UPDATE employees SET ${sets}, version = version + 1, updated_at = now(), updated_by = $${cols.length + 1}
     WHERE id = $${cols.length + 2}`,
    [...Object.values(fields), actor.id, id]
  );
  const beforeFields = Object.fromEntries(cols.map((c) => [c, before[c]]));
  await audit(client, actor.id, id, 'update', beforeFields, fields);
  return visibleEmployee(actor.ability, await getById(client, id));
}

export async function deleteEmployee(client, actor, id, version) {
  const row = await lockAndCheck(client, actor, id, version);
  if (!actor.ability.can('delete', asEmployee(row))) throw forbidden('למחוק את העובד הזה');
  await client.query(
    `UPDATE employees SET deleted_at = now(), version = version + 1, updated_at = now(), updated_by = $1 WHERE id = $2`,
    [actor.id, id]
  );
  await audit(client, actor.id, id, 'delete', null, null);
  return visibleEmployee(actor.ability, await getById(client, id));
}

// שחזור (ביטול מחיקה) - מותר למי שמותר לה למחוק את העובד
export async function restoreEmployee(client, actor, id, version) {
  const row = await lockAndCheck(client, actor, id, version, { expectDeleted: true });
  if (!actor.ability.can('delete', asEmployee(row))) throw forbidden('לשחזר את העובד הזה');
  await client.query(
    `UPDATE employees SET deleted_at = NULL, version = version + 1, updated_at = now(), updated_by = $1 WHERE id = $2`,
    [actor.id, id]
  );
  await audit(client, actor.id, id, 'restore', null, null);
  return visibleEmployee(actor.ability, await getById(client, id));
}
