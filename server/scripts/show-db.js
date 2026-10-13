// מציג בטרמינל את מה שיש כרגע בטבלאות ב-Neon
// הרצה: npm run db:show
import { pool } from '../src/db.js';

const { rows: users } = await pool.query('SELECT id, username, display_name FROM users ORDER BY id');
console.log(`\n=== users (${users.length}) ===`);
console.table(users);

const { rows: employees } = await pool.query(
  `SELECT id, first_name, last_name, department, position, salary, start_date, version,
          to_char(deleted_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI') AS deleted_at
   FROM employees ORDER BY id`
);
console.log(`\n=== employees (${employees.length}) ===`);
console.table(employees);

const { rows: audit } = await pool.query(
  `SELECT a.id, u.display_name AS who, a.action, a.employee_id,
          to_char(a.created_at AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI') AS at, a.after
   FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
   ORDER BY a.id DESC LIMIT 20`
);
console.log('\n=== audit_log (20 האחרונות) ===');
console.table(audit.map((a) => ({ ...a, after: a.after ? JSON.stringify(a.after) : '' })));

await pool.end();
