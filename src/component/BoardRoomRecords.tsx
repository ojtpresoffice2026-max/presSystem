import {
 useCallback,
 useEffect,
 useMemo,
 useRef,
 useState,
 type FormEvent,
} from 'react'
import {
 AlertCircle,
 Bell,
 Check,
 CheckCircle2,
 FileText,
 LoaderCircle,
 Search,
 Send,
 X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type WorkflowStatus =
 | 'forwarded'
 | 'board_room_received'
 | 'action_in_progress'
 | 'action_completed'
 | 'returned_to_origin'
 | 'completed'

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
 board_room_received_at: string | null
 board_room_received_by: string | null
 president_action_status: string | null
 president_action_remarks: string | null
 president_action_completed_at: string | null
 returned_to_origin_at: string | null
 returned_to_origin_by: string | null
 returned_to_origin_person?: string | null
 returned_to_origin_remarks?: string | null
 origin_office_received_at: string | null
 origin_office_received_by: string | null
 workflow_status: WorkflowStatus
 workflow_route?: 'board_room' | 'direct_release' | null
 created_at: string
}

type ReceivingRecord = {
 id: string
 reference_number: string | null
 record_type: string | null
 subject: string | null
 content: string | null
 sender: string | null
 bearer: string | null
 origin_office: string | null
 destination_folder: string | null
 current_office: string | null
 system_code?: string | null
 receiving_staff?: string | null
 received_at?: string | null
 date_received: string | null
 status: string | null
 remarks?: string | null
 created_at?: string | null
 urgency?: string | boolean | null
 is_unrecorded_paper?: boolean | null
 custom_field_values?: Record<string, unknown> | null
 [key: string]: unknown
}

type DestinationFieldDefinition = {
 id: string
 folder_id: string
 field_name: string
 field_type: string
 sort_order: number
}

type DisplayRecord = {
 workflow: WorkflowRecord
 document: ReceivingRecord | null
}

type CartItem = {
 workflowId: string
 remarks: string
 urgency: 'urgent' | 'not_urgent'
}

type ReturnCartItem = {
 workflow_id: string
 remarks: string
 urgency: 'urgent' | 'not_urgent'
}

type UnrecordedCartItem = {
 id: string
 database_id?: string
 paper_title: string
 subject_content: string
 reference_number: string
 origin_office: string
 returned_person: string
 destination_folder: string
 urgency: 'urgent' | 'not_urgent'
 remarks: string
 custom_field_values: Record<string, unknown>
 destination_fields: DestinationFieldDefinition[]
 destination_fields_loading: boolean
 storage_group_id: string
 is_created: boolean
}

const statusLabels: Record<WorkflowStatus, string> = {
 forwarded: 'Awaiting receipt',
 board_room_received: 'Ready to return',
 action_in_progress: 'In progress',
 action_completed: 'Ready to return',
 returned_to_origin: 'Returned to origin',
 completed: 'Workflow completed',
}

const statusClasses: Record<WorkflowStatus, string> = {
 forwarded: 'bg-amber-100 text-amber-800',
 board_room_received: 'bg-emerald-100 text-emerald-800',
 action_in_progress: 'bg-violet-100 text-violet-800',
 action_completed: 'bg-emerald-100 text-emerald-800',
 returned_to_origin: 'bg-orange-100 text-orange-800',
 completed: 'bg-green-100 text-green-800',
}

const inputClass =
 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

// Confirming receipt immediately makes a document eligible for return.
// action_completed remains returnable for records created by the older workflow.
const returnableStatuses: WorkflowStatus[] = ['board_room_received', 'action_completed']

function isReadyToReturn(row: DisplayRecord) {
 return returnableStatuses.includes(row.workflow.workflow_status)
}

function formatDateOnly(value: string | null | undefined) {
 if (!value) return '—'

 const date = new Date(`${value}T00:00:00`)
 if (Number.isNaN(date.getTime())) return value

 return date.toLocaleDateString('en-PH', {
 dateStyle: 'medium',
 timeZone: 'Asia/Manila',
 })
}

function formatTime(value: string | null | undefined) {
 if (!value) return '—'

 const match = value.match(/^(\d{1,2}):(\d{2})/)
 if (!match) return value

 const date = new Date()
 date.setHours(Number(match[1]), Number(match[2]), 0, 0)

 return date.toLocaleTimeString('en-PH', {
 hour: 'numeric',
 minute: '2-digit',
 hour12: true,
 timeZone: 'Asia/Manila',
 })
}

function formatDateTime(value: string | null | undefined) {
 if (!value) return '—'

 const date = new Date(value)
 if (Number.isNaN(date.getTime())) return value

 return date.toLocaleString('en-PH', {
 year: 'numeric',
 month: 'short',
 day: '2-digit',
 hour: 'numeric',
 minute: '2-digit',
 hour12: true,
 timeZone: 'Asia/Manila',
 })
}

function getErrorMessage(error: unknown) {
 if (error instanceof Error) return error.message

 if (typeof error === 'object' && error !== null && 'message' in error) {
 return String(error.message)
 }

 return 'An unexpected error occurred.'
}

function getManilaDate() {
 const parts = new Intl.DateTimeFormat('en-CA', {
 timeZone: 'Asia/Manila',
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 }).formatToParts(new Date())

 const values = Object.fromEntries(
 parts.map(part => [part.type, part.value]),
 )

 return `${values.year}-${values.month}-${values.day}`
}

function getStorageLabel(workflow: WorkflowRecord) {
 return workflow.storage_type === 'folder'
 ? `Folder — ${workflow.folder_color || 'Not specified'}`
 : `Box — ${workflow.box_number || 'Not specified'}`
}

function isUnrecordedPaper(document: ReceivingRecord | null | undefined) {
 if (!document) return false
 const metadata = document.custom_field_values ?? {}
 return document.is_unrecorded_paper === true
  || metadata._is_unrecorded_paper === true
  || String(metadata._record_kind ?? '').trim().toLowerCase().replace(/[ _-]+/g, '') === 'unrecordedpaper'
}

function getReferenceDisplay(document: ReceivingRecord | null | undefined) {
 return isUnrecordedPaper(document) ? 'UNRECORDED' : document?.reference_number || 'No reference number'
}

async function copyDocumentCode(
 value: string | null | undefined,
 cursor?: { clientX: number; clientY: number },
) {
 const text = value?.trim()
 if (!text || text === 'No reference number') return

 try {
  await navigator.clipboard.writeText(text)

  // Show visible feedback inside the application instead of relying on a browser alert.
  const existing = document.getElementById('pres-system-copy-toast')
  existing?.remove()

  const toast = document.createElement('div')
  toast.id = 'pres-system-copy-toast'
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.className = 'fixed z-[200] flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow-xl pointer-events-none'
  toast.textContent = `Copied: ${text}`
  // Position the confirmation beside the click location, keeping it inside the viewport.
  toast.style.visibility = 'hidden'
  document.body.appendChild(toast)
  const margin = 12
  const offset = 14
  const x = cursor?.clientX ?? window.innerWidth / 2
  const y = cursor?.clientY ?? window.innerHeight / 2
  const rect = toast.getBoundingClientRect()
  const left = Math.max(margin, Math.min(x + offset, window.innerWidth - rect.width - margin))
  const top = Math.max(margin, Math.min(y + offset, window.innerHeight - rect.height - margin))
  toast.style.left = `${left}px`
  toast.style.top = `${top}px`
  toast.style.visibility = 'visible'

  window.setTimeout(() => {
   toast.remove()
  }, 1800)
 } catch (error) {
  console.error('Unable to copy document reference:', error)
 }
}

