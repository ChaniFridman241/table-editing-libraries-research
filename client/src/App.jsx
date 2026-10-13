import { createBrowserRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router-dom';
import { Can } from '@casl/react';
import { ROLE_LABELS, useAuth } from './auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import EmployeesPage from './pages/EmployeesPage.jsx';
import EmployeeDetailsPage from './pages/EmployeeDetailsPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import UsersPage from './pages/UsersPage.jsx';

function Layout() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="page">טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <nav className="navbar">
        <span className="brand">ניהול עובדים</span>
        <NavLink to="/employees" end>טבלת עובדים</NavLink>
        <NavLink to="/history">יומן פעולות</NavLink>
        <Can I="read" a="User">
          <NavLink to="/users">ניהול משתמשות</NavLink>
        </Can>
        <span className="spacer" />
        <span>שלום, {user.displayName} <span className="role-badge">{ROLE_LABELS[user.role] ?? user.role}</span></span>
        <button onClick={logout}>יציאה</button>
      </nav>
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Navigate to="/employees" replace /> },
      { path: '/employees', element: <EmployeesPage /> },
      { path: '/employees/:id', element: <EmployeeDetailsPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/users', element: <UsersPage /> },
      { path: '*', element: <Navigate to="/employees" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
