import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Search,
  RefreshCw,
  Send,
  Plus,
  X,
  FileText,
  FileSearch,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Check,
  LoaderCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import AuditHistory from './AuditHistory'

type ReceivingRecord = {
  id: string
  reference_number: string
  record_type?: string | null
  subject?: string | null
  content?: string | null
  sender?: string | null
  bearer?: string | null
  origin_office?: string | null
  current_office?: string | null
  destination_folder?: string | null
  date_received?: string | null
  status?: string | null
}

type WorkflowRecord = {
  id: string
  receiving_record_id: string
  transaction_person: string
  storage_type: 'folder' | 'box'
  folder_color: string | null
  box_number: string | null
  urgency: 'urgent' | 'not_urgent'
  forwarding_date: string
  forwarding_time: string
  forwarded_by: string
  forwarded_at: string
  workflow_status: string
  returned_to_origin_person?: string | null
  returned_to_origin_remarks?: string | null
  returned_to_origin_at?: string | null
  returned_to_origin_by?: string | null
  release_assigned_to?: string | null
  release_instruction?: string | null
  release_forwarded_at?: string | null
  release_forwarded_by?: string | null
}

type WorkflowWithDocument = {
  workflow: WorkflowRecord
  document: ReceivingRecord | undefined
  recordedByName: string
}

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

const statusOptions = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Forwarded', value: 'forwarded' },
  { label: 'Board Room Received', value: 'board_room_received' },
  { label: 'Action in Progress', value: 'action_in_progress' },
  { label: 'Action Completed', value: 'action_completed' },
  { label: 'Returned to Origin', value: 'returned_to_origin' },
  { label: 'Completed', value: 'completed' },
]

const folderColors = [
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'White',
  'Black',
  'Orange',
  'Pink',
  'Other',
]

function displayStatus(status: string) {
  return status.replaceAll('_', ' ')
}

function formatDate(value?: string | null) {
  if (!value) return '—'

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      })
}

function formatTime(value?: string | null) {
  if (!value) return '—'

  const [hourString, minuteString] = value.split(':')
  const hour = Number(hourString)
  const minute = Number(minuteString)

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value
  }

  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  return date.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function statusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'border-green-200 bg-green-50 text-green-700'
    case 'board_room_received':
    case 'action_completed':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'action_in_progress':
    case 'returned_to_origin':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700'
  }
}

function matchesDocument(document: ReceivingRecord, search: string) {
  const term = search.trim().toLowerCase()
  if (!term) return true

  return [
    document.reference_number,
    document.subject,
    document.content,
    document.sender,
    document.bearer,
    document.origin_office,
    document.current_office,
    document.destination_folder,
    document.record_type,
  ].some(value => String(value ?? '').toLowerCase().includes(term))
}

function getStorageLabel(workflow: WorkflowRecord) {
  return workflow.storage_type === 'folder'
    ? `Folder: ${workflow.folder_color || 'Not specified'}`
    : `Box: ${workflow.box_number || 'Not specified'}`
}

