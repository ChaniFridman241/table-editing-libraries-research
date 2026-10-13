import { createBrowserRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import EmployeesPage from './pages/EmployeesPage.jsx';
import EmployeeDetailsPage from './pages/EmployeeDetailsPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';

function Layout() {
  const { user, loading, logout } = useAuth();
  const qc = useQueryClient();

  if (loading) return <div className="page">טוען...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <nav className="navbar">
        <span className="brand">ניהול עובדים</span>
        <NavLink to="/employees" end>טבלת עובדים</NavLink>
        <NavLink to="/history">יומן פעולות</NavLink>
        <span className="spacer" />
        <span>שלום, {user.displayName}</span>
        <button onClick={() => { logout(); qc.clear(); }}>יציאה</button>
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
      { path: '*', element: <Navigate to="/employees" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
