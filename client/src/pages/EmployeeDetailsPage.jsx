import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { subject } from '@casl/ability';
import { useAbility } from '@casl/react';
import { DEPARTMENTS, canEditField, formatDateTime } from '../columns.jsx';
import { AuditTable } from './HistoryPage.jsx';

const FIELDS = [
  { name: 'first_name', label: 'שם פרטי' },
  { name: 'last_name', label: 'שם משפחה' },
  { name: 'email', label: 'אימייל', type: 'email' },
  { name: 'department', label: 'מחלקה', options: DEPARTMENTS },
  { name: 'position', label: 'תפקיד' },
  { name: 'salary', label: 'שכר', type: 'number' },
  { name: 'start_date', label: 'תאריך התחלה', type: 'date' },
];

// מסך פרטי עובד: עריכה בטופס, עם זיהוי התנגשות אם מישהי אחרת שינתה בינתיים
export default function EmployeeDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [message, setMessage] = useState('');

  const employee = useQuery({ queryKey: ['employee', id], queryFn: () => api.getEmployee(id) });
  const history = useQuery({ queryKey: ['audit', 'employee', id], queryFn: () => api.audit({ employeeId: id }) });

  useEffect(() => {
    if (employee.data && !form) setForm(employee.data);
  }, [employee.data]);

  const afterChange = (row) => {
    qc.setQueryData(['employee', id], row);
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['audit'] });
  };

  // הרשאות (CASL): אילו שדות מוצגים ואילו אפשר לערוך
  const ability = useAbility();
  const visibleFields = FIELDS.filter((f) => ability.can('read', 'Employee', f.name));
  const canEdit = (name) => !!form && canEditField(ability, form, name);

  const save = useMutation({
    mutationFn: () => {
      // נשלחים רק שדות שהשתנו ושמותר לערוך
      const changes = Object.fromEntries(
        visibleFields
          .filter((f) => canEdit(f.name) && String(form[f.name] ?? '') !== String(employee.data[f.name] ?? ''))
          .map((f) => [f.name, form[f.name]])
      );
      if (!Object.keys(changes).length) throw new Error('אין שינויים לשמירה');
      return api.updateEmployee(Number(id), form.version, changes);
    },
    onSuccess: (row) => {
      afterChange(row);
      setForm(row);
      setConflict(null);
      setMessage('נשמר בהצלחה');
    },
    onError: (err) => {
      setMessage('');
      if (err.status === 409) setConflict({ text: err.message, current: err.body.current });
      else setConflict({ text: err.message });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteEmployee(Number(id), form.version),
    onSuccess: (row) => {
      afterChange(row);
      navigate('/employees');
    },
    onError: (err) => setConflict({ text: err.message, current: err.body?.current }),
  });

  if (employee.isLoading || (!form && !employee.isError)) return <div className="page">טוען...</div>;
  if (employee.isError) return <div className="page error-box">{employee.error.message}</div>;

  const deleted = !!employee.data.deleted_at;
  const set = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const canSave = visibleFields.some((f) => canEdit(f.name));
  const canDelete = ability.can('delete', subject('Employee', { ...employee.data }));

  return (
    <div className="page">
      <Link to="/employees">→ חזרה לטבלה</Link>
      <div className="page-header">
        <h1>{form.first_name} {form.last_name} <span className="muted">#{id}</span></h1>
      </div>
      {deleted && <div className="error-box">העובד נמחק.</div>}

      <form
        className="details-form"
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      >
        {visibleFields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select value={form[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} disabled={deleted || !canEdit(f.name)}>
                <option value="" />
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={f.type ?? 'text'}
                value={form[f.name] ?? ''}
                disabled={deleted || !canEdit(f.name)}
                onChange={(e) => set(f.name, f.type === 'number' ? Number(e.target.value) : e.target.value)}
              />
            )}
          </label>
        ))}

        <div className="form-actions">
          {canSave && (
            <>
              <button className="primary" disabled={deleted || save.isPending}>
                {save.isPending ? 'שומר...' : 'שמירה'}
              </button>
              <button type="button" onClick={() => setForm(employee.data)} disabled={deleted}>ביטול שינויים</button>
            </>
          )}
          {canDelete && (
            <button
              type="button"
              className="danger"
              disabled={deleted || remove.isPending}
              onClick={() => window.confirm('למחוק את העובד?') && remove.mutate()}
            >
              מחיקה
            </button>
          )}
          {!canSave && <span className="muted">אין לך הרשאה לערוך עובדים</span>}
        </div>
        <p className="muted">
          עודכן לאחרונה {formatDateTime(employee.data.updated_at)}
          {employee.data.updated_by_name && ` על ידי ${employee.data.updated_by_name}`} · גרסה {form.version}
        </p>
      </form>

      {message && <div className="success-box">{message}</div>}
      {conflict && (
        <div className="error-box">
          {conflict.text}
          {conflict.current && !conflict.current.deleted_at && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => { setForm(conflict.current); qc.setQueryData(['employee', id], conflict.current); setConflict(null); }}>
                טעינת הנתונים העדכניים
              </button>
            </div>
          )}
        </div>
      )}

      <h2>היסטוריית שינויים</h2>
      <AuditTable rows={history.data?.rows ?? []} showEmployee={false} />
    </div>
  );
}
