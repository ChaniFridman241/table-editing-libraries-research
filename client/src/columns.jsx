import { Link } from 'react-router-dom';
import { subject } from '@casl/ability';

export const DEPARTMENTS = ['פיתוח', 'שיווק', 'כספים', 'משאבי אנוש', 'תמיכה'];

export const formatMoney = (v) => (v == null || v === '' ? '' : `₪${Number(v).toLocaleString('he-IL')}`);
export const formatDateTime = (v) => (v ? new Date(v).toLocaleString('he-IL') : '');

function DetailsLink({ data }) {
  if (!data || data.id < 0) return null;
  return <Link to={`/employees/${data.id}`}>פרטים ←</Link>;
}

const EDITABLE_FIELDS = ['first_name', 'last_name', 'email', 'department', 'position', 'salary', 'start_date'];

// האם מותר לערוך את התא (CASL): שורה חדשה = הרשאת יצירה, שורה קיימת = הרשאת עדכון
export function canEditField(ability, row, field) {
  if (!row || !EDITABLE_FIELDS.includes(field)) return false;
  return row.id < 0
    ? ability.can('create', 'Employee', field)
    : ability.can('update', subject('Employee', { ...row }), field);
}

// עמודות לפי ההרשאות: עמודה שאסור לראות (למשל שכר) מוסתרת
export function buildColumnDefs(ability) {
  return columnDefs.map((c) => (c.field && EDITABLE_FIELDS.includes(c.field) && !ability.can('read', 'Employee', c.field)
    ? { ...c, hide: true, lockVisible: true, suppressColumnsToolPanel: true }
    : c));
}

export function buildDefaultColDef(ability) {
  return {
    ...defaultColDef,
    editable: (p) => canEditField(ability, p.data, p.colDef.field),
    cellClassRules: {
      // תא נעול (אין הרשאה לערוך) מוצג באפור
      'cell-locked': (p) => EDITABLE_FIELDS.includes(p.colDef.field) && !canEditField(ability, p.data, p.colDef.field),
    },
  };
}

const columnDefs = [
  {
    field: 'id', headerName: '#', editable: false, maxWidth: 90, sort: 'desc',
    valueFormatter: (p) => (p.value < 0 ? 'חדש' : p.value),
  },
  { field: 'first_name', headerName: 'שם פרטי' },
  { field: 'last_name', headerName: 'שם משפחה' },
  { field: 'email', headerName: 'אימייל', flex: 1.5 },
  {
    field: 'department', headerName: 'מחלקה',
    cellEditor: 'agSelectCellEditor', cellEditorParams: { values: DEPARTMENTS },
  },
  { field: 'position', headerName: 'תפקיד' },
  { field: 'salary', headerName: 'שכר', cellDataType: 'number', valueFormatter: (p) => formatMoney(p.value) },
  { field: 'start_date', headerName: 'תאריך התחלה', cellDataType: 'dateString' },
  { field: 'updated_by_name', headerName: 'עודכן ע״י', editable: false, sortable: false },
  {
    field: 'updated_at', headerName: 'עודכן ב', editable: false, minWidth: 160,
    valueFormatter: (p) => formatDateTime(p.value),
  },
  { colId: 'details', headerName: '', editable: false, sortable: false, maxWidth: 100, cellRenderer: DetailsLink },
];

const defaultColDef = {
  flex: 1,
  minWidth: 110,
  sortable: true,
  // המיון נעשה בשרת, לכן הטבלה לא ממיינת בעצמה
  comparator: () => 0,
};
