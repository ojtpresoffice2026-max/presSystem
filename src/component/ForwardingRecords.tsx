import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Bell,
  Undo2,
  CheckCircle2,
  Check,
  LoaderCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'


type ReceivingRecord = {
  id: string
  reference_number: string | null
  system_code?: string | null
  record_type?: string | null
  subject?: string | null
  content?: string | null
  sender?: string | null
  bearer?: string | null
  origin_office?: string | null
  current_office?: string | null
  destination_folder?: string | null
  date_received?: string | null
  custom_field_values?: Record<string, unknown> | null
  is_unrecorded_paper?: boolean | null
  urgency?: string | null
  status?: string | null
  remarks?: string | null
}

type DestinationFieldDefinition = {
  id: string
  folder_id: string
  field_name: string
  field_type?: string | null
  options?: string[] | null
  sort_order?: number | null
}

type WorkflowRecord = {
  id: string
  receiving_record_id: string | null
  unrecorded_paper_id?: string | null
  transaction_person: string
  storage_type: 'folder' | 'box'
  folder_color: string | null
  box_number: string | null
  urgency: 'urgent' | 'not_urgent'
  forwarding_date: string
  forwarding_time: string
  forwarded_by: string
  forwarded_at: string
  board_room_received_at?: string | null
  board_room_received_by?: string | null
  workflow_route?: 'board_room' | 'direct_release' | null
  workflow_status: string
  returned_to_origin_person?: string | null
  returned_to_origin_remarks?: string | null
  returned_to_origin_at?: string | null
  returned_to_origin_by?: string | null
  origin_office_received_at?: string | null
  origin_office_received_by?: string | null
  release_assigned_to?: string | null
  release_instruction?: string | null
  release_forwarded_at?: string | null
  release_forwarded_by?: string | null
  release_received_at?: string | null
  next_action_system_status?: string | null
  next_action_release_at?: string | null
  next_action_date_forwarded?: string | null
}

type WorkflowWithDocument = {
  workflow: WorkflowRecord
  document: ReceivingRecord | undefined
  recordedByName: string
}

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-900'

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
  'Light Blue',
  'White',
  'Orange',
]

function displayStatus(status: string) {
  return status.replaceAll('_', ' ')
}

function normalizeWorkflowStatus(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
}

// Urgency can be stored in the dedicated column or in custom-field metadata
// by older Receiving forms. Check all supported locations instead of letting
// a default value such as `not_urgent` mask a genuine urgent value.
function hasUrgentPriority(...values: Array<unknown>) {
  const urgentValues = new Set(['urgent', 'high', 'critical', 'very_urgent'])
  return values.some(value => urgentValues.has(normalizeWorkflowStatus(String(value ?? ''))))
}

function isCreatedInsideForwardingPage(document: ReceivingRecord) {
  const metadata = document.custom_field_values ?? {}

  // These papers are created by the Forwarding page itself. Their urgency is
  // a forwarding-form choice, not an incoming urgent paper from Receiving or
  // a paper received from the Board Room. Exclude them at every status,
  // including after they have been forwarded and are no longer `available`.
  return (
    metadata._manually_entered_for_board_room === true ||
    metadata._manual_entry_by !== undefined ||
    metadata._manual_entry_by_name !== undefined
  )
}

// Completed papers must not remain in the urgent notification list.
// Check both the paper status and (when present) its forwarding workflow status.
function isCompletedUrgentNotification(
  document: ReceivingRecord,
  workflow?: WorkflowRecord,
) {
  const completedStatuses = new Set([
    'completed',
    'action_completed',
    'released',
    'paper_released',
    'release_completed',
    'done',
    'cancelled',
    'rejected',
  ])

  // Completion may be stored on the workflow, its next-action field, or
  // the incoming paper itself depending on which part of the process updated it.
  const statuses = [
    document.status,
    workflow?.workflow_status,
    workflow?.next_action_system_status,
  ].map(normalizeWorkflowStatus)

  return statuses.some(status => completedStatuses.has(status))
}

function formatDate(value?: string | null) {
  if (!value) return '—'

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)

  if (Number.isNaN(date.getTime())) return value

  // Consistent numeric date format: MM/DD/YYYY.
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
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

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const datePart = date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart}, ${timePart}`
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

function isUnrecordedBoardRoomPaper(document?: ReceivingRecord | null) {
  if (!document) return false
  const values = document.custom_field_values ?? {}
  return (
    document.is_unrecorded_paper === true ||
    values._is_unrecorded_paper === true ||
    values._manually_entered_for_board_room === true ||
    String(values._record_kind ?? '').trim().toLowerCase() === 'unrecorded_paper'
  )
}

function displayOfficeName(value?: string | null) {
  if (!value) return '—'
  return value
    .trim()
    .replace(/^(?:PR|DV)_/i, '')
    .replace(/_\d{8,}$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeFolderKey(value?: string | null) {
  return displayOfficeName(value).toUpperCase().replace(/\s+/g, ' ').trim()
}

function resolveOfficeFolderName(value: string | null | undefined, names: Record<string, string>) {
  if (!value) return '—'
  const raw = value.trim()
  const normalized = normalizeFolderKey(raw)
  const resolved = names[normalized]
  if (resolved) return resolved
  // Legacy receiving records sometimes store generated folder codes such as
  // PR_MABINAY_1793179282728 instead of the configured folder display name.
  const cleaned = raw.replace(/^(?:PR|DV)_/i, '').replace(/_\d{8,}$/i, '')
  return displayOfficeName(cleaned)
}

function getStorageLabel(workflow: WorkflowRecord) {
  return workflow.storage_type === 'folder'
    ? `Folder: ${workflow.folder_color || 'Not specified'}`
    : `Box: ${workflow.box_number || 'Not specified'}`
}

function UrgencyBadge({ urgency }: { urgency?: string | null }) {
  const isUrgent = String(urgency ?? '').trim().toLowerCase() === 'urgent'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
        isUrgent
          ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
      }`}
    >
      {isUrgent && <AlertTriangle size={12} />}
      {isUrgent ? 'Urgent' : ''}
    </span>
  )
}

function StorageBadge({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
      {getStorageLabel(workflow)}
    </span>
  )
}

