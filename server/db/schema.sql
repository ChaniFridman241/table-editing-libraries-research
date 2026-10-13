-- משתמשות המערכת
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL
);

-- עובדים
-- version: מספר גרסה לזיהוי התנגשויות כשכמה משתמשות עורכות את אותה שורה
-- deleted_at: מחיקה רכה, כדי שאפשר יהיה לבטל מחיקה
CREATE TABLE IF NOT EXISTS employees (
  id          SERIAL PRIMARY KEY,
  first_name  TEXT NOT NULL DEFAULT '',
  last_name   TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  department  TEXT NOT NULL DEFAULT '',
  position    TEXT NOT NULL DEFAULT '',
  salary      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  start_date  DATE,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INTEGER REFERENCES users(id),
  deleted_at  TIMESTAMPTZ
);

-- יומן פעולות: מי עשתה מה ומתי
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  employee_id INTEGER REFERENCES employees(id),
  action      TEXT NOT NULL, -- create | update | delete | restore
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_employee ON audit_log(employee_id);

-- הגדרות תצוגת עמודות (סדר ורוחב) לכל משתמשת
ALTER TABLE users ADD COLUMN IF NOT EXISTS grid_settings JSONB;

-- הרשאות (RBAC): תפקיד לכל משתמשת. admin | finance | editor | viewer
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer';

-- מי הוסיפה את העובד (לבדיקת הרשאה לפי בעלות)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
