import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAbility } from '@casl/react';
import { api } from '../api.js';
import { ROLE_LABELS, useAuth } from '../auth.jsx';

// ניהול משתמשות: רק מנהלת יכולה לראות את המסך ולשנות תפקידים
export default function UsersPage() {
  const ability = useAbility();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers, enabled: ability.can('read', 'User') });
  const changeRole = useMutation({
    mutationFn: ({ id, role }) => api.setUserRole(id, role),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err.message),
  });

  if (!ability.can('read', 'User')) return <Navigate to="/employees" replace />;

  return (
    <div className="page">
      <div className="page-header">
        <h1>ניהול משתמשות</h1>
      </div>
      <p className="hint">משתמשת שנרשמת מקבלת תפקיד "צופה". כאן אפשר לשנות לה את התפקיד.</p>

      <table className="simple-table">
        <thead>
          <tr><th>שם</th><th>שם משתמשת</th><th>תפקיד</th></tr>
        </thead>
        <tbody>
          {(users.data ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.display_name}</td>
              <td dir="ltr" style={{ textAlign: 'right' }}>{u.username}</td>
              <td>
                <select
                  value={u.role}
                  disabled={u.id === user.id || changeRole.isPending || !ability.can('update', 'User')}
                  onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value })}
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {u.id === user.id && <span className="muted"> (את)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="error-box">{error}</div>}

      <h2>מה כל תפקיד יכול לעשות</h2>
      <table className="simple-table">
        <thead>
          <tr><th>תפקיד</th><th>לראות עובדים</th><th>להוסיף</th><th>לערוך</th><th>למחוק</th><th>לראות שכר</th><th>לנהל משתמשות</th></tr>
        </thead>
        <tbody>
          <tr><td>מנהלת</td><td>✓</td><td>✓</td><td>הכל</td><td>הכל</td><td>✓</td><td>✓</td></tr>
          <tr><td>מנהלת כספים</td><td>✓</td><td>✗</td><td>רק שכר</td><td>✗</td><td>✓</td><td>✗</td></tr>
          <tr><td>עורכת</td><td>✓</td><td>✓</td><td>הכל חוץ משכר</td><td>רק עובדים שהיא הוסיפה</td><td>✗</td><td>✗</td></tr>
          <tr><td>צופה</td><td>✓</td><td>✗</td><td>✗</td><td>✗</td><td>✗</td><td>✗</td></tr>
        </tbody>
      </table>
    </div>
  );
}
