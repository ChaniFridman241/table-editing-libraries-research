import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/employees" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (password !== password2) return setError('הסיסמאות לא זהות');
    setBusy(true);
    setError('');
    try {
      await register(username, password, displayName);
      navigate('/employees');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>הרשמה</h1>
        <label>
          שם לתצוגה (בעברית)
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </label>
        <label>
          שם משתמשת (באנגלית)
          <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" />
        </label>
        <label>
          סיסמה
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          אימות סיסמה
          <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'נרשמת...' : 'הרשמה'}</button>
        <p className="hint">משתמשת חדשה מקבלת הרשאת צפייה. מנהלת יכולה לשנות את ההרשאה.</p>
        <p className="hint">כבר יש לך משתמשת? <Link to="/login">לכניסה</Link></p>
      </form>
    </div>
  );
}
