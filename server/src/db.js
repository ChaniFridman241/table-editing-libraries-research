import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('חסר DATABASE_URL בקובץ server/.env');
  process.exit(1);
}

// NUMERIC חוזר כמחרוזת כברירת מחדל, ממירים למספר
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE נשאר מחרוזת YYYY-MM-DD ולא הופך ל-Date עם אזור זמן
pg.types.setTypeParser(1082, (v) => v);

// ה-SSL מוגדר מתוך מחרוזת החיבור (sslmode=require ב-Neon)
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// מריץ פונקציה בתוך טרנזקציה
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
