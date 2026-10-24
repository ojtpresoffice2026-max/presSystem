import { useEffect, useState } from 'react'
import { Clock, RefreshCw, History } from 'lucide-react'
import { supabase } from '../lib/supabase'

type AuditLog = {
  id: number
  document_id: string
  document_reference: string | null
  module_name: string
  action_type: string
  performed_by: string | null
  performed_by_name: string
  performed_by_role: string | null
  previous_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

type StaffProfile = {
  id: string
  full_name: string | null
}

type AuditHistoryProps = {
  documentId: string
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function collectUuids(
  value: unknown,
  found = new Set<string>(),
): Set<string> {
  if (typeof value === 'string' && UUID_PATTERN.test(value)) {
    found.add(value)
  } else if (Array.isArray(value)) {
    value.forEach(item => collectUuids(item, found))
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(item =>
      collectUuids(item, found),
    )
  }

  return found
}

function formatValue(
  value: unknown,
  staffNames: Record<string, string>,
): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (typeof value === 'string') {
    if (staffNames[value]) return staffNames[value]

    // Format ISO date-time strings in Philippine time using a 12-hour clock.
    // Only strings that look like full ISO timestamps are converted.
    const looksLikeIsoDateTime =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(value)

    if (looksLikeIsoDateTime) {
      const formattedDateTime = formatDateTime(value)
      if (formattedDateTime !== value) return formattedDateTime
    }

    // Avoid displaying raw UUIDs when the profile cannot be resolved.
    if (UUID_PATTERN.test(value)) {
      return 'Staff member (name unavailable)'
    }

    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(item => formatValue(item, staffNames))
      .join(', ')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)

    return entries
      .map(
        ([key, item]) =>
          `${key.replaceAll('_', ' ')}: ${formatValue(item, staffNames)}`,
      )
      .join('; ')
  }

  return String(value)
}

function getChangedFields(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
) {
  if (!previous || !current) return []

  const ignoredFields = new Set(['updated_at', 'created_at'])

  return Object.keys(current)
    .filter(key => !ignoredFields.has(key))
    .filter(
      key => JSON.stringify(previous[key]) !== JSON.stringify(current[key]),
    )
    .map(key => ({
      field: key.replaceAll('_', ' '),
      before: previous[key],
      after: current[key],
    }))
}

export default function AuditHistory({
  documentId,
}: AuditHistoryProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [staffNames, setStaffNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  async function loadLogs(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('document_audit_logs')
        .select(`
          id,
          document_id,
          document_reference,
          module_name,
          action_type,
          performed_by,
          performed_by_name,
          performed_by_role,
          previous_values,
          new_values,
          created_at
        `)
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })

      if (queryError) throw queryError

      const loadedLogs = (data ?? []) as AuditLog[]
      setLogs(loadedLogs)

      // Resolve UUIDs in historical before/after values to profile names.
      const ids = new Set<string>()

      loadedLogs.forEach(log => {
        collectUuids(log.previous_values, ids)
        collectUuids(log.new_values, ids)
      })

      if (ids.size > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(ids))

        if (!profileError && profiles) {
          const resolved: Record<string, string> = {}

          ;(profiles as StaffProfile[]).forEach(profile => {
            if (profile.id && profile.full_name?.trim()) {
              resolved[profile.id] = profile.full_name.trim()
            }
          })

          setStaffNames(previous => ({
            ...previous,
            ...resolved,
          }))
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load document history.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!documentId) return

    void loadLogs()

    const channel = supabase
      .channel(`audit-history-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_audit_logs',
          filter: `document_id=eq.${documentId}`,
        },
        () => {
          void loadLogs(true)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [documentId])

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <History size={16} />
            Edit History / Audit Log
          </h3>

          <p className="mt-1 text-xs text-slate-500">
            Recorded document changes
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadLogs(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={13}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="space-y-3 p-4">
        {loading && (
          <p className="text-sm text-slate-500">
            Loading audit history...
          </p>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center">
            <History size={22} className="mx-auto mb-2 text-slate-400" />

            <p className="text-sm font-medium text-slate-700">
              No history yet
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Changes recorded after audit logging was enabled will appear here.
            </p>
          </div>
        )}

        {logs.map(log => {
          const changes = getChangedFields(
            log.previous_values,
            log.new_values,
          )

          return (
            <article
              key={log.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {log.performed_by_name || 'Unknown User'}

                    <span className="font-normal text-slate-500">
                      {' '}· {log.action_type}
                    </span>
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {log.module_name}
                    {log.performed_by_role
                      ? ` · ${log.performed_by_role.replaceAll('_', ' ')}`
                      : ''}
                  </p>
                </div>

                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={12} />
                  {formatDateTime(log.created_at)}
                </p>
              </div>

              {changes.length > 0 && (
                <div className="mt-3 space-y-2">
                  {changes.map(change => (
                    <div
                      key={change.field}
                      className="rounded-md border border-slate-200 bg-white p-2"
                    >
                      <p className="text-xs font-semibold capitalize text-slate-700">
                        {change.field}
                      </p>

                      <p className="mt-1 break-words text-xs text-red-700">
                        Previous: {formatValue(change.before, staffNames)}
                      </p>

                      <p className="mt-1 break-words text-xs text-emerald-700">
                        Saved: {formatValue(change.after, staffNames)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {changes.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {log.action_type === 'INSERT'
                    ? 'Document created.'
                    : log.action_type === 'DELETE'
                      ? 'Document deleted.'
                      : 'An operation was recorded.'}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
