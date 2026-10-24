import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  RefreshCw,
  Eye,
  X,
  ArrowUpDown,
  Send,
  FileText,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type ReleasingRecord = {
  id: string
  reference_number: string
  subject: string | null
  recipient: string | null
  destination_office: string | null
  releasing_staff: string | null
  release_date: string | null
  release_time: string | null
  status: string | null
  remarks: string | null
  created_at: string | null
  release_instruction: string | null
  workflow_status: string | null
  urgency: string | null
  release_received_at: string | null
  release_received_by: string | null
  release_received_by_name: string | null
  next_action_office_to_forward: string | null
  next_action_release_to: string | null
  next_action_release_at: string | null
  next_action_system_status: string | null
  next_action_date_forwarded: string | null
  next_action_recorded_by: string | null
  next_action_recorded_by_name: string | null
}

type SortField =
  | 'reference_number'
  | 'subject'
  | 'recipient'
  | 'destination_office'
  | 'releasing_staff'
  | 'release_date'
  | 'status'
  | 'release_instruction'
  | 'next_action_recorded_by_name'
  | 'next_action_office_to_forward'
  | 'next_action_release_to'
  | 'next_action_release_at'
  | 'next_action_system_status'
  | 'next_action_date_forwarded'
  | 'urgency'

const tableColumns: { label: string; field: SortField }[] = [
  { label: 'Reference No.', field: 'reference_number' },
  { label: 'Subject', field: 'subject' },
  { label: 'Urgency', field: 'urgency' },
  { label: 'Destination Office', field: 'destination_office' },
  { label: 'Releasing Staff', field: 'releasing_staff' },
  { label: 'Office to Forward', field: 'next_action_office_to_forward' },
  { label: 'Release To', field: 'next_action_release_to' },
  { label: 'Date Release', field: 'next_action_release_at' },
  { label: 'Time Release', field: 'next_action_release_at' },
  { label: 'Released By', field: 'next_action_recorded_by_name' },
  { label: 'Action Done in Unified System / Date Forwarded', field: 'next_action_system_status' },
]

