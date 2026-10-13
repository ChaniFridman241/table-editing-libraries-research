import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { formatDateTime } from '../columns.jsx';

export const ACTION_LABELS = { create: 'הוספה', update: 'עדכון', delete: 'מחיקה', restore: 'שחזור' };

const FIELD_LABELS = {
  first_name: 'שם פרטי', last_name: 'שם משפחה', email: 'אימייל', department: 'מחלקה',
  position: 'תפקיד', salary: 'שכר', start_date: 'תאריך התחלה',
};

export function describeChange(a) {
  if (a.action !== 'update') return '';
  return Object.keys(a.after ?? {})
    .map((f) => `${FIELD_LABELS[f] ?? f}: "${a.before?.[f] ?? ''}" ← "${a.after[f] ?? ''}"`)
    .join(', ');
}

export function AuditTable({ rows, showEmployee = true }) {
  return (
    <table className="simple-table">
      <thead>
        <tr>
          <th>מתי</th>
          <th>מי</th>
          <th>פעולה</th>
          {showEmployee && <th>עובד</th>}
          <th>פירוט</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td>{formatDateTime(a.created_at)}</td>
            <td>{a.user_name}</td>
            <td><span className={`badge badge-${a.action}`}>{ACTION_LABELS[a.action] ?? a.action}</span></td>
            {showEmployee && (
              <td><Link to={`/employees/${a.employee_id}`}>#{a.employee_id} {a.employee_name}</Link></td>
            )}
            <td className="muted">{describeChange(a)}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={5}>אין פעולות</td></tr>}
      </tbody>
    </table>
  );
}

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['audit', page],
    queryFn: () => api.audit({ page }),
    placeholderData: keepPreviousData,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="page">
      <div className="page-header">
        <h1>יומן פעולות</h1>
        <button onClick={() => refetch()} disabled={isFetching}>⟳ רענון</button>
      </div>
      <AuditTable rows={data?.rows ?? []} />
      <div className="pager">
        <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>› הקודם</button>
        <span>עמוד {page} מתוך {totalPages}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>הבא ‹</button>
      </div>
    </div>
  );
}
