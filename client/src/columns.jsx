import { Link } from 'react-router-dom';

export const DEPARTMENTS = ['פיתוח', 'שיווק', 'כספים', 'משאבי אנוש', 'תמיכה'];

export const formatMoney = (v) => (v == null || v === '' ? '' : `₪${Number(v).toLocaleString('he-IL')}`);
export const formatDateTime = (v) => (v ? new Date(v).toLocaleString('he-IL') : '');

function DetailsLink({ data }) {
  if (!data || data.id < 0) return null;
  return <Link to={`/employees/${data.id}`}>פרטים ←</Link>;
}

export const columnDefs = [
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

export const defaultColDef = {
  flex: 1,
  minWidth: 110,
  sortable: true,
  // המיון נעשה בשרת, לכן הטבלה לא ממיינת בעצמה
  comparator: () => 0,
  editable: true,
};