export default function ReleasingRecords() {
  const [records, setRecords] = useState<ReleasingRecord[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReleasingRecord | null>(null)
  const [releasePanelRecord, setReleasePanelRecord] = useState<ReleasingRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [nextActionOffice, setNextActionOffice] = useState('')
  const [nextActionReleaseTo, setNextActionReleaseTo] = useState('')
  const [savingNextAction, setSavingNextAction] = useState(false)
  const [nextActionMode, setNextActionMode] = useState<'view' | 'edit'>('view')
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; edited_by_name: string; edited_at: string; change_type: string; previous_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null }>>([])
  const [viewerRole, setViewerRole] = useState<'admin' | 'staff' | null>(null)

  const [sortField, setSortField] =
    useState<SortField>('release_date')

  const [sortDirection, setSortDirection] =
    useState<'desc' | 'asc'>('desc')

  async function loadRecords() {
    setLoading(true)
    setError('')

    try {
      // Resolve the signed-in user's profile so each releasing staff member
      // sees only documents assigned to their own profile name.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Your session has expired. Please sign in again.')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) throw profileError
      if (!profile) {
        throw new Error('Your user profile could not be found.')
      }

      const isAdmin = profile.role === 'admin'
      const isReleasingStaff = profile.role === 'staff'

      setViewerRole(isAdmin ? 'admin' : isReleasingStaff ? 'staff' : null)

      if (!isAdmin && !isReleasingStaff) {
        throw new Error(
          'This page is available only to administrators and staff.',
        )
      }

      if (isReleasingStaff && !profile.full_name) {
        throw new Error('Your staff profile does not have a full name.')
      }

      // ForwardingRecords stores assignments in document_workflow.
      // Administrators can view every assignment; releasing staff can only
      // view documents assigned to their own profile name.
      let assignmentsQuery = supabase
        .from('document_workflow')
        .select(
          'id, receiving_record_id, release_assigned_to, release_instruction, release_forwarded_at, release_forwarded_by, workflow_status, urgency, release_received_at, release_received_by, release_received_by_name, next_action_office_to_forward, next_action_release_to, next_action_release_at, next_action_system_status, next_action_date_forwarded, next_action_recorded_by, next_action_recorded_by_name',
        )
        .not('release_instruction', 'is', null)
        .order('release_forwarded_at', { ascending: false })

      if (isReleasingStaff) {
        assignmentsQuery = assignmentsQuery.eq(
          'release_assigned_to',
          profile.full_name,
        )
      }

      const { data: assignments, error: assignmentError } =
        await assignmentsQuery

      if (assignmentError) throw assignmentError

      const workflowRows = assignments ?? []
      if (workflowRows.length === 0) {
        setRecords([])
        return
      }

      const receivingIds = [...new Set(
        workflowRows.map(row => row.receiving_record_id).filter(Boolean),
      )] as string[]

      if (receivingIds.length === 0) {
        setRecords([])
        return
      }

      const { data: documents, error: documentsError } = await supabase
        .from('receiving_records')
        .select(
          'id, reference_number, subject, content, sender, bearer, origin_office, date_received, created_at',
        )
        .in('id', receivingIds)

      if (documentsError) throw documentsError

      if (!documents || documents.length === 0) {
        throw new Error(
          'Assignments were found, but their document details could not be retrieved. Check the receiving_record_id values and the receiving_records access policies.',
        )
      }

      const missingDocumentIds = receivingIds.filter(
        id => !(documents ?? []).some(document => document.id === id),
      )

      if (missingDocumentIds.length > 0) {
        console.warn(
          'Some assigned documents could not be retrieved from receiving_records:',
          missingDocumentIds,
        )
      }

      const documentsById = new Map(
        (documents ?? []).map(document => [document.id, document]),
      )

      const mappedRecords: ReleasingRecord[] = workflowRows.map(workflow => {
        const document = documentsById.get(workflow.receiving_record_id)
        return {
          id: workflow.id,
          reference_number: document?.reference_number || '—',
          subject: document?.subject || document?.content || null,
          recipient: document?.bearer || document?.sender || null,
          destination_office: document?.origin_office || null,
          releasing_staff: workflow.release_assigned_to || profile.full_name,
          release_date: workflow.release_forwarded_at || null,
          release_time: workflow.release_forwarded_at || null,
          status: workflow.workflow_status || 'assigned',
          remarks: workflow.release_instruction || null,
          created_at: document?.created_at || document?.date_received || null,
          release_instruction: workflow.release_instruction || null,
          workflow_status: workflow.workflow_status || null,
          urgency: workflow.urgency || 'normal',
          release_received_at: workflow.release_received_at || null,
          release_received_by: workflow.release_received_by || null,
          release_received_by_name: workflow.release_received_by_name || null,
          next_action_office_to_forward: workflow.next_action_office_to_forward || null,
          next_action_release_to: workflow.next_action_release_to || null,
          next_action_release_at: workflow.next_action_release_at || null,
          next_action_system_status: workflow.next_action_system_status || null,
          next_action_date_forwarded: workflow.next_action_date_forwarded || null,
          next_action_recorded_by: workflow.next_action_recorded_by || null,
          next_action_recorded_by_name: workflow.next_action_recorded_by_name || null,
        }
      })

      setRecords(mappedRecords)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load releasing records.',
      )
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  async function confirmReceipt(record: ReleasingRecord) {
    setActionError('')
    setActionSuccess('')

    if (viewerRole !== 'admin' && viewerRole !== 'staff') {
      setActionError('Your account is not authorized to confirm physical receipt.')
      return
    }

    if (record.release_received_at) {
      setActionError('Receipt has already been confirmed for this document.')
      return
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      setActionError(authError.message)
      return
    }

    if (!user) {
      setActionError('Your session has expired. Please sign in again.')
      return
    }

    const { data: receiptProfile, error: receiptProfileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (receiptProfileError) {
      setActionError(receiptProfileError.message)
      return
    }

    const receiptAccountName = receiptProfile?.full_name?.trim()
    if (!receiptAccountName) {
      setActionError('Your account profile must have a full name before confirming receipt.')
      return
    }

    // Admins can confirm receipt for any assignment. Staff can confirm only
    // documents assigned to their own profile name.
    if (
      viewerRole === 'staff' &&
      record.releasing_staff?.trim().toLocaleLowerCase() !== receiptAccountName.toLocaleLowerCase()
    ) {
      setActionError('Only the assigned releasing staff member or an administrator can confirm receipt.')
      return
    }

    setConfirmingId(record.id)

    try {
      const now = new Date().toISOString()

      const { data: updatedRecord, error: updateError } = await supabase
        .from('document_workflow')
        .update({
          workflow_status: 'action_in_progress',
          release_received_at: now,
          release_received_by: user.id,
          release_received_by_name: receiptAccountName,
        })
        .eq('id', record.id)
        .eq('release_assigned_to', record.releasing_staff)
        .is('release_received_at', null)
        .select('id, release_received_at, release_received_by, release_received_by_name')
        .maybeSingle()

      if (updateError) throw updateError

      if (!updatedRecord) {
        throw new Error(
          'Receipt was not confirmed. The document may already be confirmed, may not be assigned to you, or your database permissions may not allow this action. Refresh and try again.',
        )
      }

      await loadRecords()

      setSelected(current =>
        current?.id === record.id
          ? {
              ...current,
              release_received_at: updatedRecord.release_received_at,
              release_received_by: updatedRecord.release_received_by,
              release_received_by_name: updatedRecord.release_received_by_name,
              workflow_status: 'action_in_progress',
              status: 'action_in_progress',
            }
          : current,
      )

      setActionSuccess(
        `Physical receipt confirmed for ${record.reference_number}. You can now complete the Next Action.`,
      )
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Unable to confirm physical receipt. Check the database columns and UPDATE policy.',
      )
    } finally {
      setConfirmingId(null)
    }
  }

  async function loadNextActionLogs(recordId: string) {
    const { data, error: logsError } = await supabase
      .from('document_workflow_next_action_logs')
      .select('id, edited_by_name, edited_at, change_type, previous_values, new_values')
      .eq('document_workflow_id', recordId)
      .order('edited_at', { ascending: false })

    if (logsError) {
      setActionError(`Unable to load edit history: ${logsError.message}`)
      setAuditLogs([])
      return
    }
    setAuditLogs(data ?? [])
  }

  async function saveNextAction(record: ReleasingRecord) {
    setActionError('')
    setActionSuccess('')

    if (!record.release_received_at) {
      setActionError('Confirm receipt before saving the Next Action.')
      return
    }

    const office = nextActionOffice.trim()
    const releaseTo = nextActionReleaseTo.trim()
    if (!office || !releaseTo) {
      setActionError('Please enter both Office to Forward and Release To.')
      return
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) { setActionError(authError.message); return }
    if (!user) { setActionError('Your session has expired. Please sign in again.'); return }

    setSavingNextAction(true)
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      if (profileError) throw profileError
      const editorName = profile?.full_name?.trim()
      if (!editorName) throw new Error('Your profile must have a full name before saving this action.')

      const now = new Date().toISOString()
      const previousValues = {
        office_to_forward: record.next_action_office_to_forward,
        release_to: record.next_action_release_to,
        release_at: record.next_action_release_at,
        system_status: record.next_action_system_status,
        date_forwarded: record.next_action_date_forwarded,
      }
      const newValues = {
        office_to_forward: office,
        release_to: releaseTo,
        release_at: record.next_action_release_at || now,
        system_status: 'Forwarded',
        date_forwarded: record.next_action_date_forwarded || now,
      }
      const isEdit = Boolean(record.next_action_release_at)

      const { error: updateError } = await supabase
        .from('document_workflow')
        .update({
          next_action_office_to_forward: office,
          next_action_release_to: releaseTo,
          next_action_release_at: record.next_action_release_at || now,
          next_action_system_status: 'Forwarded',
          next_action_date_forwarded: newValues.date_forwarded,
          next_action_recorded_by: user.id,
          next_action_recorded_by_name: editorName,
          workflow_status: 'action_completed',
          updated_at: now,
        })
        .eq('id', record.id)
      if (updateError) throw updateError

      // Store a separate immutable history entry for the initial save and every edit.
      const { error: logError } = await supabase
        .from('document_workflow_next_action_logs')
        .insert({
          document_workflow_id: record.id,
          edited_by: user.id,
          edited_by_name: editorName,
          edited_at: now,
          change_type: isEdit ? 'EDIT' : 'CREATE',
          previous_values: previousValues,
          new_values: newValues,
        })
      if (logError) {
        throw new Error(`The action was saved, but its audit log could not be saved: ${logError.message}. Please check the audit-log table policies.`)
      }

      await loadRecords()
      const updatedRecord = { ...record,
        next_action_office_to_forward: office,
        next_action_release_to: releaseTo,
        next_action_release_at: newValues.release_at,
        next_action_system_status: 'Forwarded',
        next_action_date_forwarded: newValues.date_forwarded,
        next_action_recorded_by: user.id,
        next_action_recorded_by_name: editorName,
        workflow_status: 'action_completed',
        status: 'action_completed',
      }
      setSelected(updatedRecord)
      setNextActionMode('view')
      await loadNextActionLogs(record.id)

      // This workflow always records the action as Forwarded when saved.
      // Close the panel and refresh the table so the completed state is visible.
      setReleasePanelRecord(null)
      setActionSuccess(`Document ${record.reference_number} was marked Forwarded successfully.`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to save Next Action.')
    } finally {
      setSavingNextAction(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(current =>
        current === 'asc' ? 'desc' : 'asc'
      )
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function getSortValue(
    record: ReleasingRecord,
    field: SortField
  ): string {
    return record[field] || ''
  }

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()

    const filtered = records.filter(record => {
      if (!term) return true

      return [
        record.reference_number,
        record.subject,
        record.recipient,
        record.destination_office,
        record.releasing_staff,
        record.release_date,
        record.release_time,
        record.status,
        record.remarks,
        record.release_instruction,
        record.next_action_recorded_by_name,
        record.urgency,
      ].some(value =>
        (value ?? '').toLowerCase().includes(term)
      )
    })

    return [...filtered].sort((a, b) => {
      const first = getSortValue(a, sortField)
      const second = getSortValue(b, sortField)

      const comparison = first.localeCompare(
        second,
        undefined,
        { numeric: true, sensitivity: 'base' }
      )

      return sortDirection === 'asc'
        ? comparison
        : -comparison
    })
  }, [records, search, sortField, sortDirection])

  function formatDate(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })
  }

  function formatDateTime(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
  }

  function formatReleaseTime(value: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleTimeString('en-PH', {
          timeZone: 'Asia/Manila',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
  }

  function displayStatus(status: string | null) {
    return (status || 'unknown').replaceAll('_', ' ')
  }

  function normalizeUrgency(value: string | null): 'urgent' | 'not urgent' {
    const normalized = (value || '').trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
    return ['urgent', 'high', 'critical', 'very urgent'].includes(normalized)
      ? 'urgent'
      : 'not urgent'
  }

  function urgencyBadge(value: string | null) {
    const urgency = normalizeUrgency(value)
    return urgency === 'urgent'
      ? { label: 'Urgent', className: 'border-red-200 bg-red-50 text-red-700' }
      : { label: 'Not Urgent', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Page heading */}
      <header>
        <p className="text-xs font-medium text-slate-500">
          Workspace / Document Management
        </p>

        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Releasing Records
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {viewerRole === 'admin'
            ? 'View all documents forwarded by Origin Staff, including urgency and receipt confirmations.'
            : 'View your assigned documents, confirm physical receipt, and check urgency.'}
        </p>
      </header>

      {/* Main table panel */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Table title and controls */}
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <Send size={20} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {viewerRole === 'admin' ? 'All Releasing Assignments' : 'Documents Assigned to You'}
              </h3>

              <p className="mt-0.5 text-xs text-slate-500">
                {loading
                  ? 'Loading records...'
                  : `${filteredRecords.length} of ${records.length} records`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Compact search */}
            <div className="relative w-full sm:w-64">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search records..."
                aria-label="Search releasing records"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadRecords()}
              disabled={loading}
              aria-label="Refresh releasing records"
              title="Refresh records"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={loading ? 'animate-spin' : ''}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {actionError && (
          <div role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div role="status" className="mx-4 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            {actionSuccess}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="m-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>Failed to load releasing records: {error}</span>

            <button
              type="button"
              onClick={() => void loadRecords()}
              className="shrink-0 font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Data table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1650px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {tableColumns.map(column => (
                  <th
                    key={column.field}
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.field)}
                      className="inline-flex items-center gap-1.5 transition hover:text-red-700"
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}

                      {sortField === column.field ? (
                        <span className="font-bold text-red-700">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      ) : (
                        <ArrowUpDown
                          size={11}
                          className="text-slate-400"
                        />
                      )}
                    </button>
                  </th>
                ))}

                <th className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Receipt / Details
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    <RefreshCw
                      size={18}
                      className="mx-auto mb-3 animate-spin text-red-600"
                    />
                    Loading outgoing documents...
                  </td>
                </tr>
              ) : error && records.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    Records could not be loaded. Check the error above.
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-14 text-center"
                  >
                    <FileText
                      size={26}
                      className="mx-auto mb-2 text-slate-300"
                    />

                    <p className="text-sm font-medium text-slate-700">
                      {search
                        ? 'No matching records'
                        : 'No outgoing documents yet'}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {search
                        ? 'Try another search term.'
                        : 'Outgoing documents will appear here when recorded.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr
                    key={record.id}
                    className="transition-colors hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-800">
                      {record.reference_number || '—'}
                    </td>

                    <td className="max-w-[220px] px-4 py-3.5 text-xs text-slate-700">
                      <span
                        className="block truncate"
                        title={record.subject || ''}
                      >
                        {record.subject || '—'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs">
                      {(() => {
                        const badge = urgencyBadge(record.urgency)
                        return (
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        )
                      })()}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.destination_office || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">{record.releasing_staff || '—'}</td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">{record.next_action_office_to_forward || '—'}</td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">{record.next_action_release_to || '—'}</td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">{record.next_action_release_at ? formatDate(record.next_action_release_at) : '—'}</td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">{record.next_action_release_at ? formatReleaseTime(record.next_action_release_at) : '—'}</td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">{record.next_action_recorded_by_name || '—'}</td>

                    <td className="min-w-[210px] px-4 py-3.5 text-xs text-slate-600">
                      <span className="font-semibold">{(record.next_action_system_status || '').trim().toLowerCase() === 'forwarded' || record.next_action_date_forwarded ? 'Forwarded' : (record.next_action_system_status || 'Not recorded')}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">Date Forwarded: {record.next_action_date_forwarded ? formatDateTime(record.next_action_date_forwarded) : '—'}</span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-2">
                      {record.release_received_at ? (
                        <span className="text-[10px] text-emerald-700">
                          Received: {formatDateTime(record.release_received_at)}
                        </span>
                      ) : (viewerRole === 'admin' || (viewerRole === 'staff' && record.releasing_staff)) ? (
                        <button
                          type="button"
                          onClick={() => void confirmReceipt(record)}
                          disabled={confirmingId === record.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} />
                          {confirmingId === record.id ? 'Confirming…' : 'Confirm Receipt'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-amber-700">Awaiting receipt</span>
                      )}
                      {record.release_received_at && (record.next_action_system_status || '').trim().toLowerCase() !== 'forwarded' && !record.next_action_date_forwarded && (
                        <button
                          type="button"
                          onClick={() => {
                            setReleasePanelRecord(record)
                            setNextActionMode(record.next_action_release_at ? 'view' : 'edit')
                            setActionError('')
                            setActionSuccess('')
                            void loadNextActionLogs(record.id)
                            setNextActionOffice(record.next_action_office_to_forward || '')
                            setNextActionReleaseTo(record.next_action_release_to || '')
                            
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-800"
                        >
                          <Send size={13} /> {record.next_action_release_at ? 'Continue Release' : 'Complete Release'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelected(record)}
                        aria-label={`View ${record.reference_number}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        <Eye size={13} /> View
                      </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">
            Showing {filteredRecords.length} record(s)
          </p>

          <p className="text-[11px] text-slate-400">
            Select a column heading to sort the records.
          </p>
        </div>
      </section>

      {/* Details modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={() => setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="releasing-detail-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Outgoing Document
                </p>

                <h3
                  id="releasing-detail-title"
                  className="mt-1 text-xl font-bold text-slate-900"
                >
                  {selected.reference_number}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Complete record information
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['Reference Number', selected.reference_number],
                  ['Subject', selected.subject],
                  ['Urgency', urgencyBadge(selected.urgency).label],
                  ['Destination Office', selected.destination_office],
                  ['Releasing Staff', selected.releasing_staff],
                  ['Release Date', formatDate(selected.release_date)],
                  ['Release Time', selected.release_time],
                  ['Status', displayStatus(selected.status)],
                  ['Remarks', selected.remarks],
                  ['Released By', selected.next_action_recorded_by_name || 'Not released yet'],
                  ['Release Recorded At', formatDateTime(selected.next_action_release_at)],
                  ['Created At', formatDateTime(selected.created_at)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3.5"
                  >
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {label}
                    </dt>

                    <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800">
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              <section className="mt-6 rounded-xl border border-red-100 bg-red-50/40 p-4">
                <h4 className="text-sm font-bold text-slate-900">
                  Physical Receipt Confirmation
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  Confirm that you have physically received this document from the originating office before proceeding with the next action.
                </p>

                {selected.release_received_at ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <CheckCircle2 size={16} />
                      Receipt Confirmed
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Confirmed on: {formatDateTime(selected.release_received_at)}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Confirmed by: {selected.release_received_by_name || 'Account name unavailable'}
                    </p>
                  </div>
                ) : (viewerRole === 'admin' || (viewerRole === 'staff' && selected.releasing_staff)) ? (
                  <button
                    type="button"
                    onClick={() => void confirmReceipt(selected)}
                    disabled={confirmingId === selected.id}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    {confirmingId === selected.id ? 'Confirming Receipt...' : 'Confirm Receipt'}
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-amber-700">
                    Receipt is awaiting confirmation by the assigned releasing staff member.
                  </p>
                )}

              </section>
            </div>

            <div className="flex justify-end border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Separate Release Panel: intentionally independent from View details. */}
      {releasePanelRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]" onClick={() => setReleasePanelRecord(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="release-panel-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-medium text-red-700">Document Workflow</p>
                <h3 id="release-panel-title" className="mt-1 text-xl font-bold text-slate-900">Release Panel · {releasePanelRecord.reference_number}</h3>
                <p className="mt-1 text-xs text-slate-500">Record the next destination and release status. Physical receipt must be confirmed first.</p>
              </div>
              <button type="button" onClick={() => setReleasePanelRecord(null)} aria-label="Close release panel" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subject</p><p className="mt-1 text-sm text-slate-800">{releasePanelRecord.subject || '—'}</p></div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Physical Receipt</p><p className="mt-1 text-sm font-semibold">{releasePanelRecord.release_received_at ? `Confirmed · ${formatDateTime(releasePanelRecord.release_received_at)}` : 'Awaiting confirmation'}</p></div>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/40 p-4">
                <h4 className="text-sm font-bold text-slate-900">Release Details</h4>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">Office to Forward *<input value={nextActionOffice} onChange={event => setNextActionOffice(event.target.value)} disabled={!releasePanelRecord.release_received_at || (nextActionMode === 'view' && Boolean(releasePanelRecord.next_action_release_at))} placeholder="Enter destination office" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" /></label>
                  <label className="text-xs font-semibold text-slate-600">Release To *<input value={nextActionReleaseTo} onChange={event => setNextActionReleaseTo(event.target.value)} disabled={!releasePanelRecord.release_received_at || (nextActionMode === 'view' && Boolean(releasePanelRecord.next_action_release_at))} placeholder="Enter receiving person" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" /></label>
                  <div className="text-xs font-semibold text-slate-600">Date Release<p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700">{releasePanelRecord.next_action_release_at ? formatDate(releasePanelRecord.next_action_release_at) : 'Recorded automatically when saved'}</p></div>
                  <div className="text-xs font-semibold text-slate-600">Time Release<p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700">{releasePanelRecord.next_action_release_at ? formatReleaseTime(releasePanelRecord.next_action_release_at) : 'Recorded automatically when saved'}</p></div>
                  <div className="text-xs font-semibold text-slate-600">Action Done in Unified System
                    <p className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">Forwarded</p>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">Date Forwarded
                    <p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700">{releasePanelRecord.next_action_date_forwarded ? formatDateTime(releasePanelRecord.next_action_date_forwarded) : 'Recorded automatically when saved'}</p>
                  </div>
                </div>
                {releasePanelRecord.next_action_recorded_by && <p className="mt-3 text-xs text-slate-500">Released by: {releasePanelRecord.next_action_recorded_by_name || 'Name unavailable'}</p>}
                {!releasePanelRecord.release_received_at && <p className="mt-3 text-xs text-amber-700">Confirm physical receipt before releasing this document.</p>}
                {actionError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{actionError}</p>}
                {actionSuccess && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{actionSuccess}</p>}
                {auditLogs.length > 0 && <div className="mt-5 border-t border-slate-200 pt-4"><h5 className="text-xs font-bold uppercase tracking-wide text-slate-700">Edit History / Audit Log</h5><div className="mt-3 space-y-2">{auditLogs.map(log => <div key={log.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-800">{log.edited_by_name} · {log.change_type === 'CREATE' ? 'Created Next Action' : 'Edited Next Action'}</span><span className="text-slate-500">{formatDateTime(log.edited_at)}</span></div>{log.previous_values && log.change_type === 'EDIT' && <p className="mt-2 text-slate-600">Previous: {String(log.previous_values.office_to_forward || '—')} → {String(log.previous_values.release_to || '—')} ({String(log.previous_values.system_status || '—')})</p>}{log.new_values && <p className="mt-1 text-slate-600">Saved: {String(log.new_values.office_to_forward || '—')} → {String(log.new_values.release_to || '—')} ({String(log.new_values.system_status || '—')})</p>}</div>)}</div></div>}
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-red-100 pt-4">
                  {releasePanelRecord.next_action_release_at && nextActionMode === 'view' ? <button type="button" onClick={() => setNextActionMode('edit')} disabled={!releasePanelRecord.release_received_at} className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">Edit Release</button> : <button type="button" onClick={() => void saveNextAction(releasePanelRecord)} disabled={savingNextAction || !releasePanelRecord.release_received_at} className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{savingNextAction ? 'Processing…' : releasePanelRecord.next_action_release_at ? 'Save Release Changes' : 'Release Document'}</button>}
                  <button type="button" onClick={() => setReleasePanelRecord(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close Panel</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
