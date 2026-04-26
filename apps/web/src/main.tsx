import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import { AuthProvider } from './context/auth-context'
import { AdminUsersPage } from './routes/admin-users'
import { AppLayout } from './routes/app-layout'
import { HomePage } from './routes/home'
import { LoginPage } from './routes/login-page'
import { NotFound } from './routes/not-found'
import { RequireAdmin } from './routes/require-admin'

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAdmin />,
        children: [{ path: '/admin', element: <AdminUsersPage /> }],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
