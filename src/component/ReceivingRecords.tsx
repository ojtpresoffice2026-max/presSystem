import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  RefreshCw,
  Eye,
  Plus,
  X,
  FileText,
  Pencil,
  Save,
  Ban,
  ChevronDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import AuditHistory from './AuditHistory'

type ReceivingRecord = {
  id: string
  reference_number: string
  record_type: string | null
  subject: string | null
  sender: string | null
  description: string | null
  system_code: string | null
  bearer: string | null
  content: string | null
  destination_folder: string | null
  receiving_staff: string | null
  date_received: string | null
  received_at: string | null
  status: string | null
  current_office: string | null
  remarks: string | null
  created_at: string | null
  created_by: string | null
  urgency?: string | boolean | null
  is_urgent?: boolean | null
  office_designation: string | null
  date_of_letter: string | null
  other_notes_remarks: string | null
  origin_office: string | null
  payee: string | null
  document_type: string | null
  amount_peso: number | string | null
  document_code: string | null
  ors_burs_amount: number | string | null
  dv_amount: number | string | null
  check_amount: number | string | null
  campus: string | null
  document_date: string | null
  batch_no: string | null
  total_amount: number | string | null
  norsa_type: string | null
  serial_number: string | null
  amount_to_adjust: number | string | null
  adjusted_amount: number | string | null
  [key: string]: unknown
}

type WorkflowTimelineRow = {
  id: string
  release_assigned_to: string | null
  release_instruction: string | null
  release_forwarded_at: string | null
  release_forwarded_by: string | null
  workflow_status: string | null
  release_received_at: string | null
  release_received_by: string | null
  next_action_office_to_forward: string | null
  next_action_release_to: string | null
  next_action_release_at: string | null
  next_action_system_status: string | null
  next_action_date_forwarded: string | null
  next_action_recorded_by: string | null
  next_action_recorded_by_name: string | null
}

type EditableRecord = {
  reference_number: string
  system_code: string
  content: string
  bearer: string
  receiving_staff: string
  destination_folder: string
  date_received: string
  status: string
  remarks: string
  urgency: string
}

type SortField =
  | 'reference_number'
  | 'system_code'
  | 'content'
  | 'bearer'
  | 'receiving_staff'
  | 'destination_folder'
  | 'date_received'
  | 'status'
  | 'urgency'

const DESTINATION_FOLDERS = [
  'CAFF',
  'CTED',
  'CAS',
  'CBA',
  'CTHM',
  'CCJE',
  'CEA',
  'CNPAHS',
  'CIT',
  'COL',
  'GS',
  'BAIS',
  'SIATION',
  'MABINAY',
  'GUIHULNGAN',
  'BAYAWAN',
  'LDDAP',
  'ORS/BURS',
  'DV MAIN',
  'DV BAIS',
  'DV BAYAWAN',
  'DV GUIHULNGAN',
  'DV MABINAY',
  'DV SIATION',
  'PACSVAL',
  'NORSA/NBURSA',
]

const SPECIAL_DESTINATIONS = [
  'BAIS',
  'SIATION',
  'MABINAY',
  'GUIHULNGAN',
  'BAYAWAN',
]

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

const tableColumns: { label: string; field: SortField }[] = [
  { label: 'PresOffice No.', field: 'reference_number' },
  { label: 'Code', field: 'system_code' },
  { label: 'Content / Subject', field: 'content' },
  { label: 'Bearer / Datetime / Received by', field: 'bearer' },
  { label: 'Inputed by', field: 'receiving_staff' },
  { label: 'Urgency', field: 'urgency' },
  { label: 'Destination', field: 'destination_folder' },
  { label: 'Status', field: 'status' },
]