function UrgencyBadge({ urgency }: { urgency: WorkflowRecord['urgency'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
        urgency === 'urgent'
          ? 'bg-red-50 text-red-700'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {urgency === 'urgent' && <AlertTriangle size={12} />}
      {urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}
    </span>
  )
}

function StorageBadge({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
      {getStorageLabel(workflow)}
    </span>
  )
}

export default function ForwardingRecords() {
  const [documents, setDocuments] = useState<ReceivingRecord[]>([])
  const [workflows, setWorkflows] = useState<WorkflowWithDocument[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showForm, setShowForm] = useState(false)

  const [documentPickerOpen, setDocumentPickerOpen] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])

  const [transactionPerson, setTransactionPerson] = useState('')
  const [storageType, setStorageType] = useState<'folder' | 'box'>('folder')
  const [folderColor, setFolderColor] = useState('')
  const [boxNumber, setBoxNumber] = useState('')
  const [urgency, setUrgency] = useState<'urgent' | 'not_urgent'>('not_urgent')
  const [forwardingTime, setForwardingTime] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmingReceiptId, setConfirmingReceiptId] = useState<string | null>(
    null,
  )

  const [receiptConfirmation, setReceiptConfirmation] =
    useState<WorkflowRecord | null>(null)
  const [viewingWorkflow, setViewingWorkflow] =
    useState<WorkflowWithDocument | null>(null)
  const [releaseAssignment, setReleaseAssignment] =
    useState<WorkflowRecord | null>(null)
  const [releaseStaff, setReleaseStaff] = useState('')
  const [releaseStaffSearch, setReleaseStaffSearch] = useState('')
  const [releaseStaffDropdownOpen, setReleaseStaffDropdownOpen] = useState(false)
  const [releasingStaffOptions, setReleasingStaffOptions] = useState<string[]>([])
  const [loadingReleasingStaff, setLoadingReleasingStaff] = useState(false)
  const [releaseInstruction, setReleaseInstruction] = useState('For Release')
  const [releaseCustomInstruction, setReleaseCustomInstruction] = useState('')
  const [savingReleaseAssignment, setSavingReleaseAssignment] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [documentsResult, workflowsResult] = await Promise.all([
        supabase
          .from('receiving_records')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('document_workflow')
          .select('*')
          .order('forwarded_at', { ascending: false }),
      ])

      if (documentsResult.error) throw documentsResult.error
      if (workflowsResult.error) throw workflowsResult.error

      const receivedDocuments =
        (documentsResult.data ?? []) as ReceivingRecord[]

      const workflowRecords =
        (workflowsResult.data ?? []) as WorkflowRecord[]

      const documentById = new Map(
        receivedDocuments.map(document => [document.id, document]),
      )

      const userIds = [
        ...new Set(
          workflowRecords
            .map(item => item.forwarded_by)
            .filter(Boolean),
        ),
      ]

      const profileMap: Record<string, string> = {}

      if (userIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)

        if (profileError) {
          console.warn('Could not load staff names:', profileError)
        } else {
          for (const profile of profileRows ?? []) {
            profileMap[profile.id] = profile.full_name || 'Staff account'
          }
        }
      }

      // Load every user with the staff role dynamically, so newly added staff appear without code changes.
      setLoadingReleasingStaff(true)
      const { data: releasingStaffRows, error: releasingStaffError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('role', 'staff')
        .order('full_name', { ascending: true })

      if (releasingStaffError) {
        console.warn('Could not load releasing staff:', releasingStaffError)
      } else {
        const names = (releasingStaffRows ?? [])
          .map(row => String(row.full_name ?? '').trim())
          .filter(Boolean)
        setReleasingStaffOptions([...new Set(names)])
      }
      setLoadingReleasingStaff(false)

      setDocuments(receivedDocuments)
      setProfiles(profileMap)

      setWorkflows(
        workflowRecords.map(workflow => ({
          workflow,
          document: documentById.get(workflow.receiving_record_id),
          recordedByName:
            profileMap[workflow.forwarded_by] || workflow.forwarded_by,
        })),
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load forwarding records.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const linkedDocumentIds = useMemo(
    () => new Set(workflows.map(item => item.workflow.receiving_record_id)),
    [workflows],
  )

  const availableDocuments = useMemo(
    () => documents.filter(document => !linkedDocumentIds.has(document.id)),
    [documents, linkedDocumentIds],
  )

  const filteredPickerDocuments = useMemo(
    () =>
      availableDocuments.filter(document =>
        matchesDocument(document, documentSearch),
      ),
    [availableDocuments, documentSearch],
  )

  const filteredWorkflows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return workflows.filter(item => {
      const { workflow, document } = item

      if (
        statusFilter !== 'ALL' &&
        workflow.workflow_status !== statusFilter
      ) {
        return false
      }

      if (!term) return true

      return [
        document?.reference_number,
        document?.subject,
        document?.content,
        document?.sender,
        document?.bearer,
        document?.origin_office,
        item.recordedByName,
        workflow.transaction_person,
        workflow.folder_color,
        workflow.box_number,
        workflow.urgency,
        workflow.workflow_status,
        workflow.returned_to_origin_person,
        workflow.returned_to_origin_remarks,
        workflow.release_assigned_to,
        workflow.release_instruction,
      ].some(value => String(value ?? '').toLowerCase().includes(term))
    })
  }, [workflows, statusFilter, search])

  const selectedDocuments = useMemo(
    () =>
      documents.filter(document =>
        selectedDocumentIds.includes(document.id),
      ),
    [documents, selectedDocumentIds],
  )

  const allFilteredSelected =
    filteredPickerDocuments.length > 0 &&
    filteredPickerDocuments.every(document =>
      selectedDocumentIds.includes(document.id),
    )

  function toggleDocumentSelection(id: string) {
    setSelectedDocumentIds(current =>
      current.includes(id)
        ? current.filter(selectedId => selectedId !== id)
        : [...current, id],
    )
  }

  function toggleAllFilteredDocuments() {
    const filteredIds = filteredPickerDocuments.map(document => document.id)

    setSelectedDocumentIds(current =>
      allFilteredSelected
        ? current.filter(id => !filteredIds.includes(id))
        : [...new Set([...current, ...filteredIds])],
    )
  }

  function resetForm() {
    setDocumentPickerOpen(false)
    setDocumentSearch('')
    setSelectedDocumentIds([])
    setTransactionPerson('')
    setStorageType('folder')
    setFolderColor('')
    setBoxNumber('')
    setUrgency('not_urgent')
    setForwardingTime('')
  }

  async function handleForward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (selectedDocumentIds.length === 0) {
      setError('Select at least one document to forward.')
      return
    }

    if (!transactionPerson.trim()) {
      setError('Enter the name of the person who brought the documents.')
      return
    }

    if (storageType === 'folder' && !folderColor.trim()) {
      setError('Select a folder color.')
      return
    }

    if (storageType === 'box' && !boxNumber.trim()) {
      setError('Enter the box number.')
      return
    }

    if (!forwardingTime) {
      setError('Enter the actual forwarding time.')
      return
    }

    const idsStillAvailable = selectedDocumentIds.filter(id =>
      availableDocuments.some(document => document.id === id),
    )

    if (idsStillAvailable.length !== selectedDocumentIds.length) {
      setError(
        'One or more selected documents have already been forwarded. Refresh and review your selection.',
      )
      return
    }

    setSaving(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!user) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      const payload = selectedDocumentIds.map(receivingRecordId => ({
        receiving_record_id: receivingRecordId,
        transaction_person: transactionPerson.trim(),
        storage_type: storageType,
        folder_color:
          storageType === 'folder' ? folderColor.trim() : null,
        box_number: storageType === 'box' ? boxNumber.trim() : null,
        urgency,
        forwarding_time: forwardingTime,
        forwarded_by: user.id,
        workflow_status: 'forwarded',
      }))

      const { data, error: insertError } = await supabase
        .from('document_workflow')
        .insert(payload)
        .select('id, receiving_record_id')

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error(
            'One or more documents have already been forwarded. Refresh and try again.',
          )
        }

        throw insertError
      }

      setSuccess(
        `${data?.length ?? 0} of ${selectedDocumentIds.length} document(s) forwarded successfully.`,
      )

      setShowForm(false)
      resetForm()
      await loadData()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to forward the selected documents.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmReceipt(workflow: WorkflowRecord) {
    if (workflow.workflow_status !== 'returned_to_origin') return

    const document = documents.find(
      item => item.id === workflow.receiving_record_id,
    )

    const reference = document?.reference_number || 'this document'

    setConfirmingReceiptId(workflow.id)
    setError('')
    setSuccess('')

    try {
      const { data: userResult, error: authError } =
        await supabase.auth.getUser()

      if (authError) throw authError

      if (!userResult.user) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      const { error: receiptError } = await supabase.rpc(
        'origin_office_confirm_receipt',
        {
          p_workflow_id: workflow.id,
        },
      )

      if (receiptError) throw receiptError

      setReceiptConfirmation(null)

      setSuccess(
        `Physical receipt confirmed for ${reference}. Workflow completed.`,
      )

      await loadData()
    } catch (err: unknown) {
      // Supabase/PostgREST errors are often plain objects, not Error instances.
      // Extract their message so the actual database/RPC failure is visible.
      const details =
        typeof err === 'object' && err !== null
          ? (err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown })
          : null

      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof details?.message === 'string'
            ? [
                details.message,
                typeof details.details === 'string' ? details.details : '',
                typeof details.hint === 'string' ? `Hint: ${details.hint}` : '',
                typeof details.code === 'string' ? `Code: ${details.code}` : '',
              ].filter(Boolean).join(' — ')
            : typeof err === 'string'
              ? err
              : 'Unknown error. Check the browser console and Supabase logs.'

      console.error('Unable to confirm document receipt:', err)
      setError(`Unable to confirm document receipt: ${errorMessage}`)
    } finally {
      setConfirmingReceiptId(null)
    }
  }

  async function handleForwardToReleasingStaff(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (!releaseAssignment) return

    setError('')
    setSuccess('')

    const instruction = (
      releaseInstruction === 'Custom'
        ? releaseCustomInstruction
        : releaseInstruction
    ).trim()

    if (!instruction) {
      setError('Please enter an instruction.')
      return
    }

    if (!releasingStaffOptions.includes(releaseStaff)) {
      setError('Please select a releasing staff member from the search results.')
      return
    }

    if (releaseAssignment.workflow_status !== 'completed') {
      setError('The originating office must confirm physical receipt first.')
      return
    }

    if (releaseAssignment.release_assigned_to) {
      setError('This document has already been assigned to releasing staff.')
      return
    }

    setSavingReleaseAssignment(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      const { data, error: updateError } = await supabase
        .from('document_workflow')
        .update({
          release_assigned_to: releaseStaff,
          release_instruction: instruction,
          release_forwarded_at: new Date().toISOString(),
          release_forwarded_by: user.id,
        })
        .eq('id', releaseAssignment.id)
        .eq('workflow_status', 'completed')
        .is('release_assigned_to', null)
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError
      if (!data) {
        throw new Error(
          'The document was already assigned or its status changed. Refresh and try again.',
        )
      }

      const document = documents.find(
        item => item.id === releaseAssignment.receiving_record_id,
      )

      setSuccess(
        `${document?.reference_number || 'Document'} forwarded to ${releaseStaff} — ${instruction}.`,
      )
      setReleaseAssignment(null)
      setReleaseStaff('')
      setReleaseStaffSearch('')
      setReleaseInstruction('For Release')
      setReleaseCustomInstruction('')
      await loadData()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to forward the document to releasing staff.',
      )
    } finally {
      setSavingReleaseAssignment(false)
    }
  }

  const completedCount = workflows.filter(
    item => item.workflow.workflow_status === 'completed',
  ).length

  const returnedCount = workflows.filter(
    item => item.workflow.workflow_status === 'returned_to_origin',
  ).length

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Workspace / Document Management
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Forwarding to Board Room
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Forward documents to the Board Room, confirm returned documents, and assign received documents to releasing staff.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError('')
            setSuccess('')
            setShowForm(true)
          }}
          disabled={availableDocuments.length === 0 || loading}
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <Plus size={17} />
          Forward Documents
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
              <FileText size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Forwarded Documents</p>
              <p className="text-2xl font-bold text-slate-900">
                {workflows.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700">
              <Clock size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Eligible to Forward</p>
              <p className="text-2xl font-bold text-slate-900">
                {availableDocuments.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700">
              <RefreshCw size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Awaiting Origin Receipt</p>
              <p className="text-2xl font-bold text-slate-900">
                {returnedCount}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-2.5 text-green-700">
              <ListChecks size={21} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Completed Workflows</p>
              <p className="text-2xl font-bold text-slate-900">
                {completedCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Forwarding Records
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {loading
                  ? 'Loading records...'
                  : `${filteredWorkflows.length} matching records · ${availableDocuments.length} eligible to forward`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label
                htmlFor="forwarding-search"
                className="text-xs font-semibold text-slate-600"
              >
                Search Records
              </label>
              <div className="relative mt-1.5">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="forwarding-search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Reference, subject, sender, office, remarks..."
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="forwarding-status"
                className="text-xs font-semibold text-slate-600"
              >
                Forwarding Status
              </label>
              <select
                id="forwarding-status"
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
                className={inputClass}
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('ALL')
                }}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {[
                  'PresOffice No.',
                  'Content / Subject',
                  'Origin Office',
                  'Transaction Person',
                  'Storage',
                  'Urgency',
                  'Forwarding Date',
                  'Forwarding Time',
                  'Recorded By',
                  'Workflow Status',
                  'Return Remarks',
                  'Releasing Staff',
                  'Release Instruction',
                  'Action',
                ].map(label => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={14}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    Loading forwarding records...
                  </td>
                </tr>
              ) : filteredWorkflows.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    {workflows.length === 0
                      ? 'No documents have been forwarded yet.'
                      : 'No matching forwarding records found.'}
                  </td>
                </tr>
              ) : (
                filteredWorkflows.map(
                  ({ workflow, document, recordedByName }) => (
                    <tr
                      key={workflow.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-800">
                        {document?.reference_number || '—'}
                      </td>

                      <td
                        className="max-w-[240px] px-4 py-3.5 text-xs text-slate-700"
                        title={document?.content || document?.subject || ''}
                      >
                        <span className="block truncate">
                          {document?.content || document?.subject || '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {document?.origin_office ||
                          document?.current_office ||
                          document?.destination_folder ||
                          '—'}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {workflow.transaction_person}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                        {getStorageLabel(workflow)}
                      </td>

                      <td className="px-4 py-3.5">
                        <UrgencyBadge urgency={workflow.urgency} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                        {formatDate(workflow.forwarding_date)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={13} />
                          {formatTime(workflow.forwarding_time)}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {profiles[workflow.forwarded_by] || recordedByName}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${statusClass(workflow.workflow_status)}`}
                        >
                          {workflow.workflow_status === 'completed' && (
                            <CheckCircle2 size={12} className="mr-1" />
                          )}
                          {displayStatus(workflow.workflow_status)}
                        </span>
                      </td>

                      {/* Return remarks, pickup person, urgency and storage. */}
                      <td className="max-w-[280px] px-4 py-3.5">
                        {workflow.workflow_status === 'returned_to_origin' ||
                        workflow.workflow_status === 'completed' ? (
                          <div className="min-w-[200px] space-y-2">
                            <p className="whitespace-pre-wrap break-words text-xs font-medium text-slate-700">
                              {workflow.returned_to_origin_remarks?.trim() ||
                                'No remarks provided.'}
                            </p>

                            {workflow.returned_to_origin_person && (
                              <p className="text-[10px] text-slate-500">
                                Picked up by:{' '}
                                {workflow.returned_to_origin_person}
                              </p>
                            )}

                            {workflow.returned_to_origin_at && (
                              <p className="text-[10px] text-slate-400">
                                Returned on:{' '}
                                {formatDate(
                                  workflow.returned_to_origin_at.slice(0, 10),
                                )}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <UrgencyBadge urgency={workflow.urgency} />
                              <StorageBadge workflow={workflow} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-700">
                        {workflow.release_assigned_to ? (
                          <div className="space-y-1">
                            <p className="font-semibold">{workflow.release_assigned_to}</p>
                            {workflow.release_forwarded_at && (
                              <p className="text-[10px] text-slate-400">
                                {new Date(workflow.release_forwarded_at).toLocaleString('en-PH')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Not assigned</span>
                        )}
                      </td>

                      <td className="max-w-[220px] px-4 py-3.5 text-xs text-slate-700">
                        {workflow.release_instruction || '—'}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex min-w-[180px] flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setViewingWorkflow({ workflow, document, recordedByName })
                            }
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Eye size={14} />
                            View
                          </button>
                          {workflow.workflow_status === 'returned_to_origin' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError('')
                              setSuccess('')
                              setReceiptConfirmation(workflow)
                            }}
                            disabled={confirmingReceiptId === workflow.id}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} />
                            Confirm Receipt
                          </button>
                        ) : workflow.workflow_status === 'completed' && !workflow.release_assigned_to ? (
                          <button
                            type="button"
                            onClick={() => {
                              setError('')
                              setSuccess('')
                              setReleaseStaff('')
      setReleaseStaffSearch('')
                              setReleaseInstruction('For Release')
                              setReleaseCustomInstruction('')
                              setReleaseAssignment(workflow)
                            }}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-800"
                          >
                            <Send size={14} />
                            Forward to Releasing Staff
                          </button>
                        ) : workflow.workflow_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-green-700">
                            <CheckCircle2 size={14} />
                            Assigned
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* View a forwarding document and its audit history. */}
      {viewingWorkflow && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="forwarding-details-title"
            className="my-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h3 id="forwarding-details-title" className="text-lg font-bold text-slate-900">
                  Document Details
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {viewingWorkflow.document?.reference_number || 'Document'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingWorkflow(null)}
                aria-label="Close document details"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ['Reference Number', viewingWorkflow.document?.reference_number],
                  ['Subject', viewingWorkflow.document?.subject || viewingWorkflow.document?.content],
                  ['Record Type', viewingWorkflow.document?.record_type],
                  ['Sender', viewingWorkflow.document?.sender],
                  ['Bearer', viewingWorkflow.document?.bearer],
                  ['Origin Office', viewingWorkflow.document?.origin_office],
                  ['Current Office', viewingWorkflow.document?.current_office],
                  ['Destination Folder', viewingWorkflow.document?.destination_folder],
                  ['Date Received', viewingWorkflow.document?.date_received ? formatDate(viewingWorkflow.document.date_received) : null],
                  ['Transaction Person', viewingWorkflow.workflow.transaction_person],
                  ['Storage', getStorageLabel(viewingWorkflow.workflow)],
                  ['Urgency', displayStatus(viewingWorkflow.workflow.urgency)],
                  ['Forwarding Date', formatDate(viewingWorkflow.workflow.forwarding_date)],
                  ['Forwarding Time', formatTime(viewingWorkflow.workflow.forwarding_time)],
                  ['Recorded By', profiles[viewingWorkflow.workflow.forwarded_by] || viewingWorkflow.recordedByName],
                  ['Workflow Status', displayStatus(viewingWorkflow.workflow.workflow_status)],
                  ['Returned To Origin Person', viewingWorkflow.workflow.returned_to_origin_person],
                  ['Return Remarks', viewingWorkflow.workflow.returned_to_origin_remarks],
                  ['Release Assigned To', viewingWorkflow.workflow.release_assigned_to],
                  ['Release Instruction', viewingWorkflow.workflow.release_instruction],
                  ['Release Forwarded At', viewingWorkflow.workflow.release_forwarded_at ? new Date(viewingWorkflow.workflow.release_forwarded_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : null],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value || '—'}</p>
                  </div>
                ))}
              </div>

              {viewingWorkflow.document?.id && (
                <AuditHistory documentId={viewingWorkflow.document.id} />
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 p-5">
              <button
                type="button"
                onClick={() => setViewingWorkflow(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Confirm physical receipt of a returned document. */}
      {receiptConfirmation && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="receipt-confirmation-title"
            aria-describedby="receipt-confirmation-description"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-4 border-b border-slate-100 p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <CheckCircle2 size={25} />
              </div>

              <div className="min-w-0">
                <h3
                  id="receipt-confirmation-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Confirm Document Receipt
                </h3>

                <p
                  id="receipt-confirmation-description"
                  className="mt-2 text-sm leading-6 text-slate-600"
                >
                  Confirm that this document has physically arrived at its
                  originating office. Only confirm after the office has
                  actually received the document.
                </p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">PR/Office No.</span>
                <span className="text-sm font-semibold text-slate-900">
                  {documents.find(
                    item =>
                      item.id === receiptConfirmation.receiving_record_id,
                  )?.reference_number || '—'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-500">Origin Office</span>
                <span className="text-right text-sm font-semibold text-slate-900">
                  {(() => {
                    const document = documents.find(
                      item =>
                        item.id === receiptConfirmation.receiving_record_id,
                    )

                    return (
                      document?.origin_office ||
                      document?.current_office ||
                      document?.destination_folder ||
                      'Not specified'
                    )
                  })()}
                </span>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">
                  Board Room Remarks
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                  {receiptConfirmation.returned_to_origin_remarks?.trim() ||
                    'No remarks provided.'}
                </p>
              </div>

              {receiptConfirmation.returned_to_origin_person && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500">Picked Up By</span>
                  <span className="text-right text-sm font-semibold text-slate-900">
                    {receiptConfirmation.returned_to_origin_person}
                  </span>
                </div>
              )}

              {receiptConfirmation.returned_to_origin_at && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500">Returned On</span>
                  <span className="text-right text-sm font-semibold text-slate-900">
                    {formatDate(
                      receiptConfirmation.returned_to_origin_at.slice(0, 10),
                    )}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <UrgencyBadge urgency={receiptConfirmation.urgency} />
                <StorageBadge workflow={receiptConfirmation} />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <AlertTriangle size={17} className="shrink-0" />
                This action marks the workflow as completed.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={confirmingReceiptId !== null}
                onClick={() => setReceiptConfirmation(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={confirmingReceiptId === receiptConfirmation.id}
                onClick={() => void handleConfirmReceipt(receiptConfirmation)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmingReceiptId === receiptConfirmation.id ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}

                {confirmingReceiptId === receiptConfirmation.id
                  ? 'Confirming...'
                  : 'Confirm Receipt'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Assign a returned document to releasing staff. */}
      {releaseAssignment && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-assignment-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h3 id="release-assignment-title" className="text-lg font-bold text-slate-900">
                  Forward to Releasing Staff
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Assign the returned document after Origin Staff confirms physical receipt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !savingReleaseAssignment && setReleaseAssignment(null)}
                disabled={savingReleaseAssignment}
                aria-label="Close form"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleForwardToReleasingStaff} className="space-y-5 p-6">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">PR/Office No.</p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {documents.find(
                    item => item.id === releaseAssignment.receiving_record_id,
                  )?.reference_number || '—'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {documents.find(
                    item => item.id === releaseAssignment.receiving_record_id,
                  )?.content ||
                    documents.find(
                      item => item.id === releaseAssignment.receiving_record_id,
                    )?.subject ||
                    'No subject'}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Releasing Staff *
                </label>
                <div className="relative mt-1.5">
                  <button
                    type="button"
                    onClick={() => setReleaseStaffDropdownOpen(open => !open)}
                    disabled={loadingReleasingStaff || releasingStaffOptions.length === 0}
                    aria-haspopup="listbox"
                    aria-expanded={releaseStaffDropdownOpen}
                    className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:bg-slate-50`}
                  >
                    <span className={releaseStaff ? 'text-slate-800' : 'text-slate-400'}>
                      {loadingReleasingStaff
                        ? 'Loading staff...'
                        : releaseStaff || 'Select a staff member...'}
                    </span>
                    <Search size={16} className="shrink-0 text-slate-400" />
                  </button>

                  {releaseStaffDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      <div className="border-b border-slate-100 p-2">
                        <div className="relative">
                          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            id="release-staff-search"
                            autoFocus
                            autoComplete="off"
                            value={releaseStaffSearch}
                            onChange={event => setReleaseStaffSearch(event.target.value)}
                            placeholder="Search staff..."
                            className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                      <div role="listbox" aria-label="Releasing staff" className="max-h-48 overflow-y-auto py-1">
                        {releasingStaffOptions
                          .filter(name => name.toLowerCase().includes(releaseStaffSearch.trim().toLowerCase()))
                          .map(name => (
                            <button
                              key={name}
                              type="button"
                              role="option"
                              aria-selected={releaseStaff === name}
                              onClick={() => {
                                setReleaseStaff(name)
                                setReleaseStaffSearch('')
                              setReleaseStaffDropdownOpen(false)
                                setReleaseStaffDropdownOpen(false)
                              }}
                              className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 ${releaseStaff === name ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700'}`}
                            >
                              {name}
                            </button>
                          ))}
                        {!releasingStaffOptions.some(name => name.toLowerCase().includes(releaseStaffSearch.trim().toLowerCase())) && (
                          <p className="px-3 py-3 text-sm text-slate-500">No matching staff found.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {releaseStaff ? `Selected: ${releaseStaff}` : 'Open the dropdown to search and select any staff member.'}
                </p>
              </div>

              <div>
                <label htmlFor="release-instruction" className="text-xs font-semibold text-slate-600">
                  Instruction *
                </label>
                <select
                  id="release-instruction"
                  required
                  value={releaseInstruction}
                  onChange={event => setReleaseInstruction(event.target.value)}
                  className={inputClass}
                >
                  <option value="For Release">For Release</option>
                  <option value="For File">For File</option>
                  <option value="Custom">Custom instruction</option>
                </select>
                {releaseInstruction === 'Custom' && (
                  <textarea
                    required
                    rows={3}
                    value={releaseCustomInstruction}
                    onChange={event => setReleaseCustomInstruction(event.target.value)}
                    placeholder="Enter the instruction..."
                    className={inputClass}
                  />
                )}
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                The originating office must confirm receipt before this document can be assigned. Existing workflow history will be preserved.
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={savingReleaseAssignment}
                  onClick={() => setReleaseAssignment(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReleaseAssignment}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingReleaseAssignment ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {savingReleaseAssignment ? 'Forwarding...' : 'Forward Document'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Form for forwarding documents to the Board Room. */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="forwarding-form-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3
                  id="forwarding-form-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Forward Documents to Board Room
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Select one or more Receiving records and enter the shared
                  forwarding details.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (saving) return
                  setShowForm(false)
                  resetForm()
                }}
                disabled={saving}
                aria-label="Close form"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleForward} className="space-y-5 p-6">
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Documents to Forward *
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setDocumentSearch('')
                    setDocumentPickerOpen(true)
                  }}
                  className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left text-sm text-slate-800 transition hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <span className="flex items-center gap-3">
                    <FileSearch size={19} className="text-blue-600" />
                    Search and select documents
                  </span>
                  <Search size={17} className="text-slate-400" />
                </button>

                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-950">
                        Selected Documents
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Review your list before forwarding.
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-700 px-3 py-1.5 text-sm font-bold text-white">
                      {selectedDocumentIds.length}
                    </span>
                  </div>

                  {selectedDocuments.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No documents selected yet.
                    </p>
                  ) : (
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                      {selectedDocuments.map(document => (
                        <div
                          key={document.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {document.reference_number}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {document.content ||
                                document.subject ||
                                'No subject'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {document.origin_office ||
                                document.current_office ||
                                'Office not specified'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              toggleDocumentSelection(document.id)
                            }
                            aria-label={`Remove ${document.reference_number}`}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setDocumentSearch('')
                      setDocumentPickerOpen(true)
                    }}
                    className="mt-3 text-sm font-semibold text-blue-700 hover:underline"
                  >
                    + Add or remove documents
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="transaction-person"
                  className="text-xs font-semibold text-slate-600"
                >
                  Transaction — Person Who Brought the Documents *
                </label>
                <input
                  id="transaction-person"
                  required
                  value={transactionPerson}
                  onChange={event => setTransactionPerson(event.target.value)}
                  placeholder="Enter the person's full name"
                  className={inputClass}
                />
              </div>

              <fieldset>
                <legend className="text-xs font-semibold text-slate-600">
                  Document Storage Location *
                </legend>

                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="storage-type"
                      checked={storageType === 'folder'}
                      onChange={() => setStorageType('folder')}
                      className="accent-blue-700"
                    />
                    Folder (Color)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="storage-type"
                      checked={storageType === 'box'}
                      onChange={() => setStorageType('box')}
                      className="accent-blue-700"
                    />
                    Box (Number)
                  </label>
                </div>

                {storageType === 'folder' ? (
                  <div className="mt-3">
                    <label
                      htmlFor="folder-color"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Folder Color *
                    </label>
                    <select
                      id="folder-color"
                      required
                      value={folderColor}
                      onChange={event => setFolderColor(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select folder color...</option>
                      {folderColors.map(color => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-3">
                    <label
                      htmlFor="box-number"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Box Number *
                    </label>
                    <input
                      id="box-number"
                      required
                      value={boxNumber}
                      onChange={event => setBoxNumber(event.target.value)}
                      placeholder="Enter box number"
                      className={inputClass}
                    />
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend className="text-xs font-semibold text-slate-600">
                  Urgency *
                </legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="urgency"
                      checked={urgency === 'urgent'}
                      onChange={() => setUrgency('urgent')}
                      className="accent-red-600"
                    />
                    <AlertTriangle size={15} className="text-red-600" />
                    Urgent
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="urgency"
                      checked={urgency === 'not_urgent'}
                      onChange={() => setUrgency('not_urgent')}
                      className="accent-blue-700"
                    />
                    Not Urgent
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">
                    Forwarding Date
                  </label>
                  <input
                    value={new Intl.DateTimeFormat('en-CA', {
                      timeZone: 'Asia/Manila',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    }).format(new Date())}
                    readOnly
                    className={`${inputClass} bg-slate-50`}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Saved using the database's Philippine-date default.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="forwarding-time"
                    className="text-xs font-semibold text-slate-600"
                  >
                    Actual Forwarding Time *
                  </label>
                  <input
                    id="forwarding-time"
                    type="time"
                    required
                    value={forwardingTime}
                    onChange={event => setForwardingTime(event.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the time the documents were physically forwarded.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600">
                  Recorded By
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  Automatically assigned from the authenticated Supabase
                  account.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
                <p className="self-center text-sm font-semibold text-slate-600">
                  {selectedDocumentIds.length} document(s) selected
                </p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setShowForm(false)
                      resetForm()
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || selectedDocumentIds.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={16} />
                    {saving
                      ? 'Forwarding...'
                      : `Forward ${selectedDocumentIds.length} Document(s)`}
                  </button>
                </div>
              </div>
            </form>
          </section>

          {documentPickerOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="document-picker-title"
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="border-b border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3
                        id="document-picker-title"
                        className="text-lg font-bold text-slate-900"
                      >
                        Select Documents to Forward
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Check multiple documents to forward them as a group.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocumentPickerOpen(false)}
                      aria-label="Close document search"
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="relative mt-4">
                    <Search
                      size={18}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="search"
                      autoFocus
                      value={documentSearch}
                      onChange={event => setDocumentSearch(event.target.value)}
                      placeholder="Search reference, subject, sender, bearer, office..."
                      className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-50 p-3">
                    <div>
                      <p className="font-semibold text-blue-950">
                        {selectedDocumentIds.length} document(s) selected
                      </p>
                      <p className="text-xs text-slate-600">
                        {filteredPickerDocuments.length} document(s) match this
                        search
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAllFilteredDocuments}
                      disabled={filteredPickerDocuments.length === 0}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                    >
                      {allFilteredSelected
                        ? 'Deselect Search Results'
                        : 'Select All Search Results'}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {filteredPickerDocuments.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileSearch
                        size={36}
                        className="mx-auto text-slate-300"
                      />
                      <p className="mt-3 font-semibold text-slate-700">
                        No matching documents found
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Try a different search term or check whether the
                        documents have already been forwarded.
                      </p>
                    </div>
                  ) : (
                    filteredPickerDocuments.map(document => {
                      const isSelected = selectedDocumentIds.includes(
                        document.id,
                      )

                      return (
                        <label
                          key={document.id}
                          className={`mb-2 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              toggleDocumentSelection(document.id)
                            }
                            className="mt-1 h-4 w-4 accent-blue-700"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-blue-950">
                              {document.reference_number || 'No reference number'}
                            </p>
                            <p className="mt-1 break-words text-sm text-slate-800">
                              {document.content ||
                                document.subject ||
                                'No subject'}
                            </p>
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              <p>Sender: {document.sender || 'Not specified'}</p>
                              {document.bearer && (
                                <p>Bearer: {document.bearer}</p>
                              )}
                              <p>
                                Originating office:{' '}
                                {document.origin_office ||
                                  document.current_office ||
                                  document.destination_folder ||
                                  'Not specified'}
                              </p>
                              {document.record_type && (
                                <p>Record type: {document.record_type}</p>
                              )}
                            </div>
                          </div>

                          {isSelected && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-100 px-2.5 py-2 text-xs font-semibold text-blue-700">
                              <Check size={14} />
                              Selected
                            </span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-600">
                    {selectedDocumentIds.length} selected
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDocumentIds([])}
                      disabled={selectedDocumentIds.length === 0}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Clear Selection
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocumentPickerOpen(false)}
                      className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      Confirm {selectedDocumentIds.length} Selected
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
