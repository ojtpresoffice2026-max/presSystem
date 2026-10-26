import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Files,
  Clock,
  Users,
  Send,
  ArrowRight,
  ClipboardCheck,
  TrendingUp,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
type RecordSummary = {
  id: string
  reference_number: string
  record_type: string
  subject: string
  status: string
}
type DashboardCard = {
  title: string
  subtitle: string
  description: string
  path: string
  icon: typeof Files
  color: 'blue' | 'amber' | 'green' | 'red'
}
export default function Dashboard() {
  const { role } = useAuth()
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [records, setRecords] = useState<RecordSummary[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Read the welcome message saved during login.
  useEffect(() => {
    const message = sessionStorage.getItem('loginWelcome')
    if (message) {
      setWelcomeMessage(message)
    }
  }, [])
  // Load dashboard statistics.
  useEffect(() => {
    let active = true
    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const recordsQuery = supabase
          .from('receiving_records')
          .select(
            'id, reference_number, record_type, subject, status',
          )
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
        if (active) {
          setLoading(false)
        }
      }
    }
    void loadDashboard()
    return () => {
      active = false
    }
  }, [role])
  const stats = [
    {
      title: 'Total Records',
      value: records.length,
      icon: Files,
      color: 'bg-blue-50 text-blue-700',
      accent: 'group-hover:bg-blue-600 group-hover:text-white',
    },
    {
      title: 'Total Users',
      value: totalUsers,
      icon: Users,
      color: 'bg-red-50 text-red-700',
      accent: 'group-hover:bg-red-600 group-hover:text-white',
    },
  ]
  const cards: DashboardCard[] = [
    {
      title: 'Receiving',
      subtitle: 'Incoming documents',
      description:
        'Register and manage incoming documents, reference numbers, bearer information, and receipt details.',
      path: '/receiving',
      icon: Files,
      color: 'blue',
    },
    {
      title: 'Forwarding to Board Room',
      subtitle: 'Document handoff',
      description:
        'Manage document forwarding, transaction details, urgency, and document handoffs.',
      path: '/forwarding',
      icon: Clock,
      color: 'amber',
    },
    {
      title: 'Board Room',
      subtitle: 'Document processing',
      description:
        'Confirm document receipt, record communicated actions and remarks, and track returned documents.',
      path: '/board-room',
      icon: ClipboardCheck,
      color: 'green',
    },
    {
      title: 'Releasing',
      subtitle: 'Outgoing documents',
      description:
        'Manage outgoing documents, recipients, release details, and transaction statuses.',
      path: '/releasing',
      icon: Send,
      color: 'red',
    },
  ]
  const cardStyles = {
    blue: {
      icon: 'bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white',
      border: 'hover:border-blue-300',
      line: 'bg-blue-600',
    },
    amber: {
      icon: 'bg-amber-50 text-amber-700 group-hover:bg-amber-500 group-hover:text-white',
      border: 'hover:border-amber-300',
      line: 'bg-amber-500',
    },
    green: {
      icon: 'bg-green-50 text-green-700 group-hover:bg-green-600 group-hover:text-white',
      border: 'hover:border-green-300',
      line: 'bg-green-600',
    },
    red: {
      icon: 'bg-red-50 text-red-700 group-hover:bg-red-600 group-hover:text-white',
      border: 'hover:border-red-300',
      line: 'bg-red-600',
    },
  }
  // Extract the account name from the saved login message.
  const accountName = welcomeMessage
    ? welcomeMessage
        .replace(/^Welcome,\s*/i, '')
        .replace(/\s*!?\s*Have a good day\.?$/i, '')
        .trim()
    : ''
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-5 overflow-hidden">
      {/* Dashboard heading */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Workspace / Overview
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage document transactions from one central workspace.
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-medium text-blue-800 shadow-sm sm:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          {role === 'admin' ? 'Administrator' : 'Staff'} Portal
        </div>
      </header>
      {/* Welcome banner */}
      <section className="group relative shrink-0 overflow-hidden rounded-2xl bg-gradient-to-r from-[#172554] via-[#1e40af] to-[#2563eb] p-5 text-white shadow-lg transition-all duration-300 hover:shadow-xl md:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[24px] border-white/[0.06] transition-transform duration-700 ease-out group-hover:scale-125" />
        <div className="pointer-events-none absolute -bottom-16 right-1/4 h-40 w-40 rounded-full bg-blue-300/10 blur-2xl transition-transform duration-700 group-hover:scale-150" />
        <div className="relative flex items-center gap-4 md:gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-3 shadow-md transition-transform duration-300 group-hover:rotate-2 group-hover:scale-105 md:h-20 md:w-20">
            <img
              src="/logo.jpg"
              alt="presSystem logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-blue-200 md:text-xs">
              <Sparkles size={14} />
              DOCUMENT MANAGEMENT SYSTEM
            </p>
            {accountName ? (
              <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tracking-tight">
                <span className="text-base font-medium text-blue-100 md:text-xl">
                  Welcome,
                </span>
                <span className="inline-block text-2xl font-extrabold text-white drop-shadow-md motion-safe:animate-[welcomeName_0.8s_ease-out_both] md:text-4xl">
                  {accountName}!
                </span>
                <span className="text-sm font-medium text-blue-100 md:text-base">
                  Have a good day.
                </span>
              </h3>
            ) : (
              <h3 className="text-xl font-bold tracking-tight md:text-3xl">
                Welcome to presSystem
              </h3>
            )}
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-blue-100 md:text-sm">
              Your centralized workspace for receiving, forwarding,
              processing, and releasing documents.
            </p>
          </div>
        </div>
      </section>
      {/* Main dashboard content */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-5 overflow-y-auto overscroll-contain pb-1 xl:grid-cols-[minmax(0,1.4fr)\_minmax(300px,0.9fr)]">
        {/* Operational modules */}
        <section className="flex min-w-0 flex-col">
          <div className="mb-3 shrink-0">
            <h3 className="text-lg font-bold text-slate-900">
              Document Management
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Select a module to manage document transactions.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((card, index) => {
              const Icon = card.icon
              const style = cardStyles[card.color]
              return (
                <NavLink
                  key={card.path}
                  to={card.path}
                  style={{ animationDelay: `${index * 70}ms` }}
                  className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-safe:animate-[fadeInUp_0.45s_ease-out_both] ${style.border}`}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${style.line}`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`rounded-xl p-3 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${style.icon}`}
                    >
                      <Icon size={22} />
                    </div>
                    <ArrowRight
                      size={18}
                      className="mt-1 shrink-0 text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-blue-600"
                    />
                  </div>
                  <h4 className="mt-4 text-base font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-blue-700">
                    {card.title}
                  </h4>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {card.subtitle}
                  </p>
                  <p className="mt-3 flex-1 text-xs leading-5 text-slate-600">
                    {card.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-semibold text-blue-700">
                      Open module
                    </span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition-all duration-300 group-hover:bg-blue-600 group-hover:text-white">
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </NavLink>
              )
            })}
          </div>
        </section>
        {/* System overview */}
        <section className="flex min-w-0 flex-col">
          <div className="mb-3 shrink-0">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <TrendingUp size={19} className="text-blue-600" />
              System Overview
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Current database statistics.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {stats.map(({ title, value, icon: Icon, color, accent }) => (
              <article
                key={title}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 transition-colors group-hover:text-slate-700">
                      {title}
                    </p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 transition-transform duration-300 group-hover:scale-105">
                      {loading ? '—' : value}
                    </p>
                  </div>
                  <div
                    className={`rounded-xl p-3 transition-all duration-300 group-hover:rotate-3 ${color} ${accent}`}
                  >
                    <Icon size={22} />
                  </div>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full w-1/3 rounded-full transition-all duration-500 group-hover:w-full ${
                      title === 'Total Records'
                        ? 'bg-blue-500'
                        : 'bg-red-500'
                    }`}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  {title === 'Total Records'
                    ? 'Latest 100 records loaded'
                    : title === 'Total Users' && role !== 'admin'
                      ? 'Administrator-only statistic'
                      : 'Current database statistics'}
                </p>
              </article>
            ))}
          </div>
          {error && (
            <div
              role="alert"
              className="mt-4 shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700"
            >
              <p className="font-semibold">
                Unable to load some statistics
              </p>
              <p className="mt-1 break-words">{error}</p>
            </div>
          )}
          <div className="mt-4 hidden rounded-xl border border-slate-200 bg-white p-4 sm:block">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                <ClipboardCheck size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">
                  Workflow at a glance
                </h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Receiving → Forwarding → Board Room → Releasing
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
