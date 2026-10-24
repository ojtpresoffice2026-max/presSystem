
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Files,
  Users,
  Settings,
  Bell,
  Clock,
  LogOut,
  Send,
  ClipboardCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function DashboardLayout() {
  const navigate = useNavigate()
  const { role } = useAuth()

  const sharedNavigation = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Receiving', path: '/receiving', icon: Files },
    { label: 'Forwarding to Board Room', path: '/forwarding', icon: Clock },
    { label: 'Board Room', path: '/board-room', icon: ClipboardCheck },
    { label: 'Releasing', path: '/releasing', icon: Send },
  ]

  const navigation =
    role === 'admin'
      ? [
          ...sharedNavigation,
          { label: 'User Management', path: '/users', icon: Users },
          { label: 'Settings', path: '/settings', icon: Settings },
        ]
      : [
          ...sharedNavigation,
          { label: 'Settings', path: '/settings', icon: Settings },
        ]

  const portalTitle =
    role === 'admin' ? 'Administrator Portal' : 'Staff Portal'

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      window.alert(`Unable to sign out: ${error.message}`)
      return
    }

    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      <aside className="relative flex w-full flex-col overflow-hidden bg-[#172554] p-5 text-white md:min-h-screen md:w-64">
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
                      ? 'bg-blue-600 text-white'
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
            className="rounded-xl border border-slate-200 p-3 transition-colors hover:bg-slate-50"
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
