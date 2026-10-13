// יוצר את הטבלאות ב-Neon ומכניס נתוני דמו (פעם אחת)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(dir, '../db/schema.sql'), 'utf8');

// משתמשות דמו, אחת לכל תפקיד (משתמשת שנרשמת לבד מקבלת "צופה")
const users = [
  { username: 'chani', display_name: 'חני', role: 'admin' },
  { username: 'chaya', display_name: 'חיה', role: 'finance' },
  { username: 'sara', display_name: 'שרה', role: 'editor' },
];

const firstNames = ['דוד', 'רחל', 'משה', 'לאה', 'יוסף', 'מרים', 'אברהם', 'אסתר', 'יעקב', 'רבקה', 'שמואל', 'דבורה', 'אליהו', 'נועה', 'דניאל'];
const lastNames = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי', 'גולן'];
const departments = ['פיתוח', 'שיווק', 'כספים', 'משאבי אנוש', 'תמיכה'];
const positions = ['מפתח/ת', 'ראש צוות', 'אנליסט/ית', 'מנהל/ת', 'רכז/ת'];

const pick = (arr, i) => arr[i % arr.length];

async function main() {
  await pool.query(schema);
  console.log('✔ טבלאות נוצרו');

  const hash = await bcrypt.hash('1234', 10);
  for (const u of users) {
    await pool.query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      [u.username, hash, u.display_name, u.role]
    );
    // משתמשות דמו שנוצרו לפני שהיו תפקידים - מקבלות את התפקיד שלהן
    await pool.query(`UPDATE users SET role = $1 WHERE username = $2 AND role = 'viewer'`, [u.role, u.username]);
  }
  console.log('✔ משתמשות: chani (מנהלת) / chaya (מנהלת כספים) / sara (עורכת)  - סיסמה 1234');

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM employees');
  if (rows[0].n === 0) {
    for (let i = 0; i < 45; i++) {
      const month = String((i % 12) + 1).padStart(2, '0');
      await pool.query(
        `INSERT INTO employees (first_name, last_name, email, department, position, salary, start_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pick(firstNames, i),
          pick(lastNames, i * 3),
          `employee${i + 1}@company.co.il`,
          pick(departments, i),
          pick(positions, i * 7),
          9000 + ((i * 1370) % 16000),
          `20${String(15 + (i % 10)).padStart(2, '0')}-${month}-01`,
        ]
      );
    }
    console.log('✔ נוספו 45 עובדי דמו');
  } else {
    console.log(`ℹ כבר קיימים ${rows[0].n} עובדים, לא נוספו נתוני דמו`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
