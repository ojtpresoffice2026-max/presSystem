
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
  LogOut,
  Send,
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
import Dashboard from './pages/Dashboard'
import MyProfile from './pages/MyProfile'

type HeaderProfile = {
  full_name: string | null
  avatar_path: string | null
}

function isValidRole(
  role: string | null | undefined,
): role is UserRole {
  return role === 'admin' || role === 'staff'
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

// Protect application pages from unauthenticated users.
function ProtectedRoute() {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isValidRole(role)) {
    return <UnauthorizedScreen />
  }

  return <Outlet />
}

// Only administrators can access User Management and Settings.
function AdminOnly({ children }: { children: ReactNode }) {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isValidRole(role)) {
    return <UnauthorizedScreen />
  }

  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// Both admin and staff can access operational modules and My Profile.
function OperationalAccess({ children }: { children: ReactNode }) {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isValidRole(role)) {
    return <UnauthorizedScreen />
  }

  return <>{children}</>
}

// Redirect authenticated users to the shared dashboard.
function RoleHomeRedirect() {
  const { session, role, loading } = useAuth()

  if (loading) return <LoadingScreen />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isValidRole(role)) {
    return <UnauthorizedScreen />
  }

  return <Navigate to="/dashboard" replace />
}

// Header profile and avatar.
function HeaderProfileButton() {
  const navigate = useNavigate()
  const { role } = useAuth()

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

        <p className="text-xs text-slate-500">
          {role === 'admin' ? 'Administrator' : 'Staff'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/profile')}
        aria-label="Open My Profile"
        title="My Profile"
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

// Shared sidebar and application layout.
function DashboardLayout() {
  const { role } = useAuth()

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      window.alert(`Unable to sign out: ${error.message}`)
      return
    }

    window.location.href = '/login'
  }

  const sharedNavigation = [
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'My Profile',
      path: '/profile',
      icon: UserRound,
    },
    {
      label: 'Receiving',
      path: '/receiving',
      icon: Files,
    },
    {
      label: 'Forwarding to Board Room',
      path: '/forwarding',
      icon: Clock,
    },
    {
      label: 'Board Room',
      path: '/board-room',
      icon: ClipboardCheck,
    },
    {
      label: 'Releasing',
      path: '/releasing',
      icon: Send,
    },
  ]

  const navigation =
    role === 'admin'
      ? [
          ...sharedNavigation,
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
      : sharedNavigation

  const portalTitle: Record<UserRole, string> = {
    admin: 'Administrator Portal',
    staff: 'Staff Portal',
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      {/* Sidebar */}
      <aside className="relative flex w-full flex-col overflow-hidden bg-[#172554] p-5 text-white md:min-h-screen md:w-64">
        {/* Logo and application name */}
        <div className="relative z-10 mb-10 flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 rounded-xl border border-white/20 bg-white p-1">
            <img
              src="/logo.jpg"
              alt="presSystem logo"
              className="h-full w-full rounded-lg object-contain"
            />
          </div>

          <div>
            <h1 className="text-lg font-bold">presSystem</h1>
            <p className="text-xs text-blue-200">
              Management Portal
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="relative z-10">
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
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors ${
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
        </div>

        {/* Sign out */}
        <div className="relative z-10 mt-8 border-t border-white/15 pt-5 md:mt-auto">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-blue-100 transition-colors hover:bg-red-600"
          >
            <LogOut size={19} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-sm text-slate-500">
              presSystem / Workspace
            </p>

            <p className="font-semibold">
              {isValidRole(role)
                ? portalTitle[role]
                : 'Management Portal'}
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              {/* Shared dashboard */}
              <Route
                path="/dashboard"
                element={<Dashboard />}
              />

              {/* Profile page for Admin and Staff */}
              <Route
                path="/profile"
                element={
                  <OperationalAccess>
                    <MyProfile />
                  </OperationalAccess>
                }
              />

              {/* Receiving */}
              <Route
                path="/receiving"
                element={
                  <OperationalAccess>
                    <ReceivingRecords />
                  </OperationalAccess>
                }
              />

              <Route
                path="/receiving/new"
                element={
                  <OperationalAccess>
                    <Receiving />
                  </OperationalAccess>
                }
              />

              {/* Forwarding to Board Room */}
              <Route
                path="/forwarding"
                element={
                  <OperationalAccess>
                    <ForwardingRecords />
                  </OperationalAccess>
                }
              />

              {/* Board Room */}
              <Route
                path="/board-room"
                element={
                  <OperationalAccess>
                    <BoardRoomRecords />
                  </OperationalAccess>
                }
              />

              {/* Releasing */}
              <Route
                path="/releasing"
                element={
                  <OperationalAccess>
                    <ReleasingRecords />
                  </OperationalAccess>
                }
              />

              {/* Administrator-only User Management */}
              <Route
                path="/users"
                element={
                  <AdminOnly>
                    <UserManagement />
                  </AdminOnly>
                }
              />

              {/* Returned documents */}
              <Route
                path="/returned-documents"
                element={
                  <OperationalAccess>
                    <OriginOfficeReturns />
                  </OperationalAccess>
                }
              />

              {/* Administrator-only Settings */}
              <Route
                path="/settings"
                element={
                  <AdminOnly>
                    <SettingsPage />
                  </AdminOnly>
                }
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
