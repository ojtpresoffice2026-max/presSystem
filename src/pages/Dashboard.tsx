
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Files,
  Clock,
  CheckCircle2,
  Users,
  Send,
  ArrowRight,
  ClipboardCheck,
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
    },
    {
      title: 'Pending Requests',
      value: records.filter((record) =>
        [
          'received',
          'forwarded',
          'in_progress',
          'returned',
        ].includes((record.status || '').toLowerCase()),
      ).length,
      icon: Clock,
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Completed',
      value: records.filter(
        (record) =>
          (record.status || '').toLowerCase() === 'completed',
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

  // All operational modules are visible to every authorized role.
  // User Management remains in the administrator-only sidebar.
  const cards: DashboardCard[] = [
    {
      title: 'Receiving',
      subtitle: 'Incoming documents',
      description:
        'Register and manage incoming document records, including reference numbers, bearer information, destination folders, and receipt details.',
      path: '/receiving',
      icon: Files,
      color: 'blue',
    },
    {
      title: 'Forwarding to Board Room',
      subtitle: 'Document handoff',
      description:
        'Select existing Receiving records and record the transaction person, folder color or box number, urgency, and forwarding details.',
      path: '/forwarding',
      icon: Clock,
      color: 'amber',
    },
    {
      title: 'Board Room',
      subtitle: 'Document processing',
      description:
        'Confirm document receipt, record the President’s communicated action and remarks, and track returned documents.',
      path: '/board-room',
      icon: ClipboardCheck,
      color: 'green',
    },
    {
      title: 'Releasing',
      subtitle: 'Outgoing documents',
      description:
        'Manage outgoing document records, recipients, release details, and transaction statuses.',
      path: '/releasing',
      icon: Send,
      color: 'red',
    },
  ]

  const cardColors: Record<DashboardCard['color'], string> = {
    blue: 'border-blue-200 hover:border-blue-500 bg-blue-100 text-blue-700',
    amber:
      'border-amber-200 hover:border-amber-500 bg-amber-100 text-amber-700',
    green:
      'border-green-200 hover:border-green-500 bg-green-100 text-green-700',
    red: 'border-red-200 hover:border-red-500 bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-7">
      {/* Dashboard heading */}
      <header>
        <p className="text-sm text-slate-500">
          Workspace / Overview
        </p>

        <h2 className="mt-1 text-3xl font-bold text-blue-950">
          Dashboard
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          Manage document transactions and access all operational
          modules available in presSystem.
        </p>
      </header>

      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 p-7 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" />

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

      {/* Operational modules */}
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
            const colors = cardColors[card.color].split(' ')

            const borderColors = colors
              .filter(
                (value) =>
                  value.startsWith('border-') ||
                  value.startsWith('hover:border-'),
              )
              .join(' ')

            const iconColors = colors
              .filter(
                (value) =>
                  value.startsWith('bg-') ||
                  value.startsWith('text-'),
              )
              .join(' ')

            return (
              <NavLink
                key={card.path}
                to={card.path}
                className={`group rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md sm:p-7 ${borderColors}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`rounded-xl p-4 ${iconColors}`}>
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

      {/* Dashboard errors */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Unable to load some dashboard statistics: {error}
        </div>
      )}

      {/* System statistics */}
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
                <p className="text-sm text-slate-500">
                  {title}
                </p>

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
