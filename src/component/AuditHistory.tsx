
import { useCallback, useEffect, useState } from 'react'
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

type ChangedField = {
  field: string
  before: unknown
  after: unknown
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

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
    if (staffNames[value]) {
      return staffNames[value]
    }

    const looksLikeIsoDateTime =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
        value,
      )

    if (looksLikeIsoDateTime) {
      return formatDateTime(value)
    }

    if (UUID_PATTERN.test(value)) {
      return 'Staff member (name unavailable)'
    }

    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => formatValue(item, staffNames)).join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) =>
          `${key.replaceAll('_', ' ')}: ${formatValue(item, staffNames)}`,
      )
      .join('; ')
  }

  return String(value)
}

/**
 * Fields that must not appear as ordinary document edits.
 * Workflow events belong in Document Progress.
 */
const IGNORED_FIELDS = new Set([
  'id',
  'document_id',
  'receiving_record_id',
  'document_reference',
  'reference_number',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'performed_by',
  'performed_by_name',
  'performed_by_role',

  // Urgency and priority
  'urgency',
  'is_urgent',
  'priority',

  // Workflow status and routing
  'workflow_status',
  'status',
  'current_office',
  'current_holder',
  'current_step',
  'next_action',

  // Release assignment and actions
  'release_assigned_to',
  'release_instruction',
  'release_forwarded_at',
  'release_forwarded_by',
  'release_received_at',
  'release_received_by',
  'released_at',
  'released_by',
  'released_to',
  'release_remarks',

  // Forwarding
  'forwarded_at',
  'forwarded_by',
  'forwarded_to',
  'forwarded_to_office',
  'forwarded_to_person',
  'forward_remarks',

  // Receipt
  'received_at',
  'received_by',
  'received_person',
  'received_remarks',
  'board_room_received_at',
  'board_room_received_by',

  // Return
  'returned_at',
  'returned_by',
  'returned_to',
  'returned_to_origin_at',
  'returned_to_origin_by',
  'returned_to_origin_person',
  'returned_to_origin_remarks',

  // Completion
  'completed_at',
  'completed_by',
  'completed_on',
  'workflow_completed_at',
  'workflow_completed_by',

  // Workflow next-action fields
  'next_action_office_to_forward',
  'next_action_release_to',
  'next_action_release_at',
  'next_action_system_status',
  'next_action_date_forwarded',
  'next_action_recorded_by',
  'next_action_recorded_by_name',
])

function isWorkflowField(field: string): boolean {
  const normalized = field.toLowerCase().trim()

  if (IGNORED_FIELDS.has(normalized)) {
    return true
  }

  // Catch other workflow metadata fields.
  const workflowPattern =
    /(^|_)(workflow|forwarded|forwarding|received|receipt|released|release|returned|returning|completed|completion|next_action)(_|$)/i

  const workflowDetailPattern =
    /(at|by|to|from|person|office|remarks|status|date|time|user|account|step|assigned|instruction|recorded)/i

  return (
    workflowPattern.test(normalized) &&
    workflowDetailPattern.test(normalized)
  )
}

function valuesAreEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function getChangedFields(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
): ChangedField[] {
  // Both snapshots are required to establish a real change.
  if (!previous || !current) {
    return []
  }

  const keys = new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ])

  return Array.from(keys)
    .filter(key => !isWorkflowField(key))
    .filter(key => !valuesAreEqual(previous[key], current[key]))
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

  const loadLogs = useCallback(
    async (isRefresh = false) => {
      if (!documentId) {
        setLogs([])
        setLoading(false)
        setRefreshing(false)
        return
      }

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

        if (queryError) {
          throw queryError
        }

        const loadedLogs = (data ?? []) as AuditLog[]

        /**
         * Only show UPDATE logs belonging to the Receiving module.
         * Document Workflow logs must remain in Document Progress.
         *
         * This assumes ordinary document edits use module_name = 'Receiving'.
         */
        const editLogs = loadedLogs.filter(log => {
          if (log.action_type?.trim().toUpperCase() !== 'UPDATE') {
            return false
          }

          if (log.module_name?.trim().toLowerCase() !== 'receiving') {
            return false
          }

          const changes = getChangedFields(
            log.previous_values,
            log.new_values,
          )

          return changes.length > 0
        })

        setLogs(editLogs)

        // Resolve UUID values to staff names when available.
        const ids = new Set<string>()

        editLogs.forEach(log => {
          collectUuids(log.previous_values, ids)
          collectUuids(log.new_values, ids)

          if (log.performed_by) {
            ids.add(log.performed_by)
          }
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
        console.error('Unable to load edit history:', err)

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load document history.',
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [documentId],
  )

  useEffect(() => {
    if (!documentId) {
      setLogs([])
      setLoading(false)
      return
    }

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
  }, [documentId, loadLogs])

  return (
    <section className="mt-5 rounded-xl border border-slate-700 bg-slate-800">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <History size={16} />
            Edit History / Audit Log
          </h3>

          <p className="mt-1 text-xs text-slate-300">
            Only actual changes to document information are shown here.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadLogs(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
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
          <p className="text-sm text-slate-300">
            Loading edit history...
          </p>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-600 p-5 text-center">
            <History
              size={22}
              className="mx-auto mb-2 text-slate-400"
            />

            <p className="text-sm font-medium text-slate-200">
              No edits recorded
            </p>

            <p className="mt-1 text-xs text-slate-400">
              This section shows saved changes to document information.
              Creation, forwarding, receipt, release, return, and other
              workflow events belong in Document Progress.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          logs.map(log => {
            const changes = getChangedFields(
              log.previous_values,
              log.new_values,
            )

            if (changes.length === 0) {
              return null
            }

            const accountName =
              log.performed_by_name?.trim() ||
              (log.performed_by && staffNames[log.performed_by]) ||
              'Unknown User'

            return (
              <article
                key={log.id}
                className="rounded-lg border border-slate-700 bg-slate-900 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {accountName}
                      <span className="font-normal text-slate-400">
                        {' '}· EDIT
                      </span>
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Document Information
                      {log.performed_by_role
                        ? ` · ${log.performed_by_role.replaceAll('_', ' ')}`
                        : ''}
                    </p>
                  </div>

                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock size={12} />
                    {formatDateTime(log.created_at)}
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  {changes.map(change => (
                    <div
                      key={change.field}
                      className="rounded-md border border-slate-700 bg-slate-800 p-2"
                    >
                      <p className="text-xs font-semibold capitalize text-slate-200">
                        {change.field}
                      </p>

                      <p className="mt-1 break-words text-xs text-red-400">
                        Previous: {formatValue(change.before, staffNames)}
                      </p>

                      <p className="mt-1 break-words text-xs text-emerald-400">
                        Saved: {formatValue(change.after, staffNames)}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
      </div>
    </section>
  )
}
