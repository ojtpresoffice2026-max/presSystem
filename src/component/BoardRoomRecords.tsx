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
 date_received: string | null
 status: string | null
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

const statusLabels: Record<WorkflowStatus, string> = {
 forwarded: 'Awaiting receipt',
 board_room_received: 'Received by Board Room',
 action_in_progress: 'In progress',
 action_completed: 'Ready to return',
 returned_to_origin: 'Returned to origin',
 completed: 'Workflow completed',
}

const statusClasses: Record<WorkflowStatus, string> = {
 forwarded: 'bg-amber-100 text-amber-800',
 board_room_received: 'bg-blue-100 text-blue-800',
 action_in_progress: 'bg-violet-100 text-violet-800',
 action_completed: 'bg-emerald-100 text-emerald-800',
 returned_to_origin: 'bg-orange-100 text-orange-800',
 completed: 'bg-green-100 text-green-800',
}

const inputClass =
 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

// A document can be returned to its originating office only after the
// Board Room has confirmed physical receipt AND the action is completed.
const returnableStatuses: WorkflowStatus[] = ['action_completed']

function isReadyToReturn(row: DisplayRecord) {
 return (
  returnableStatuses.includes(row.workflow.workflow_status) &&
  Boolean(row.workflow.board_room_received_at)
 )
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
 const [search, setSearch] = useState('')
 const [statusFilter, setStatusFilter] =
 useState<'all' | WorkflowStatus>('all')

 const [loading, setLoading] = useState(true)
 const [processing, setProcessing] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
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
 const [cartOpen, setCartOpen] = useState(false)
 const [pickerSearch, setPickerSearch] = useState('')

 // Shared return checkout details.
 const [returnPerson, setReturnPerson] = useState('')
 const [sharedReturnRemarks, setSharedReturnRemarks] = useState('')
 const [returnDate, setReturnDate] = useState(getManilaDate)
 const [returnTime, setReturnTime] = useState('')

 // Storage settings are shared across the return transaction. Urgency is set per paper.
 const [returnStorageType, setReturnStorageType] =
 useState<'folder' | 'box'>('folder')
 const [returnFolderColor, setReturnFolderColor] = useState('')
 const [returnBoxNumber, setReturnBoxNumber] = useState('')

 const loadRecords = useCallback(async () => {
 setLoading(true)
 setError('')

 try {
 const { data: workflows, error: workflowError } = await supabase
 .from('document_workflow')
 .select('*')
 .order('forwarded_at', { ascending: false })

 if (workflowError) throw workflowError

 const workflowRows = (workflows ?? []) as WorkflowRecord[]

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

 const receivingIds = [
 ...new Set(workflowRows.map(row => row.receiving_record_id)),
 ]

 let documents: ReceivingRecord[] = []

 if (receivingIds.length > 0) {
 const { data, error: documentError } = await supabase
 .from('receiving_records')
 .select(
 'id, reference_number, record_type, subject, content, sender, bearer, origin_office, destination_folder, current_office, date_received, status',
 )
 .in('id', receivingIds)

 if (documentError) throw documentError
 documents = (data ?? []) as ReceivingRecord[]
 }

 const documentMap = new Map(
 documents.map(document => [document.id, document]),
 )

 const combined: DisplayRecord[] = workflowRows.map(workflow => ({
 workflow,
 document: documentMap.get(workflow.receiving_record_id) ?? null,
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

 const selected =
 records.find(row => row.workflow.id === selectedId) ?? null

 const returnableRecords = useMemo(
 () =>
 records.filter(isReadyToReturn),
 [records],
 )

 const cartRecords = useMemo(
 () =>
 cart
 .map(item => {
 const row = returnableRecords.find(
 record => record.workflow.id === item.workflowId,
 )

 return row ? { ...row, cartRemarks: item.remarks, cartUrgency: item.urgency } : null
 })
 .filter(
 (row): row is DisplayRecord & { cartRemarks: string; cartUrgency: 'urgent' | 'not_urgent' } =>
 row !== null,
 ),
 [cart, returnableRecords],
 )

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
 const { error: rpcError } = await supabase.rpc(
 'board_room_receive',
 { p_workflow_id: workflowId },
 )

 if (rpcError) throw rpcError

 setSuccess('Board Room receipt recorded successfully.')
 await loadRecords()
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

 function addToCart(workflowId: string) {
 setCart(current => {
 if (current.some(item => item.workflowId === workflowId)) {
 return current
 }

 return [...current, { workflowId, remarks: '', urgency: 'not_urgent' }]
 })

 setSuccess('')
 }

 function removeFromCart(workflowId: string) {
 setCart(current =>
 current.filter(item => item.workflowId !== workflowId),
 )
 }

 function updateCartRemarks(workflowId: string, remarks: string) {
 setCart(current =>
 current.map(item =>
 item.workflowId === workflowId ? { ...item, remarks } : item,
 ),
 )
 }

 function updateCartUrgency(workflowId: string, urgency: 'urgent' | 'not_urgent') {
 setCart(current =>
 current.map(item =>
 item.workflowId === workflowId ? { ...item, urgency } : item,
 ),
 )
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

 setCart(current => {
 const existingIds = new Set(current.map(item => item.workflowId))
 const additions = visibleIds
 .filter(id => !existingIds.has(id))
 .map(workflowId => ({ workflowId, remarks: '', urgency: 'not_urgent' as const }))

 return [...current, ...additions]
 })
 }

 function closeCheckout() {
 if (processing) return

 setCartOpen(false)
 }

 async function submitReturn(event: FormEvent<HTMLFormElement>) {
 event.preventDefault()

 if (processing) return

 setError('')
 setSuccess('')

 if (cartRecords.length === 0) {
 setError('Select at least one document to return.')
 return
 }

 if (!returnPerson.trim()) {
 setError('Enter the person returning the documents.')
 return
 }

 if (!returnDate || !returnTime) {
 setError('Return date and actual return time are required.')
 return
 }

 if (returnStorageType === 'folder' && !returnFolderColor.trim()) {
 setError('Select a folder color for the returned documents.')
 return
 }

 if (returnStorageType === 'box' && !returnBoxNumber.trim()) {
 setError('Enter a box number for the returned documents.')
 return
 }

 const items: ReturnCartItem[] = cartRecords.map(row => ({
  workflow_id: row.workflow.id,
  remarks: row.cartRemarks.trim(),
  urgency: row.workflow.urgency === 'urgent' ? 'urgent' : 'not_urgent',
}))

 // Re-check readiness immediately before submitting the return transaction.
 if (cartRecords.some(row => !isReadyToReturn(row))) {
 setError('Only documents received by the Board Room and marked Ready to return can be returned to their originating offices. Reload the page and try again.')
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

 const { data, error: rpcError } = await supabase.rpc(
 'board_room_return_documents',
 {
 p_items: items,
 p_returned_person: returnPerson.trim(),
 p_shared_remarks: sharedReturnRemarks.trim() || null,
 p_return_date: returnDate,
 p_return_time: returnTime,
 p_storage_type: returnStorageType,
 p_folder_color:
 returnStorageType === 'folder' ? returnFolderColor.trim() : null,
 p_box_number:
 returnStorageType === 'box' ? returnBoxNumber.trim() : null,
 // Keep the RPC's legacy shared value at Not Urgent; per-document urgency
 // is applied immediately after the return transaction succeeds.
 p_urgency: 'not_urgent',
 },
 )

 if (rpcError) throw rpcError

 // Apply each paper's own urgency so a single return transaction can contain
 // both Urgent and Not Urgent documents. The RPC marks the selected papers
 // as returned; this follow-up preserves the per-paper urgency choices.
 for (const row of cartRecords) {
  const { error: urgencyError } = await supabase
   .from('document_workflow')
   .update({ urgency: row.cartUrgency })
   .eq('id', row.workflow.id)
   .eq('workflow_status', 'returned_to_origin')
  if (urgencyError) throw urgencyError
 }

 const returnedCount = Number(data ?? items.length)

 setCart([])
 setCartOpen(false)
 setPickerSearch('')
 setReturnPerson('')
 setSharedReturnRemarks('')
 setReturnDate(getManilaDate())
 setReturnTime('')
 setReturnStorageType('folder')
 setReturnFolderColor('')
 setReturnBoxNumber('')

 setSuccess(
 `${returnedCount} document(s) returned to their originating offices successfully.`,
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
 <div className="flex items-start justify-between gap-2"><span className="break-words text-sm font-semibold text-slate-900">{document?.reference_number || 'No reference number'}</span><span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">URGENT</span></div>
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
 <button type="button" key={workflow.id} onClick={() => { setSelectedId(workflow.id); setIncomingDocumentsOpen(false) }} className="block w-full px-4 py-3 text-left transition-colors hover:bg-blue-50"><div className="flex items-start justify-between gap-2"><span className="break-words text-sm font-semibold text-slate-900">{document?.reference_number || 'No reference number'}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${workflow.urgency === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{workflow.urgency === 'urgent' ? 'URGENT' : 'NOT URGENT'}</span></div><p className="mt-1 line-clamp-2 text-xs text-slate-600">{document?.subject || document?.content || 'No subject provided'}</p><p className="mt-1 text-[11px] text-slate-500">Forwarded {formatDateTime(workflow.forwarded_at)}</p></button>
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
 {latestUrgentRecord.document?.reference_number || 'No reference number'} — {latestUrgentRecord.document?.subject || latestUrgentRecord.document?.content || 'No subject provided'}
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
 Confirm Board Room receipt or select received documents for return.
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
 {filteredRecords.map(({ workflow, document }, index) => {
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
 {filteredRecords.length - index}
 </td>
 <td className="min-w-[170px] px-5 py-4">
 <button type="button" onClick={(event) => { event.stopPropagation(); void copyDocumentCode(document?.reference_number, event) }} title="Click to copy reference number" className="break-words text-left font-semibold text-slate-900 hover:text-blue-700 focus:outline-none focus:underline">
 {document?.reference_number || 'No reference number'}
 </button>
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
 setViewDetailsOpen(true)
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
 {processing ? (
 <LoaderCircle
 size={14}
 className="animate-spin"
 />
 ) : (
 <CheckCircle2 size={14} />
 )}
 Confirm Receipt
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

 <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
 Showing {filteredRecords.length} of {records.length} records
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
 {selected.document?.reference_number || 'No reference number'}
 </button>
 <p className="mt-1 text-sm text-slate-500">
 {selected.document?.subject ||
 selected.document?.content ||
 'No subject provided'}
 </p>

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
 Document information
 </h3>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 {[
 ['Record type', selected.document?.record_type],
 ['Sender', selected.document?.sender],
 ['Person who brought it', selected.workflow.transaction_person],
 ['Originating office', selected.document?.origin_office],
 ['Destination folder', selected.document?.destination_folder],
 ['Storage location', getStorageLabel(selected.workflow)],
 [
 'Urgency',
 selected.workflow.urgency === 'urgent'
 ? 'Urgent'
 : 'Not Urgent',
 ],
 [
 'Forwarding date',
 formatDateOnly(selected.workflow.forwarding_date),
 ],
 [
 'Forwarding time',
 formatTime(selected.workflow.forwarding_time),
 ],
 [
 'Forwarded at',
 formatDateTime(selected.workflow.forwarded_at),
 ],
 [
 'Forwarded by',
 selected.workflow.forwarded_by
 ? accountNames[selected.workflow.forwarded_by] ||
 'Account name unavailable'
 : null,
 ],
 [
 'Board Room receipt',
 formatDateTime(selected.workflow.board_room_received_at),
 ],
 [
 'Confirmed by',
 selected.workflow.board_room_received_by
 ? accountNames[selected.workflow.board_room_received_by] ||
 'Account name unavailable'
 : null,
 ],
 ['President action', selected.workflow.president_action_status],
 ['Action remarks', selected.workflow.president_action_remarks],
 [
 'Returned to origin',
 formatDateTime(selected.workflow.returned_to_origin_at),
 ],
 ['Returned by', selected.workflow.returned_to_origin_person],
 [
 'Return processed by',
 selected.workflow.returned_to_origin_by
 ? accountNames[selected.workflow.returned_to_origin_by] ||
 'Account name unavailable'
 : null,
 ],
 ['Return remarks', selected.workflow.returned_to_origin_remarks],
 [
 'Origin office receipt',
 formatDateTime(selected.workflow.origin_office_received_at),
 ],
 ].map(([label, value]) => (
 <div
 key={label as string}
 className="min-w-0 rounded-lg bg-slate-50 p-3"
 >
 <p className="text-xs font-medium text-slate-500">
 {label}
 </p>
 <p className="mt-1 break-words text-sm font-medium text-slate-900">
 {value ? String(value) : '—'}
 </p>
 </div>
 ))}
 </div>
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
 <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
 <section
 role="dialog"
 aria-modal="true"
 aria-labelledby="return-documents-title"
 className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
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
 {cartRecords.length}
 </span>
 </div>
 <p className="mt-1 text-sm text-slate-500">
 Select eligible documents, add remarks to each paper, and complete the return details below.
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

 <form onSubmit={submitReturn} className="space-y-5 p-5 sm:p-6">
 {/* Search and select documents */}
 <div>
 <label className="mb-2 block text-xs font-semibold text-slate-600">
 Documents to Return *
 </label>

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
 disabled={filteredReturnableRecords.length === 0}
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

 <div className="max-h-48 overflow-y-auto p-2">
 {filteredReturnableRecords.length === 0 ? (
 <div className="p-5 text-center">
 <p className="text-sm font-semibold text-slate-700">
 No eligible documents found
 </p>
 <p className="mt-1 text-xs text-slate-500">
 Only documents received by the Board Room and not yet returned can be selected.
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
 {document?.reference_number || 'No reference number'}
 </button>
 <p className="mt-0.5 break-words text-xs text-slate-600">
 {document?.subject ||
 document?.content ||
 'No subject provided'}
 </p>
 <p className="mt-1 text-[11px] text-slate-500">
 {statusLabels[workflow.workflow_status]} ·{' '}
 {workflow.urgency === 'urgent'
 ? 'Urgent'
 : 'Not Urgent'}
 </p>
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

 {/* Selected documents and individual remarks */}
 <div className="mt-4 rounded-xl border border-whi-200 bg-white-50 p-4">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-sm font-semibold text-white-950">
 Selected Documents
 </p>
 <p className="mt-0.5 text-xs text-slate-600">
 Add separate remarks for each paper before returning.
 </p>
 </div>
 <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-700 px-2 text-xs font-bold text-white">
 {cartRecords.length}
 </span>
 </div>

 <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
 <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
 <p className="text-[11px] font-medium text-blue-700">Selected</p>
 <p className="text-lg font-bold tabular-nums text-blue-900">{cartRecords.length}</p>
 </div>
 <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
 <p className="text-[11px] font-medium text-red-700">Urgent</p>
 <p className="text-lg font-bold tabular-nums text-red-900">{cartRecords.filter(row => row.cartUrgency === 'urgent').length}</p>
 </div>
 <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
 <p className="text-[11px] font-medium text-slate-600">Not Urgent</p>
 <p className="text-lg font-bold tabular-nums text-slate-900">{cartRecords.filter(row => row.cartUrgency === 'not_urgent').length}</p>
 </div>
 </div>

 {cartRecords.length === 0 ? (
 <p className="mt-4 text-sm text-slate-500">
 No documents selected yet.
 </p>
 ) : (
 <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
 {cartRecords.map(({ workflow, document, cartRemarks, cartUrgency }) => (
 <div
 key={workflow.id}
 className="rounded-lg border border-blue-100 bg-white p-3"
 >
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <button type="button" onClick={(event) => { event.stopPropagation(); void copyDocumentCode(document?.reference_number, event) }} title="Click to copy reference number" className="text-left text-sm font-semibold text-slate-900 hover:text-blue-700 focus:outline-none focus:underline">
 {document?.reference_number || 'No reference number'}
 </button>
 <p className="mt-0.5 break-words text-xs text-slate-600">
 {document?.subject ||
 document?.content ||
 'No subject provided'}
 </p>
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

 <label className="mt-3 block">
 <span className="text-xs font-semibold text-slate-600">
 Remarks for this paper (Optional)
 </span>
 <textarea
 value={cartRemarks}
 onChange={event =>
 updateCartRemarks(
 workflow.id,
 event.target.value,
 )
 }
 rows={2}
 placeholder="Enter remarks specific to this document..."
 className={inputClass}
 />
 </label>

 <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
  <p className="text-xs font-semibold text-slate-700">Urgency for this paper</p>
  <div className="mt-2 flex flex-wrap gap-5">
   <label className="inline-flex items-center gap-2 text-sm text-slate-700">
    <input type="radio" name={`return-urgency-${workflow.id}`} checked={cartUrgency === 'urgent'} onChange={() => updateCartUrgency(workflow.id, 'urgent')} className="accent-red-600" />
    <AlertCircle size={15} className="text-red-600" /> Urgent
   </label>
   <label className="inline-flex items-center gap-2 text-sm text-slate-700">
    <input type="radio" name={`return-urgency-${workflow.id}`} checked={cartUrgency === 'not_urgent'} onChange={() => updateCartUrgency(workflow.id, 'not_urgent')} className="accent-blue-700" />
    Not Urgent
   </label>
  </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Shared storage settings */}
 <div className="border-t border-slate-200 pt-5">
 <h3 className="text-sm font-bold text-slate-900">
 Shared Storage
 </h3>
 <p className="mt-1 text-xs text-slate-500">
 Storage details apply to every document in this return. Urgency is selected separately for each paper above.
 </p>

 <div className="mt-4 space-y-4">
 <div>
 <span className="text-xs font-semibold text-slate-600">
 Document Storage Location *
 </span>

 <div className="mt-2 flex flex-wrap gap-5">
 <label className="inline-flex items-center gap-2 text-sm text-slate-700">
 <input
 type="radio"
 name="returnStorageType"
 value="folder"
 checked={returnStorageType === 'folder'}
 onChange={() => {
 setReturnStorageType('folder')
 setReturnBoxNumber('')
 }}
 />
 Folder (Color)
 </label>

 <label className="inline-flex items-center gap-2 text-sm text-slate-700">
 <input
 type="radio"
 name="returnStorageType"
 value="box"
 checked={returnStorageType === 'box'}
 onChange={() => {
 setReturnStorageType('box')
 setReturnFolderColor('')
 }}
 />
 Box (Number)
 </label>
 </div>
 </div>

 {returnStorageType === 'folder' ? (
 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Folder Color *
 </span>
 <select
 required
 value={returnFolderColor}
 onChange={event =>
 setReturnFolderColor(event.target.value)
 }
 className={inputClass}
 >
 <option value="">Select folder color...</option>
 <option value="Red">Red</option>
 <option value="Blue">Blue</option>
 <option value="Green">Green</option>
 <option value="Yellow">Yellow</option>
 <option value="Orange">Orange</option>
 <option value="White">White</option>
 <option value="Black">Black</option>
 <option value="Pink">Pink</option>
 <option value="Violet">Violet</option>
 <option value="Brown">Brown</option>
 </select>
 </label>
 ) : (
 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Box Number *
 </span>
 <input
 required
 value={returnBoxNumber}
 onChange={event =>
 setReturnBoxNumber(event.target.value)
 }
 placeholder="Enter box number"
 className={inputClass}
 />
 </label>
 )}


 </div>
 </div>

 {/* Shared return details */}
 <div className="border-t border-slate-200 pt-5">
 <h3 className="text-sm font-bold text-slate-900">
 Return Details
 </h3>
 <p className="mt-1 text-xs text-slate-500">
 These details apply to every document in this return.
 </p>

 <div className="mt-4 space-y-4">
 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Person Returning the Documents *
 </span>
 <input
 required
 value={returnPerson}
 onChange={event => setReturnPerson(event.target.value)}
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
 setSharedReturnRemarks(event.target.value)
 }
 rows={2}
 placeholder="Enter remarks that apply to all returned documents..."
 className={inputClass}
 />
 </label>

 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <label className="block">
 <span className="text-xs font-semibold text-slate-600">
 Return Date *
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
 Actual Return Time *
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
 {cartRecords.length} document(s) selected
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
 disabled={processing || cartRecords.length === 0}
 className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
 >
 {processing ? (
 <LoaderCircle size={16} className="animate-spin" />
 ) : (
 <Send size={16} />
 )}
 {processing
 ? 'Returning...'
 : `Return ${cartRecords.length} Document(s)`}
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
