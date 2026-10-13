// לוגיקת עבודה מול טבלת העובדים.
// כל פונקציה מקבלת client (חיבור בתוך טרנזקציה) כדי שאפשר יהיה להריץ כמה פעולות יחד.

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
async function lockAndCheck(client, id, version, { expectDeleted = false } = {}) {
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
    throw new ApiError(409, message, { current });
  }
  return row;
}

async function audit(client, userId, employeeId, action, before, after) {
  await client.query(
    `INSERT INTO audit_log (user_id, employee_id, action, before, after) VALUES ($1, $2, $3, $4, $5)`,
    [userId, employeeId, action, before && JSON.stringify(before), after && JSON.stringify(after)]
  );
}

export async function createEmployee(client, userId, data) {
  const fields = pickEditable(data);
  const cols = Object.keys(fields);
  const values = Object.values(fields);
  const sql = cols.length
    ? `INSERT INTO employees (${cols.join(', ')}, updated_by)
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}) RETURNING id`
    : `INSERT INTO employees (updated_by) VALUES ($1) RETURNING id`;
  const { rows } = await client.query(sql, [...values, userId]);
  const created = await getById(client, rows[0].id);
  await audit(client, userId, created.id, 'create', null, fields);
  return created;
}

export async function updateEmployee(client, userId, id, version, changes) {
  const fields = pickEditable(changes);
  const cols = Object.keys(fields);
  if (!cols.length) throw new ApiError(400, 'אין שדות לעדכון');

  const before = await lockAndCheck(client, id, version);
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await client.query(
    `UPDATE employees SET ${sets}, version = version + 1, updated_at = now(), updated_by = $${cols.length + 1}
     WHERE id = $${cols.length + 2}`,
    [...Object.values(fields), userId, id]
  );
  const beforeFields = Object.fromEntries(cols.map((c) => [c, before[c]]));
  await audit(client, userId, id, 'update', beforeFields, fields);
  return getById(client, id);
}

export async function deleteEmployee(client, userId, id, version) {
  await lockAndCheck(client, id, version);
  await client.query(
    `UPDATE employees SET deleted_at = now(), version = version + 1, updated_at = now(), updated_by = $1 WHERE id = $2`,
    [userId, id]
  );
  await audit(client, userId, id, 'delete', null, null);
  return getById(client, id);
}

export async function restoreEmployee(client, userId, id, version) {
  await lockAndCheck(client, id, version, { expectDeleted: true });
  await client.query(
    `UPDATE employees SET deleted_at = NULL, version = version + 1, updated_at = now(), updated_by = $1 WHERE id = $2`,
    [userId, id]
  );
  await audit(client, userId, id, 'restore', null, null);
  return getById(client, id);
}