export default function BoardRoomRecords() {
 const [records, setRecords] = useState<DisplayRecord[]>([])
 const [accountNames, setAccountNames] = useState<Record<string, string>>({})
 const [selectedId, setSelectedId] = useState<string | null>(null)
 const [viewDetailsOpen, setViewDetailsOpen] = useState(false)
 const [destinationFieldDefinitions, setDestinationFieldDefinitions] = useState<DestinationFieldDefinition[]>([])
 const [destinationFieldsLoading, setDestinationFieldsLoading] = useState(false)
 const [search, setSearch] = useState('')
 const [currentPage, setCurrentPage] = useState(1)
 const pageSize = 10
 const [statusFilter, setStatusFilter] =
 useState<'all' | WorkflowStatus>('all')

 const [loading, setLoading] = useState(true)
 const [processing, setProcessing] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
 const [currentAccountName, setCurrentAccountName] = useState('')
 const [urgentNotificationsOpen, setUrgentNotificationsOpen] = useState(false)
 const [incomingDocumentsOpen, setIncomingDocumentsOpen] = useState(false)
 const [latestUrgentWorkflowId, setLatestUrgentWorkflowId] = useState<string | null>(null)


 // Play urgent alerts automatically. If browser autoplay is blocked, retry on
 // the first ordinary click/key press instead of requiring a separate button.
 const urgentAudioContext = useRef<AudioContext | null>(null)
 const pendingUrgentSound = useRef(false)
 const previousUrgentIds = useRef<Set<string> | null>(null)

 const playUrgentSound = useCallback(async () => {
  try {
   if (!window.AudioContext) return

   if (!urgentAudioContext.current) {
    urgentAudioContext.current = new window.AudioContext()
   }

   const context = urgentAudioContext.current
   if (context.state !== 'running') {
    await context.resume()
   }

   if (context.state !== 'running') {
    pendingUrgentSound.current = true
    return
   }

   pendingUrgentSound.current = false
   const now = context.currentTime

   ;[880, 1174.66].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startAt = now + index * 0.16

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.24)
   })
  } catch (audioError) {
   pendingUrgentSound.current = true
   console.debug('Urgent notification sound is waiting for browser permission.', audioError)
  }
 }, [])

 useEffect(() => {
  const resumePendingSound = () => {
   if (pendingUrgentSound.current) void playUrgentSound()
  }

  window.addEventListener('pointerdown', resumePendingSound)
  window.addEventListener('keydown', resumePendingSound)

  return () => {
   window.removeEventListener('pointerdown', resumePendingSound)
   window.removeEventListener('keydown', resumePendingSound)
   void urgentAudioContext.current?.close()
   urgentAudioContext.current = null
  }
 }, [playUrgentSound])

 // Selected documents for a single return transaction.
 const [cart, setCart] = useState<CartItem[]>([])
 const [documentUrgencyChoices, setDocumentUrgencyChoices] = useState<Record<string, 'urgent' | 'not_urgent'>>({})
 const [unrecordedCart, setUnrecordedCart] = useState<UnrecordedCartItem[]>([])
 const [cartOpen, setCartOpen] = useState(false)
 const [pickerSearch, setPickerSearch] = useState('')
 const [, setDestinationFolderOptions] = useState<Array<{ id: string; code: string | null; name: string | null }>>([])
 const [, setDestinationFoldersLoading] = useState(false)
 const [, setDestinationFoldersError] = useState('')

 // Shared return checkout details.
 const [returnPerson, setReturnPerson] = useState('')
 const [sharedReturnRemarks, setSharedReturnRemarks] = useState('')
 const [returnDate, setReturnDate] = useState(getManilaDate)
 const [returnTime, setReturnTime] = useState('')

 // Storage can be assigned per document through reusable storage groups.
 const [storageGroups, setStorageGroups] = useState<Array<{ id: string; name: string; storageType: 'folder' | 'box'; folderColor: string; boxNumber: string }>>([{ id: 'storage-group-1', name: 'Storage Group 1', storageType: 'folder', folderColor: '', boxNumber: '' }])
 const [activeStorageGroupId, setActiveStorageGroupId] = useState('storage-group-1')
 const [documentStorageGroupIds, setDocumentStorageGroupIds] = useState<Record<string, string>>({})

  async function loadDestinationFieldDefinitions(record: ReceivingRecord | null) {
    setDestinationFieldDefinitions([])
    if (!record) return

    const destination = String(record.destination_folder || record.current_office || '').trim()
    if (!destination) return

    setDestinationFieldsLoading(true)
    try {
      const { data: folders, error: folderError } = await supabase
        .from('office_folders')
        .select('id, code, name')
      if (folderError) throw folderError

      // Receiving stores generated destination values such as PR_MABINAY_1793179282728.
      // Match the configured folder by its stable code/name without changing the stored value.
      const normalizeFolderKey = (value: unknown) =>
        String(value ?? '').trim().toUpperCase().replace(/_\d{8,}$/, '').replace(/[^A-Z0-9]/g, '')
      const destinationKey = normalizeFolderKey(destination)
      const folder = (folders ?? []).find((item: { id: string; code: string | null; name: string | null }) =>
        normalizeFolderKey(item.code) === destinationKey ||
        normalizeFolderKey(item.name) === destinationKey
      )
      if (!folder) return

      const { data: fields, error: fieldsError } = await supabase
        .from('destination_folder_fields')
        .select('id, folder_id, field_name, field_type, sort_order')
        .eq('folder_id', folder.id)
        .order('sort_order', { ascending: true })
      if (fieldsError) throw fieldsError
      setDestinationFieldDefinitions((fields ?? []) as DestinationFieldDefinition[])
    } catch (loadError) {
      console.error('Unable to load destination-specific fields for Board Room view:', loadError)
      setDestinationFieldDefinitions([])
    } finally {
      setDestinationFieldsLoading(false)
    }
  }

  function formatDestinationName(value: string | null | undefined) {
    if (!value) return '—'
    return value.trim().replace(/_\d{8,}$/, '').replace(/_/g, ' ')
  }

 const loadRecords = useCallback(async () => {
 setLoading(true)
 setError('')

 try {
 const { data: workflows, error: workflowError } = await supabase
 .from('document_workflow')
 .select('*')
 .order('forwarded_at', { ascending: false })

 if (workflowError) throw workflowError

 // Only records routed to the Board Room belong on this page.
 // Keep null-route rows visible for legacy records created before route separation.
 let workflowRows = ((workflows ?? []) as WorkflowRecord[]).filter(
  workflow => workflow.workflow_route !== 'direct_release',
 )

 // Resolve the accounts that forwarded, confirmed receipt, or processed returns.
 const accountIds = [
 ...new Set(
 workflowRows.flatMap(workflow =>
 [
 workflow.forwarded_by,
 workflow.board_room_received_by,
 workflow.returned_to_origin_by,
 ].filter((id): id is string => Boolean(id)),
 ),
 ),
 ]

 if (accountIds.length > 0) {
 const { data: profiles, error: profilesError } = await supabase
 .from('profiles')
 .select('id, full_name')
 .in('id', accountIds)

 if (profilesError) throw profilesError

 const names: Record<string, string> = {}
 for (const profile of profiles ?? []) {
 names[profile.id] = profile.full_name?.trim() || 'Unknown account'
 }
 setAccountNames(names)
 } else {
 setAccountNames({})
 }

 const receivingIds = [...new Set(workflowRows.map(row => row.receiving_record_id).filter((id): id is string => Boolean(id)))]
 const unrecordedIds = [...new Set(workflowRows.map(row => row.unrecorded_paper_id).filter((id): id is string => Boolean(id)))]
 let documents: ReceivingRecord[] = []

 if (receivingIds.length > 0) {
  const { data, error: documentError } = await supabase
   .from('receiving_records').select('*').in('id', receivingIds)
  if (documentError) throw documentError
  documents = (data ?? []) as ReceivingRecord[]
 }

 if (unrecordedIds.length > 0) {
  const { data, error: unrecordedError } = await supabase
   .from('unrecorded_papers').select('*').in('id', unrecordedIds)
  if (unrecordedError) throw unrecordedError
  const unrecordedDocuments = (data ?? []).map((paper: any) => ({
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
  documents = [...documents, ...unrecordedDocuments]
 }

 const documentMap = new Map(documents.map(document => [document.id, document]))
 const combined: DisplayRecord[] = workflowRows.map(workflow => ({
  workflow,
  document: documentMap.get(workflow.unrecorded_paper_id || workflow.receiving_record_id || '') ?? null,
 }))

 setRecords(combined)

 setSelectedId(previous => {
 if (previous && combined.some(row => row.workflow.id === previous)) {
 return previous
 }

 return combined[0]?.workflow.id ?? null
 })

 // Keep only documents that are still eligible for return.
 const eligibleIds = new Set(
 combined
 .filter(isReadyToReturn)
 .map(row => row.workflow.id),
 )

 setCart(current =>
 current.filter(item => eligibleIds.has(item.workflowId)),
 )
 } catch (loadError) {
 setError(getErrorMessage(loadError))
 } finally {
 setLoading(false)
 }
 }, [])

 useEffect(() => {
 void loadRecords()
 }, [loadRecords])

 // Load the complete configured folder list instead of relying on a hardcoded list.
 useEffect(() => {
  let active = true
  const loadDestinationFolders = async () => {
   setDestinationFoldersLoading(true)
   setDestinationFoldersError('')
   try {
    const { data, error: foldersError } = await supabase
     .from('office_folders')
     .select('id, code, name')
     .order('name', { ascending: true })
    if (foldersError) throw foldersError
    if (active) setDestinationFolderOptions((data ?? []) as Array<{ id: string; code: string | null; name: string | null }>)
   } catch (loadError) {
    if (active) setDestinationFoldersError(getErrorMessage(loadError))
    console.error('Unable to load destination folders:', loadError)
   } finally {
    if (active) setDestinationFoldersLoading(false)
   }
  }
  void loadDestinationFolders()
  return () => { active = false }
 }, [])

 // Listen for newly forwarded urgent papers so the Board Room updates without
 // requiring staff to press Refresh.
 useEffect(() => {
 const channel = supabase
 .channel('board-room-urgent-forwarding-notifications')
 .on(
 'postgres_changes',
 {
 event: '*',
 schema: 'public',
 table: 'document_workflow',
 },
 payload => {
 const row = payload.new as Partial<WorkflowRecord>
 if (
 row.workflow_route !== 'direct_release' &&
 row.urgency === 'urgent' &&
 row.workflow_status === 'forwarded' &&
 row.id
 ) {
 setLatestUrgentWorkflowId(row.id)
 }
 void loadRecords()
 },
 )
 .subscribe()

 return () => {
 void supabase.removeChannel(channel)
 }
 }, [loadRecords])

 const filteredRecords = useMemo(() => {
 const query = search.trim().toLowerCase()

 return records.filter(({ workflow, document }) => {
 const matchesStatus =
 statusFilter === 'all' || workflow.workflow_status === statusFilter

 if (!matchesStatus) return false
 if (!query) return true

 return [
 document?.reference_number,
 document?.subject,
 document?.content,
 document?.sender,
 document?.bearer,
 document?.origin_office,
 document?.current_office,
 document?.record_type,
 workflow.transaction_person,
 workflow.folder_color,
 workflow.box_number,
 workflow.urgency,
 ]
 .filter(Boolean)
 .join(' ')
 .toLowerCase()
 .includes(query)
 })
 }, [records, search, statusFilter])

 const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
 const paginatedRecords = useMemo(
  () => filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  [filteredRecords, currentPage],
 )

 useEffect(() => {
  setCurrentPage(1)
 }, [search, statusFilter])

 useEffect(() => {
  if (currentPage > totalPages) setCurrentPage(totalPages)
 }, [currentPage, totalPages])

 const selected =
 records.find(row => row.workflow.id === selectedId) ?? null

 const returnableRecords = useMemo(() => {
  // A paper may have legacy/duplicate workflow rows. Once ANY transaction for
  // that same paper has been returned or completed, never offer it for return again.
  const processedDocumentIds = new Set(
   records
    .filter(row => ['returned_to_origin', 'completed'].includes(row.workflow.workflow_status))
    .map(row => row.workflow.unrecorded_paper_id || row.workflow.receiving_record_id)
    .filter((id): id is string => Boolean(id)),
  )

  return records.filter(row => {
   if (!isReadyToReturn(row)) return false
   const documentId = row.workflow.unrecorded_paper_id || row.workflow.receiving_record_id
   return !documentId || !processedDocumentIds.has(documentId)
  })
 }, [records])

 const cartRecords = useMemo(
 () =>
 cart
 .map(item => {
 const row = returnableRecords.find(
 record => record.workflow.id === item.workflowId,
 )

 const storageGroupId = documentStorageGroupIds[item.workflowId] || activeStorageGroupId
 const storageGroup = storageGroups.find(group => group.id === storageGroupId)
 return row ? { ...row, cartRemarks: item.remarks, cartUrgency: item.urgency, cartStorageGroupId: storageGroupId, cartStorageGroup: storageGroup } : null
 })
 .filter(
 (row): row is DisplayRecord & { cartRemarks: string; cartUrgency: 'urgent' | 'not_urgent'; cartStorageGroupId: string; cartStorageGroup: { id: string; name: string; storageType: 'folder' | 'box'; folderColor: string; boxNumber: string } | undefined } =>
 row !== null,
 ),
 [cart, returnableRecords, documentStorageGroupIds, activeStorageGroupId, storageGroups],
 )

 const totalReturnItems = cartRecords.length + unrecordedCart.length

 const filteredReturnableRecords = useMemo(() => {
 const query = pickerSearch.trim().toLowerCase()

 if (!query) return returnableRecords

 return returnableRecords.filter(({ workflow, document }) =>
 [
 document?.reference_number,
 document?.subject,
 document?.content,
 document?.origin_office,
 document?.sender,
 document?.bearer,
 workflow.transaction_person,
 workflow.folder_color,
 workflow.box_number,
 workflow.urgency,
 ]
 .filter(Boolean)
 .join(' ')
 .toLowerCase()
 .includes(query),
 )
 }, [returnableRecords, pickerSearch])

 const urgentIncomingRecords = useMemo(
 () =>
 records.filter(
 row =>
 row.workflow.urgency === 'urgent' &&
 row.workflow.workflow_status === 'forwarded',
 ),
 [records],
 )

 // All forwarded documents awaiting Board Room receipt.
 const incomingRecords = useMemo(
 () => records.filter(row => row.workflow.workflow_status === 'forwarded'),
 [records],
 )

 const latestUrgentRecord = records.find(
 row => row.workflow.id === latestUrgentWorkflowId,
 )

 // Alert once on page load if urgent papers are waiting, then only when
 // a new urgent workflow appears. Routine refreshes do not repeat the sound.
 useEffect(() => {
 if (loading) return

 const currentUrgentIds = new Set(
 urgentIncomingRecords.map(row => row.workflow.id),
 )
 const previousIds = previousUrgentIds.current

 if (previousIds === null) {
 if (currentUrgentIds.size > 0) void playUrgentSound()
 } else {
 const hasNewUrgent = [...currentUrgentIds].some(id => !previousIds.has(id))
 if (hasNewUrgent) void playUrgentSound()
 }

 previousUrgentIds.current = currentUrgentIds
 }, [loading, urgentIncomingRecords, playUrgentSound])

 async function receiveDocument(workflowId: string) {
  if (processing) return

  setProcessing(true)
  setError('')
  setSuccess('')

  try {
   // The database RPC records who received the document and when.
   const { error: rpcError } = await supabase.rpc(
    'board_room_receive',
    { p_workflow_id: workflowId },
   )
   if (rpcError) {
    // If the receipt was already recorded by an earlier attempt, recover the
    // workflow below instead of leaving the record stuck in an intermediate state.
    const { data: current, error: currentError } = await supabase
     .from('document_workflow')
     .select('id, workflow_status, board_room_received_at, workflow_route')
     .eq('id', workflowId)
     .maybeSingle()

    if (currentError) throw currentError
    if (
     !current ||
     current.workflow_route === 'direct_release' ||
     !current.board_room_received_at ||
     !['board_room_received', 'action_in_progress', 'action_completed'].includes(current.workflow_status)
    ) {
     throw rpcError
    }
   }

   // Record the authenticated account together with the completion timestamp.
   // The database action_completion_pair constraint requires both values.
   const { data: authData, error: authError } = await supabase.auth.getUser()
   if (authError) throw authError
   if (!authData.user) throw new Error('Your session has expired. Please sign in again.')

   // Confirming receipt immediately makes the paper ready for return.
   const { data: readyRecord, error: readyError } = await supabase
    .from('document_workflow')
    .update({
     workflow_status: 'action_completed',
     president_action_status: 'completed',
     president_action_completed_at: new Date().toISOString(),
     president_action_completed_by: authData.user.id,
    })
    .eq('id', workflowId)
    .in('workflow_status', ['forwarded', 'board_room_received', 'action_in_progress', 'action_completed'])
    .select('id')
    .maybeSingle()

   if (readyError) throw readyError
   if (!readyRecord) {
    const { data: current, error: currentError } = await supabase
     .from('document_workflow')
     .select('id, workflow_status, board_room_received_at, workflow_route')
     .eq('id', workflowId)
     .maybeSingle()

    if (currentError) throw currentError
    if (
     !current ||
     current.workflow_route === 'direct_release' ||
     !current.board_room_received_at ||
     current.workflow_status !== 'action_completed'
    ) {
     throw new Error('Receipt was recorded, but this document could not be marked Ready to return. Refresh and try again.')
    }
   }

   // Update the visible row locally instead of reloading every workflow,
   // profile, and receiving record after a single receipt confirmation.
   const confirmedAt = new Date().toISOString()
   setRecords(current => current.map(row => row.workflow.id === workflowId
    ? {
       ...row,
       workflow: {
        ...row.workflow,
        workflow_status: 'action_completed',
        president_action_status: 'completed',
        president_action_completed_at: confirmedAt,
        president_action_completed_by: authData.user!.id,
        board_room_received_at: row.workflow.board_room_received_at || confirmedAt,
        board_room_received_by: row.workflow.board_room_received_by || authData.user!.id,
       },
      }
    : row))
   setSuccess('Receipt confirmed. The document is now Ready to return.')
  } catch (actionError) {
   setError(getErrorMessage(actionError))
  } finally {
   setProcessing(false)
  }
 }

 function openCart() {
 setError('')
 setSuccess('')
 setPickerSearch('')
 // Each paper defaults to Not Urgent when it is added to the transaction.
 setCartOpen(true)
 }

 function hasValidActiveStorageGroup() {
  const group = storageGroups.find(item => item.id === activeStorageGroupId)
  if (!group) return false
  return group.storageType === 'folder'
   ? Boolean(group.folderColor.trim())
   : Boolean(group.boxNumber.trim())
 }

 function addToCart(workflowId: string) {
 if (!hasValidActiveStorageGroup()) {
  setError('Choose a storage type and complete its folder color or box number before selecting documents.')
  return
 }
 setCart(current => {
 if (current.some(item => item.workflowId === workflowId)) {
 return current
 }

 return [...current, { workflowId, remarks: '', urgency: documentUrgencyChoices[workflowId] || 'not_urgent' }]
 })
 setDocumentStorageGroupIds(current => ({ ...current, [workflowId]: activeStorageGroupId }))
 setSuccess('')
 }

 function removeFromCart(workflowId: string) {
 setCart(current => current.filter(item => item.workflowId !== workflowId))
 setDocumentStorageGroupIds(current => { const next = { ...current }; delete next[workflowId]; return next })
 }

 function addStorageGroup() {
 const id = `storage-group-${crypto.randomUUID()}`
 setStorageGroups(current => [...current, { id, name: `Storage Group ${current.length + 1}`, storageType: 'folder', folderColor: '', boxNumber: '' }])
 setActiveStorageGroupId(id)
 }

 function getStorageGroupKey(group: { storageType: 'folder' | 'box'; folderColor: string; boxNumber: string }) {
  if (group.storageType === 'folder') {
   const color = group.folderColor.trim().toLowerCase()
   return color ? `folder:${color}` : ''
  }
  const box = group.boxNumber.trim().toLowerCase().replace(/\s+/g, ' ')
  return box ? `box:${box}` : ''
 }

 function updateStorageGroup(groupId: string, patch: Partial<{ storageType: 'folder' | 'box'; folderColor: string; boxNumber: string }>) {
  const currentGroup = storageGroups.find(group => group.id === groupId)
  if (!currentGroup) return
  const updatedGroup = { ...currentGroup, ...patch }
  const updatedKey = getStorageGroupKey(updatedGroup)
  const matchingGroup = updatedKey ? storageGroups.find(group => group.id !== groupId && getStorageGroupKey(group) === updatedKey) : undefined
  if (matchingGroup) {
   setStorageGroups(current => current.filter(group => group.id !== groupId))
   setDocumentStorageGroupIds(current => {
    const next = { ...current }
    Object.keys(next).forEach(documentId => { if (next[documentId] === groupId) next[documentId] = matchingGroup.id })
    return next
   })
   setActiveStorageGroupId(matchingGroup.id)
   return
  }
  setStorageGroups(current => current.map(group => group.id === groupId ? updatedGroup : group))
 }

 function assignDocumentStorage(workflowId: string, groupId: string) {
 setDocumentStorageGroupIds(current => ({ ...current, [workflowId]: groupId }))
 }

 function updateCartRemarks(workflowId: string, remarks: string) {
 setCart(current =>
 current.map(item =>
 item.workflowId === workflowId ? { ...item, remarks } : item,
 ),
 )
 }

 function updateCartUrgency(workflowId: string, urgency: 'urgent' | 'not_urgent') {
 setDocumentUrgencyChoices(current => ({ ...current, [workflowId]: urgency }))
 setCart(current =>
 current.map(item =>
 item.workflowId === workflowId ? { ...item, urgency } : item,
 ),
 )
 }

 function addUnrecordedPaper() {
  setUnrecordedCart(current => [...current, {
   id: crypto.randomUUID(),
   paper_title: '',
   subject_content: '',
   reference_number: '',
   origin_office: '',
   returned_person: currentAccountName,
   destination_folder: '',
   urgency: 'not_urgent',
   remarks: '',
   custom_field_values: {},
   destination_fields: [],
   destination_fields_loading: false,
   storage_group_id: activeStorageGroupId,
   is_created: false,
  }])
 }

 
 
 function updateUnrecordedPaper(id: string, field: keyof Omit<UnrecordedCartItem, 'id'>, value: string) {
  const normalizedValue = field === 'urgency' || field === 'storage_group_id' ? value : value.toUpperCase()
  setUnrecordedCart(current => current.map(item => item.id === id ? ({ ...item, [field]: normalizedValue } as UnrecordedCartItem) : item))
 }

 async function createUnrecordedPaper(id: string) {
  const paper = unrecordedCart.find(item => item.id === id)
  if (!paper || paper.is_created) return
  if (!paper.subject_content.trim()) {
   setError('Enter the content before creating this unrecorded paper.')
   return
  }
  const storageGroup = storageGroups.find(group => group.id === paper.storage_group_id)
  if (!storageGroup || (storageGroup.storageType === 'folder' ? !storageGroup.folderColor.trim() : !storageGroup.boxNumber.trim())) {
   setError('Choose a complete folder or box storage location for this unrecorded paper.')
   return
  }

  setProcessing(true)
  setError('')
  setSuccess('')
  try {
   const { data: authData, error: authError } = await supabase.auth.getUser()
   if (authError) throw authError
   if (!authData.user) throw new Error('Your session has expired. Please sign in again.')
   const { data: profile, error: profileError } = await supabase
    .from('profiles').select('full_name').eq('id', authData.user.id).maybeSingle()
   if (profileError) throw profileError
   const receivingStaff = profile?.full_name?.trim()
    || String(authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || authData.user.email || 'Unknown account')
   setCurrentAccountName(receivingStaff)
   const subjectContent = paper.subject_content.trim().toUpperCase()
   const now = new Date()
   const dateReceived = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
   }).format(now)
   const storageType = storageGroup.storageType
   const folderColor = storageType === 'folder' ? storageGroup.folderColor.trim() : null
   const boxNumber = storageType === 'box' ? storageGroup.boxNumber.trim() : null
   const { data: insertedPaper, error: insertError } = await supabase.from('unrecorded_papers').insert({
    reference_number: null,
    subject: subjectContent,
    content: subjectContent,
    sender: receivingStaff.trim().toUpperCase() || 'UNRECORDED PAPER',
    bearer: receivingStaff.trim().toUpperCase() || 'UNRECORDED PAPER',
    origin_office: null,
    destination_folder: null,
    current_office: null,
    received_at: now.toISOString(),
    date_received: dateReceived,
    status: 'returned_to_origin',
    remarks: null,
    urgency: paper.urgency === 'urgent' ? 'urgent' : 'not_urgent',
    created_by: authData.user.id,
    custom_field_values: {
     _record_kind: 'UNRECORDED PAPER',
     _is_unrecorded_paper: true,
     _created_by_name: receivingStaff.toUpperCase(),
     _storage_group_name: storageGroup.name,
     _storage_type: storageType,
     _folder_color: folderColor,
     _box_number: boxNumber,
     _urgency: paper.urgency,
     _source: 'board_room_return',
    },
   }).select('id').single()
   if (insertError) throw insertError
   if (!insertedPaper?.id) throw new Error('The saved paper ID could not be retrieved.')

   setUnrecordedCart(current => current.map(item => item.id === id
    ? { ...item, is_created: true, database_id: insertedPaper.id }
    : item))
   setSuccess('Unrecorded paper saved successfully with its urgency and storage location.')
  } catch (createError) {
   setError(`Unable to create unrecorded paper: ${getErrorMessage(createError)}`)
  } finally {
   setProcessing(false)
  }
 }

 async function removeUnrecordedPaper(id: string) {
  const paper = unrecordedCart.find(item => item.id === id)
  if (paper?.is_created && paper.database_id) {
   setProcessing(true)
   setError('')
   try {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!authData.user) throw new Error('Your session has expired. Please sign in again.')
    const { data: deletedRows, error: deleteError } = await supabase
     .from('unrecorded_papers')
     .delete()
     .eq('id', paper.database_id)
     .eq('created_by', authData.user.id)
     .eq('status', 'returned_to_origin')
     .filter('custom_field_values->>_source', 'eq', 'board_room_return')
     .select('id')
    if (deleteError) throw deleteError
    if (!deletedRows?.length) throw new Error('The paper was not deleted. Confirm the Board Room unrecorded-paper DELETE policy is installed and that the paper is still unprocessed.')
   } catch (deleteError) {
    setError(`Unable to remove unrecorded paper: ${getErrorMessage(deleteError)}`)
    return
   } finally {
    setProcessing(false)
   }
  }
  setUnrecordedCart(current => current.filter(item => item.id !== id))
 }

 function toggleAllVisibleDocuments() {
 const visibleIds = filteredReturnableRecords.map(
 row => row.workflow.id,
 )

 const allVisibleInCart =
 visibleIds.length > 0 &&
 visibleIds.every(id =>
 cart.some(item => item.workflowId === id),
 )

 if (allVisibleInCart) {
 setCart(current =>
 current.filter(item => !visibleIds.includes(item.workflowId)),
 )
 return
 }

 if (!hasValidActiveStorageGroup()) {
  setError('Choose a storage type and complete its folder color or box number before selecting documents.')
  return
 }

 setCart(current => {
 const existingIds = new Set(current.map(item => item.workflowId))
 const additions = visibleIds
 .filter(id => !existingIds.has(id))
 .map(workflowId => ({ workflowId, remarks: '', urgency: documentUrgencyChoices[workflowId] || 'not_urgent' as const }))

 return [...current, ...additions]
 })
 setDocumentStorageGroupIds(current => { const next = { ...current }; visibleIds.forEach(id => { if (!cart.some(item => item.workflowId === id)) next[id] = activeStorageGroupId }); return next })
 }

 async function closeCheckout() {
  if (processing) return
  const createdDraftIds = unrecordedCart
   .filter(paper => paper.is_created && paper.database_id)
   .map(paper => paper.database_id as string)

  // Cancel the UI immediately; remove only this user's unprocessed Board Room
  // unrecorded-paper drafts afterward. The DELETE policy must allow this status.
  setCartOpen(false)
  setCart([])
  setUnrecordedCart([])
  setDocumentStorageGroupIds({})
  setError('')

  if (createdDraftIds.length === 0) return
  try {
   const { data: authData, error: authError } = await supabase.auth.getUser()
   if (authError) throw authError
   if (!authData.user) throw new Error('Your session has expired. Sign in again to clean up cancelled papers.')
   const { data: deletedRows, error: deleteError } = await supabase
    .from('unrecorded_papers')
    .delete()
    .in('id', createdDraftIds)
    .eq('created_by', authData.user.id)
    .eq('status', 'returned_to_origin')
    .filter('custom_field_values->>_source', 'eq', 'board_room_return')
    .select('id')
   if (deleteError) throw deleteError
   if ((deletedRows ?? []).length !== createdDraftIds.length) {
    throw new Error('Some cancelled papers remain in the database. Confirm the Board Room unrecorded-paper DELETE policy is installed and that the papers are still unprocessed.')
   }
  } catch (cleanupError) {
   setError(`Checkout was cancelled, but cleanup failed: ${getErrorMessage(cleanupError)}`)
  }
 }

 async function submitReturn(event: FormEvent<HTMLFormElement>) {
 event.preventDefault()

 if (processing) return

 setError('')
 setSuccess('')

 if (totalReturnItems === 0) {
 setError('Select a recorded document or add an unrecorded paper to return.')
 return
 }

 // Existing workflow records retain their established return requirements.
 // Unrecorded papers can be submitted with every descriptive field left blank.
 if (cartRecords.length > 0 && !returnPerson.trim()) {
 setError('Enter the person returning the recorded documents.')
 return
 }

 if (unrecordedCart.some(paper => !paper.is_created && !paper.subject_content.trim())) {
  setError('Enter the subject/content for each unrecorded paper.')
  return
 }

 if (cartRecords.length > 0 && (!returnDate || !returnTime)) {
 setError('Return date and actual return time are required for recorded documents.')
 return
 }

 const missingStorage = cartRecords.find(row => {
  const group = row.cartStorageGroup
  return !group || (group.storageType === 'folder' ? !group.folderColor.trim() : !group.boxNumber.trim())
 })
 if (missingStorage) {
  setError(`Complete the storage location for ${missingStorage.document?.reference_number || 'each selected document'}.`)
  return
 }

 const items: ReturnCartItem[] = cartRecords.map(row => ({
  workflow_id: row.workflow.id,
  remarks: row.cartRemarks.trim(),
  urgency: row.cartUrgency,
}))

 // Re-check readiness and transaction history immediately before submitting.
 const alreadyReturnedDocumentIds = new Set(
  records
   .filter(row => ['returned_to_origin', 'completed'].includes(row.workflow.workflow_status))
   .map(row => row.workflow.unrecorded_paper_id || row.workflow.receiving_record_id)
   .filter((id): id is string => Boolean(id)),
 )
 const alreadyReturnedSelection = cartRecords.some(row => {
  const documentId = row.workflow.unrecorded_paper_id || row.workflow.receiving_record_id
  return !isReadyToReturn(row) || Boolean(documentId && alreadyReturnedDocumentIds.has(documentId))
 })
 if (alreadyReturnedSelection) {
  setError('This paper has already been returned or completed in a previous transaction. It cannot be returned again. Refresh the records and select an eligible paper.')
  return
 }

 setProcessing(true)

 try {
 const { data: authData, error: authError } =
 await supabase.auth.getUser()

 if (authError) throw authError

 if (!authData.user) {
 throw new Error('Your session has expired. Please sign in again.')
 }

 // Normalize previously confirmed records to the return-ready status expected
 // by the existing return transaction.
 const legacyReceivedIds = cartRecords
  .filter(row => row.workflow.workflow_status === 'board_room_received')
  .map(row => row.workflow.id)

 if (legacyReceivedIds.length > 0) {
  const { error: normalizeError } = await supabase
   .from('document_workflow')
   .update({
    workflow_status: 'action_completed',
    president_action_status: 'completed',
    president_action_completed_at: new Date().toISOString(),
    president_action_completed_by: authData.user.id,
   })
   .in('id', legacyReceivedIds)
   .eq('workflow_status', 'board_room_received')

  if (normalizeError) throw normalizeError
 }

 let returnedCount = 0

 if (cartRecords.length > 0) {
 const { data, error: rpcError } = await supabase.rpc(
 'board_room_return_documents',
 {
 p_items: items,
 p_returned_person: returnPerson.trim(),
 p_shared_remarks: sharedReturnRemarks.trim() || null,
 p_return_date: returnDate,
 p_return_time: returnTime,
 p_storage_type: cartRecords[0]?.cartStorageGroup?.storageType || 'folder',
 p_folder_color: cartRecords[0]?.cartStorageGroup?.storageType === 'folder' ? cartRecords[0].cartStorageGroup.folderColor.trim() : null,
 p_box_number: cartRecords[0]?.cartStorageGroup?.storageType === 'box' ? cartRecords[0].cartStorageGroup.boxNumber.trim() : null,
 // Keep the RPC's legacy shared value at Not Urgent; per-document urgency
 // is applied immediately after the return transaction succeeds.
 p_urgency: 'not_urgent',
 },
 )

 if (rpcError) throw rpcError

 // Preserve each document's individual urgency and storage location after
 // the single Board Room return RPC has completed the transaction.
 for (const row of cartRecords) {
  const group = row.cartStorageGroup!
  const { error: updateError } = await supabase
   .from('document_workflow')
   .update({
    urgency: row.cartUrgency,
    storage_type: group.storageType,
    folder_color: group.storageType === 'folder' ? group.folderColor.trim() : null,
    box_number: group.storageType === 'box' ? group.boxNumber.trim() : null,
   })
   .eq('id', row.workflow.id)
   .eq('workflow_status', 'returned_to_origin')
  if (updateError) throw updateError
 }

 returnedCount += Number(data ?? items.length)
 }

 // Unrecorded papers are created individually using the Create Paper button.
 // Do not insert them again during the final return transaction.
 if (unrecordedCart.length > 0) returnedCount += unrecordedCart.length

 setCart([])
 setDocumentStorageGroupIds({})
 setStorageGroups([{ id: 'storage-group-1', name: 'Storage Group 1', storageType: 'folder', folderColor: '', boxNumber: '' }])
 setActiveStorageGroupId('storage-group-1')
 setUnrecordedCart([])
 setCartOpen(false)
 setPickerSearch('')
 setReturnPerson('')
 setSharedReturnRemarks('')
 setReturnDate(getManilaDate())
 setReturnTime('')
 setStorageGroups([{ id: 'storage-group-1', name: 'Storage Group 1', storageType: 'folder', folderColor: '', boxNumber: '' }])
 setActiveStorageGroupId('storage-group-1')
 setDocumentStorageGroupIds({})

 setSuccess(
 unrecordedCart.length > 0
  ? `${returnedCount} paper(s) returned successfully.`
  : `${returnedCount} paper(s) returned successfully.`,
 )

 await loadRecords()
 } catch (returnError) {
 setError(getErrorMessage(returnError))
 } finally {
 setProcessing(false)
 }
 }
 return (
 <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden bg-slate-50 p-4 sm:p-6 lg:p-8">
 {/* Page heading */}
 <div className="flex shrink-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
 <div>
 <p className="text-sm font-semibold uppercase tracking-wider text-green-700">
 presSystem Management Portal
 </p>
 <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
 Board Room Documents
 </h1>
 <p className="mt-2 text-sm text-slate-500">
 Confirm document receipt and return eligible documents to their originating offices.
 </p>
 </div>

 <div className="flex flex-wrap items-center gap-3">
 {/* Urgent notification bell */}
 <div className="relative">
 <button
 type="button"
 onClick={() => setUrgentNotificationsOpen(open => !open)}
 aria-label={`Urgent incoming papers: ${urgentIncomingRecords.length}`}
 aria-expanded={urgentNotificationsOpen}
 className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 shadow-sm transition-colors hover:bg-red-50"
 >
 <Bell size={19} />
 {urgentIncomingRecords.length > 0 && (
 <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
 {urgentIncomingRecords.length > 99 ? '99+' : urgentIncomingRecords.length}
 </span>
 )}
 </button>
 {urgentNotificationsOpen && (
 <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-red-200 bg-white shadow-xl">
 <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
 <div><h3 className="font-bold text-slate-900">Urgent Incoming Papers</h3><p className="text-xs text-slate-500">{urgentIncomingRecords.length} awaiting Board Room receipt</p></div>
 <button type="button" onClick={() => setUrgentNotificationsOpen(false)} aria-label="Close urgent notifications" className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"><X size={16} /></button>
 </div>
 {urgentIncomingRecords.length === 0 ? (
 <div className="px-4 py-7 text-center text-sm text-slate-500">No urgent papers are waiting for receipt.</div>
 ) : (
 <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
 {urgentIncomingRecords.map(({ workflow, document }) => (
 <button type="button" key={workflow.id} onClick={() => { setSelectedId(workflow.id); setUrgentNotificationsOpen(false) }} className="block w-full px-4 py-3 text-left transition-colors hover:bg-red-50">
 <div className="flex items-start justify-between gap-2"><span className="break-words text-sm font-semibold text-slate-900">{getReferenceDisplay(document)}</span><span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">URGENT</span></div>
 <p className="mt-1 line-clamp-2 text-xs text-slate-600">{document?.subject || document?.content || 'No subject provided'}</p>
 <p className="mt-1 text-[11px] text-slate-500">Forwarded {formatDateTime(workflow.forwarded_at)}</p>
 </button>
 ))}
 </div>
 )}
 </div>
 )}
 </div>

 {/* Incoming count badge sits at the top-right corner of the button. */}
 <div className="relative">
 <button type="button" onClick={() => setIncomingDocumentsOpen(open => !open)} aria-label={`Incoming documents awaiting receipt: ${incomingRecords.length}`} aria-expanded={incomingDocumentsOpen} className="relative inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50">
 <FileText size={17} /> Incoming
 <span className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[10px] font-bold text-white ring-2 ring-slate-50">{incomingRecords.length > 99 ? '99+' : incomingRecords.length}</span>
 </button>
 {incomingDocumentsOpen && (
 <div className="absolute right-0 z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-blue-200 bg-white shadow-xl">
 <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h3 className="font-bold text-slate-900">Incoming Documents</h3><p className="text-xs text-slate-500">{incomingRecords.length} forwarded to the Board Room · awaiting receipt</p></div><button type="button" onClick={() => setIncomingDocumentsOpen(false)} aria-label="Close incoming documents" className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100"><X size={16} /></button></div>
 {incomingRecords.length === 0 ? <div className="px-4 py-7 text-center text-sm text-slate-500">No incoming documents are waiting for receipt.</div> : (
 <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">{incomingRecords.map(({ workflow, document }) => (
 <button type="button" key={workflow.id} onClick={() => { setSelectedId(workflow.id); setIncomingDocumentsOpen(false) }} className="block w-full px-4 py-3 text-left transition-colors hover:bg-blue-50"><div className="flex items-start justify-between gap-2"><span className="break-words text-sm font-semibold text-slate-900">{getReferenceDisplay(document)}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${workflow.urgency === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{workflow.urgency === 'urgent' ? 'URGENT' : 'NOT URGENT'}</span></div><p className="mt-1 line-clamp-2 text-xs text-slate-600">{document?.subject || document?.content || 'No subject provided'}</p><p className="mt-1 text-[11px] text-slate-500">Forwarded {formatDateTime(workflow.forwarded_at)}</p></button>
 ))}</div>
 )}
 </div>
 )}
 </div>

 <button type="button" onClick={openCart} disabled={processing} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-50"><FileText size={17} /> Return Documents <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{cart.length}</span></button>
 </div>
 </div>

 {latestUrgentRecord && (
 <div role="alert" className="flex shrink-0 items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
 <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-700" />
 <div className="min-w-0 flex-1">
 <p className="font-bold">Urgent paper forwarded to the Board Room</p>
 <p className="mt-1 break-words">
 {getReferenceDisplay(latestUrgentRecord.document)} — {latestUrgentRecord.document?.subject || latestUrgentRecord.document?.content || 'No subject provided'}
 </p>
 <p className="mt-1 text-xs text-red-700">Please prioritize this paper and confirm receipt.</p>
 </div>
 <button type="button" onClick={() => setLatestUrgentWorkflowId(null)} aria-label="Dismiss urgent paper notification" className="rounded p-1 text-red-700 ">
 <X size={16} />
 </button>
 </div>
 )}

 {/* Alerts */}
 {error && (
 <div
 role="alert"
 className="flex shrink-0 items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
 >
 <AlertCircle size={19} className="mt-0.5 shrink-0" />
 <span className="min-w-0 flex-1 break-words">{error}</span>
 <button
 type="button"
 onClick={() => setError('')}
 aria-label="Dismiss error"
 >
 <X size={16} />
 </button>
 </div>
 )}

 {success && (
 <div
 role="status"
 className="flex shrink-0 items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
 >
 <CheckCircle2 size={19} className="shrink-0" />
 <span className="flex-1">{success}</span>
 <button
 type="button"
 onClick={() => setSuccess('')}
 aria-label="Dismiss success message"
 >
 <X size={16} />
 </button>
 </div>
 )}

 {/* Document list */}
 <div className="flex min-h-0 min-w-0 flex-1 flex-col">
 <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
 <div className="border-b border-slate-200 p-4 sm:p-5">
 <h2 className="text-lg font-bold text-slate-900">
 Forwarded Documents
 </h2>
 <p className="mt-1 text-sm text-slate-500">
 Confirm receipt, then select documents whenever they are ready to be returned.
 </p>

 <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
 <label className="relative block">
 <Search
 size={17}
 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
 />
 <input
 value={search}
 onChange={event => setSearch(event.target.value)}
 placeholder="Search reference, subject, office..."
 className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
 />
 </label>

 <select
 value={statusFilter}
 onChange={event =>
 setStatusFilter(event.target.value as 'all' | WorkflowStatus)
 }
 className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-green-600"
 >
 <option value="all">All statuses</option>
 <option value="forwarded">Awaiting receipt</option>
 <option value="board_room_received">Received by Board Room</option>
 <option value="action_in_progress">In progress</option>
 <option value="action_completed">Ready to return</option>
 <option value="returned_to_origin">Returned to origin</option>
 <option value="completed">Workflow completed</option>
 </select>
 </div>
 </div>

 <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
 {loading ? (
 <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
 <LoaderCircle size={19} className="animate-spin" />
 Loading Board Room records...
 </div>
 ) : filteredRecords.length === 0 ? (
 <div className="px-6 py-14 text-center">
 <FileText size={34} className="mx-auto text-slate-300" />
 <p className="mt-3 font-semibold text-slate-700">
 No documents found
 </p>
 <p className="mt-1 text-sm text-slate-500">
 Try changing your search or status filter.
 </p>
 </div>
 ) : (
 <table className="min-w-[1240px] w-full border-collapse text-left text-sm">
 <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
 <tr className="border-b border-slate-200">
 <th className="w-16 px-5 py-3 font-semibold">No.</th>
 <th className="min-w-[170px] px-5 py-3 font-semibold">PresOffice No.</th>
 <th className="min-w-[240px] px-5 py-3 font-semibold">Content / Subject</th>
 <th className="min-w-[220px] px-5 py-3 font-semibold">Transaction / Storage</th>
 <th className="px-5 py-3 font-semibold">Urgency</th>
 <th className="px-5 py-3 font-semibold">Forwarded</th>
 <th className="px-5 py-3 font-semibold">Status</th>
 <th className="px-5 py-3 font-semibold">Action Account</th>
 <th className="px-5 py-3 font-semibold">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100">
 {paginatedRecords.map(({ workflow, document }, index) => {
 const inCart = cart.some(
 item => item.workflowId === workflow.id,
 )
 const canReturn = isReadyToReturn({ workflow, document })

 return (
 <tr
 key={workflow.id}
 onClick={() => setSelectedId(workflow.id)}
 className="cursor-pointer bg-white transition-colors hover:bg-slate-50"
 >
 <td className="px-5 py-4 font-semibold tabular-nums text-slate-600">
 {(currentPage - 1) * pageSize + index + 1}
 </td>
 <td className="min-w-[170px] px-5 py-4">
 {isUnrecordedPaper(document) ? (
 <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">UNRECORDED</span>
 ) : (
 <button type="button" onClick={(event) => { event.stopPropagation(); void copyDocumentCode(document?.reference_number, event) }} title="Click to copy reference number" className="break-words text-left font-semibold text-slate-900 hover:text-blue-700 focus:outline-none focus:underline">
 {getReferenceDisplay(document)}
 </button>
 )}
 </td>

 <td className="min-w-[240px] max-w-[360px] px-5 py-4">
 <div
 className="break-words text-sm text-slate-700"
 title={document?.subject || document?.content || ''}
 >
 {document?.subject ||
 document?.content ||
 'No subject provided'}
 </div>
 </td>

 <td className="min-w-[220px] px-5 py-4">
 <div>
 <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
 Transaction Person
 </div>
 <div className="mt-0.5 break-words text-sm font-medium text-slate-800">
 {workflow.transaction_person || '—'}
 </div>
 </div>
 <div className="mt-2 border-t border-slate-100 pt-2">
 <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
 Storage
 </div>
 <span className="mt-1 inline-flex max-w-full break-words rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
 {getStorageLabel(workflow)}
 </span>
 </div>
 </td>

 <td className="px-5 py-4">
 <span
 className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
 workflow.urgency === 'urgent'
 ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
 : 'bg-slate-100 text-slate-600'
 }`}
 >
 {workflow.urgency === 'urgent'
 ? 'Urgent'
 : 'Not Urgent'}
 </span>
 </td>

 <td className="min-w-[190px] px-5 py-4 text-xs text-slate-600">
 <div className="whitespace-nowrap">
 {formatDateOnly(workflow.forwarding_date)}
 </div>
 <div className="mt-1 whitespace-nowrap text-slate-400">
 {formatTime(workflow.forwarding_time)}
 </div>
 <div className="mt-2 whitespace-normal break-words">
 <span className="font-semibold text-slate-500">
 Forwarded by:
 </span>
 <div className="mt-0.5 font-medium text-slate-800">
 {workflow.forwarded_by
 ? accountNames[workflow.forwarded_by] ||
 'Account name unavailable'
 : '—'}
 </div>
 </div>
 {workflow.forwarded_at && (
 <div className="mt-1 text-[11px] text-slate-500">
 At: {formatDateTime(workflow.forwarded_at)}
 </div>
 )}
 </td>

 <td className="px-5 py-4">
 <span
 className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses[workflow.workflow_status]}`}
 >
 {statusLabels[workflow.workflow_status]}
 </span>
 </td>

 <td className="min-w-[220px] px-5 py-4 text-xs text-slate-600">
 {workflow.board_room_received_at && (
 <div>
 <div className="font-semibold text-slate-500">Confirmed by:</div>
 <div className="font-medium text-slate-800">
 {workflow.board_room_received_by
 ? accountNames[workflow.board_room_received_by] ||
 'Account name unavailable'
 : '—'}
 </div>
 <div className="mt-0.5 text-[11px] text-slate-500">
 Confirmed at: {formatDateTime(workflow.board_room_received_at)}
 </div>
 </div>
 )}
 {workflow.returned_to_origin_at && (
 <div className={workflow.board_room_received_at ? 'mt-2 border-t border-slate-100 pt-2' : ''}>
 <div className="font-semibold text-slate-500">Picked up by / Storage:</div>
 <div className="mt-0.5 break-words font-medium text-slate-800">
 {workflow.returned_to_origin_person?.trim() || 'Person not recorded'}
 {' / '}
 {getStorageLabel(workflow)}
 </div>
 <div className="mt-1 font-semibold text-slate-500">Return processed by:</div>
 <div className="font-medium text-slate-800">
 {workflow.returned_to_origin_by
 ? accountNames[workflow.returned_to_origin_by] ||
 'Account name unavailable'
 : '—'}
 </div>
 <div className="mt-0.5 text-[11px] text-slate-500">
 Returned at: {formatDateTime(workflow.returned_to_origin_at)}
 </div>
 </div>
 )}
 {!workflow.board_room_received_at &&
 !workflow.returned_to_origin_at && '—'}
 </td>

 <td
 className="px-5 py-4"
 onClick={event => event.stopPropagation()}
 >
 <div className="flex min-w-[170px] flex-wrap gap-2">
 <button
 type="button"
 onClick={() => {
 setSelectedId(workflow.id)
 setDestinationFieldDefinitions([])
 setViewDetailsOpen(true)
 void loadDestinationFieldDefinitions(document)
 }}
 className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
 >
 <FileText size={14} /> View
 </button>

 {workflow.workflow_status === 'forwarded' && (
 <button
 type="button"
 disabled={processing}
 onClick={() => void receiveDocument(workflow.id)}
 className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-800 disabled:opacity-50"
 >
 <CheckCircle2 size={14} />
 {processing ? 'Confirming...' : 'Confirm Receipt'}
 </button>
 )}

 {canReturn && (
 <button
 type="button"
 disabled={inCart}
 onClick={() => addToCart(workflow.id)}
 className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
 >
 {inCart ? (
 <Check size={14} />
 ) : (
 <FileText size={14} />
 )}
 {inCart ? 'Selected' : 'Select for Return'}
 </button>
 )}

 {workflow.workflow_status !== 'forwarded' &&
 workflow.workflow_status !== 'action_in_progress' &&
 !canReturn && (
 <span className="text-xs text-slate-400">
 No actions
 </span>
 )}
 </div>
 </td>
 </tr>
 )
 })}
 </tbody>
 </table>
 )}
 </div>

 <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
  <p className="text-xs text-slate-500">
   Showing {filteredRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRecords.length)} of {filteredRecords.length} filtered records ({records.length} total)
  </p>
  <div className="flex items-center justify-between gap-2 sm:justify-end">
   <button
    type="button"
    onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
    disabled={currentPage === 1}
    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
   >
    Previous
   </button>
   <span className="whitespace-nowrap text-xs font-medium text-slate-600">
    Page {currentPage} of {totalPages}
   </span>
   <button
    type="button"
    onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
    disabled={currentPage >= totalPages}
    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
   >
    Next
   </button>
  </div>
 </div>
 </section>
 </div>

 {/* Document details modal */}
 {viewDetailsOpen && selected && (
 <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
 <section
 role="dialog"
 aria-modal="true"
 aria-labelledby="document-details-title"
 className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
 >
 <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
 Document details
 </p>
 <button
 type="button"
 onClick={(event) => void copyDocumentCode(selected.document?.reference_number, event)}
 title="Click to copy reference number"
 className="mt-1 block text-left text-xl font-bold text-slate-900 hover:text-blue-700 focus:outline-none focus:underline"
 >
 {getReferenceDisplay(selected.document)}
 </button>
 {selected.document?.is_unrecorded_paper === true && <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-800">UNRECORDED PAPER</span>}
 <div className="mt-3 flex flex-wrap gap-2">
 <span
 className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[selected.workflow.workflow_status]}`}
 >
 {statusLabels[selected.workflow.workflow_status]}
 </span>
 <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
 {getStorageLabel(selected.workflow)}
 </span>
 <span
 className={`rounded-full px-3 py-1 text-xs font-semibold ${
 selected.workflow.urgency === 'urgent'
 ? 'bg-red-50 text-red-700'
 : 'bg-slate-100 text-slate-600'
 }`}
 >
 {selected.workflow.urgency === 'urgent'
 ? 'Urgent'
 : 'Not Urgent'}
 </span>
 </div>
 </div>

 <button
 type="button"
 onClick={() => setViewDetailsOpen(false)}
 aria-label="Close document details"
 className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
 >
 <X size={19} />
 </button>
 </div>

 <div className="p-6">
 <h3 className="mb-3 text-sm font-bold text-slate-900">
 Receiving details for {formatDestinationName(selected.document?.destination_folder || selected.document?.current_office)}
 </h3>
 {destinationFieldsLoading ? (
 <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Loading receiving details…</div>
 ) : (
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 {[
   { label: 'PresOffice Number', value: selected.document?.reference_number },
   { label: 'System Code', value: selected.document?.system_code },
   { label: 'Content / Subject', value: selected.document?.content || selected.document?.subject },
   { label: 'Bearer / Sender', value: selected.document?.bearer || selected.document?.sender },
   { label: 'Inputted by', value: selected.document?.receiving_staff },
   { label: 'Urgency', value: (typeof selected.document?.urgency === 'string' && ['urgent', 'high', 'yes', 'true'].includes(selected.document.urgency.trim().toLowerCase())) ? 'Urgent' : '' },
   { label: 'Destination Folder', value: formatDestinationName(selected.document?.destination_folder || selected.document?.current_office) },
   { label: 'Date / Time Received', value: selected.document?.received_at ? formatDateTime(selected.document.received_at) : formatDateOnly(selected.document?.date_received) },
   { label: 'Status', value: selected.document?.status },
 ].map(({ label, value }) => (
   <div key={String(label)} className="min-w-0 rounded-lg bg-slate-50 p-3">
     <p className="text-xs font-semibold text-slate-500">{label}</p>
     <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{value === null || value === undefined || value === '' ? '—' : String(value)}</p>
   </div>
 ))}
 {destinationFieldDefinitions.map(field => {
   const values = selected.document?.custom_field_values
   const normalizedFieldName = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
   const valueEntries = values && typeof values === 'object' ? Object.entries(values) : []
   const matchedEntry = valueEntries.find(([key]) => normalizedFieldName(key) === normalizedFieldName(field.field_name))
   const value = values && typeof values === 'object' ? (values[field.id] ?? values[field.field_name] ?? matchedEntry?.[1]) : undefined
   return (
     <div key={field.id} className="min-w-0 rounded-lg bg-slate-50 p-3">
       <p className="text-xs font-semibold text-slate-500">{field.field_name}</p>
       <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{value === null || value === undefined || value === '' ? '—' : String(value)}</p>
     </div>
   )
 })}
 {selected.document?.remarks ? (
   <div className="min-w-0 rounded-lg bg-slate-50 p-3">
     <p className="text-xs font-semibold text-slate-500">Remarks</p>
     <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{selected.document.remarks}</p>
   </div>
 ) : null}
 {selected.document?.created_at ? (
   <div className="min-w-0 rounded-lg bg-slate-50 p-3">
     <p className="text-xs font-semibold text-slate-500">Created At</p>
     <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{formatDateTime(selected.document.created_at)}</p>
   </div>
 ) : null}
 {destinationFieldDefinitions.length === 0 && (
   <p className="text-sm text-slate-500 sm:col-span-2">No additional custom fields are configured for this destination folder.</p>
 )}
 </div>
 )}
 </div>

 <div className="flex justify-end border-t border-slate-200 px-6 py-4">
 <button
 type="button"
 onClick={() => setViewDetailsOpen(false)}
 className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
 >
 Close
 </button>
 </div>
 </section>
 </div>
 )}
 {/* Return documents form */}
 {cartOpen && (
 <div
  className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-slate-950/60 p-2 backdrop-blur-sm sm:p-4"
  onMouseDown={event => { if (event.target === event.currentTarget) closeCheckout() }}
 >
 <section
 role="dialog"
 aria-modal="true"
 aria-labelledby="return-documents-title"
 className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)]"
 >
 <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
 <div>
 <div className="flex items-center gap-2">
 <FileText size={21} className="text-blue-700" />
 <h2
 id="return-documents-title"
 className="text-lg font-bold text-slate-900"
 >
 Return Documents
 </h2>
 <span className="rounded-full bg-blue-700 px-2.5 py-1 text-xs font-bold text-white">
 {totalReturnItems}
 </span>
 </div>
 <p className="mt-1 text-sm text-slate-500">
Select recorded documents or add an unrecorded paper. Unrecorded papers become normal Receiving Records when returned.
 </p>
 </div>

 <button
 type="button"
 disabled={processing}
 onClick={closeCheckout}
 aria-label="Close return documents form"
 className="rounded-lg p-2 text-slate-500 disabled:opacity-50"
 >
 <X size={19} />
 </button>
 </div>

 <form onSubmit={submitReturn} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-7">
 {/* Per-document storage groups */}
 <div className="border-t border-slate-200 pt-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h3 className="text-sm font-bold text-slate-900">Storage Groups</h3><p className="mt-1 text-xs text-slate-500">Create multiple folder or box locations, then assign each recorded document to its correct storage group.</p></div>
   <button type="button" onClick={addStorageGroup} disabled={processing} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">+ Add Storage Group</button>
  </div>
  <div className="mt-3 flex flex-wrap gap-2">
   {storageGroups.map((group, index) => <button key={group.id} type="button" onClick={() => setActiveStorageGroupId(group.id)} className={`rounded-lg border px-3 py-2 text-left text-xs ${activeStorageGroupId === group.id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white'}`}><span className="block font-bold">{group.name || `Storage Group ${index + 1}`}</span><span className="text-slate-500">{group.storageType === 'folder' ? `Folder: ${group.folderColor || 'Choose color'}` : `Box: ${group.boxNumber || 'Enter number'}`}</span></button>)}
  </div>
  {storageGroups.find(group => group.id === activeStorageGroupId) && (() => { const group = storageGroups.find(item => item.id === activeStorageGroupId)!; return <div className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2">
   <label className="block"><span className="text-xs font-semibold text-slate-600">Storage Type</span><select value={group.storageType} onChange={event => updateStorageGroup(group.id, { storageType: event.target.value as 'folder' | 'box', folderColor: '', boxNumber: '' })} className={inputClass}><option value="folder">Folder (Color)</option><option value="box">Box (Number)</option></select></label>
   {group.storageType === 'folder' ? <label className="block"><span className="text-xs font-semibold text-slate-600">Folder Color</span><select value={group.folderColor} onChange={event => updateStorageGroup(group.id, { folderColor: event.target.value })} className={inputClass}><option value="">Select folder color...</option>{['Red','Blue','Green','Light Blue','Orange','White'].map(color => <option key={color} value={color}>{color}</option>)}</select></label> : <label className="block"><span className="text-xs font-semibold text-slate-600">Box Number</span><input value={group.boxNumber} onChange={event => updateStorageGroup(group.id, { boxNumber: event.target.value })} placeholder="Enter box number" className={inputClass} /></label>}
  </div> })()}
 </div>


 {/* Search and select documents */}
 <div>
 <label className="mb-2 block text-xs font-semibold text-slate-600">
 Recorded Documents (Optional if adding unrecorded papers)
 </label>
 {hasValidActiveStorageGroup() ? (
  <p className="mb-2 text-xs text-emerald-700">Active storage: {storageGroups.find(group => group.id === activeStorageGroupId)?.storageType === 'folder' ? `Folder — ${storageGroups.find(group => group.id === activeStorageGroupId)?.folderColor}` : `Box — ${storageGroups.find(group => group.id === activeStorageGroupId)?.boxNumber}`}. Newly selected documents will use this storage group. You can assign a different group to each document afterward.</p>
 ) : (
  <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Choose and complete a storage group above before selecting recorded documents.</p>
 )}

 <div className="relative">
 <Search
 size={17}
 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
 />
 <input
 autoFocus
 value={pickerSearch}
 onChange={event => setPickerSearch(event.target.value)}
 placeholder="Search reference, subject, sender, office, folder or box..."
 className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
 />
 </div>

 <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
 <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
 <div>
 <p className="text-xs font-semibold text-slate-700">
 Eligible Board Room documents
 </p>
 <p className="mt-0.5 text-xs text-slate-500">
 {filteredReturnableRecords.length} matching document(s)
 </p>
 </div>

 <button
 type="button"
 disabled={filteredReturnableRecords.length === 0 || (!hasValidActiveStorageGroup() && !filteredReturnableRecords.every(row => cart.some(item => item.workflowId === row.workflow.id)))}
 onClick={toggleAllVisibleDocuments}
 className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
 >
 {filteredReturnableRecords.length > 0 &&
 filteredReturnableRecords.every(row =>
 cart.some(item => item.workflowId === row.workflow.id),
 )
 ? 'Remove matches'
 : 'Add all matches'}
 </button>
 </div>

 <div className="max-h-64 overflow-y-auto p-2">
 {filteredReturnableRecords.length === 0 ? (
 <div className="p-5 text-center">
 <p className="text-sm font-semibold text-slate-700">
 No eligible documents found
 </p>
 <p className="mt-1 text-xs text-slate-500">
 Only documents confirmed as received by the Board Room can be selected for return.
 </p>
 </div>
 ) : (
 filteredReturnableRecords.map(({ workflow, document }) => {
 const isSelected = cart.some(
 item => item.workflowId === workflow.id,
 )

 return (
 <div
 key={workflow.id}
 className="flex items-start gap-3 rounded-lg px-3 py-2.5 "
 >
 <input
 type="checkbox"
 checked={isSelected}
 disabled={!isSelected && !hasValidActiveStorageGroup()}
 onChange={() =>
 isSelected
 ? removeFromCart(workflow.id)
 : addToCart(workflow.id)
 }
 aria-label={`${isSelected ? 'Remove' : 'Select'} ${document?.reference_number || 'document'}`}
 className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
 />

 <div className="min-w-0 flex-1">
 <button type="button" onClick={(event) => { event.stopPropagation(); void copyDocumentCode(document?.reference_number, event) }} title="Click to copy reference number" className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 focus:outline-none focus:underline">
 {getReferenceDisplay(document)}
 </button>
 <p className="mt-0.5 break-words text-xs text-slate-600">
 {document?.subject ||
 document?.content ||
 'No subject provided'}
 </p>
 <p className="mt-1 text-[11px] text-slate-500">
 {statusLabels[workflow.workflow_status]}
 </p>
 <div className="mt-2 flex flex-wrap items-center gap-1.5">
  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Urgency</span>
  <button
   type="button"
   aria-pressed={(documentUrgencyChoices[workflow.id] || (cart.find(item => item.workflowId === workflow.id)?.urgency) || 'not_urgent') === 'urgent'}
   onClick={() => updateCartUrgency(workflow.id, 'urgent')}
   className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${(documentUrgencyChoices[workflow.id] || cart.find(item => item.workflowId === workflow.id)?.urgency || 'not_urgent') === 'urgent' ? 'border-red-300 bg-red-100 text-red-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-700'}`}
  >Urgent</button>
  <button
   type="button"
   aria-pressed={(documentUrgencyChoices[workflow.id] || cart.find(item => item.workflowId === workflow.id)?.urgency || 'not_urgent') === 'not_urgent'}
   onClick={() => updateCartUrgency(workflow.id, 'not_urgent')}
   className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${(documentUrgencyChoices[workflow.id] || cart.find(item => item.workflowId === workflow.id)?.urgency || 'not_urgent') === 'not_urgent' ? 'border-blue-300 bg-blue-100 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`}
  >Not Urgent</button>
 </div>
 {isSelected && (
  <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
   <label className="block">
    <span className="text-[11px] font-semibold text-slate-600">Storage Group (Required)</span>
    <select
     value={documentStorageGroupIds[workflow.id] || activeStorageGroupId}
     onChange={event => assignDocumentStorage(workflow.id, event.target.value)}
     className={inputClass}
    >
     {storageGroups.map((group, index) => (
      <option key={group.id} value={group.id}>
       {group.name || `Storage Group ${index + 1}`} — {group.storageType === 'folder' ? `Folder ${group.folderColor || '(color not set)'}` : `Box ${group.boxNumber || '(number not set)'}`}
      </option>
     ))}
    </select>
   </label>
   <label className="block">
    <span className="text-[11px] font-semibold text-slate-600">Remarks (Optional)</span>
    <textarea
     value={cart.find(item => item.workflowId === workflow.id)?.remarks || ''}
     onChange={event => updateCartRemarks(workflow.id, event.target.value)}
     rows={2}
     placeholder="Enter remarks specific to this document..."
     className={inputClass}
    />
   </label>
  </div>
 )}
 </div>

 <span
 className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
 isSelected
 ? 'bg-blue-100 text-blue-700'
 : 'bg-slate-100 text-slate-500'
 }`}
 >
 {isSelected ? 'Selected' : 'Select'}
 </span>
 </div>
 )
 })
 )}
 </div>
 </div>

 {/* Add unrecorded paper entries */}
 <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <p className="text-sm font-semibold text-slate-900">Unrecorded Papers</p>
    <p className="mt-0.5 text-xs text-slate-600">Enter the paper content. The signed-in account is recorded automatically; no destination folder is required.</p>
   </div>
   <button type="button" onClick={addUnrecordedPaper} disabled={processing} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">+ Add Unrecorded Paper</button>
  </div>
  {unrecordedCart.some(paper => paper.is_created) && (
   <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
    {unrecordedCart.filter(paper => paper.is_created).length} unrecorded paper(s) saved and ready to include in this return.
   </div>
  )}
  {unrecordedCart.some(paper => !paper.is_created) && (
   <div className="mt-3 space-y-3">
    {unrecordedCart.filter(paper => !paper.is_created).map((paper, index) => (
     <div key={paper.id} className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
       <div><span className={`rounded px-2 py-1 text-[10px] font-bold ${paper.is_created ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{paper.is_created ? 'SAVED' : 'UNRECORDED PAPER'}</span><span className="ml-2 text-xs font-semibold text-slate-600">Paper {index + 1}</span></div>
       {!paper.is_created && <button type="button" onClick={() => removeUnrecordedPaper(paper.id)} disabled={processing} className="text-xs font-semibold text-red-600 disabled:opacity-50">Remove</button>}
       {paper.is_created && <span className="text-xs font-semibold text-emerald-700">Saved to Receiving Records</span>}
      </div>
      <label className="block"><span className="text-xs font-semibold text-slate-600">Content *</span><textarea value={paper.subject_content} onChange={e => updateUnrecordedPaper(paper.id, 'subject_content', e.target.value)} rows={3} required disabled={paper.is_created} placeholder="Enter the content of the unrecorded paper" className={inputClass} /></label>
      <div className="mt-3"><span className="text-xs font-semibold text-slate-600">Urgency</span><div className="mt-2 flex gap-5"><label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="radio" name={`unrecorded-urgency-${paper.id}`} checked={paper.urgency === 'urgent'} disabled={paper.is_created} onChange={() => updateUnrecordedPaper(paper.id, 'urgency', 'urgent')} className="accent-red-600" />Urgent</label><label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="radio" name={`unrecorded-urgency-${paper.id}`} checked={paper.urgency === 'not_urgent'} disabled={paper.is_created} onChange={() => updateUnrecordedPaper(paper.id, 'urgency', 'not_urgent')} className="accent-blue-700" />Not Urgent</label></div></div>
      <label className="mt-3 block"><span className="text-xs font-semibold text-slate-600">Storage Group *</span><select value={paper.storage_group_id} disabled={paper.is_created} onChange={e => updateUnrecordedPaper(paper.id, 'storage_group_id', e.target.value)} className={inputClass}>{storageGroups.map((group, groupIndex) => <option key={group.id} value={group.id}>{group.name || `Storage Group ${groupIndex + 1}`} — {group.storageType === 'folder' ? `Folder ${group.folderColor || '(color not set)'}` : `Box ${group.boxNumber || '(number not set)'}`}</option>)}</select></label>
      {paper.is_created && <p className="mt-2 text-xs text-emerald-700">Urgency and storage assignment have been saved with this paper.</p>}
      {!paper.is_created && <div className="mt-4 flex justify-end border-t border-amber-100 pt-3"><button type="button" onClick={() => void createUnrecordedPaper(paper.id)} disabled={processing} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">{processing ? 'Saving...' : 'Save Unrecorded Paper'}</button></div>}
     </div>
    ))}
   </div>
  )}
 </div>

 {/* Selected documents and individual remarks */}
 <div className="mt-4 rounded-xl border border-whi-200 bg-white-50 p-4">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-sm font-semibold text-white-950">
 Selected Documents
 </p>
 <p className="mt-0.5 text-xs text-slate-600">
 Selected paper numbers are listed here. Set urgency, storage, and remarks in Eligible Board Room documents.
 </p>
 </div>
 <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-700 px-2 text-xs font-bold text-white">
 {totalReturnItems}
 </span>
 </div>

 <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
 <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
 <p className="text-[11px] font-medium text-blue-700">Selected</p>
 <p className="text-lg font-bold tabular-nums text-blue-900">{totalReturnItems}</p>
 </div>
 <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
 <p className="text-[11px] font-medium text-red-700">Urgent</p>
 <p className="text-lg font-bold tabular-nums text-red-900">{cartRecords.filter(row => row.cartUrgency === 'urgent').length + unrecordedCart.filter(paper => paper.urgency === 'urgent').length}</p>
 </div>
 <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
 <p className="text-[11px] font-medium text-slate-600">Not Urgent</p>
 <p className="text-lg font-bold tabular-nums text-slate-900">{cartRecords.filter(row => row.cartUrgency === 'not_urgent').length + unrecordedCart.filter(paper => paper.urgency === 'not_urgent').length}</p>
 </div>
 </div>

 {totalReturnItems === 0 ? (
 <p className="mt-4 text-sm text-slate-500">
 No papers selected yet.
 </p>
 ) : (
 <div className="mt-3 space-y-3 pr-1">
 {cartRecords.map(({ workflow, document }) => (
 <div
  key={workflow.id}
  className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2"
 >
  <div className="min-w-0">
   <span className="break-words text-sm font-semibold text-slate-900">
    {getReferenceDisplay(document)}
   </span>
  </div>
  <button
   type="button"
   onClick={() => removeFromCart(workflow.id)}
   disabled={processing}
   className="shrink-0 text-xs font-semibold text-red-600 disabled:opacity-50"
  >
   Remove
  </button>
 </div>
 ))}
 {unrecordedCart.map((paper, index) => (
  <div key={paper.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
   <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">UNRECORDED</span>
   <span className="text-xs text-slate-600">Paper {index + 1}</span>
  </div>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Shared return details */}
 <div className="border-t border-slate-200 pt-5">
 <h3 className="text-sm font-bold text-slate-900">
 Return Details
 </h3>
 <p className="mt-1 text-xs text-slate-500">
 These details apply to recorded documents. Leave them blank when returning only unrecorded papers.
 </p>

 <div className="mt-4 space-y-4">
 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Person Returning the Documents (Required for recorded documents)
 </span>
 <input
 required
 value={returnPerson}
 onChange={event => setReturnPerson(event.target.value.toUpperCase())}
 placeholder="Enter the person's full name"
 className={inputClass}
 />
 </label>

 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Shared Return Remarks (Optional)
 </span>
 <textarea
 value={sharedReturnRemarks}
 onChange={event =>
 setSharedReturnRemarks(event.target.value.toUpperCase())
 }
 rows={2}
 placeholder="Enter remarks that apply to all returned documents..."
 className={inputClass}
 />
 </label>

 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Return Date (Required for recorded documents)
 </span>
 <input
 required
 type="date"
 value={returnDate}
 onChange={event => setReturnDate(event.target.value)}
 className={inputClass}
 />
 </label>

 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Actual Return Time (Required for recorded documents)
 </span>
 <input
 required
 type="time"
 value={returnTime}
 onChange={event => setReturnTime(event.target.value)}
 className={inputClass}
 />
 </label>
 </div>

 <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
 <p className="text-xs font-semibold text-slate-600">
 Recorded By
 </p>
 <p className="mt-1 text-sm text-slate-800">
 Automatically recorded from the authenticated Supabase session.
 </p>
 </div>
 </div>
 </div>

 {/* Checkout count and actions */}
 <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="text-sm font-semibold text-slate-700">
 {totalReturnItems} paper(s) selected
 </p>
 <p className="mt-1 text-xs text-slate-500">
 Each paper keeps its own urgency and remarks; one transaction can mix Urgent and Not Urgent documents.
 </p>
 </div>

 <div className="flex flex-col-reverse gap-3 sm:flex-row">
 <button
 type="button"
 disabled={processing}
 onClick={closeCheckout}
 className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
 >
 Cancel
 </button>

 <button
 type="submit"
 disabled={processing || totalReturnItems === 0}
 className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
 >
 {processing ? (
 <LoaderCircle size={16} className="animate-spin" />
 ) : (
 <Send size={16} />
 )}
 {processing
 ? 'Returning...'
 : `Return ${totalReturnItems} Paper(s)`}
 </button>
 </div>
 </div>
 </form>
 </section>
 </div>
 )}

 </div>
 )
}