function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  const amount = Number(value)

  if (!Number.isFinite(amount)) {
    return String(value)
  }

  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function valueOrDash(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00`)

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

function displayStatus(status: string | null) {
  return (status || 'unknown').replaceAll('_', ' ')
}

export default function ReceivingRecords() {
  const navigate = useNavigate()

  const [records, setRecords] = useState<ReceivingRecord[]>([])

  // General record search
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  // Searchable destination folder dropdown
  const [selectedFolder, setSelectedFolder] = useState('ALL')
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false)
  const [folderDropdownSearch, setFolderDropdownSearch] = useState('')

  const filteredFolderOptions = useMemo(
    () =>
      DESTINATION_FOLDERS.filter(folder =>
        folder
          .toLowerCase()
          .includes(folderDropdownSearch.trim().toLowerCase()),
      ),
    [folderDropdownSearch],
  )

  const [selected, setSelected] = useState<ReceivingRecord | null>(null)
  const [draft, setDraft] = useState<EditableRecord | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editFolderDropdownOpen, setEditFolderDropdownOpen] = useState(false)
  const [editFolderSearch, setEditFolderSearch] = useState('')

  const editFolderOptions = useMemo(() => {
    const currentFolder = draft?.destination_folder?.trim() ?? ''
    const options = currentFolder && !DESTINATION_FOLDERS.some(
      folder => folder.toLowerCase() === currentFolder.toLowerCase(),
    )
      ? [currentFolder, ...DESTINATION_FOLDERS]
      : DESTINATION_FOLDERS

    const term = editFolderSearch.trim().toLowerCase()
    return options.filter(folder => folder.toLowerCase().includes(term))
  }, [draft?.destination_folder, editFolderSearch])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [success, setSuccess] = useState('')
  const [copyToast, setCopyToast] = useState<{ text: string; x: number; y: number } | null>(null)

  // Creator profile details displayed in the record modal.
  const [creatorName, setCreatorName] = useState('')
  const [accountNames, setAccountNames] = useState<Record<string, string>>({})
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null)
  const [creatorLoading, setCreatorLoading] = useState(false)
  const [timelineRows, setTimelineRows] = useState<WorkflowTimelineRow[]>([])
  const [timelineAccountNames, setTimelineAccountNames] = useState<Record<string, string>>({})
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState('')

  const [sortField, setSortField] =
    useState<SortField>('date_received')
  const [sortDirection, setSortDirection] =
    useState<'asc' | 'desc'>('desc')

  async function copyRecordValue(
    event: MouseEvent<HTMLButtonElement>,
    value: string | null | undefined,
    label: string,
  ) {
    const text = value?.trim()
    if (!text || text === '—') return

    try {
      await navigator.clipboard.writeText(text)
      const x = Math.min(event.clientX + 12, window.innerWidth - 210)
      const y = Math.min(event.clientY + 14, window.innerHeight - 60)
      setCopyToast({ text: `Copied ${label}: ${text}`, x: Math.max(8, x), y: Math.max(8, y) })
      window.setTimeout(() => setCopyToast(null), 1800)
    } catch (err) {
      console.error('Unable to copy document value:', err)
      setCopyToast({
        text: 'Unable to copy. Check browser clipboard permissions.',
        x: Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 260)),
        y: Math.max(8, Math.min(event.clientY + 14, window.innerHeight - 60)),
      })
      window.setTimeout(() => setCopyToast(null), 2200)
    }
  }

  async function loadRecords() {
    setLoading(true)
    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('receiving_records')
        .select('*')
        .order('created_at', { ascending: false })

      if (queryError) throw queryError

      const loadedRecords = (data ?? []) as ReceivingRecord[]
      setRecords(loadedRecords)

      // Resolve each record creator's account name from their profile.
      const accountIds = [...new Set(loadedRecords
        .map(record => record.created_by)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''))]

      if (accountIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', accountIds)

        if (profilesError) {
          console.error('Unable to load bearer account names:', profilesError)
        } else {
          const names: Record<string, string> = {}
          for (const profile of profiles ?? []) {
            if (profile.id && profile.full_name?.trim()) {
              names[profile.id] = profile.full_name.trim()
            }
          }
          setAccountNames(names)
        }
      } else {
        setAccountNames({})
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load receiving records.',
      )
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  // Load the record creator's name and profile picture.
  // This assumes created_by contains the Supabase auth user UUID.
  async function loadCreatorName(record: ReceivingRecord) {
    setCreatorName('')
    setCreatorAvatarUrl(null)

    if (!record.created_by) {
      setCreatorLoading(false)
      return
    }

    setCreatorLoading(true)

    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, avatar_path')
        .eq('id', record.created_by)
        .maybeSingle()

      if (profileError) {
        console.error('Unable to load creator profile:', profileError)
        return
      }

      setCreatorName(data?.full_name?.trim() || '')

      if (data?.avatar_path) {
        const { data: avatarData } = supabase.storage
          .from('avatars')
          .getPublicUrl(data.avatar_path)

        setCreatorAvatarUrl(avatarData.publicUrl)
      } else {
        setCreatorAvatarUrl(null)
      }
    } catch (err) {
      console.error('Unable to load creator profile:', err)
    } finally {
      setCreatorLoading(false)
    }
  }

  function createDraft(record: ReceivingRecord): EditableRecord {
    return {
      reference_number: record.reference_number ?? '',
      system_code: record.system_code ?? '',
      content: record.content || record.subject || '',
      bearer: record.bearer || record.sender || '',
      receiving_staff: record.receiving_staff ?? '',
      destination_folder:
        record.destination_folder || record.current_office || '',
      date_received: record.date_received ?? '',
      status: record.status ?? 'received',
      remarks: record.remarks ?? '',
      urgency: typeof record.urgency === 'string' ? record.urgency : record.is_urgent ? 'Urgent' : '',
    }
  }

  async function loadDocumentTimeline(record: ReceivingRecord) {
    setTimelineLoading(true)
    setTimelineError('')
    setTimelineRows([])
    setTimelineAccountNames({})

    try {
      const { data, error: timelineQueryError } = await supabase
        .from('document_workflow')
        .select('id, release_assigned_to, release_instruction, release_forwarded_at, release_forwarded_by, workflow_status, release_received_at, release_received_by, next_action_office_to_forward, next_action_release_to, next_action_release_at, next_action_system_status, next_action_date_forwarded, next_action_recorded_by, next_action_recorded_by_name')
        .eq('receiving_record_id', record.id)
        .order('release_forwarded_at', { ascending: true })

      if (timelineQueryError) throw timelineQueryError

      const rows = (data ?? []) as WorkflowTimelineRow[]
      setTimelineRows(rows)

      // Resolve workflow actor UUIDs to display names from the profiles table.
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const actorIds = Array.from(
        new Set(
          rows.flatMap(workflow => [
            workflow.release_forwarded_by,
            workflow.release_received_by,
            workflow.next_action_recorded_by,
          ]).filter((value): value is string => Boolean(value && uuidPattern.test(value))),
        ),
      )

      if (actorIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds)

        if (profilesError) {
          console.error('Unable to resolve workflow account names:', profilesError)
        } else {
          const names: Record<string, string> = {}
          for (const profile of profiles ?? []) {
            const id = typeof profile.id === 'string' ? profile.id : ''
            const name = typeof profile.full_name === 'string' ? profile.full_name.trim() : ''
            if (id && name) names[id] = name
          }
          setTimelineAccountNames(names)
        }
      }
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : 'Unable to load document progress.')
    } finally {
      setTimelineLoading(false)
    }
  }

  function displayTimelineActor(actor: string | null | undefined): string {
    if (!actor) return ''
    const value = actor.trim()
    if (!value) return ''

    const resolvedName = timelineAccountNames[value]
    if (resolvedName) return resolvedName

    // Keep existing human-readable names, but never display an unresolved UUID.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    return isUuid ? 'Name unavailable' : value
  }

  function openRecord(record: ReceivingRecord) {
    setSelected(record)
    setDraft(createDraft(record))
    setEditMode(false)
    setEditFolderDropdownOpen(false)
    setEditFolderSearch('')
    setSaveError('')
    setSuccess('')
    void loadCreatorName(record)
    void loadDocumentTimeline(record)
  }

  function startEditing() {
    if (!selected) return

    setDraft(createDraft(selected))
    setEditMode(true)
    setEditFolderDropdownOpen(false)
    setEditFolderSearch('')
    setSaveError('')
    setSuccess('')
  }

  function cancelEditing() {
    if (selected) {
      setDraft(createDraft(selected))
    }

    setEditMode(false)
    setEditFolderDropdownOpen(false)
    setEditFolderSearch('')
    setSaveError('')
  }

  function closeModal() {
    if (saving) return

    setSelected(null)
    setDraft(null)
    setEditMode(false)
    setEditFolderDropdownOpen(false)
    setEditFolderSearch('')
    setSaveError('')
    setSuccess('')
    setCreatorName('')
    setCreatorAvatarUrl(null)
    setCreatorLoading(false)
    setTimelineRows([])
    setTimelineAccountNames({})
    setTimelineError('')
  }

  function updateDraft<K extends keyof EditableRecord>(
    field: K,
    value: EditableRecord[K],
  ) {
    setDraft(current =>
      current ? { ...current, [field]: value } : current,
    )

    setSaveError('')
    setSuccess('')
  }

  async function saveChanges() {
    if (!selected || !draft) return

    if (!draft.reference_number.trim()) {
      setSaveError('PresOffice Number is required.')
      return
    }

    if (!draft.content.trim()) {
      setSaveError('Content / Subject is required.')
      return
    }

    if (!draft.bearer.trim()) {
      setSaveError('Bearer is required.')
      return
    }

    if (!draft.receiving_staff.trim()) {
      setSaveError('Inputed by is required.')
      return
    }

    if (!draft.destination_folder.trim()) {
      setSaveError('Destination Folder is required.')
      return
    }

    if (!draft.date_received) {
      setSaveError('Date Received is required.')
      return
    }

    setSaving(true)
    setSaveError('')
    setSuccess('')

    try {
      const { data, error: updateError } = await supabase
        .from('receiving_records')
        .update({
          reference_number: draft.reference_number.trim(),
          system_code: draft.system_code.trim() || null,
          content: draft.content.trim(),
          subject: draft.content.trim(),
          bearer: draft.bearer.trim(),
          sender: draft.bearer.trim(),
          receiving_staff: draft.receiving_staff.trim(),
          destination_folder: draft.destination_folder.trim(),
          current_office: draft.destination_folder.trim(),
          date_received: draft.date_received,
          status: draft.status,
          remarks: draft.remarks.trim() || null,
          urgency: draft.urgency.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id)
        .select('*')
        .single()

      if (updateError) throw updateError

      const updatedRecord = data as ReceivingRecord

      setRecords(current =>
        current.map(record =>
          record.id === updatedRecord.id ? updatedRecord : record,
        ),
      )

      setSelected(updatedRecord)
      setDraft(createDraft(updatedRecord))
      setEditMode(false)
      setSuccess('Record updated successfully.')
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Unable to save changes.',
      )
    } finally {
      setSaving(false)
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(current =>
        current === 'asc' ? 'desc' : 'asc',
      )
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function getSortValue(
    record: ReceivingRecord,
    field: SortField,
  ): string {
    switch (field) {
      case 'content':
        return record.content || record.subject || ''

      case 'bearer':
        return record.bearer || record.sender || ''

      case 'urgency':
        return String(record.urgency ?? (record.is_urgent ? 'Urgent' : ''))

      case 'destination_folder':
        return record.destination_folder || record.current_office || ''

      default:
        return String(record[field] ?? '')
    }
  }

  function handleSearch() {
    setAppliedSearch(searchInput.trim())
  }

  function handleFolderChange(folder: string) {
    setSelectedFolder(folder)
    setFolderDropdownSearch('')
    setFolderDropdownOpen(false)
  }

  function clearFilters() {
    setSearchInput('')
    setAppliedSearch('')
    setSelectedFolder('ALL')
    setFolderDropdownSearch('')
    setFolderDropdownOpen(false)
  }

  const filteredRecords = useMemo(() => {
    const term = normalize(appliedSearch)

    const filtered = records.filter(record => {
      const destination = (
        record.destination_folder ||
        record.current_office ||
        ''
      )
        .trim()
        .toUpperCase()

      // Apply the destination filter first.
      if (
        selectedFolder !== 'ALL' &&
        destination !== selectedFolder.toUpperCase()
      ) {
        return false
      }

      // Then apply the general record search.
      if (term) {
        const searchFields = [
          record.reference_number,
          record.system_code,
          record.record_type,
          record.subject,
          record.sender,
          record.bearer,
          record.content,
          record.description,
          record.destination_folder,
          record.receiving_staff,
          record.status,
          record.current_office,
          record.remarks,
          record.origin_office,
          record.payee,
          record.document_type,
          record.document_code,
          record.batch_no,
          record.serial_number,
          record.norsa_type,
          record.office_designation,
          record.other_notes_remarks,
          record.campus,
          record.amount_peso,
          record.ors_burs_amount,
          record.dv_amount,
          record.check_amount,
          record.total_amount,
          record.amount_to_adjust,
          record.adjusted_amount,
        ]

        if (!searchFields.some(value => normalize(value).includes(term))) {
          return false
        }
      }

      return true
    })

    return [...filtered].sort((a, b) => {
      const first = getSortValue(a, sortField)
      const second = getSortValue(b, sortField)

      const comparison = first.localeCompare(second, undefined, {
        numeric: true,
        sensitivity: 'base',
      })

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [
    records,
    appliedSearch,
    selectedFolder,
    sortField,
    sortDirection,
  ])

  function detail(
    label: string,
    value: unknown,
    formatter?: (value: any) => string,
  ) {
    const displayValue =
      value === null || value === undefined || value === ''
        ? '—'
        : formatter
          ? formatter(value)
          : valueOrDash(value)

    return (
      <div
        key={label}
        className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3.5"
      >
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </dt>

        <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800">
          {displayValue}
        </dd>
      </div>
    )
  }

  function renderRecordDetails(record: ReceivingRecord): ReactNode[] {
    const destination = (
      record.destination_folder ||
      record.current_office ||
      ''
    )
      .trim()
      .toUpperCase()

    const details: ReactNode[] = [
      detail('PresOffice Number', record.reference_number),
      detail('System Code', record.system_code),
      detail('Content / Subject', record.content || record.subject),
      detail('Bearer / Sender', record.bearer || record.sender),
      detail('Origin of Document / Office', record.origin_office),
      detail('Payee', record.payee),
      detail('Inputed by', record.receiving_staff),
      detail('Urgency', record.is_urgent === true || (typeof record.urgency === 'string' && ['urgent', 'high', 'yes', 'true'].includes(record.urgency.trim().toLowerCase())) ? 'Urgent' : ''),
      detail('Destination Folder', record.destination_folder),
      detail(
        'Date / Time Received',
        record.received_at || record.date_received,
        record.received_at ? formatDateTime : formatDate,
      ),
      detail('Status', displayStatus(record.status)),
    ]

    if (destination === 'LDDAP') {
      details.push(
        detail('Amount (₱)', record.amount_peso, money),
        detail('Other Notes / Remarks', record.other_notes_remarks),
      )
    }

    if (destination === 'ORS/BURS') {
      details.push(
        detail('ORS / BURS Type', record.document_type),
        detail('ORS / BURS Amount', record.ors_burs_amount, money),
        detail('Other Notes / Remarks', record.other_notes_remarks),
      )
    }

    // Show the fields associated with the selected destination folder.
    // DV MAIN and other DV destinations include all DV-related values captured
    // on the receiving form, in addition to the common document information above.
    if (destination.startsWith('DV')) {
      details.push(
        detail('Document Type', record.document_type),
        detail('Document Codes', record.document_code),
        detail('Amount (₱)', record.amount_peso, money),
        detail('ORS / BURS Amount', record.ors_burs_amount, money),
        detail('DV Amount', record.dv_amount, money),
        detail('Check Amount', record.check_amount, money),
        detail('Other Notes / Remarks', record.other_notes_remarks),
      )
    }

    if (destination === 'PACSVAL') {
      details.push(
        detail('Campus', record.campus),
        detail('Document Date', record.document_date, formatDate),
        detail('Batch No.', record.batch_no),
        detail('Total Amount', record.total_amount, money),
        detail('Other Notes / Remarks', record.other_notes_remarks),
      )
    }

    if (destination === 'NORSA/NBURSA') {
      details.push(
        detail('NORSA / NBURSA Type', record.norsa_type),
        detail('Serial Number', record.serial_number),
        detail('Amount to Adjust', record.amount_to_adjust, money),
        detail('Adjusted Amount', record.adjusted_amount, money),
        detail('Other Notes / Remarks', record.other_notes_remarks),
      )
    }

    if (SPECIAL_DESTINATIONS.includes(destination)) {
      details.push(
        detail('Office / Designation', record.office_designation),
        detail('Date of Letter', record.date_of_letter, formatDate),
        detail('Other Notes / Remarks', record.other_notes_remarks),
      )
    }

    details.push(
      detail('Remarks', record.remarks),
      detail('Created At', record.created_at, formatDateTime),
    )

    return details
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      {copyToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed z-[200] max-w-[min(360px,calc(100vw-16px))] rounded-lg border border-blue-300 bg-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-xl"
          style={{ left: copyToast.x, top: copyToast.y }}
        >
          {copyToast.text}
        </div>
      )}
      {/* Page heading */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-green-500">
            PRESSYSTEM MANAGEMENT PORTAL
          </p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Receiving Records
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Manage and review all incoming documents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/receiving/new')}
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:self-auto"
        >
          <Plus size={17} />
          Add Received Record
        </button>
      </header>

      {/* Records table */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <FileText size={20} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Incoming Documents
              </h3>

              <p className="mt-0.5 text-xs text-slate-500">
                {loading
                  ? 'Loading records...'
                  : `${filteredRecords.length} of ${records.length} records`}
              </p>
            </div>
          </div>

          {/* Searchable folder selector and general search */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="relative min-w-0">
              <label
                htmlFor="destination-folder-search"
                className="text-xs font-semibold text-slate-600"
              >
                Destination Folder
              </label>

              <div className="relative mt-1.5">
                <input
                  id="destination-folder-search"
                  type="text"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={folderDropdownOpen}
                  aria-controls="destination-folder-options"
                  aria-autocomplete="list"
                  value={
                    folderDropdownOpen
                      ? folderDropdownSearch
                      : selectedFolder === 'ALL'
                        ? ''
                        : selectedFolder
                  }
                  placeholder={
                    selectedFolder === 'ALL'
                      ? 'Search destination folder...'
                      : selectedFolder
                  }
                  onFocus={() => {
                    setFolderDropdownOpen(true)
                    setFolderDropdownSearch('')
                  }}
                  onChange={event => {
                    setFolderDropdownSearch(event.target.value)
                    setFolderDropdownOpen(true)
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      setFolderDropdownOpen(false)
                      setFolderDropdownSearch('')
                    }

                    if (event.key === 'Enter') {
                      event.preventDefault()

                      if (filteredFolderOptions.length > 0) {
                        handleFolderChange(filteredFolderOptions[0])
                      } else if (
                        'all folders'.includes(
                          folderDropdownSearch.trim().toLowerCase(),
                        )
                      ) {
                        handleFolderChange('ALL')
                      }
                    }

                    if (event.key === 'ArrowDown') {
                      setFolderDropdownOpen(true)
                    }
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <button
                  type="button"
                  aria-label="Toggle destination folder options"
                  onClick={() => {
                    setFolderDropdownOpen(open => !open)
                    setFolderDropdownSearch('')
                  }}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-blue-700"
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${
                      folderDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {folderDropdownOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close folder dropdown"
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => {
                      setFolderDropdownOpen(false)
                      setFolderDropdownSearch('')
                    }}
                  />

                  <div
                    id="destination-folder-options"
                    role="listbox"
                    className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedFolder === 'ALL'}
                      onClick={() => handleFolderChange('ALL')}
                      className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                        selectedFolder === 'ALL'
                          ? 'bg-blue-50 font-semibold text-blue-700'
                          : 'text-slate-700'
                      }`}
                    >
                      All Folders
                    </button>

                    {filteredFolderOptions.length > 0 ? (
                      filteredFolderOptions.map(folder => (
                        <button
                          key={folder}
                          type="button"
                          role="option"
                          aria-selected={selectedFolder === folder}
                          onClick={() => handleFolderChange(folder)}
                          className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                            selectedFolder === folder
                              ? 'bg-blue-50 font-semibold text-blue-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {folder}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-slate-500">
                        No matching folders found.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* General search */}
            <div className="min-w-0">
              <label
                htmlFor="general-search"
                className="text-xs font-semibold text-slate-600"
              >
                Search Records
              </label>

              <div className="mt-1.5 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="general-search"
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') handleSearch()
                    }}
                    placeholder="Number, subject, sender..."
                    aria-label="Search receiving records"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSearch}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white transition hover:bg-blue-800"
                >
                  <Search size={14} />
                  Search
                </button>
              </div>
            </div>

            {/* Refresh and clear */}
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => void loadRecords()}
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
                onClick={clearFilters}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Active filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {selectedFolder !== 'ALL' && (
              <span className="rounded-full bg-blue-50 px-3 py-1.5 font-medium text-blue-700">
                Folder: {selectedFolder}
              </span>
            )}

            {appliedSearch && (
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                Search: {appliedSearch}
              </span>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="m-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>Failed to load records: {error}</span>

            <button
              type="button"
              onClick={() => void loadRecords()}
              className="shrink-0 font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Records list */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1150px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 bg-slate-50">
                {tableColumns.map(column => (
                  <th
                    key={column.field}
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.field)}
                      className="inline-flex items-center gap-1.5 transition hover:text-blue-700"
                    >
                      {column.label}

                      <span className="font-bold text-slate-400">
                        {sortField === column.field
                          ? sortDirection === 'asc'
                            ? '↑'
                            : '↓'
                          : '↕'}
                      </span>
                    </button>
                  </th>
                ))}

                <th className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Details
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    Loading incoming documents...
                  </td>
                </tr>
              ) : error && records.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    Records could not be loaded. Check the error above.
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    {appliedSearch || selectedFolder !== 'ALL'
                      ? 'No matching records found. Try changing your search or folder.'
                      : 'No incoming documents yet.'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr
                    key={record.id}
                    className="transition-colors hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-800">
                      <button
                        type="button"
                        onClick={event => void copyRecordValue(event, record.reference_number, 'PresOffice No.')}
                        title="Click to copy PresOffice Number"
                        className="cursor-copy rounded px-1 py-0.5 text-left transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      >
                        {record.reference_number || '—'}
                      </button>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                      <button
                        type="button"
                        onClick={event => void copyRecordValue(event, record.system_code, 'System Code')}
                        title="Click to copy System Code"
                        className="cursor-copy rounded px-1 py-0.5 text-left transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      >
                        {record.system_code || '—'}
                      </button>
                    </td>

                    <td className="max-w-[220px] px-4 py-3.5 text-xs text-slate-700">
                      <span
                        className="block truncate"
                        title={record.content || record.subject || ''}
                      >
                        {record.content || record.subject || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
  <div>Bearer: {record.bearer || record.sender || '—'}</div>
  <div>Datetime: {formatDateTime(record.received_at || record.date_received || record.created_at)}</div>
  <div>Received by: {(record.created_by && accountNames[record.created_by]) || 'Unknown account'}</div>
</td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      <div>Inputed by: {record.receiving_staff || '—'}</div>
                      <div>Created: {formatDateTime(record.created_at || record.received_at || record.date_received)}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      {record.is_urgent === true ||
                      (typeof record.urgency === 'string' &&
                        ['urgent', 'high', 'yes', 'true'].includes(record.urgency.trim().toLowerCase())) ? (
                        <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-600">
                          Urgent
                        </span>
                      ) : null}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.destination_folder ||
                        record.current_office ||
                        '—'}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold capitalize text-blue-700">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {displayStatus(record.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => openRecord(record)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Eye size={13} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">
            Showing {filteredRecords.length} record(s)
          </p>

          <p className="text-[11px] text-slate-400">
            Select a column heading to sort.
          </p>
        </div>
      </section>

      {/* Record details and editing modal */}
      {selected && draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={closeModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receiving-detail-title"
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Incoming Document
                </p>

                <h3
                  id="receiving-detail-title"
                  className="mt-1 text-xl font-bold text-slate-900"
                >
                  {selected.reference_number}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {editMode
                    ? 'Edit the fields below and save your changes.'
                    : 'Review the complete record information.'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close details"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {saveError && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {saveError}
                </div>
              )}

              {success && !editMode && (
                <div
                  role="status"
                  className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
                >
                  {success}
                </div>
              )}

              {editMode ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    PresOffice Number *
                    <input
                      required
                      value={draft.reference_number}
                      onChange={event =>
                        updateDraft('reference_number', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600">
                    System Code
                    <input
                      value={draft.system_code}
                      onChange={event =>
                        updateDraft('system_code', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    Content / Subject *
                    <textarea
                      required
                      rows={3}
                      value={draft.content}
                      onChange={event =>
                        updateDraft('content', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600">
                    Bearer *
                    <input
                      required
                      value={draft.bearer}
                      onChange={event =>
                        updateDraft('bearer', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600">
                    Inputed by *
                    <input
                      required
                      value={draft.receiving_staff}
                      onChange={event =>
                        updateDraft('receiving_staff', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600">
                    Urgency
                    <select
                      value={draft.urgency}
                      onChange={event => updateDraft('urgency', event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Not urgent / Leave blank</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </label>

                  <div className="relative sm:col-span-2">
                    <label
                      htmlFor="edit-destination-folder-search"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Destination Folder *
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="edit-destination-folder-search"
                        type="text"
                        required
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={editFolderDropdownOpen}
                        aria-controls="edit-destination-folder-options"
                        aria-autocomplete="list"
                        value={
                          editFolderDropdownOpen
                            ? editFolderSearch
                            : draft.destination_folder
                        }
                        placeholder="Search or select destination folder..."
                        onFocus={() => {
                          setEditFolderSearch('')
                          setEditFolderDropdownOpen(true)
                        }}
                        onChange={event => {
                          setEditFolderSearch(event.target.value)
                          setEditFolderDropdownOpen(true)
                          if (!event.target.value.trim()) {
                            updateDraft('destination_folder', '')
                          }
                        }}
                        onBlur={() => {
                          window.setTimeout(() => setEditFolderDropdownOpen(false), 120)
                        }}
                        onKeyDown={event => {
                          if (event.key === 'Escape') {
                            setEditFolderDropdownOpen(false)
                            setEditFolderSearch('')
                          }
                          if (event.key === 'Enter' && editFolderDropdownOpen) {
                            event.preventDefault()
                            if (editFolderOptions.length > 0) {
                              updateDraft('destination_folder', editFolderOptions[0])
                              setEditFolderSearch('')
                              setEditFolderDropdownOpen(false)
                            }
                          }
                          if (event.key === 'ArrowDown') {
                            setEditFolderDropdownOpen(true)
                          }
                        }}
                        className={`${inputClass} pr-10`}
                      />
                      <button
                        type="button"
                        aria-label="Toggle destination folder options"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => {
                          setEditFolderDropdownOpen(open => !open)
                          setEditFolderSearch('')
                        }}
                        className="absolute inset-y-0 right-0 mt-1.5 flex items-center px-3 text-slate-500 hover:text-blue-700"
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${editFolderDropdownOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                    {editFolderDropdownOpen && (
                      <div
                        id="edit-destination-folder-options"
                        role="listbox"
                        className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
                      >
                        {editFolderOptions.length > 0 ? (
                          editFolderOptions.map(folder => (
                            <button
                              key={folder}
                              type="button"
                              role="option"
                              aria-selected={draft.destination_folder === folder}
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => {
                                updateDraft('destination_folder', folder)
                                setEditFolderSearch('')
                                setEditFolderDropdownOpen(false)
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                                draft.destination_folder === folder
                                  ? 'bg-blue-50 font-semibold text-blue-700'
                                  : 'text-slate-700'
                              }`}
                            >
                              {folder}
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-3 text-sm text-slate-500">
                            No matching folders found.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <label className="text-xs font-semibold text-slate-600">
                    Date Received *
                    <input
                      type="date"
                      required
                      value={draft.date_received}
                      onChange={event =>
                        updateDraft('date_received', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-600">
                    Status
                    <select
                      value={draft.status}
                      onChange={event =>
                        updateDraft('status', event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="received">Received</option>
                      <option value="forwarded">Forwarded</option>
                      <option value="in_progress">In Progress</option>
                      <option value="returned">Returned</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                    Remarks
                    <textarea
                      rows={3}
                      value={draft.remarks}
                      onChange={event =>
                        updateDraft('remarks', event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
              ) : (
                <>
                  {timelineRows.some(workflow =>
                    Boolean(workflow.next_action_release_at) ||
                    ['released', 'paper_released'].includes(
                      (workflow.next_action_system_status || '').toLowerCase().replace(/\s+/g, '_'),
                    )
                  ) && (
                    <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-extrabold tracking-wide">PAPER RELEASED</p>
                        <p className="mt-0.5 text-xs text-emerald-800">A release action has been recorded for this document.</p>
                      </div>
                    </div>
                  )}

                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {renderRecordDetails(selected)}
                  </dl>
                  <AuditHistory documentId={selected.id} />

                  {/* Document workflow timeline */}
                  <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Document Progress</h4>
                        <p className="mt-1 text-xs text-slate-500">Chronological tracking of forwarding, receipt, release, and completion.</p>
                      </div>
                      <button type="button" onClick={() => void loadDocumentTimeline(selected)} disabled={timelineLoading} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        {timelineLoading ? 'Refreshing…' : 'Refresh progress'}
                      </button>
                    </div>

                    {timelineError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{timelineError}</p>}
                    {timelineLoading ? <p className="mt-4 text-sm text-slate-500">Loading document progress…</p> : timelineRows.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No forwarding workflow has been recorded for this document yet.</p> : (
                      <div className="mt-5 space-y-0">
                        {timelineRows.map((workflow, index) => {
                          const events = [
                            { label: 'Document forwarded', at: workflow.release_forwarded_at, actor: workflow.release_forwarded_by, detail: workflow.release_instruction || 'Forwarded to ' + (workflow.release_assigned_to || 'staff') },
                            { label: 'Receipt confirmed', at: workflow.release_received_at, actor: workflow.release_received_by, detail: 'Physical receipt confirmed' },
                            { label: 'Next action released', at: workflow.next_action_release_at, actor: workflow.next_action_recorded_by_name || workflow.next_action_recorded_by, detail: [workflow.next_action_office_to_forward, workflow.next_action_release_to].filter(Boolean).join(' · ') || 'Next action recorded' },
                            { label: 'Forwarded to next office', at: workflow.next_action_date_forwarded, actor: workflow.next_action_recorded_by_name || workflow.next_action_recorded_by, detail: workflow.next_action_system_status || 'Next step forwarded' },
                          ].filter(event => event.at)
                          const completed = (workflow.workflow_status || '').toLowerCase() === 'completed' || (workflow.next_action_system_status || '').toLowerCase() === 'completed'
                          return <div key={workflow.id} className="relative pb-5 last:pb-0">
                            {index < timelineRows.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />}
                            <div className="relative flex gap-3">
                              <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${completed ? 'border-green-600 bg-green-100' : 'border-blue-500 bg-blue-50'}`} />
                              <div className="min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-slate-800">Workflow #{index + 1}</p>
                                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold capitalize text-slate-600">{displayStatus(workflow.workflow_status)}</span>
                                </div>
                                {events.length ? <div className="mt-3 space-y-3">{events.map((event, eventIndex) => <div key={`${workflow.id}-${event.label}-${eventIndex}`} className="border-l-2 border-blue-200 pl-3">
                                  <p className="text-xs font-semibold text-slate-800">{event.label}</p>
                                  <p className="mt-0.5 text-xs text-slate-600">{event.detail}</p>
                                  <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(event.at)}{displayTimelineActor(event.actor) ? ` · Account: ${displayTimelineActor(event.actor)}` : ''}</p>
                                </div>)}</div> : <p className="mt-2 text-xs text-slate-500">Forwarding record exists; awaiting the first recorded action.</p>}
                                {completed && <p className="mt-3 text-xs font-semibold text-green-700">Workflow completed</p>}
                              </div>
                            </div>
                          </div>
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* Modal footer and creator profile */}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {!editMode && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-blue-100 text-sm font-bold text-blue-800">
                      {creatorAvatarUrl ? (
                        <img
                          src={creatorAvatarUrl}
                          alt={`${creatorName || 'Creator'} profile picture`}
                          className="h-full w-full object-cover"
                          onError={() => setCreatorAvatarUrl(null)}
                        />
                      ) : (
                        creatorName.trim().charAt(0).toUpperCase() || '?'
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Created By
                      </p>

                      <p className="mt-1 max-w-48 truncate text-sm font-semibold text-slate-800">
                        {creatorLoading
                          ? 'Loading account...'
                          : creatorName || 'Account name unavailable'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Ban size={15} />
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => void saveChanges()}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save size={15} />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Close
                    </button>

                    <button
                      type="button"
                      onClick={startEditing}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      <Pencil size={15} />
                      Edit Record
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
