
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom'

import {
  LayoutDashboard,
  Files,
  Users,
  Settings,
  Bell,
  Clock,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Send,
  ArrowRight,
} from 'lucide-react'

import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Receiving from './pages/Receiving'
import ReceivingRecords from './component/ReceivingRecords'
import ReleasingRecords from './component/ReleasingRecords'
import UserManagement from './pages/UserManagement'

type UserRole = 'admin' | 'receiving_staff' | 'releasing_staff'

type RecordSummary = {
  id: string
  reference_number: string
  record_type: string
  subject: string
  status: string
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
        <p className="mt-4 text-sm font-medium text-slate-600">
          Loading presSystem...
        </p>
      </div>
    </div>
  )
}

function UnauthorizedScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          Access not authorized
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Your account does not have a valid presSystem role. Contact your
          administrator.
        </p>

        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// Protect all application pages from unauthenticated users.
function ProtectedRoute() {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!isValidRole(role)) return <UnauthorizedScreen />

  return <Outlet />
}

function isValidRole(
  role: string | null | undefined
): role is UserRole {
  return (
    role === 'admin' ||
    role === 'receiving_staff' ||
    role === 'releasing_staff'
  )
}

// Only administrators can access User Management.
function AdminOnly({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// All authenticated roles can access Receiving.
function ReceivingAccess({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  return <>{children}</>
}

// All authenticated roles can access Releasing.
function ReleasingAccess({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  return <>{children}</>
}

// Send every logged-in user to the shared dashboard.
function RoleHomeRedirect() {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />

  if (isValidRole(role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <UnauthorizedScreen />
}

// Main application layout.
function DashboardLayout() {
  const { role } = useAuth()

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      window.alert(error.message)
      return
    }

    window.location.href = '/login'
  }

  const adminNavigation = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Receiving',
      path: '/receiving',
      icon: Files,
    },
    {
      label: 'Releasing',
      path: '/releasing',
      icon: Send,
    },
    {
      label: 'User Management',
      path: '/users',
      icon: Users,
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: Settings,
    },
  ]

  // Staff can access all modules except User Management.
  const staffNavigation = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Receiving',
      path: '/receiving',
      icon: Files,
    },
    {
      label: 'Releasing',
      path: '/releasing',
      icon: Send,
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: Settings,
    },
  ]

  const navigation =
    role === 'admin' ? adminNavigation : staffNavigation

  const portalTitle =
    role === 'admin'
      ? 'Administrator Portal'
      : role === 'receiving_staff'
        ? 'Receiving Portal'
        : 'Releasing Portal'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      <aside className="flex w-full flex-col bg-[#172554] p-5 text-white md:min-h-screen md:w-64">

        {/* Application logo and name */}
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
            <img
              src="/logo.jpg"
              alt="presSystem logo"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <h1 className="text-lg font-bold">presSystem</h1>
            <p className="text-xs text-blue-200">
              Management Portal
            </p>
          </div>
        </div>

        <p className="mb-3 text-xs tracking-widest text-blue-200">
          MAIN MENU
        </p>

        <nav className="space-y-2">
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-blue-100 hover:bg-white/10'
                }`
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-10 border-t border-white/10 pt-5 md:mt-auto">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-blue-100 transition hover:bg-red-600 hover:text-white"
          >
            <LogOut size={19} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-sm text-slate-500">
              presSystem / Workspace
            </p>
            <p className="font-semibold">{portalTitle}</p>
          </div>

          <button
            type="button"
            aria-label="Notifications"
            className="rounded-xl border border-slate-200 p-3 transition hover:bg-blue-50"
          >
            <Bell size={19} />
          </button>
        </header>

        <div className="p-5 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

// Shared dashboard for Admin, Receiving Staff, and Releasing Staff.
function Dashboard() {
  const [records, setRecords] = useState<RecordSummary[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        const [recordsResult, usersResult] = await Promise.all([
          supabase
            .from('receiving_records')
            .select('id, reference_number, record_type, subject, status')
            .order('created_at', { ascending: false })
            .limit(100),

          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true }),
        ])

        if (!active) return

        if (recordsResult.error) {
          setError(recordsResult.error.message)
        } else {
          setRecords(recordsResult.data ?? [])
        }

        if (usersResult.error) {
          setError(current =>
            current
              ? `${current}; ${usersResult.error!.message}`
              : usersResult.error!.message
          )
        } else {
          setTotalUsers(usersResult.count ?? 0)
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load dashboard data.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [])

  const stats = [
    {
      title: 'Total Records',
      value: records.length,
      icon: Files,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      title: 'Pending Requests',
      value: records.filter(record =>
        ['received', 'forwarded', 'in_progress', 'returned'].includes(
          record.status.toLowerCase()
        )
      ).length,
      icon: Clock,
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Completed',
      value: records.filter(
        record => record.status.toLowerCase() === 'completed'
      ).length,
      icon: CheckCircle2,
      color: 'bg-green-50 text-green-700',
    },
    {
      title: 'Total Users',
      value: totalUsers,
      icon: Users,
      color: 'bg-red-50 text-red-700',
    },
  ]

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm text-slate-500">
          Workspace / Overview
        </p>
        <h2 className="mt-1 text-3xl font-bold text-blue-950">
          Dashboard
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Manage incoming and outgoing documents from one place.
        </p>
      </header>

      {/* Welcome banner with application logo */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 p-7 text-white shadow-sm">
        <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
            <img
              src="/logo.jpg"
              alt="presSystem logo"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <p className="mb-2 text-sm text-blue-100">
              DOCUMENT MANAGEMENT SYSTEM
            </p>
            <h3 className="text-2xl font-bold md:text-3xl">
              Welcome to presSystem
            </h3>
            <p className="mt-2 text-sm text-blue-100">
              Select a module below to manage document transactions.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h3 className="text-xl font-bold text-blue-950">
            Document Management
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Choose which document records you want to access.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <NavLink
            to="/receiving"
            className="group rounded-2xl border border-blue-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-500 hover:shadow-md sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-blue-100 p-4 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                  <Files size={28} />
                </div>

                <div>
                  <h4 className="text-xl font-bold text-blue-950">
                    Receiving
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Incoming documents
                  </p>
                </div>
              </div>

              <ArrowRight
                size={21}
                className="text-blue-600 transition group-hover:translate-x-1"
              />
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-600">
              View and search incoming document records, including
              PresOffice numbers, bearer information, receiving staff,
              destination folders, and receipt details.
            </p>

            <p className="mt-5 text-sm font-semibold text-blue-700">
              View Receiving Records →
            </p>
          </NavLink>

          <NavLink
            to="/releasing"
            className="group rounded-2xl border border-red-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-red-400 hover:shadow-md sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-red-100 p-4 text-red-700 transition group-hover:bg-red-600 group-hover:text-white">
                  <Send size={28} />
                </div>

                <div>
                  <h4 className="text-xl font-bold text-blue-950">
                    Releasing
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Outgoing documents
                  </p>
                </div>
              </div>

              <ArrowRight
                size={21}
                className="text-red-600 transition group-hover:translate-x-1"
              />
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-600">
              View outgoing document records, recipients, release details,
              and transaction statuses.
            </p>

            <p className="mt-5 text-sm font-semibold text-red-700">
              View Releasing Records →
            </p>
          </NavLink>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Unable to load some dashboard statistics: {error}
        </div>
      )}

      <section>
        <h3 className="mb-4 text-xl font-bold text-blue-950">
          System Overview
        </h3>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ title, value, icon: Icon, color }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">{title}</p>
                <div className={`rounded-xl p-3 ${color}`}>
                  <Icon size={21} />
                </div>
              </div>

              <p className="mt-5 text-3xl font-bold text-blue-950">
                {loading ? '—' : value}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {title === 'Total Records'
                  ? 'Latest 100 records loaded'
                  : 'Current database statistics'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-sm text-slate-500">
        Workspace / {title}
      </p>

      <h2 className="mt-2 text-2xl font-bold text-blue-950">
        {title}
      </h2>

      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <ClipboardList size={36} className="mx-auto text-blue-600" />

        <h3 className="mt-4 font-semibold text-slate-800">
          {title} Module
        </h3>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          This module is ready for its own records table and workflow.
          Its database connection and transaction features still need
          to be implemented.
        </p>
      </div>
    </section>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              {/* All valid roles can access the dashboard. */}
              <Route
                path="/dashboard"
                element={<Dashboard />}
              />

              {/* All valid roles can access Receiving. */}
              <Route
                path="/receiving"
                element={
                  <ReceivingAccess>
                    <ReceivingRecords />
                  </ReceivingAccess>
                }
              />

              <Route
                path="/receiving/new"
                element={
                  <ReceivingAccess>
                    <Receiving />
                  </ReceivingAccess>
                }
              />

              {/* All valid roles can access Releasing. */}
              <Route
                path="/releasing"
                element={
                  <ReleasingAccess>
                    <ReleasingRecords />
                  </ReleasingAccess>
                }
              />

              {/* Only Admin can access User Management. */}
              <Route
                path="/users"
                element={
                  <AdminOnly>
                    <UserManagement />
                  </AdminOnly>
                }
              />

              {/* All valid roles can access Settings. */}
              <Route
                path="/settings"
                element={<Placeholder title="Settings" />}
              />
            </Route>
          </Route>

          <Route path="/" element={<RoleHomeRedirect />} />
          <Route path="*" element={<RoleHomeRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}