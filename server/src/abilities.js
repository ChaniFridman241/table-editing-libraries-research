// הרשאות לפי תפקיד (RBAC) עם הספרייה CASL.
// הכללים מוגדרים כאן פעם אחת, נאכפים בשרת, ונשלחים גם לאתר כדי להסתיר כפתורים ולנעול תאים.
import { AbilityBuilder, createMongoAbility, subject } from '@casl/ability';
import { permittedFieldsOf } from '@casl/ability/extra';

export const ROLES = ['admin', 'finance', 'editor', 'viewer'];

const EDIT_FIELDS_NO_SALARY = ['first_name', 'last_name', 'email', 'department', 'position', 'start_date'];
const META_FIELDS = ['id', 'version', 'created_at', 'updated_at', 'updated_by', 'updated_by_name', 'deleted_at', 'created_by'];
const ALL_EMPLOYEE_FIELDS = [...META_FIELDS, ...EDIT_FIELDS_NO_SALARY, 'salary'];
const READ_NO_SALARY = [...META_FIELDS, ...EDIT_FIELDS_NO_SALARY];

export function defineAbilityFor(user) {
  const { can, build } = new AbilityBuilder(createMongoAbility);

  switch (user.role) {
    case 'admin':
      can('manage', 'all');
      break;
    case 'finance':
      can('read', 'Employee');
      can('update', 'Employee', ['salary']);
      can('read', 'AuditLog');
      break;
    case 'editor':
      can('read', 'Employee', READ_NO_SALARY);
      can('create', 'Employee', EDIT_FIELDS_NO_SALARY);
      can('update', 'Employee', EDIT_FIELDS_NO_SALARY);
      // הרשאה לפי בעלות: מותר למחוק רק עובדים שהיא עצמה הוסיפה
      can('delete', 'Employee', { created_by: user.id });
      can('read', 'AuditLog');
      break;
    default: // viewer
      can('read', 'Employee', READ_NO_SALARY);
      can('read', 'AuditLog');
  }
  return build();
}

export const asEmployee = (row) => subject('Employee', { ...row });

// מחזיר רק את השדות שמותר למשתמשת לראות
export function visibleEmployee(ability, row) {
  if (!row) return row;
  const fields = permittedFieldsOf(ability, 'read', asEmployee(row), {
    fieldsFrom: (rule) => rule.fields || ALL_EMPLOYEE_FIELDS,
  });
  return Object.fromEntries(Object.entries(row).filter(([k]) => fields.includes(k)));
}
