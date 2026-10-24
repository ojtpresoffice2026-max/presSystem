
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'

import {
  LayoutDashboard,
  Files,
  Users,
  Settings,
  Bell,
  Clock,
  CheckCircle2,
  LogOut,
  Send,
  ArrowRight,
  UserRound,
  ClipboardCheck,
} from 'lucide-react'

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { supabase } from './lib/supabase'
import {
  AuthProvider,
  useAuth,
  type UserRole,
} from './context/AuthContext'

import Login from './pages/Login'
import Receiving from './pages/Receiving'
import ReceivingRecords from './component/ReceivingRecords'
import ReleasingRecords from './component/ReleasingRecords'
import ForwardingRecords from './component/ForwardingRecords'
import BoardRoomRecords from './component/BoardRoomRecords'
import UserManagement from './pages/UserManagement'
import SettingsPage from './pages/Settings'
import OriginOfficeReturns from './component/OriginOfficeReturns'

type RecordSummary = {
  id: string
  reference_number: string
  record_type: string
  subject: string
  status: string
}

type HeaderProfile = {
  full_name: string | null
  avatar_path: string | null
}

function isValidRole(
  role: string | null | undefined,
): role is UserRole {
  return (
    role === 'admin' ||
    role === 'receiving_staff' ||
    role === 'forwarding_staff' ||
    role === 'board_room_staff' ||
    role === 'releasing_staff'
  )
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
          Your account does not have a valid presSystem role.
          Contact your administrator.
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

// Administrator-only access.
function AdminOnly({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Receiving: administrators and Receiving Staff.
function ReceivingAccess({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  if (role !== 'admin' && role !== 'receiving_staff') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Forwarding: administrators and Forwarding Staff.
function ForwardingAccess({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  if (role !== 'admin' && role !== 'forwarding_staff') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Releasing: administrators and Releasing Staff.
function ReleasingAccess({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  if (role !== 'admin' && role !== 'releasing_staff') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Board Room: administrators and Board Room Staff.
function BoardRoomAccess({ children }: { children: ReactNode }) {
  const { role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!isValidRole(role)) return <Navigate to="/login" replace />

  if (role !== 'admin' && role !== 'board_room_staff') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Redirect users to the correct home page.
function RoleHomeRedirect() {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />

  if (!isValidRole(role)) return <UnauthorizedScreen />

  if (role === 'board_room_staff') {
    return <Navigate to="/board-room" replace />
  }

  if (role === 'forwarding_staff') {
    return <Navigate to="/forwarding" replace />
  }

  if (role === 'releasing_staff') {
    return <Navigate to="/releasing" replace />
  }

  if (role === 'receiving_staff') {
    return <Navigate to="/receiving" replace />
  }

  return <Navigate to="/dashboard" replace />
}

// Header profile and avatar.
function HeaderProfileButton() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState<HeaderProfile | null>(null)
  const [imageFailed, setImageFailed] = useState(false)

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!user) {
        setProfile(null)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_path')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error

      setProfile(data)
      setImageFailed(false)
    } catch (error) {
      console.error('Unable to load profile:', error)
    }
  }, [])

  useEffect(() => {
    void loadProfile()

    const handleProfileUpdate = () => {
      void loadProfile()
    }

    window.addEventListener(
      'profile-avatar-updated',
      handleProfileUpdate,
    )

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadProfile()
    })

    return () => {
      window.removeEventListener(
        'profile-avatar-updated',
        handleProfileUpdate,
      )
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const avatarUrl = profile?.avatar_path
    ? supabase.storage
        .from('avatars')
        .getPublicUrl(profile.avatar_path).data.publicUrl
    : null

  const initial =
    profile?.full_name?.trim().charAt(0).toUpperCase() || ''

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="max-w-40 truncate text-sm font-semibold text-slate-800">
          {profile?.full_name || 'My Account'}
        </p>
        <p className="text-xs text-slate-500">Profile Settings</p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/settings')}
        aria-label="Open profile settings"
        title="Open profile settings"
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-blue-100 text-blue-800 shadow-sm transition hover:ring-4 hover:ring-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-200"
      >
        {avatarUrl && !imageFailed ? (
          <img
            src={avatarUrl}
            alt="Profile picture"
            className="h-full w-full rounded-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : initial ? (
          <span className="text-lg font-bold">{initial}</span>
        ) : (
          <UserRound size={21} />
        )}
      </button>
    </div>
  )
}

// Main application layout and role-based sidebar.
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
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Receiving', path: '/receiving', icon: Files },
    { label: 'Forwarding to Board Room', path: '/forwarding', icon: Clock },
    { label: 'Board Room', path: '/board-room', icon: ClipboardCheck },
    { label: 'Releasing', path: '/releasing', icon: Send },
    { label: 'User Management', path: '/users', icon: Users },
    { label: 'Settings', path: '/settings', icon: Settings },
  
  ]

  const receivingNavigation = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Receiving', path: '/receiving', icon: Files },
    { label: 'Settings', path: '/settings', icon: Settings },
  ]

  const forwardingNavigation = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Forwarding to Board Room', path: '/forwarding', icon: Clock },
    { label: 'Settings', path: '/settings', icon: Settings },
  ]

  const boardRoomNavigation = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Board Room', path: '/board-room', icon: ClipboardCheck },
    { label: 'Settings', path: '/settings', icon: Settings },
  ]

  const releasingNavigation = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Releasing', path: '/releasing', icon: Send },
    { label: 'Settings', path: '/settings', icon: Settings },
  ]

  const navigation =
    role === 'admin'
      ? adminNavigation
      : role === 'receiving_staff'
        ? receivingNavigation
        : role === 'forwarding_staff'
          ? forwardingNavigation
          : role === 'board_room_staff'
            ? boardRoomNavigation
            : releasingNavigation

  const portalTitle: Record<UserRole, string> = {
    admin: 'Administrator Portal',
    receiving_staff: 'Receiving Portal',
    forwarding_staff: 'Forwarding Portal',
    board_room_staff: 'Board Room Portal',
    releasing_staff: 'Releasing Portal',
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      <aside className="flex w-full flex-col bg-[#172554] p-5 text-white md:min-h-screen md:w-64">
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
            <p className="text-xs text-blue-200">Management Portal</p>
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
              <span>{label}</span>
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
            <p className="font-semibold">
              {isValidRole(role) ? portalTitle[role] : 'Management Portal'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Notifications"
              title="Notifications"
              className="rounded-xl border border-slate-200 p-3 transition hover:bg-blue-50"
            >
              <Bell size={19} />
            </button>
            <HeaderProfileButton />
          </div>
        </header>

        <div className="p-5 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

// Dashboard
function Dashboard() {
  const { role } = useAuth()

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
        const recordsQuery = supabase
          .from('receiving_records')
          .select('id, reference_number, record_type, subject, status')
          .order('created_at', { ascending: false })
          .limit(100)

        const [recordsResult, usersResult] = await Promise.all([
          recordsQuery,
          role === 'admin'
            ? supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
            : Promise.resolve({
                count: null,
                data: null,
                error: null,
              }),
        ])

        if (!active) return

        if (recordsResult.error) {
          setError(recordsResult.error.message)
        } else {
          setRecords(recordsResult.data ?? [])
        }

        if (usersResult.error) {
          setError((current) =>
            current
              ? `${current}; ${usersResult.error!.message}`
              : usersResult.error!.message,
          )
        } else {
          setTotalUsers(usersResult.count ?? 0)
        }
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to load dashboard data.',
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
  }, [role])

  const isBoardRoomStaff = role === 'board_room_staff'
  const isForwardingStaff = role === 'forwarding_staff'
  const isReceivingStaff = role === 'receiving_staff'
  const isReleasingStaff = role === 'releasing_staff'

  const stats = [
    {
      title: 'Total Records',
      value: records.length,
      icon: Files,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      title: 'Pending Requests',
      value: records.filter((record) =>
        ['received', 'forwarded', 'in_progress', 'returned'].includes(
          (record.status || '').toLowerCase(),
        ),
      ).length,
      icon: Clock,
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Completed',
      value: records.filter(
        (record) => (record.status || '').toLowerCase() === 'completed',
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

  const cards = [
    {
      title: 'Receiving',
      subtitle: 'Incoming documents',
      description:
        'Register and manage incoming document records, including reference numbers, bearer information, destination folders, and receipt details.',
      path: '/receiving',
      icon: Files,
      color: 'blue',
      visible: role === 'admin' || isReceivingStaff,
    },
    {
      title: 'Forwarding to Board Room',
      subtitle: 'Document handoff',
      description:
        'Select existing Receiving records and record the transaction person, folder color or box number, urgency, and forwarding details.',
      path: '/forwarding',
      icon: Clock,
      color: 'amber',
      visible: role === 'admin' || isForwardingStaff,
    },
    {
      title: 'Board Room',
      subtitle: 'Document processing',
      description:
        'Confirm document receipt, record the President’s communicated action and remarks, and track returned documents.',
      path: '/board-room',
      icon: ClipboardCheck,
      color: 'green',
      visible: role === 'admin' || isBoardRoomStaff,
    },
    {
      title: 'Releasing',
      subtitle: 'Outgoing documents',
      description:
        'Manage outgoing document records, recipients, release details, and transaction statuses.',
      path: '/releasing',
      icon: Send,
      color: 'red',
      visible: role === 'admin' || isReleasingStaff,
    },
  ].filter((card) => card.visible)

  const cardColors: Record<string, string> = {
    blue: 'border-blue-200 hover:border-blue-500 bg-blue-100 text-blue-700',
    amber: 'border-amber-200 hover:border-amber-500 bg-amber-100 text-amber-700',
    green: 'border-green-200 hover:border-green-500 bg-green-100 text-green-700',
    red: 'border-red-200 hover:border-red-500 bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm text-slate-500">Workspace / Overview</p>
        <h2 className="mt-1 text-3xl font-bold text-blue-950">
          Dashboard
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {isBoardRoomStaff
            ? 'Review incoming Board Room documents and record the President’s communicated actions.'
            : isForwardingStaff
              ? 'Forward received documents to the Board Room and track each handoff.'
              : 'Manage document transactions based on your assigned role.'}
        </p>
      </header>

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
              {isBoardRoomStaff
                ? 'Manage document receipt, presidential actions, and returns.'
                : isForwardingStaff
                  ? 'Manage the forwarding of documents to the Board Room.'
                  : 'Select a module below to manage document transactions.'}
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
            Available modules for your account.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {cards.map((card) => {
            const Icon = card.icon

            return (
              <NavLink
                key={card.path}
                to={card.path}
                className={`group rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:p-7 ${cardColors[card.color].split(' ').filter((value) => value.startsWith('border-') || value.startsWith('hover:border-')).join(' ')}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`rounded-xl p-4 ${cardColors[card.color].split(' ').filter((value) => value.startsWith('bg-') || value.startsWith('text-')).join(' ')}`}>
                      <Icon size={28} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xl font-bold text-blue-950">
                        {card.title}
                      </h4>
                      <p className="mt-1 text-sm text-slate-500">
                        {card.subtitle}
                      </p>
                    </div>
                  </div>

                  <ArrowRight
                    size={21}
                    className="shrink-0 text-blue-600 transition group-hover:translate-x-1"
                  />
                </div>

                <p className="mt-5 text-sm leading-6 text-slate-600">
                  {card.description}
                </p>

                <p className="mt-5 text-sm font-semibold text-blue-700">
                  Open Module →
                </p>
              </NavLink>
            )
          })}
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
                  : title === 'Total Users' && role !== 'admin'
                    ? 'Administrator-only statistic'
                    : 'Current database statistics'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
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
              <Route
                path="/dashboard"
                element={<Dashboard />}
              />

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

              <Route
                path="/forwarding"
                element={
                  <ForwardingAccess>
                    <ForwardingRecords />
                  </ForwardingAccess>
                }
              />

              <Route
                path="/board-room"
                element={
                  <BoardRoomAccess>
                    <BoardRoomRecords />
                  </BoardRoomAccess>
                }
              />

              <Route
                path="/releasing"
                element={
                  <ReleasingAccess>
                    <ReleasingRecords />
                  </ReleasingAccess>
                }
              />

              <Route
                path="/users"
                element={
                  <AdminOnly>
                    <UserManagement />
                  </AdminOnly>
                }
              />
<Route
  path="/returned-documents"
  element={
    <ReceivingAccess>
      <OriginOfficeReturns />
    </ReceivingAccess>
  }
/>
              <Route
                path="/settings"
                element={<SettingsPage />}
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