export default function ForwardingRecords() {
  const [documents, setDocuments] = useState<ReceivingRecord[]>([])
  const [workflows, setWorkflows] = useState<WorkflowWithDocument[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [officeFolderNames, setOfficeFolderNames] = useState<Record<string, string>>({})

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [showForm, setShowForm] = useState(false)
  const [urgentNotificationsOpen, setUrgentNotificationsOpen] = useState(false)
  const [returnedNotificationsOpen, setReturnedNotificationsOpen] = useState(false)
  const [documentPickerOpen, setDocumentPickerOpen] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [selectedDocumentSearch, setSelectedDocumentSearch] = useState('')
  const [selectedDocumentsPage, setSelectedDocumentsPage] = useState(1)
  const selectedDocumentsPageSize = 10
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [manualUnrecordedPapers, setManualUnrecordedPapers] = useState<Array<{
    id: string
    referenceNumber: string
    subject: string
    urgency: 'urgent' | 'not_urgent'
    sender: string
    originOffice: string
    destinationFolder: string
    destinationFields: DestinationFieldDefinition[]
    customFieldValues: Record<string, string | boolean>
    createdRecordId?: string
    creating?: boolean
  }>>([])
  const [showManualPaperForm, setShowManualPaperForm] = useState(false)
  const [, setManualFolderOptions] = useState<Array<{ id: string; code: string; name: string }>>([])
  const [currentAccountName, setCurrentAccountName] = useState('')

  const [transactionPerson, setTransactionPerson] = useState('')
  const [documentStorageAssignments, setDocumentStorageAssignments] = useState<Record<string, {
    storageType: 'folder' | 'box'
    folderColor: string
    boxNumber: string
  }>>({})
  const [storageGroups, setStorageGroups] = useState<Array<{
    id: string
    name: string
    storageType: 'folder' | 'box'
    folderColor: string
    boxNumber: string
  }>>([{ id: 'storage-group-1', name: 'Storage Group 1', storageType: 'folder', folderColor: '', boxNumber: '' }])
  const [activeStorageGroupId, setActiveStorageGroupId] = useState('storage-group-1')
  const [documentStorageGroupIds, setDocumentStorageGroupIds] = useState<Record<string, string>>({})
  const [documentUrgencies, setDocumentUrgencies] = useState<Record<string, 'urgent' | 'not_urgent'>>({})
  const [forwardingTime, setForwardingTime] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Urgent-notification sound state. The first urgent snapshot alerts once;
  // later alerts only play for newly urgent notification items, not each refresh.
  const urgentAudioContextRef = useRef<AudioContext | null>(null)
  const seenUrgentKeysRef = useRef<Set<string> | null>(null)
  const pendingUrgentSoundRef = useRef(false)
  const [confirmingReceiptId, setConfirmingReceiptId] = useState<string | null>(
    null,
  )

  const [viewingWorkflow, setViewingWorkflow] =
    useState<WorkflowWithDocument | null>(null)
  const [viewDestinationFields, setViewDestinationFields] =
    useState<DestinationFieldDefinition[]>([])
  const [viewDestinationFieldsLoading, setViewDestinationFieldsLoading] =
    useState(false)
  const [viewingUrgentDocument, setViewingUrgentDocument] =
    useState<ReceivingRecord | null>(null)
  const [releaseAssignment, setReleaseAssignment] =
    useState<WorkflowRecord | null>(null)
  const [releaseStaff, setReleaseStaff] = useState('')
  const [releaseStaffSearch, setReleaseStaffSearch] = useState('')
  const [releaseStaffDropdownOpen, setReleaseStaffDropdownOpen] = useState(false)
  const [releasingStaffOptions, setReleasingStaffOptions] = useState<string[]>([])
  const [loadingReleasingStaff, setLoadingReleasingStaff] = useState(false)
  const [releaseInstruction, setReleaseInstruction] = useState('For Release')
  const [releaseUrgency, setReleaseUrgency] = useState<'urgent' | 'not_urgent'>('not_urgent')
  const [releaseCustomInstruction, setReleaseCustomInstruction] = useState('')
  const [savingReleaseAssignment, setSavingReleaseAssignment] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Load only the custom fields configured for the destination folder of the
  // document currently being viewed. Field values are stored by field ID.
  useEffect(() => {
    let cancelled = false

    async function loadViewDestinationFields() {
      setViewDestinationFields([])
      const document = viewingWorkflow?.document
      const destination = String(
        document?.destination_folder || document?.current_office || '',
      ).trim()

      if (!document || !destination) {
        setViewDestinationFieldsLoading(false)
        return
      }

      setViewDestinationFieldsLoading(true)
      try {
        const { data: folders, error: folderError } = await supabase
          .from('office_folders')
          .select('id, code, name')

        if (folderError) throw folderError

        const normalizeMatchKey = (value: unknown) =>
          String(value ?? '')
            .trim()
            .toUpperCase()
            .replace(/^(?:PR|DV)_/i, '')
            .replace(/_\\d{8,}$/i, '')
            .replace(/[^A-Z0-9]/g, '')

        const normalizedDestination = normalizeMatchKey(destination)
        const destinationParts = destination
          .trim()
          .toUpperCase()
          .replace(/^(?:PR|DV)_/i, '')
          .replace(/_\\d{8,}$/i, '')
          .split(/[^A-Z0-9]+/)
          .filter(Boolean)

        const folder = (folders ?? []).find(
          (item: { id: string; code: string | null; name: string | null }) => {
            const codeKey = normalizeMatchKey(item.code)
            const nameKey = normalizeMatchKey(item.name)

            return (
              (codeKey !== '' && codeKey === normalizedDestination) ||
              (nameKey !== '' && nameKey === normalizedDestination) ||
              (codeKey.length >= 4 && destinationParts.some(part => normalizeMatchKey(part) === codeKey)) ||
              (nameKey.length >= 4 && destinationParts.some(part => normalizeMatchKey(part) === nameKey)) ||
              (codeKey.length >= 4 && normalizedDestination.includes(codeKey)) ||
              (nameKey.length >= 4 && normalizedDestination.includes(nameKey))
            )
          },
        )

        if (!folder) return

        const { data: fields, error: fieldsError } = await supabase
          .from('destination_folder_fields')
          .select('id, folder_id, field_name, field_type, sort_order')
          .eq('folder_id', folder.id)
          .order('sort_order', { ascending: true })

        if (fieldsError) throw fieldsError
        if (!cancelled) {
          setViewDestinationFields((fields ?? []) as DestinationFieldDefinition[])
        }
      } catch (err) {
        console.error('Unable to load destination fields for document view:', err)
        if (!cancelled) setViewDestinationFields([])
      } finally {
        if (!cancelled) setViewDestinationFieldsLoading(false)
      }
    }

    void loadViewDestinationFields()
    return () => {
      cancelled = true
    }
  }, [
    viewingWorkflow?.document?.id,
    viewingWorkflow?.document?.destination_folder,
    viewingWorkflow?.document?.current_office,
  ])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [documentsResult, workflowsResult, unrecordedResult] = await Promise.all([
        supabase
          .from('receiving_records')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('document_workflow')
          .select('*')
          .order('forwarded_at', { ascending: false }),
        supabase.from('unrecorded_papers').select('*').order('created_at', { ascending: false }),
      ])

      if (documentsResult.error) throw documentsResult.error
      if (workflowsResult.error) throw workflowsResult.error
      if (unrecordedResult.error) throw unrecordedResult.error

      const recordedDocuments = (documentsResult.data ?? []) as ReceivingRecord[]
      const separateUnrecordedDocuments = (unrecordedResult.data ?? []).map((paper: any) => ({
        id: paper.id,
        reference_number: paper.reference_number,
        record_type: 'Other',
        subject: paper.subject,
        content: paper.content,
        sender: paper.sender,
        bearer: paper.bearer,
        origin_office: paper.origin_office,
        current_office: paper.current_office,
        destination_folder: paper.destination_folder,
        date_received: paper.date_received,
        status: paper.status,
        remarks: paper.remarks,
        urgency: paper.urgency,
        is_unrecorded_paper: true,
        custom_field_values: { ...(paper.custom_field_values ?? {}), _is_unrecorded_paper: true, _record_kind: 'unrecorded_paper' },
      })) as ReceivingRecord[]
      const receivedDocuments = [...recordedDocuments, ...separateUnrecordedDocuments]

      const workflowRecords =
        (workflowsResult.data ?? []) as WorkflowRecord[]

      const documentById = new Map(
        receivedDocuments.map(document => [document.id, document]),
      )

      const userIds = [
        ...new Set(
          workflowRecords
            .flatMap(item => [
              item.forwarded_by,
              item.board_room_received_by,
              item.returned_to_origin_by,
              item.origin_office_received_by,
              item.release_forwarded_by,
            ])
            .filter((id): id is string => Boolean(id)),
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

      // Only active staff accounts may be assigned for releasing.
      // User Management stores this flag in profiles.is_active.
      setLoadingReleasingStaff(true)
      const { data: releasingStaffRows, error: releasingStaffError } = await supabase
        .from('profiles')
        .select('full_name, is_active')
        .eq('role', 'staff')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (releasingStaffError) {
        console.warn('Could not load active releasing staff:', releasingStaffError)
        setReleasingStaffOptions([])
      } else {
        const names = (releasingStaffRows ?? [])
          .filter(row => row.is_active === true)
          .map(row => String(row.full_name ?? '').trim())
          .filter(Boolean)
        setReleasingStaffOptions([...new Set(names)])
      }
      setLoadingReleasingStaff(false)

      const { data: officeFolders, error: officeFoldersError } = await supabase
        .from('office_folders')
        .select('code, name')

      if (officeFoldersError) {
        console.warn('Could not load office/folder display names:', officeFoldersError)
      } else {
        const folderNames: Record<string, string> = {}
        for (const folder of officeFolders ?? []) {
          const name = String(folder.name ?? '').trim()
          const code = String(folder.code ?? '').trim()
          if (name) {
            if (code) folderNames[normalizeFolderKey(code)] = name
            folderNames[normalizeFolderKey(name)] = name
          }
        }
        setOfficeFolderNames(folderNames)
      }

      setDocuments(receivedDocuments)
      setProfiles(profileMap)

      const { data: activeManualFolders, error: manualFoldersError } = await supabase
        .from('office_folders')
        .select('id, code, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (manualFoldersError) throw manualFoldersError
      setManualFolderOptions((activeManualFolders ?? []) as Array<{ id: string; code: string; name: string }>)

      setWorkflows(
        workflowRecords.map(workflow => ({
          workflow,
          document:
            // Try both foreign keys independently. A stale unrecorded_paper_id
            // must not prevent resolving a valid receiving_record_id.
            documentById.get(workflow.unrecorded_paper_id || '') ||
            documentById.get(workflow.receiving_record_id || ''),
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

  // Refresh alerts when a new/updated receiving record is saved or when
  // the Board Room changes a workflow (for example, returning a paper).
  useEffect(() => {
    const channel = supabase
      .channel('forward-page-urgent-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receiving_records' },
        () => { void loadData() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'unrecorded_papers' },
        () => { void loadData() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_workflow' },
        () => { void loadData() },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  // A document may enter a forwarding transaction only once. Any existing
  // workflow row (Board Room or Releasing, regardless of its current status)
  // means the paper has already been transacted and must not be selectable again.
  const completedOrReleasedDocumentIds = useMemo(() => {
    const ids = new Set<string>()

    for (const item of workflows) {
      const documentId = item.workflow.unrecorded_paper_id || item.workflow.receiving_record_id
      if (documentId) ids.add(documentId)
    }

    for (const document of documents) {
      const status = String(document.status ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
      if (['paper_released', 'released', 'completed', 'done'].includes(status)) {
        ids.add(document.id)
      }
    }

    return ids
  }, [workflows, documents])

  // Only papers with no prior transaction are available for forwarding.
  // Unrecorded papers created by the Board Room return process are already
  // completed return records; they must never re-enter the Forwarding picker.
  // New manual unrecorded papers created inside this Forwarding form have
  // status 'available' and remain eligible for their first transaction.
  const availableDocuments = useMemo(
    () => documents.filter(document => {
      if (completedOrReleasedDocumentIds.has(document.id)) return false

      const metadata = document.custom_field_values ?? {}
      const status = String(document.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
      const isUnrecorded =
        document.is_unrecorded_paper === true || metadata._is_unrecorded_paper === true ||
        String(metadata._record_kind ?? '').trim().toLowerCase().replace(/[ _-]+/g, '') === 'unrecordedpaper'

      // Unrecorded papers created in this form start as `available`. Once
      // forwarded, their status changes to `forwarded` and they are never
      // offered in the picker again.
      if (isUnrecorded && status !== 'available') return false

      const source = String(metadata._source ?? '').trim().toLowerCase()
      // A paper returned by the Board Room is not eligible for another
      // forwarding transaction, regardless of whether it is recorded or
      // unrecorded. Check the return marker for every paper type.
      const isBoardRoomReturnPaper =
        source === 'board_room_return' || status === 'returned_to_origin'

      return !isBoardRoomReturnPaper
    }),
    [documents, completedOrReleasedDocumentIds],
  )

  // Notify about the PAPER received from Receiving / Board Room, not about
  // the forwarding transaction itself. In particular, workflow.urgency is
  // intentionally ignored because it describes the transaction and can be
  // urgent even when the incoming paper was not marked urgent.
  // A workflow notification is valid only when its linked paper is loaded and
  // that paper's own urgency (column or legacy metadata) is urgent.
  const urgentReturnedWorkflows = useMemo(() => {
    const seenDocumentIds = new Set<string>()

    return workflows.filter(({ workflow, document }) => {
      if (!document) return false
      if (isCreatedInsideForwardingPage(document)) return false

      // This list is ONLY for papers that the Board Room actually returned
      // to the originating office. A normal `forwarded`, `in_progress`,
      // `completed`, or `direct_release` workflow is not a new incoming paper.
      // In particular, workflow.urgency must never create an incoming alert.
      const workflowStatus = normalizeWorkflowStatus(workflow.workflow_status)
      if (workflowStatus !== 'returned_to_origin') return false
      if (workflow.origin_office_received_at) return false

      const linkedIds = [workflow.unrecorded_paper_id, workflow.receiving_record_id]
        .filter((id): id is string => Boolean(id))
      if (linkedIds.length === 0) return false
      if (linkedIds.some(id => seenDocumentIds.has(id))) return false
      linkedIds.forEach(id => seenDocumentIds.add(id))

      const metadata = document.custom_field_values ?? {}
      const paperIsUrgent = hasUrgentPriority(
        document.urgency,
        metadata._urgency,
      )

      return paperIsUrgent && !isCompletedUrgentNotification(document, workflow)
    })
  }, [workflows])

  const documentsWithWorkflowIds = useMemo(() => {
    const ids = new Set<string>()

    for (const { workflow } of workflows) {
      if (workflow.unrecorded_paper_id) ids.add(workflow.unrecorded_paper_id)
      if (workflow.receiving_record_id) ids.add(workflow.receiving_record_id)
    }

    return ids
  }, [workflows])

  // Incoming urgent papers without a workflow are notified here. This includes
  // legitimate unrecorded incoming papers, but excludes only the temporary
  // `available` unrecorded drafts manually created inside the Forwarding form.
  // Papers already represented by a workflow are counted in that workflow list.
  const urgentReceivedDocuments = useMemo(
    () => documents.filter(document => {
      if (documentsWithWorkflowIds.has(document.id)) return false
      if (isCreatedInsideForwardingPage(document)) return false

      const metadata = document.custom_field_values ?? {}
      const isUnrecordedPaper = isUnrecordedBoardRoomPaper(document)
      const source = String(metadata._source ?? '').trim().toLowerCase()
      const status = normalizeWorkflowStatus(document.status)

      // Unrecorded papers are not Receiving Office intake records. Only allow
      // one here when it is explicitly marked as a Board Room return awaiting
      // receipt and has no linked workflow row.
      if (
        isUnrecordedPaper &&
        !(source === 'board_room_return' && status === 'returned_to_origin')
      ) {
        return false
      }

      const isUrgent = hasUrgentPriority(
        document.urgency,
        metadata._urgency,
      )

      return isUrgent && !isCompletedUrgentNotification(document)
    }),
    [documents, documentsWithWorkflowIds],
  )

  const urgentNotificationCount =
    urgentReceivedDocuments.length + urgentReturnedWorkflows.length

  // The workflow status is the source of truth for the pending receipt action.
  // Some older rows may have a stale origin_office_received_at timestamp even
  // though the workflow is still returned_to_origin (the table then still shows
  // the Confirm Receipt action). Do not hide those rows from this notification.
  const returnedAwaitingReceiptWorkflows = useMemo(
    () =>
      workflows.filter(({ workflow }) =>
        String(workflow.workflow_status ?? '')
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_') === 'returned_to_origin',
      ),
    [workflows],
  )

  // Count only unrecorded papers that were actually returned by the Board Room.
  // A newly created paper in the Forwarding panel is merely `available`; it is
  // not a return and must never increase the Returned badge/count.
  const returnedAwaitingReceiptUnrecordedDocuments = useMemo(
    () =>
      documents.filter(document => {
        const metadata = document.custom_field_values ?? {}
        const isUnrecordedBoardRoomReturn =
          document.is_unrecorded_paper === true ||
          metadata._is_unrecorded_paper === true ||
          String(metadata._record_kind ?? '').trim().toLowerCase().replace(/[ _-]+/g, '') === 'unrecordedpaper'
        const source = String(metadata._source ?? '').trim().toLowerCase()
        const status = String(document.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
        const wasActuallyReturned = source === 'board_room_return' || status === 'returned_to_origin'

        return (
          isUnrecordedBoardRoomReturn &&
          wasActuallyReturned &&
          !hasForwardingStaffConfirmedBoardRoomReturn(document)
        )
      }),
    [documents],
  )

  const returnedAwaitingReceiptCount =
    returnedAwaitingReceiptWorkflows.length +
    returnedAwaitingReceiptUnrecordedDocuments.length

  const playUrgentNotificationSound = useCallback(async () => {
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

      if (!AudioContextConstructor) {
        pendingUrgentSoundRef.current = true
        return false
      }

      if (!urgentAudioContextRef.current) {
        urgentAudioContextRef.current = new AudioContextConstructor()
      }

      const audioContext = urgentAudioContextRef.current
      if (audioContext.state !== 'running') {
        try {
          await audioContext.resume()
        } catch {
          // Browsers may require a user gesture before audio can start.
        }
      }

      if (audioContext.state !== 'running') {
        pendingUrgentSoundRef.current = true
        return false
      }

      pendingUrgentSoundRef.current = false
      const now = audioContext.currentTime
      const notes = [
        { frequency: 880, start: 0, duration: 0.18 },
        { frequency: 1046.5, start: 0.2, duration: 0.22 },
      ]

      for (const note of notes) {
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(note.frequency, now + note.start)
        gain.gain.setValueAtTime(0.0001, now + note.start)
        gain.gain.exponentialRampToValueAtTime(0.18, now + note.start + 0.02)
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + note.start + note.duration,
        )
        oscillator.connect(gain)
        gain.connect(audioContext.destination)
        oscillator.start(now + note.start)
        oscillator.stop(now + note.start + note.duration)
      }

      return true
    } catch (error) {
      pendingUrgentSoundRef.current = true
      console.warn('Unable to play urgent notification sound:', error)
      return false
    }
  }, [])

  // Browsers can block autoplay until the first ordinary user interaction.
  // If an urgent alert was blocked on page load, retry it on that interaction.
  useEffect(() => {
    const resumePendingUrgentSound = () => {
      if (pendingUrgentSoundRef.current) {
        void playUrgentNotificationSound()
      }
    }

    window.addEventListener('pointerdown', resumePendingUrgentSound)
    window.addEventListener('keydown', resumePendingUrgentSound)

    return () => {
      window.removeEventListener('pointerdown', resumePendingUrgentSound)
      window.removeEventListener('keydown', resumePendingUrgentSound)
    }
  }, [playUrgentNotificationSound])

  // Play once when the page first loads with active urgent items, and again
  // only when a new urgent document/returned workflow appears. Routine
  // Supabase realtime refreshes do not replay alerts for the same items.
  useEffect(() => {
    if (loading) return

    const currentKeys = new Set<string>([
      ...urgentReceivedDocuments.map(document => `received:${document.id}`),
      ...urgentReturnedWorkflows.map(({ workflow }) => `returned:${workflow.id}`),
    ])

    const previousKeys = seenUrgentKeysRef.current
    const hasNewUrgentItem =
      previousKeys === null
        ? currentKeys.size > 0
        : [...currentKeys].some(key => !previousKeys.has(key))

    seenUrgentKeysRef.current = currentKeys

    if (hasNewUrgentItem) {
      void playUrgentNotificationSound()
    }
  }, [
    loading,
    urgentReceivedDocuments,
    urgentReturnedWorkflows,
    playUrgentNotificationSound,
  ])

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

      // This page keeps the complete Board Room transaction history and also
      // retains transactions that have subsequently been assigned to Releasing
      // Staff. Older records may have their route changed to `direct_release`
      // when a staff member is assigned, so include those when an assignment
      // exists. Hide only unassigned direct-release drafts.
      const route = String(workflow.workflow_route ?? 'board_room').trim().toLowerCase()
      const hasReleasingStaffAssignment = Boolean(
        workflow.release_assigned_to ||
        workflow.release_forwarded_at ||
        workflow.release_received_at
      )
      if (route !== 'board_room' && !hasReleasingStaffAssignment) return false

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

  const filteredUntouchedDocuments = useMemo(() => {
    // Show only unrecorded papers that were actually returned by the Board Room
    // and are awaiting confirmation by the originating office. A paper created
    // in the Forwarding panel is NOT a return: it belongs to the first forwarding
    // transaction and must not show a Confirm Receipt action here.
    return documents.filter(document => {
      const metadata = document.custom_field_values ?? {}
      const isUnrecorded =
        document.is_unrecorded_paper === true ||
        metadata._is_unrecorded_paper === true ||
        String(metadata._record_kind ?? '').trim().toLowerCase().replace(/[ _-]+/g, '') === 'unrecordedpaper'
      const source = String(metadata._source ?? '').trim().toLowerCase()
      const status = String(document.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
      const isBoardRoomReturn =
        source === 'board_room_return' || status === 'returned_to_origin'

      // If a workflow row already represents this returned paper, render the
      // workflow row only. This prevents the same physical paper appearing
      // twice (once from unrecorded_papers and once from document_workflow).
      const alreadyShownInWorkflow = workflows.some(({ workflow }) =>
        (workflow.unrecorded_paper_id || workflow.receiving_record_id) === document.id
      )

      return isUnrecorded && isBoardRoomReturn && !alreadyShownInWorkflow && matchesDocument(document, search)
    })
  }, [documents, search, workflows])

  const totalTableRows = filteredUntouchedDocuments.length + filteredWorkflows.length
  const totalPages = Math.max(1, Math.ceil(totalTableRows / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const visibleUntouchedDocuments = filteredUntouchedDocuments.slice(pageStart, pageStart + pageSize)
  const workflowPageStart = Math.max(0, pageStart - filteredUntouchedDocuments.length)
  const workflowPageEnd = Math.max(0, Math.min(filteredWorkflows.length, pageStart + pageSize - filteredUntouchedDocuments.length))
  const visibleWorkflows = filteredWorkflows.slice(workflowPageStart, workflowPageEnd)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

  const selectedDocuments = useMemo(
    () =>
      documents.filter(document =>
        selectedDocumentIds.includes(document.id),
      ),
    [documents, selectedDocumentIds],
  )

  const filteredSelectedDocuments = useMemo(() => {
    const term = selectedDocumentSearch.trim().toLowerCase()
    if (!term) return selectedDocuments

    return selectedDocuments.filter(document => {
      const assignment = documentStorageAssignments[document.id]
      const group = storageGroups.find(item => item.id === documentStorageGroupIds[document.id])
      const storageText = assignment
        ? `${group?.name ?? ''} ${assignment.storageType === 'folder' ? `folder ${assignment.folderColor}` : `box ${assignment.boxNumber}`}`
        : 'not assigned'

      return [
        document.reference_number,
        document.subject,
        document.content,
        document.sender,
        storageText,
        documentUrgencies[document.id] ?? 'not urgent',
      ].some(value => String(value ?? '').toLowerCase().includes(term))
    })
  }, [selectedDocuments, selectedDocumentSearch, documentStorageAssignments, storageGroups, documentStorageGroupIds, documentUrgencies])

  const selectedDocumentsTotalPages = Math.max(
    1,
    Math.ceil(filteredSelectedDocuments.length / selectedDocumentsPageSize),
  )
  const safeSelectedDocumentsPage = Math.min(selectedDocumentsPage, selectedDocumentsTotalPages)
  const visibleSelectedDocuments = filteredSelectedDocuments.slice(
    (safeSelectedDocumentsPage - 1) * selectedDocumentsPageSize,
    safeSelectedDocumentsPage * selectedDocumentsPageSize,
  )

  useEffect(() => {
    setSelectedDocumentsPage(1)
  }, [selectedDocumentSearch, selectedDocumentIds.length])

  const allFilteredSelected =
    filteredPickerDocuments.length > 0 &&
    filteredPickerDocuments.every(document =>
      selectedDocumentIds.includes(document.id),
    )


  function toggleDocumentSelection(id: string) {
    if (selectedDocumentIds.includes(id)) {
      setSelectedDocumentIds(current => current.filter(selectedId => selectedId !== id))
      setDocumentUrgencies(current => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setDocumentStorageAssignments(current => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setDocumentStorageGroupIds(current => {
        const next = { ...current }
        delete next[id]
        return next
      })
      return
    }

    const activeGroup = storageGroups.find(group => group.id === activeStorageGroupId)
    if (!activeGroup) {
      setError('Add or select a storage group before selecting documents.')
      return
    }
    setSelectedDocumentIds(current => current.includes(id) ? current : [...current, id])
    setDocumentStorageGroupIds(current => ({ ...current, [id]: activeGroup.id }))
    setDocumentStorageAssignments(current => ({
      ...current,
      [id]: {
        storageType: activeGroup.storageType,
        folderColor: activeGroup.folderColor,
        boxNumber: activeGroup.boxNumber,
      },
    }))
    setDocumentUrgencies(current => ({ ...current, [id]: current[id] ?? 'not_urgent' }))
  }

  function getStorageGroupKey(group: {
    storageType: 'folder' | 'box'
    folderColor: string
    boxNumber: string
  }) {
    if (group.storageType === 'folder') {
      const color = group.folderColor.trim().toLowerCase()
      return color ? `folder:${color}` : ''
    }

    const box = group.boxNumber.trim().toLowerCase().replace(/\\s+/g, ' ')
    return box ? `box:${box}` : ''
  }

  function addStorageGroup() {
    const id = `storage-group-${crypto.randomUUID()}`
    const nextGroup = {
      id,
      name: `Storage Group ${storageGroups.length + 1}`,
      storageType: 'folder' as const,
      folderColor: '',
      boxNumber: '',
    }
    setStorageGroups(current => [...current, nextGroup])
    setActiveStorageGroupId(id)
  }

  function updateStorageGroup(groupId: string, patch: Partial<{
    storageType: 'folder' | 'box'
    folderColor: string
    boxNumber: string
  }>) {
    const currentGroup = storageGroups.find(group => group.id === groupId)
    if (!currentGroup) return

    const updatedGroup = { ...currentGroup, ...patch }
    const updatedKey = getStorageGroupKey(updatedGroup)
    const matchingGroup = updatedKey
      ? storageGroups.find(group =>
          group.id !== groupId && getStorageGroupKey(group) === updatedKey,
        )
      : undefined

    if (matchingGroup) {
      // Reuse an existing group when the same physical storage location is
      // selected. Move documents from the duplicate group into the existing one.
      setStorageGroups(current => current.filter(group => group.id !== groupId))
      setDocumentStorageGroupIds(current => {
        const next = { ...current }
        for (const [documentId, assignedGroupId] of Object.entries(next)) {
          if (assignedGroupId === groupId) next[documentId] = matchingGroup.id
        }
        return next
      })
      setDocumentStorageAssignments(current => {
        const next = { ...current }
        for (const [documentId, assignedGroupId] of Object.entries(documentStorageGroupIds)) {
          if (assignedGroupId === groupId) {
            next[documentId] = {
              storageType: matchingGroup.storageType,
              folderColor: matchingGroup.folderColor,
              boxNumber: matchingGroup.boxNumber,
            }
          }
        }
        return next
      })
      setActiveStorageGroupId(matchingGroup.id)
      return
    }

    setStorageGroups(current => current.map(group =>
      group.id === groupId ? updatedGroup : group,
    ))
    setDocumentStorageAssignments(current => {
      const next = { ...current }
      for (const [documentId, assignedGroupId] of Object.entries(documentStorageGroupIds)) {
        if (assignedGroupId !== groupId) continue
        next[documentId] = {
          storageType: updatedGroup.storageType,
          folderColor: updatedGroup.folderColor,
          boxNumber: updatedGroup.boxNumber,
        }
      }
      return next
    })
  }

  function setSelectedDocumentUrgency(id: string, value: 'urgent' | 'not_urgent') {
    setDocumentUrgencies(current => ({ ...current, [id]: value }))
  }

  function toggleAllFilteredDocuments() {
    const filteredIds = filteredPickerDocuments.map(document => document.id)
    if (allFilteredSelected) {
      setSelectedDocumentIds(current => current.filter(id => !filteredIds.includes(id)))
      setDocumentUrgencies(current => {
        const next = { ...current }
        filteredIds.forEach(id => delete next[id])
        return next
      })
      setDocumentStorageAssignments(current => {
        const next = { ...current }
        filteredIds.forEach(id => delete next[id])
        return next
      })
      setDocumentStorageGroupIds(current => {
        const next = { ...current }
        filteredIds.forEach(id => delete next[id])
        return next
      })
      return
    }
    const activeGroup = storageGroups.find(group => group.id === activeStorageGroupId)
    if (!activeGroup) {
      setError('Add or select a storage group before selecting documents.')
      return
    }
    const newlySelectedIds = filteredIds.filter(id => !selectedDocumentIds.includes(id))
    setSelectedDocumentIds(current => [...new Set([...current, ...newlySelectedIds])])
    setDocumentStorageGroupIds(current => {
      const next = { ...current }
      newlySelectedIds.forEach(id => { next[id] = activeGroup.id })
      return next
    })
    setDocumentStorageAssignments(current => {
      const next = { ...current }
      newlySelectedIds.forEach(id => {
        next[id] = { storageType: activeGroup.storageType, folderColor: activeGroup.folderColor, boxNumber: activeGroup.boxNumber }
      })
      return next
    })
    setDocumentUrgencies(current => {
      const next = { ...current }
      filteredPickerDocuments.forEach(document => { next[document.id] = next[document.id] ?? 'not_urgent' })
      return next
    })
  }

  function resetForm() {
    setDocumentPickerOpen(false)
    setDocumentSearch('')
    setSelectedDocumentIds([])
    setDocumentStorageGroupIds({})
    setStorageGroups([{ id: 'storage-group-1', name: 'Storage Group 1', storageType: 'folder', folderColor: '', boxNumber: '' }])
    setActiveStorageGroupId('storage-group-1')
    setManualUnrecordedPapers([])
    setShowManualPaperForm(false)
    setManualFolderOptions([])
    setCurrentAccountName('')
    setTransactionPerson('')
    setDocumentStorageAssignments({})
    setDocumentUrgencies({})
    setForwardingTime('')
  }

  
  function updateManualPaper(
    paperId: string,
    patch: Partial<{
      referenceNumber: string
      subject: string
      urgency: 'urgent' | 'not_urgent'
      sender: string
      originOffice: string
      customFieldValues: Record<string, string | boolean>
    }>,
  ) {
    setManualUnrecordedPapers(current => current.map(paper =>
      paper.id === paperId ? { ...paper, ...patch } : paper
    ))
  }

  async function createManualUnrecordedPaper(paperId: string) {
    const paper = manualUnrecordedPapers.find(item => item.id === paperId)
    if (!paper) return
    if (paper.createdRecordId) return
    if (!paper.subject.trim()) {
      setError('Enter the Content before creating the unrecorded paper.')
      return
    }

    setError('')
    setSuccess('')
    setManualUnrecordedPapers(current => current.map(item =>
      item.id === paperId ? { ...item, creating: true } : item
    ))

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Your session has expired. Please sign in again.')

      const { data: accountProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      if (profileError) throw profileError

      const accountName = String(accountProfile?.full_name ?? '').trim()
      if (!accountName) throw new Error('Your account does not have a full name in the profile.')

      const receivedDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())

      const { data: createdRecord, error: insertError } = await supabase
        .from('unrecorded_papers')
        .insert({
          reference_number: null,
          subject: paper.subject.trim() || 'UNRECORDED PAPER',
          content: paper.subject.trim() || null,
          urgency: paper.urgency,
          // receiving_records.sender is NOT NULL in the current database schema.
          // Keep the field optional in the form, but use the logged-in account
          // as the database fallback when no sender was entered.
          sender: paper.sender.trim() || accountName,
          bearer: accountName,
          origin_office: null,
          current_office: null,
          destination_folder: null,
          date_received: receivedDate,
          received_at: new Date().toISOString(),
          created_by: user.id,
          status: 'available',
          custom_field_values: {
            ...paper.customFieldValues,
            _urgency: paper.urgency,
            _manually_entered_for_board_room: true,
            _is_unrecorded_paper: true,
            _record_kind: 'unrecorded_paper',
            _manual_entry_by: user.id,
            _manual_entry_by_name: accountName,
          },
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      if (!createdRecord?.id) throw new Error('The unrecorded paper was not created.')

      setCurrentAccountName(accountName)
      setManualUnrecordedPapers(current => current.map(item =>
        item.id === paperId
          ? {
              ...item,
              creating: false,
              createdRecordId: createdRecord.id,
            }
          : item
      ))

      // Automatically add the newly created unrecorded paper to the same
      // Selected Documents list as the records chosen from Receiving.
      setSelectedDocumentIds(current =>
        current.includes(createdRecord.id) ? current : [...current, createdRecord.id],
      )
      setDocumentUrgencies(current => ({
        ...current,
        [createdRecord.id]: paper.urgency,
      }))
      const activeGroup = storageGroups.find(group => group.id === activeStorageGroupId)
      if (activeGroup) {
        setDocumentStorageGroupIds(current => ({ ...current, [createdRecord.id]: activeGroup.id }))
        setDocumentStorageAssignments(current => ({
          ...current,
          [createdRecord.id]: { storageType: activeGroup.storageType, folderColor: activeGroup.folderColor, boxNumber: activeGroup.boxNumber },
        }))
      }

      setShowManualPaperForm(false)
      await loadData()
    } catch (err) {
      const errorMessage =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message || '')
          : err instanceof Error
            ? err.message
            : String(err || '')
      setError(errorMessage || 'Unable to create the unrecorded paper.')
      setManualUnrecordedPapers(current => current.map(item =>
        item.id === paperId ? { ...item, creating: false } : item
      ))
    }
  }

  async function cancelForwardingForm() {
    // Close the forwarding form first. Cleanup must never trap the user inside
    // the form if a draft cannot be deleted because of permissions or status.
    const draftIds = [...new Set(
      manualUnrecordedPapers
        .map(paper => paper.createdRecordId)
        .filter((id): id is string => Boolean(id)),
    )]

    setShowForm(false)
    setShowManualPaperForm(false)
    resetForm()

    let cleanupMessage = ''
    if (draftIds.length > 0) {
      const { data: deletedRows, error: deleteError } = await supabase
        .from('unrecorded_papers')
        .delete()
        .in('id', draftIds)
        .eq('status', 'available')
        .select('id')

      if (deleteError) {
        cleanupMessage = `The forwarding form was closed, but the newly created paper(s) could not be deleted: ${deleteError.message}`
      } else if ((deletedRows ?? []).length !== draftIds.length) {
        cleanupMessage = 'The forwarding form was closed, but one or more newly created papers were not deleted because their status changed or database permissions prevented deletion. Please refresh and review them.'
      }
    }

    await loadData()
    if (cleanupMessage) {
      setError(cleanupMessage)
      setSuccess('')
    } else {
      setError('')
      setSuccess(draftIds.length > 0
        ? 'Forwarding cancelled. Newly created unrecorded paper(s) were also cancelled.'
        : 'Forwarding cancelled.')
    }
  }

  async function handleForward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (selectedDocumentIds.length === 0 && manualUnrecordedPapers.length === 0) {
      setError('Select at least one document or add an unrecorded paper.')
      return
    }

    if (!transactionPerson.trim()) {
      setError('Enter the name of the person who brought the documents.')
      return
    }

    const missingStorageAssignment = selectedDocumentIds.find(id => {
      const assignment = documentStorageAssignments[id] ?? {
        storageType: 'folder' as const,
        folderColor: '',
        boxNumber: '',
      }
      return assignment.storageType === 'folder'
        ? !assignment.folderColor.trim()
        : !assignment.boxNumber.trim()
    })
    if (missingStorageAssignment) {
      const document = documents.find(item => item.id === missingStorageAssignment)
      const assignment = documentStorageAssignments[missingStorageAssignment]
      setError(
        assignment?.storageType === 'box'
          ? `Enter the Box Number for ${document?.reference_number || 'the selected document'}.`
          : `Select a Folder Color for ${document?.reference_number || 'the selected document'}.`,
      )
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
        'One or more selected documents have already been forwarded, released, or completed. Refresh and review your selection.',
      )
      return
    }

    setSaving(true)

    let claimedUnrecordedIds: string[] = []
    let workflowInserted = false

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!user) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      let forwardingDocumentIds = [...selectedDocumentIds]

      if (manualUnrecordedPapers.length > 0) {
        const uncreatedPaper = manualUnrecordedPapers.find(paper => !paper.createdRecordId)
        if (uncreatedPaper) {
          throw new Error('Create every unrecorded paper before forwarding.')
        }
        // Created papers are already in Selected Documents; de-duplicate IDs
        // so each paper receives exactly one Board Room workflow transaction.
        forwardingDocumentIds = [
          ...new Set([
            ...forwardingDocumentIds,
            ...manualUnrecordedPapers.map(paper => paper.createdRecordId as string),
          ]),
        ]
      }

      const { data: separatePaperRows, error: separatePaperLookupError } = await supabase
        .from('unrecorded_papers')
        .select('id')
        .in('id', forwardingDocumentIds)
      if (separatePaperLookupError) throw separatePaperLookupError
      const separatePaperIds = new Set((separatePaperRows ?? []).map((row: { id: string }) => row.id))

      // Re-check against the database at submission time. This blocks duplicate
      // forwarding even if the picker was left open while another user transacted the paper.
      const recordedIds = forwardingDocumentIds.filter(id => !separatePaperIds.has(id))
      const unrecordedIds = forwardingDocumentIds.filter(id => separatePaperIds.has(id))

      // A Board Room return is already a completed transaction even when it
      // has no document_workflow row. Never allow it back into Forwarding.
      if (unrecordedIds.length > 0) {
        const { data: unrecordedPaperStates, error: unrecordedStateError } = await supabase
          .from('unrecorded_papers')
          .select('id, status, custom_field_values')
          .in('id', unrecordedIds)
        if (unrecordedStateError) throw unrecordedStateError
        const unavailablePaper = (unrecordedPaperStates ?? []).some((paper: any) => {
          const metadata = paper.custom_field_values ?? {}
          const source = String(metadata._source ?? '').trim().toLowerCase()
          const status = String(paper.status ?? '').trim().toLowerCase().replace(/[\\s-]+/g, '_')
          return source === 'board_room_return' || status !== 'available'
        })
        if (unavailablePaper || (unrecordedPaperStates ?? []).length !== unrecordedIds.length) {
          await loadData()
          throw new Error('This unrecorded paper has already been forwarded or processed. It cannot be forwarded again.')
        }
      }

      // Board Room returns must be blocked for ALL papers, not only rows in
      // unrecorded_papers. Re-check recorded receiving records in the database
      // so stale picker state cannot bypass the rule.
      if (recordedIds.length > 0) {
        const { data: recordedPaperStates, error: recordedStateError } = await supabase
          .from('receiving_records')
          .select('id, status, custom_field_values')
          .in('id', recordedIds)
        if (recordedStateError) throw recordedStateError

        const returnedRecordedPaper = (recordedPaperStates ?? []).some((paper: any) => {
          const metadata = paper.custom_field_values ?? {}
          const source = String(metadata._source ?? '').trim().toLowerCase()
          const status = String(paper.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
          return source === 'board_room_return' || status === 'returned_to_origin'
        })
        if (returnedRecordedPaper || (recordedPaperStates ?? []).length !== recordedIds.length) {
          await loadData()
          throw new Error('This paper has already been returned by the Board Room. It cannot be forwarded again.')
        }
      }

      const duplicateChecks = await Promise.all([
        ...(recordedIds.length ? [supabase.from('document_workflow').select('id, receiving_record_id').in('receiving_record_id', recordedIds)] : []),
        ...(unrecordedIds.length ? [supabase.from('document_workflow').select('id, unrecorded_paper_id').in('unrecorded_paper_id', unrecordedIds)] : []),
      ])
      const duplicateCheckError = duplicateChecks.find(result => result.error)?.error
      if (duplicateCheckError) throw duplicateCheckError
      if (duplicateChecks.some(result => (result.data ?? []).length > 0)) {
        await loadData()
        throw new Error('This paper is already in a forwarding transaction. It cannot be forwarded again.')
      }
      // Atomically claim unrecorded papers BEFORE creating the workflow row.
      // A concurrent forwarding attempt can only update rows still marked available.
      if (unrecordedIds.length > 0) {
        const { data: claimedPapers, error: claimError } = await supabase
          .from('unrecorded_papers')
          .update({ status: 'forwarded' })
          .in('id', unrecordedIds)
          .eq('status', 'available')
          .select('id')

        if (claimError) throw claimError

        claimedUnrecordedIds = (claimedPapers ?? []).map((paper: { id: string }) => paper.id)
        if (claimedUnrecordedIds.length !== unrecordedIds.length) {
          if (claimedUnrecordedIds.length > 0) {
            await supabase
              .from('unrecorded_papers')
              .update({ status: 'available' })
              .in('id', claimedUnrecordedIds)
              .eq('status', 'forwarded')
          }
          claimedUnrecordedIds = []
          await loadData()
          throw new Error('This unrecorded paper has already been forwarded or processed. Refresh and review your selection.')
        }
      }

      const payload = forwardingDocumentIds.map(receivingRecordId => {
        const assignment = documentStorageAssignments[receivingRecordId] ?? {
          storageType: 'folder' as const,
          folderColor: '',
          boxNumber: '',
        }
        return {
        receiving_record_id: separatePaperIds.has(receivingRecordId) ? null : receivingRecordId,
        unrecorded_paper_id: separatePaperIds.has(receivingRecordId) ? receivingRecordId : null,
        transaction_person: transactionPerson.trim(),
        storage_type: assignment.storageType,
        folder_color:
          assignment.storageType === 'folder' ? assignment.folderColor.trim() : null,
        box_number: assignment.storageType === 'box' ? assignment.boxNumber.trim() : null,
        urgency: documentUrgencies[receivingRecordId] ?? 'not_urgent',
        forwarding_time: forwardingTime,
        forwarded_by: user.id,
        workflow_route: 'board_room',
        workflow_status: 'forwarded',
      }
      })

      const now = new Date()
      const forwardingDate = now.toISOString().slice(0, 10)
      const forwardingTimestamp = now.toISOString()
      const rowsToInsert = payload.map(row => ({
        ...row,
        forwarding_date: forwardingDate,
        forwarded_at: forwardingTimestamp,
      }))

      const { data: insertedRows, error: insertError } = await supabase
        .from('document_workflow')
        .insert(rowsToInsert)
        .select('id')

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('One or more papers are already in a forwarding transaction. Refresh and review your selection.')
        }
        throw insertError
      }
      const insertedCount = insertedRows?.length ?? 0
      workflowInserted = true

      const forwardedCount = insertedCount
      setSuccess(
        `${forwardedCount} document(s) forwarded successfully.`,
      )

      setShowForm(false)
      resetForm()
      await loadData()
    } catch (err) {
      // If the workflow insert failed after we claimed unrecorded papers,
      // restore only those claims made by this attempt.
      if (!workflowInserted && claimedUnrecordedIds.length > 0) {
        const { error: rollbackError } = await supabase
          .from('unrecorded_papers')
          .update({ status: 'available' })
          .in('id', claimedUnrecordedIds)
          .eq('status', 'forwarded')
        if (rollbackError) console.error('Unable to restore unrecorded-paper status:', rollbackError)
      }
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
      item => item.id === (workflow.unrecorded_paper_id || workflow.receiving_record_id),
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

      // Confirm only the originating office's physical receipt here.
      // Do NOT assign a releasing staff member during receipt confirmation.
      // Staff assignment is a separate action handled by
      // handleForwardToReleasingStaff after the user selects a staff member.
      const confirmedAt = new Date().toISOString()
      const { data: confirmedWorkflow, error: receiptError } = await supabase
        .from('document_workflow')
        .update({
          workflow_status: 'completed',
          origin_office_received_by: userResult.user.id,
          origin_office_received_at: confirmedAt,
          release_assigned_to: null,
          release_instruction: null,
          release_forwarded_at: null,
          release_forwarded_by: null,
        })
        .eq('id', workflow.id)
        .eq('workflow_status', 'returned_to_origin')
        .select('id')
        .maybeSingle()

      if (receiptError) throw receiptError
      if (!confirmedWorkflow) {
        throw new Error(
          'The document status has changed or receipt was already confirmed. Refresh the records and try again.',
        )
      }

      setSuccess(
        `Physical receipt confirmed for ${reference}. Next, select “Forward to Releasing Staff” and choose the staff member.`,
      )

      // Refresh the records after the inline confirmation action completes.
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

  // The staff member assigned by the Board Room must acknowledge physical
  // receipt from this Forwarding panel. Keep this separate from the
  // originating-office confirmation handled by handleConfirmReceipt.
  
  function hasForwardingStaffConfirmedBoardRoomReturn(document: ReceivingRecord) {
    const values = document.custom_field_values ?? {}
    return values._forwarding_receipt_confirmed === true &&
      Boolean(values._forwarding_receipt_confirmed_at) &&
      Boolean(values._forwarding_receipt_confirmed_by)
  }

  async function handleConfirmUnrecordedBoardRoomReceipt(document: ReceivingRecord) {
    if (!document.is_unrecorded_paper || hasForwardingStaffConfirmedBoardRoomReturn(document)) return

    setConfirmingReceiptId(document.id)
    setError('')
    setSuccess('')

    try {
      const { data: authResult, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authResult.user) throw new Error('Your session has expired. Please sign in again.')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, is_active')
        .eq('id', authResult.user.id)
        .maybeSingle()
      if (profileError) throw profileError
      if (profile?.is_active === false) throw new Error('Your account is inactive and cannot confirm receipt.')

      const confirmedAt = new Date().toISOString()
      const currentValues = document.custom_field_values ?? {}
      const updatedValues = {
        ...currentValues,
        _forwarding_receipt_confirmed: true,
        _forwarding_receipt_confirmed_at: confirmedAt,
        _forwarding_receipt_confirmed_by: authResult.user.id,
        _forwarding_receipt_confirmed_by_name: profile?.full_name?.trim() || authResult.user.email || 'Forwarding Staff',
      }

      const { data: updated, error: updateError } = await supabase
        .from('unrecorded_papers')
        .update({ custom_field_values: updatedValues })
        .eq('id', document.id)
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      if (!updated) throw new Error('The paper could not be confirmed. Refresh the page and try again.')

      setSuccess(`Receipt confirmed for ${document.reference_number || 'the unrecorded paper'}. It is now ready to be released to staff.`)
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to confirm Board Room receipt.'
      console.error('Unable to confirm unrecorded Board Room receipt:', err)
      setError(message)
    } finally {
      setConfirmingReceiptId(null)
    }
  }

  async function handleStartDirectRelease(
    document: ReceivingRecord,
    returnedWorkflow?: WorkflowRecord,
  ) {
    setError('')
    setSuccess('')

    // A returned paper becomes eligible for Releasing only after the
    // originating office confirms physical receipt. For workflow-backed
    // returns, origin_office_received_at is authoritative. For a separate
    // unrecorded_papers row, the confirmation metadata on that row is used.
    const isConfirmedUnrecordedReturn =
      Boolean(document.is_unrecorded_paper) &&
      hasForwardingStaffConfirmedBoardRoomReturn(document)

    const isConfirmedReturn =
      (Boolean(returnedWorkflow?.origin_office_received_at) &&
        returnedWorkflow?.workflow_status === 'completed' &&
        !returnedWorkflow.release_assigned_to) ||
      isConfirmedUnrecordedReturn

    // Do not reject a workflow-backed returned paper just because its linked
    // receiving_records copy does not carry the separate-table confirmation.
    if (
      document.is_unrecorded_paper &&
      !isConfirmedReturn
    ) {
      setError('Confirm receipt of this paper from the Board Room before releasing it to staff.')
      return
    }

    if (
      !isConfirmedReturn &&
      !availableDocuments.some(item => item.id === document.id)
    ) {
      setError('This paper already has a Board Room action or a confirmed releasing-staff assignment.')
      return
    }

    // Prefer the confirmed returned workflow. Otherwise reuse an old
    // unassigned direct-release draft or create a local-only draft.
    const existingDraft = returnedWorkflow ?? workflows.find(({ workflow }) =>
      (workflow.unrecorded_paper_id || workflow.receiving_record_id) === document.id &&
      workflow.workflow_route === 'direct_release' &&
      !workflow.release_assigned_to &&
      !workflow.release_received_at
    )?.workflow

    const now = new Date()
    const forwardingTimeValue = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const draft: WorkflowRecord = existingDraft ?? {
      id: `draft-release:${document.id}`,
      receiving_record_id: document.is_unrecorded_paper ? null : document.id,
      unrecorded_paper_id: document.is_unrecorded_paper ? document.id : null,
      transaction_person: document.sender || document.bearer || 'Direct release',
      storage_type: 'folder',
      folder_color: 'Other',
      box_number: null,
      urgency: String(document.urgency ?? '').toLowerCase() === 'urgent' ? 'urgent' : 'not_urgent',
      forwarding_date: now.toISOString().slice(0, 10),
      forwarding_time: forwardingTimeValue,
      forwarded_by: '',
      forwarded_at: now.toISOString(),
      workflow_route: 'direct_release',
      workflow_status: 'forwarded',
    }

    setReleaseStaff('')
    setReleaseStaffSearch('')
    setReleaseInstruction('For Release')
    setReleaseCustomInstruction('')
    setReleaseUrgency(draft.urgency)
    setReleaseAssignment(draft)
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
      setError('Please select an active releasing staff member from the search results.')
      return
    }

    // Re-check the account against Supabase before saving. This prevents an
    // account deactivated after the dropdown loaded from receiving an assignment.
    const { data: activeStaff, error: activeStaffError } = await supabase
      .from('profiles')
      .select('id, full_name, is_active')
      .eq('role', 'staff')
      .eq('is_active', true)
      .eq('full_name', releaseStaff)
      .limit(1)
      .maybeSingle()

    if (activeStaffError) {
      setError(`Unable to verify releasing staff status: ${activeStaffError.message}`)
      return
    }

    if (!activeStaff || activeStaff.is_active !== true) {
      setReleasingStaffOptions(current => current.filter(name => name !== releaseStaff))
      setReleaseStaff('')
      setReleaseStaffSearch('')
      setError('This staff account is inactive or no longer available. Select an active staff member.')
      return
    }

    const eligibleReleaseStatuses = ['forwarded', 'in_progress', 'completed']
    if (!eligibleReleaseStatuses.includes(releaseAssignment.workflow_status)) {
      setError('This paper cannot be forwarded to Releasing Staff from its current status. If it was returned to the originating office, confirm physical receipt first.')
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

      const releaseTimestamp = new Date().toISOString()
      const assignedDocumentId =
        releaseAssignment.unrecorded_paper_id ||
        releaseAssignment.receiving_record_id ||
        ''
      const isLocalDraft = releaseAssignment.id.startsWith('draft-release:')

      if (isLocalDraft) {
        const { error: insertError } = await supabase
          .from('document_workflow')
          .insert({
            receiving_record_id: releaseAssignment.receiving_record_id,
            unrecorded_paper_id: releaseAssignment.unrecorded_paper_id ?? null,
            transaction_person: releaseAssignment.transaction_person,
            storage_type: releaseAssignment.storage_type,
            folder_color: releaseAssignment.folder_color,
            box_number: releaseAssignment.box_number,
            urgency: releaseUrgency,
            forwarding_date: releaseAssignment.forwarding_date,
            forwarding_time: releaseAssignment.forwarding_time,
            forwarded_at: releaseAssignment.forwarded_at,
            forwarded_by: user.id,
            workflow_route: 'direct_release',
            workflow_status: 'forwarded',
            release_assigned_to: releaseStaff,
            release_instruction: instruction,
            release_forwarded_at: releaseTimestamp,
            release_forwarded_by: user.id,
          })

        if (insertError) throw insertError
      } else {
        const { data, error: updateError } = await supabase
          .from('document_workflow')
          .update({
            workflow_route: 'direct_release',
            release_assigned_to: releaseStaff,
            release_instruction: instruction,
            urgency: releaseUrgency,
            release_forwarded_at: releaseTimestamp,
            release_forwarded_by: user.id,
          })
          .eq('id', releaseAssignment.id)
          .in('workflow_status', ['forwarded', 'in_progress', 'completed'])
          .is('release_assigned_to', null)
          .select('id')
          .maybeSingle()

        if (updateError) throw updateError
        if (!data) {
          throw new Error(
            'The document was already assigned or its status changed. Refresh and try again.',
          )
        }
      }

      const document = documents.find(item => item.id === assignedDocumentId)

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

  const renderPickerDocumentCard = (document: ReceivingRecord) => {
    const isSelected = selectedDocumentIds.includes(document.id)
    const selectedUrgency = documentUrgencies[document.id] ?? 'not_urgent'

    // Explicit inline colors keep the selected card theme-correct even if
    // Tailwind utility ordering causes the light background to win.
    const isDarkTheme =
      window.document.documentElement.classList.contains('dark') ||
      window.document.body.classList.contains('dark') ||
      window.document.documentElement.getAttribute('data-theme') === 'dark' ||
      window.document.body.getAttribute('data-theme') === 'dark'

    return (
      <div
        key={document.id}
        style={
          isSelected
            ? { backgroundColor: isDarkTheme ? '#1e293b' : '#eff6ff' }
            : undefined
        }
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
          isSelected
            ? 'border-blue-500 ring-2 ring-blue-200 dark:border-sky-400 dark:ring-sky-500'
            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-600 dark:hover:bg-slate-800'
        }`}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleDocumentSelection(document.id)}
          className="mt-1 h-4 w-4 accent-blue-700"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-blue-800 dark:text-sky-300">
              {document.reference_number || 'No reference number'}
            </p>
            {isUnrecordedBoardRoomPaper(document) && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Unrecorded
              </span>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              selectedUrgency === 'urgent'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}>
              {selectedUrgency === 'urgent' ? 'Urgent' : 'Not Urgent'}
            </span>
          </div>
          <div
            className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-slate-600 dark:bg-slate-950/70"
            onClick={event => event.stopPropagation()}
          >
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Urgency
              </p>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-100">
                  <input
                    type="radio"
                    name={`picker-urgency-${document.id}`}
                    checked={selectedUrgency === 'urgent'}
                    onChange={() => setSelectedDocumentUrgency(document.id, 'urgent')}
                    className="accent-red-600"
                  />
                  <AlertTriangle size={13} className="text-red-600" /> Urgent
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-100">
                  <input
                    type="radio"
                    name={`picker-urgency-${document.id}`}
                    checked={selectedUrgency === 'not_urgent'}
                    onChange={() => setSelectedDocumentUrgency(document.id, 'not_urgent')}
                    className="accent-blue-700"
                  />
                  Not Urgent
                </label>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Assigned Storage Group</p>
              <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                {(() => {
                  const group = storageGroups.find(item => item.id === documentStorageGroupIds[document.id])
                  if (!group) return isSelected ? 'No storage group assigned' : `Will be assigned to ${storageGroups.find(item => item.id === activeStorageGroupId)?.name || 'active group'} when selected`
                  return group.storageType === 'folder' ? `${group.name} — Folder: ${group.folderColor || 'Choose color'}` : `${group.name} — Box: ${group.boxNumber || 'Enter number'}`
                })()}
              </p>
            </div>
          </div>
          <p className={`mt-3 break-words text-sm font-medium ${isSelected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'}`}>
            {document.content || document.subject || 'No subject'}
          </p>
          {/* Keep the forwarding picker focused on the document content only. */}
          <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {document.content || document.subject || 'No content provided'}
          </div>
        </div>
        {isSelected && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-100 px-2.5 py-2 text-xs font-semibold text-blue-800 dark:bg-blue-900/70 dark:text-blue-100">
            <Check size={14} /> Selected
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-green-500">
            PRESSYSTEM MANAGEMENT PORTAL
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Forwarding to Board Room
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Review documents received from Receiving and choose whether each goes to the Board Room or directly to Releasing Staff.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative">
            <button
              type="button"
              onClick={() => setUrgentNotificationsOpen(open => !open)}
              aria-label={`Urgent document notifications: ${urgentNotificationCount}`}
              aria-expanded={urgentNotificationsOpen}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-red-50 hover:text-red-700"
            >
              <Bell size={19} />
              {urgentNotificationCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {urgentNotificationCount > 99 ? '99+' : urgentNotificationCount}
                </span>
              )}
            </button>

            {urgentNotificationsOpen && (
              <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Urgent Notifications</h3>
                    <p className="text-xs text-slate-500">
                      {urgentNotificationCount} urgent incoming paper(s) · Receiving and Board Room
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUrgentNotificationsOpen(false)}
                    aria-label="Close urgent notifications"
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <X size={16} />
                  </button>
                </div>

                {urgentNotificationCount === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <CheckCircle2 className="mx-auto text-green-600" size={25} />
                    <p className="mt-2 text-sm font-semibold text-slate-800">No urgent notifications</p>
                    <p className="mt-1 text-xs text-slate-500">New urgent papers and urgent papers returned by the Board Room will appear here.</p>
                  </div>
                ) : (
                  <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                    {urgentReceivedDocuments.map(document => (
                      <div key={`new-${document.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-red-50/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900" title={document.reference_number ?? ''}>
                            PresOffice No.: {isUnrecordedBoardRoomPaper(document) ? 'UNRECORDED' : document.reference_number || '—'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300" title={document.system_code || ''}>
                            System Code: {document.system_code || '—'}
                          </p>
                          <p className="mt-1 text-[10px] text-red-700">{documentsWithWorkflowIds.has(document.id) ? 'Urgent · In workflow' : 'Urgent · Awaiting forwarding'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setViewingUrgentDocument(document); setUrgentNotificationsOpen(false) }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={13} /> View
                        </button>
                      </div>
                    ))}

                    {urgentReturnedWorkflows.map(({ workflow, document }) => (
                      <div key={`returned-${workflow.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900" title={document?.reference_number || ''}>
                            PresOffice No.: {isUnrecordedBoardRoomPaper(document) ? 'UNRECORDED' : document?.reference_number || '—'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300" title={document?.system_code || ''}>
                            System Code: {document?.system_code || '—'}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-amber-700">
                            {workflow.workflow_status === 'returned_to_origin'
                              ? 'Urgent · Returned by Board Room · Awaiting receipt'
                              : workflow.release_assigned_to
                                ? `Urgent · Assigned to ${workflow.release_assigned_to}`
                                : workflow.origin_office_received_at
                                  ? 'Urgent · Receipt confirmed · Awaiting forwarding'
                                  : 'Urgent · In workflow'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setViewingWorkflow({ workflow, document, recordedByName: profiles[workflow.forwarded_by] || workflow.forwarded_by })
                            setUrgentNotificationsOpen(false)
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={13} /> View
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setReturnedNotificationsOpen(open => !open)}
              aria-label={`Returned documents awaiting receipt: ${returnedAwaitingReceiptCount}`}
              aria-expanded={returnedNotificationsOpen}
              title="Returned documents awaiting receipt"
              className="relative inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 text-blue-800 shadow-sm transition hover:bg-blue-100 hover:text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/60"
            >
              <Undo2 size={18} />
              <span className="whitespace-nowrap text-xs font-semibold">Returned</span>
              {returnedAwaitingReceiptCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
                  {returnedAwaitingReceiptCount > 99 ? '99+' : returnedAwaitingReceiptCount}
                </span>
              )}
            </button>

            {returnedNotificationsOpen && (
              <div className="absolute right-0 z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Returned Documents</h3>
                    <p className="text-xs text-slate-500">
                      {returnedAwaitingReceiptCount} awaiting origin-office receipt
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReturnedNotificationsOpen(false)}
                    aria-label="Close returned documents"
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <X size={16} />
                  </button>
                </div>

                {returnedAwaitingReceiptCount === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <CheckCircle2 className="mx-auto text-green-600" size={25} />
                    <p className="mt-2 text-sm font-semibold text-slate-800">No returned documents awaiting receipt</p>
                    <p className="mt-1 text-xs text-slate-500">Documents returned by the Board Room will appear here until receipt is confirmed.</p>
                  </div>
                ) : (
                  <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                    {returnedAwaitingReceiptWorkflows.map(({ workflow, document, recordedByName }) => (
                      <div key={`returned-pending-${workflow.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900" title={document?.reference_number || ''}>
                            PresOffice No.: {isUnrecordedBoardRoomPaper(document) ? 'UNRECORDED' : document?.reference_number || '—'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300" title={document?.system_code || ''}>
                            System Code: {document?.system_code || '—'}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                            {document?.content || document?.subject || 'No subject provided'}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-blue-700">
                            Returned · Awaiting receipt confirmation
                          </p>
                          {workflow.returned_to_origin_at && (
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Returned: {formatDateTime(workflow.returned_to_origin_at)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setViewingWorkflow({ workflow, document, recordedByName })
                            setReturnedNotificationsOpen(false)
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={13} /> View
                        </button>
                      </div>
                    ))}
                    {returnedAwaitingReceiptUnrecordedDocuments.map(document => (
                      <div key={`returned-unrecorded-${document.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50/60">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900" title={document.reference_number || ''}>
                            PresOffice No.: {isUnrecordedBoardRoomPaper(document) ? 'UNRECORDED' : document.reference_number || '—'}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-600">
                            System Code: {document.system_code || '—'}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-600">
                            {document.content || document.subject || 'Unrecorded paper returned by Board Room'}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-blue-700">
                            Unrecorded Board Room return · Awaiting receipt confirmation
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setError('')
              setSuccess('')
              setShowForm(true)
            }}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={17} />
            Forward Documents
          </button>
        </div>
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


      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
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
                  : `${totalTableRows} total records · ${filteredWorkflows.length} Board Room transactions · ${filteredUntouchedDocuments.length} unrecorded returns`}
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
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-900"
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

        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1450px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                {[
                  'No.',
                  'PresOffice No.',
                  'Content / Subject',
                  'Transaction Person / Storage',
                  'Urgency',
                  'Forwarded',
                  'Workflow Status',
                  'Return Remarks',
                  'Releasing Staff / Release Instruction',
                  'Action',
                ].map(label => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    Loading forwarding records...
                  </td>
                </tr>
              ) : totalTableRows === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    {workflows.length === 0 && filteredUntouchedDocuments.length === 0
                      ? 'No Board Room transactions or unrecorded Board Room returns found.'
                      : 'No matching Board Room transactions or unrecorded returns found.'}
                  </td>
                </tr>
              ) : (
                <>
                {visibleUntouchedDocuments
                  .map((document, index) => (
                    <tr key={`untouched-${document.id}`} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-500">{pageStart + index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span>{document.reference_number || '—'}</span>
                          {isUnrecordedBoardRoomPaper(document) && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Unrecorded
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[240px] px-4 py-3.5 text-xs text-slate-700 dark:text-slate-200" title={document.content || document.subject || ''}>
                        <span className="block truncate">{document.content || document.subject || document.system_code || '—'}</span>
                        <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{document.system_code || ''}</span>
                      </td>
                      <td className="min-w-[190px] px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Origin / Sender</p>
                        <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{document.origin_office || document.sender || document.bearer || '—'}</p>
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{'Returned by Board Room'}</p>
                      </td>
                      <td className="px-4 py-3.5"><UrgencyBadge urgency={document.urgency} /></td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">—</td>
                      <td className="px-4 py-3.5"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${document.is_unrecorded_paper && !hasForwardingStaffConfirmedBoardRoomReturn(document) ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{document.is_unrecorded_paper ? (hasForwardingStaffConfirmedBoardRoomReturn(document) ? 'Returned to origin · Receipt confirmed' : 'Returned to origin') : 'Received · No action'}</span></td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">—</td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        <div className="space-y-1">
                          <p className="font-medium">Not assigned</p>
                          <p className="text-[10px] text-slate-400">No release instruction yet</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex min-w-[250px] flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingUrgentDocument(document)}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            <Eye size={14} /> View
                          </button>
                          {document.is_unrecorded_paper && !hasForwardingStaffConfirmedBoardRoomReturn(document) ? (
                            <button
                              type="button"
                              onClick={() => void handleConfirmUnrecordedBoardRoomReceipt(document)}
                              disabled={confirmingReceiptId === document.id || loading}
                              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {confirmingReceiptId === document.id ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              {confirmingReceiptId === document.id ? 'Confirming...' : 'Confirm Receipt'}
                            </button>
                          ) : document.is_unrecorded_paper ? (
                            <button
                              type="button"
                              onClick={() => void handleStartDirectRelease(document)}
                              disabled={savingReleaseAssignment || loading}
                              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Send size={14} /> Release to Staff
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleStartDirectRelease(document)}
                              disabled={savingReleaseAssignment || loading}
                              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Send size={14} /> Release to Staff
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                {visibleWorkflows.map(
                  ({ workflow, document, recordedByName }, index) => (
                    <tr
                      key={workflow.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-500">
                        {filteredUntouchedDocuments.length + workflowPageStart + index + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{document?.reference_number || '—'}</span>
                          {isUnrecordedBoardRoomPaper(document) && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Unrecorded
                            </span>
                          )}
                        </div>
                      </td>

                      <td
                        className="max-w-[240px] px-4 py-3.5 text-xs text-slate-700 dark:text-slate-200"
                        title={document?.system_code || ''}
                      >
                        <span className="block truncate">
                          {document?.system_code || '—'}
                        </span>
                      </td>

                      <td className="min-w-[190px] px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        <div className="space-y-1.5">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Transaction Person
                            </p>
                            <p className="mt-0.5 font-medium text-slate-800">
                              {workflow.transaction_person || '—'}
                            </p>
                          </div>
                          <div className="border-t border-slate-100 pt-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Storage
                            </p>
                            <p className="mt-0.5">{getStorageLabel(workflow)}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <UrgencyBadge urgency={workflow.urgency || document?.urgency} />
                      </td>

                      <td className="min-w-[190px] px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-800">
                            {formatDate(workflow.forwarding_date)}
                          </p>
                          <p className="inline-flex items-center gap-1.5 text-slate-500">
                            <Clock size={12} />
                            {formatTime(workflow.forwarding_time)}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Forwarded by: <span className="font-semibold text-slate-700">{profiles[workflow.forwarded_by] || recordedByName || 'Account name unavailable'}</span>
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                            workflow.workflow_route === 'direct_release' && !workflow.release_received_at
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              : statusClass(workflow.workflow_status)
                          }`}
                        >
                          {workflow.workflow_route === 'direct_release' && !workflow.release_received_at
                            ? 'Received - No action'
                            : <>
                                {workflow.workflow_status === 'completed' && (
                                  <CheckCircle2 size={12} className="mr-1" />
                                )}
                                {workflow.origin_office_received_at &&
                                  workflow.workflow_status === 'completed' &&
                                  !workflow.release_assigned_to
                                  ? 'Receipt Confirmed · Ready for Releasing'
                                  : displayStatus(workflow.workflow_status)}
                              </>}
                        </span>
                        {workflow.board_room_received_at && (
                          <div className="mt-2 min-w-[150px] space-y-1 text-[10px] text-slate-500">
                            <p>Receipt confirmed by: {workflow.board_room_received_by ? (profiles[workflow.board_room_received_by] || workflow.board_room_received_by) : '—'}</p>
                            <p>At: {formatDateTime(workflow.board_room_received_at)}</p>
                          </div>
                        )}
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

                            {workflow.returned_to_origin_by && (
                              <p className="text-[10px] text-slate-500">
                                Processed by: {profiles[workflow.returned_to_origin_by] || workflow.returned_to_origin_by}
                              </p>
                            )}
                            {workflow.returned_to_origin_at && (
                              <p className="text-[10px] text-slate-500">
                                Returned at: {formatDateTime(workflow.returned_to_origin_at)}
                              </p>
                            )}

                            {workflow.origin_office_received_by && (
                              <p className="text-[10px] text-slate-600">
                                Receipt confirmed by:{' '}
                                <span className="font-semibold text-slate-800">
                                  {profiles[workflow.origin_office_received_by] ||
                                    workflow.origin_office_received_by}
                                </span>
                              </p>
                            )}

                            {workflow.origin_office_received_at && (
                              <p className="text-[10px] text-slate-500">
                                Confirmed at: {formatDateTime(workflow.origin_office_received_at)}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <UrgencyBadge urgency={workflow.urgency || document?.urgency} />
                              <StorageBadge workflow={workflow} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="max-w-[260px] px-4 py-3.5 text-xs text-slate-700 dark:text-slate-200">
                        <div className="space-y-1">
                          {workflow.release_assigned_to ? (
                            <>
                              <p className="font-semibold">{workflow.release_assigned_to}</p>
                              {workflow.release_forwarded_at && (
                                <p className="text-[10px] text-slate-400">
                                  Forwarded: {new Date(workflow.release_forwarded_at).toLocaleString('en-PH')}
                                </p>
                              )}
                              {workflow.release_received_at ? (
                                <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400">
                                  <CheckCircle2 size={12} /> Received: {formatDateTime(workflow.release_received_at)}
                                </p>
                              ) : (
                                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">Awaiting staff confirmation</p>
                              )}
                            </>
                          ) : (
                            <p className="text-slate-400">Not assigned</p>
                          )}
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {workflow.release_instruction || 'No release instruction yet'}
                          </p>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex min-w-[180px] flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setViewingWorkflow({ workflow, document, recordedByName })
                            }
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            <Eye size={14} />
                            View
                          </button>
                          {workflow.release_assigned_to ? (
                          workflow.release_received_at ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-green-700">
                              <CheckCircle2 size={14} />
                              Receipt Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-amber-700">
                              <Clock size={13} />
                              Assigned · Awaiting Staff
                            </span>
                          )
                        ) : workflow.workflow_status === 'returned_to_origin' ? (
                          <button
                            type="button"
                            onClick={() => void handleConfirmReceipt(workflow)}
                            disabled={confirmingReceiptId === workflow.id}
                            aria-busy={confirmingReceiptId === workflow.id}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {confirmingReceiptId === workflow.id ? (
                              <>
                                <LoaderCircle size={14} className="animate-spin" />
                                Confirming...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={14} />
                                Confirm Receipt
                              </>
                            )}
                          </button>
                        ) : workflow.origin_office_received_at &&
                          workflow.workflow_status === 'completed' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (document) void handleStartDirectRelease(document, workflow)
                            }}
                            disabled={savingReleaseAssignment || loading}
                            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Send size={14} />
                            Release to Staff
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                        </div>
                      </td>
                    </tr>
                  ),
                )}
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {totalTableRows === 0 ? 'Showing 0 papers' : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, totalTableRows)} of ${totalTableRows} papers`} · 10 rows per page
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={safeCurrentPage <= 1} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">Previous</button>
            <span className="min-w-[100px] text-center text-xs font-semibold text-slate-600 dark:text-slate-300">Page {safeCurrentPage} of {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={safeCurrentPage >= totalPages} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">Next</button>
          </div>
        </div>
      </section>

      {/* View full details for an urgent paper that has not entered forwarding yet. */}
      {viewingUrgentDocument && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="urgent-document-title" className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <h3 id="urgent-document-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">Urgent Document Details</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{viewingUrgentDocument.reference_number || 'Document'}</p>
              </div>
              <button type="button" onClick={() => setViewingUrgentDocument(null)} aria-label="Close document details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
              {[
                ['PresOffice No.', viewingUrgentDocument.reference_number],
                ['System Code / Subject', viewingUrgentDocument.content || viewingUrgentDocument.subject],
                ['Sender', viewingUrgentDocument.sender],
                ['Bearer', viewingUrgentDocument.bearer],
                ['Origin Office', viewingUrgentDocument.origin_office],
                ['Current Office', resolveOfficeFolderName(viewingUrgentDocument.current_office, officeFolderNames)],
                ['Destination Folder', resolveOfficeFolderName(viewingUrgentDocument.destination_folder, officeFolderNames)],
                ['Date Received', viewingUrgentDocument.date_received ? formatDate(viewingUrgentDocument.date_received) : null],
                ['Urgency', viewingUrgentDocument.urgency],
                ['Status', viewingUrgentDocument.status],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value || '—'}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-slate-200 p-5">
              <button type="button" onClick={() => setViewingUrgentDocument(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </div>
          </section>
        </div>
      )}

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
                <h3 id="forwarding-details-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Document Details
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
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
                  ['PresOffice Number', viewingWorkflow.document?.reference_number],
                  ['System Code', viewingWorkflow.document?.system_code],
                  ['Content / Subject', viewingWorkflow.document?.subject || viewingWorkflow.document?.content],
                  ['Sender', viewingWorkflow.document?.sender],
                  ['Bearer', viewingWorkflow.document?.bearer],
                  ['Origin Office', displayOfficeName(viewingWorkflow.document?.origin_office)],
                  ['Current Office', resolveOfficeFolderName(viewingWorkflow.document?.current_office, officeFolderNames)],
                  ['Destination Folder', resolveOfficeFolderName(viewingWorkflow.document?.destination_folder, officeFolderNames)],
                  ...viewDestinationFields.map(field => {
                    const customValues = viewingWorkflow.document?.custom_field_values
                    const rawValue = customValues
                      ? Object.prototype.hasOwnProperty.call(customValues, field.id)
                        ? customValues[field.id]
                        : customValues[field.field_name]
                      : undefined
                    const value =
                      rawValue === null || rawValue === undefined
                        ? ''
                        : typeof rawValue === 'object'
                          ? JSON.stringify(rawValue)
                          : String(rawValue)
                    return [field.field_name, value] as [string, string]
                  }),
                  ['Date Received', viewingWorkflow.document?.date_received ? formatDate(viewingWorkflow.document.date_received) : null],
                  ['Urgency', displayStatus(String(viewingWorkflow.document?.urgency ?? viewingWorkflow.workflow.urgency ?? 'not_urgent'))],
                  ['Remarks', viewingWorkflow.document?.remarks],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value || '—'}</p>
                  </div>
                ))}
              </div>

              {viewDestinationFieldsLoading && (
                <p className="text-xs text-slate-500">Loading destination-specific fields...</p>
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
                <h3 id="release-assignment-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Forward to Releasing Staff
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
Choose an active Releasing Staff member. Nothing is saved until you click Forward Document; Cancel leaves this paper available for Board Room forwarding.
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
                    item => item.id === (releaseAssignment.unrecorded_paper_id || releaseAssignment.receiving_record_id),
                  )?.reference_number || '—'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {documents.find(
                    item => item.id === (releaseAssignment.unrecorded_paper_id || releaseAssignment.receiving_record_id),
                  )?.content ||
                    documents.find(
                      item => item.id === (releaseAssignment.unrecorded_paper_id || releaseAssignment.receiving_record_id),
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

              <fieldset>
                <legend className="text-xs font-semibold text-slate-600">Urgency *</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="release-urgency"
                      checked={releaseUrgency === 'urgent'}
                      onChange={() => setReleaseUrgency('urgent')}
                      className="accent-red-600"
                    />
                    <AlertTriangle size={15} className="text-red-600" />
                    Urgent
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="release-urgency"
                      checked={releaseUrgency === 'not_urgent'}
                      onChange={() => setReleaseUrgency('not_urgent')}
                      className="accent-blue-700"
                    />
                    Not Urgent
                  </label>
                </div>
                <div className="mt-2">
                  <UrgencyBadge urgency={releaseUrgency} />
                </div>
              </fieldset>

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
                This assignment is saved only after you click Forward Document. If you cancel, the paper remains available under Forward Documents for Board Room forwarding.
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
            className="my-auto flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3
                  id="forwarding-form-title"
                  className="text-lg font-bold text-slate-900 dark:text-slate-100"
                >
                  Forward Documents to Board Room
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
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

            <form onSubmit={handleForward} className="grid min-h-0 grid-cols-1 gap-5 overflow-y-auto p-6 xl:grid-cols-2">
              <div className="grid grid-cols-1 items-start gap-5 xl:col-span-2 xl:grid-cols-2">
              <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-700 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Unrecorded Papers</h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Add an unrecorded paper. It is stored separately from Receiving Records. Enter only its Content.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualPaperForm(true)
                      setManualUnrecordedPapers(current => [...current, {
                        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        referenceNumber: '',
                        subject: '',
                        urgency: 'not_urgent',
                        sender: '',
                        originOffice: '',
                        destinationFolder: '',
                        destinationFields: [],
                        customFieldValues: {},
                      }])
                      if (!currentAccountName) {
                        void supabase.auth.getUser().then(async ({ data }) => {
                          if (!data.user) return
                          const { data: profile } = await supabase
                            .from('profiles')
                            .select('full_name')
                            .eq('id', data.user.id)
                            .maybeSingle()
                          setCurrentAccountName(String(profile?.full_name ?? '').trim())
                        })
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                  >
                    <Plus size={14} /> Add Unrecorded Paper
                  </button>
                </div>

                {showManualPaperForm && manualUnrecordedPapers.some(paper => !paper.createdRecordId) && (
                  <div className="mt-3 space-y-3">
                    {manualUnrecordedPapers.filter(paper => !paper.createdRecordId).map((paper, index) => (
                      <div key={paper.id} className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-800 dark:bg-slate-900">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Unrecorded Paper {index + 1}</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (paper.createdRecordId) {
                                setSelectedDocumentIds(current =>
                                  current.filter(id => id !== paper.createdRecordId),
                                )
                                setDocumentUrgencies(current => {
                                  const next = { ...current }
                                  delete next[paper.createdRecordId as string]
                                  return next
                                })
                              }
                              setManualUnrecordedPapers(current =>
                                current.filter(item => item.id !== paper.id),
                              )
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove unrecorded paper ${index + 1}`}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Content *</label>
                          <textarea
                            rows={4}
                            required
                            value={paper.subject}
                            onChange={event => updateManualPaper(paper.id, { subject: event.target.value })}
                            placeholder="Enter the unrecorded paper content"
                            className={inputClass}
                          />
                        </div>
                        <div className="mt-3">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Urgency *</label>
                          <select
                            value={paper.urgency}
                            onChange={event => updateManualPaper(paper.id, { urgency: event.target.value as 'urgent' | 'not_urgent' })}
                            className={inputClass}
                          >
                            <option value="not_urgent">Not Urgent</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-amber-100 pt-3 dark:border-amber-900">
                          {paper.createdRecordId ? (
                            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">This paper is saved separately and ready to forward.</p>
                          ) : (
                            <p className="text-xs text-slate-500">Enter the content, then create this paper.</p>
                          )}
                          <button
                            type="button"
                            disabled={Boolean(paper.creating || paper.createdRecordId)}
                            onClick={() => void createManualUnrecordedPaper(paper.id)}
                            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {paper.creating ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {paper.creating ? 'Creating...' : paper.createdRecordId ? 'Created' : 'Create Paper'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

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
                      <p className="mt-1 text-xs text-blue-600">
                        Review your list before forwarding.
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-700 px-3 py-1.5 text-sm font-bold text-white">
                      {selectedDocumentIds.length}
                    </span>
                  </div>

                  <div className="mt-3">
                    <label className="sr-only" htmlFor="selected-documents-search">Search selected documents</label>
                    <div className="relative">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="selected-documents-search"
                        type="search"
                        value={selectedDocumentSearch}
                        onChange={event => setSelectedDocumentSearch(event.target.value)}
                        placeholder="Search PresOffice No., subject, urgency, or storage..."
                        className="w-full rounded-lg border border-blue-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  {selectedDocuments.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      No documents selected yet.
                    </p>
                  ) : filteredSelectedDocuments.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
                      No selected documents match your search.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-white">
                      <div className="max-h-[360px] overflow-auto">
                        <table className="w-full min-w-[440px] border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-blue-100 text-[10px] uppercase tracking-wide text-blue-900 shadow-sm">
                            <tr>
                              <th className="px-3 py-2.5 font-bold">PresOffice No.</th>
                              <th className="px-3 py-2.5 font-bold">Urgency</th>
                              <th className="px-3 py-2.5 font-bold">Storage</th>
                              <th className="w-10 px-2 py-2.5 text-center font-bold"> </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {visibleSelectedDocuments.map(document => {
                              const assignment = documentStorageAssignments[document.id]
                              const urgency = documentUrgencies[document.id] ?? 'not_urgent'
                              const assignedGroup = storageGroups.find(group => group.id === documentStorageGroupIds[document.id])
                              const storageLabel = !assignment
                                ? 'Not assigned'
                                : `${assignedGroup?.name ? `${assignedGroup.name} — ` : ''}${assignment.storageType === 'folder' ? `Folder: ${assignment.folderColor || 'Select color'}` : `Box: ${assignment.boxNumber || 'Enter number'}`}`

                              return (
                                <tr key={document.id} className="hover:bg-blue-50/70">
                                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">
                                    <div className="flex items-center gap-2">
                                      <span>{document.reference_number}</span>
                                      {isUnrecordedBoardRoomPaper(document) && (
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                                          Unrecorded
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                      urgency === 'urgent'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 font-medium text-blue-800">
                                    {storageLabel}
                                  </td>
                                  <td className="px-2 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => toggleDocumentSelection(document.id)}
                                      aria-label={`Remove ${document.reference_number}`}
                                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                    >
                                      <X size={15} />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-100 bg-white px-3 py-2 text-[11px] text-slate-500">
                        <span>
                          Showing {(safeSelectedDocumentsPage - 1) * selectedDocumentsPageSize + 1}–{Math.min(safeSelectedDocumentsPage * selectedDocumentsPageSize, filteredSelectedDocuments.length)} of {filteredSelectedDocuments.length} documents · 10 per page
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={safeSelectedDocumentsPage <= 1}
                            onClick={() => setSelectedDocumentsPage(page => Math.max(1, page - 1))}
                            className="rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <span className="tabular-nums">Page {safeSelectedDocumentsPage} of {selectedDocumentsTotalPages}</span>
                          <button
                            type="button"
                            disabled={safeSelectedDocumentsPage >= selectedDocumentsTotalPages}
                            onClick={() => setSelectedDocumentsPage(page => Math.min(selectedDocumentsTotalPages, page + 1))}
                            className="rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
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

              </div>

              <div className="xl:col-span-2">
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


              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-2">
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

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 xl:col-span-2">
                <p className="text-xs font-semibold text-slate-600">
                  Recorded By
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  Automatically assigned from the authenticated Supabase
                  account.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between xl:col-span-2">
                <p className="self-center text-sm font-semibold text-slate-600">
                  {selectedDocumentIds.length} document(s) selected
                </p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void cancelForwardingForm()}
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
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3
                        id="document-picker-title"
                        className="text-lg font-bold text-slate-900 dark:text-slate-100"
                      >
                        Select Documents to Forward
                      </h3>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Check multiple documents to forward them as a group.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocumentPickerOpen(false)}
                      aria-label="Close document search"
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
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
                      className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-900"
                    />
                  </div>

                  <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-indigo-950 dark:text-indigo-200">Storage Groups</p>
                        <p className="text-xs text-indigo-700 dark:text-indigo-300">Choose a storage group first. Matching storage locations automatically share one group.</p>
                      </div>
                      <button type="button" onClick={addStorageGroup} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800">
                        <Plus size={14} /> Add Storage Group
                      </button>
                    </div>
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {storageGroups.map((group, index) => {
                        const assignedCount = Object.values(documentStorageGroupIds).filter(id => id === group.id).length
                        const isActive = activeStorageGroupId === group.id
                        return (
                          <button key={group.id} type="button" onClick={() => setActiveStorageGroupId(group.id)} className={`min-w-[170px] rounded-lg border p-3 text-left transition ${isActive ? 'border-indigo-600 bg-white ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-slate-900 dark:ring-indigo-900' : 'border-indigo-200 bg-indigo-100/70 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70'}`}>
                            <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">{group.name || `Storage Group ${index + 1}`}</span>
                            <span className="mt-1 block text-[11px] text-slate-600 dark:text-slate-300">{group.storageType === 'folder' ? `Folder: ${group.folderColor || 'Choose color'}` : `Box: ${group.boxNumber || 'Enter number'}`}</span>
                            <span className="mt-1 block text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">{assignedCount} document(s)</span>
                            {isActive && <span className="mt-1 inline-block text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">Active</span>}
                          </button>
                        )
                      })}
                    </div>
                    {storageGroups.find(group => group.id === activeStorageGroupId) && (() => {
                      const group = storageGroups.find(item => item.id === activeStorageGroupId)!
                      return (
                        <div className="mt-3 grid gap-3 rounded-lg border border-indigo-200 bg-white p-3 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900">
                          <div>
                            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Storage Type</label>
                            <div className="mt-2 flex gap-4">
                              <label className="flex items-center gap-1.5 text-xs font-medium"><input type="radio" checked={group.storageType === 'folder'} onChange={() => updateStorageGroup(group.id, { storageType: 'folder' })} /> Folder</label>
                              <label className="flex items-center gap-1.5 text-xs font-medium"><input type="radio" checked={group.storageType === 'box'} onChange={() => updateStorageGroup(group.id, { storageType: 'box' })} /> Box</label>
                            </div>
                          </div>
                          {group.storageType === 'folder' ? (
                            <div>
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Folder Color *</label>
                              <select value={group.folderColor} onChange={event => updateStorageGroup(group.id, { folderColor: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
                                <option value="">Select folder color...</option>
                                {folderColors.map(color => <option key={color} value={color}>{color} Folder</option>)}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Box Number *</label>
                              <input value={group.boxNumber} onChange={event => updateStorageGroup(group.id, { boxNumber: event.target.value })} placeholder="Enter box number" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/50">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-blue-800 dark:text-sky-300">
                          {selectedDocumentIds.length} document(s) selected
                        </p>
                        <p className="text-xs text-blue-600 dark:text-slate-300">
                          {filteredPickerDocuments.length} document(s) match this search
                        </p>
                      </div>
                      <button
                      type="button"
                      onClick={toggleAllFilteredDocuments}
                      disabled={filteredPickerDocuments.length === 0}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
                    >
                        {allFilteredSelected
                          ? 'Deselect Search Results'
                          : 'Select All Search Results'}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-red-800 dark:bg-red-950/70 dark:text-red-300">
                        <AlertTriangle size={12} />
                        {selectedDocuments.filter(document => (documentUrgencies[document.id] ?? 'not_urgent') === 'urgent').length} selected urgent
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-1 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                        <FileText size={12} />
                        {selectedDocuments.filter(document => (documentUrgencies[document.id] ?? 'not_urgent') === 'not_urgent').length} selected not urgent
                      </span>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3 dark:bg-slate-950">
                  {filteredPickerDocuments.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileSearch size={36} className="mx-auto text-slate-400 dark:text-slate-600" />
                      <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">No matching documents found</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Try a different search term or check whether the documents have already been forwarded.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredPickerDocuments.map(renderPickerDocumentCard)}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {selectedDocumentIds.length} selected
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedDocumentIds([]); setDocumentUrgencies({}); setDocumentStorageAssignments({}); setDocumentStorageGroupIds({}) }}
                      disabled={selectedDocumentIds.length === 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
 