
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Eye,
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  X,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import AuditHistory from './AuditHistory'

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
}

type ReturnCartItem = {
  workflow_id: string
  remarks: string
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

const returnableStatuses: WorkflowStatus[] = [
  'board_room_received',
  'action_in_progress',
  'action_completed',
]

function formatDate(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  })
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—'

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
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

function getManilaTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function getStorageLabel(workflow: WorkflowRecord) {
  return workflow.storage_type === 'folder'
    ? `Folder — ${workflow.folder_color || 'Not specified'}`
    : `Box — ${workflow.box_number || 'Not specified'}`
}

function StorageBadge({ workflow }: { workflow: WorkflowRecord }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
      {getStorageLabel(workflow)}
    </span>
  )
}

function UrgencyBadge({ urgency }: { urgency: WorkflowRecord['urgency'] }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold ${
        urgency === 'urgent'
          ? 'bg-red-100 text-red-700'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      {urgency === 'urgent' && <AlertTriangle size={11} />}
      {urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}
    </span>
  )
}

export default function BoardRoomRecords() {
  const [records, setRecords] = useState<DisplayRecord[]>([])
  const [viewingRecord, setViewingRecord] = useState<DisplayRecord | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<'all' | WorkflowStatus>('all')

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [documentPickerOpen, setDocumentPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const [returnPerson, setReturnPerson] = useState('')
  const [sharedReturnRemarks, setSharedReturnRemarks] = useState('')
  const [returnDate, setReturnDate] = useState(getManilaDate)
  const [returnTime, setReturnTime] = useState(getManilaTime)

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

      const eligibleIds = new Set(
        combined
          .filter(row =>
            returnableStatuses.includes(row.workflow.workflow_status),
          )
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
        document?.destination_folder,
        document?.record_type,
        workflow.transaction_person,
        workflow.folder_color,
        workflow.box_number,
        workflow.urgency,
        workflow.workflow_status,
        workflow.returned_to_origin_person,
        workflow.returned_to_origin_remarks,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [records, search, statusFilter])

  const returnableRecords = useMemo(
    () =>
      records.filter(row =>
        returnableStatuses.includes(row.workflow.workflow_status),
      ),
    [records],
  )

  const cartRecords = useMemo(
    () =>
      cart
        .map(item => {
          const row = returnableRecords.find(
            record => record.workflow.id === item.workflowId,
          )

          return row ? { ...row, cartRemarks: item.remarks } : null
        })
        .filter(
          (row): row is DisplayRecord & { cartRemarks: string } =>
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

  const counts = useMemo(
    () => ({
      total: records.length,
      awaiting: records.filter(
        row => row.workflow.workflow_status === 'forwarded',
      ).length,
      received: records.filter(
        row =>
          row.workflow.workflow_status === 'board_room_received' ||
          row.workflow.workflow_status === 'action_in_progress',
      ).length,
      readyToReturn: records.filter(
        row => row.workflow.workflow_status === 'action_completed',
      ).length,
      returned: records.filter(
        row => row.workflow.workflow_status === 'returned_to_origin',
      ).length,
      completed: records.filter(
        row => row.workflow.workflow_status === 'completed',
      ).length,
    }),
    [records],
  )

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
    setCartOpen(true)
    setDocumentPickerOpen(false)
  }

  function addToCart(workflowId: string) {
    setCart(current => {
      if (current.some(item => item.workflowId === workflowId)) {
        return current
      }

      return [...current, { workflowId, remarks: '' }]
    })
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
        .map(workflowId => ({ workflowId, remarks: '' }))

      return [...current, ...additions]
    })
  }

  function closeCheckout() {
    if (processing) return

    setCartOpen(false)
    setDocumentPickerOpen(false)
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (processing) return

    setError('')
    setSuccess('')

    if (cartRecords.length === 0) {
      setError('Add at least one document to the return cart.')
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

    const items: ReturnCartItem[] = cartRecords.map(row => ({
      workflow_id: row.workflow.id,
      remarks: row.cartRemarks.trim(),
    }))

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
        },
      )

      if (rpcError) throw rpcError

      const returnedCount = Number(data ?? items.length)

      setCart([])
      setCartOpen(false)
      setDocumentPickerOpen(false)
      setPickerSearch('')
      setReturnPerson('')
      setSharedReturnRemarks('')
      setReturnDate(getManilaDate())
      setReturnTime(getManilaTime())

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
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-green-700">
            presSystem Management Portal
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            Board Room Documents
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Confirm document receipt, track workflow progress, and return
            documents to their originating offices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openCart}
            disabled={processing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
          >
            <ShoppingCart size={17} />
            Return Cart
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {cart.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading || processing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
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
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {[
          { label: 'Total forwarded', value: counts.total },
          { label: 'Awaiting receipt', value: counts.awaiting },
          { label: 'Received / in progress', value: counts.received },
          { label: 'Ready to return', value: counts.readyToReturn },
          { label: 'Returned to origin', value: counts.returned },
          { label: 'Workflow completed', value: counts.completed },
        ].map(item => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium leading-5 text-slate-500">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Forwarded Documents
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review document information, workflow status, return details,
                and available actions in one table.
              </p>
            </div>

            <p className="text-xs text-slate-500">
              {filteredRecords.length} of {records.length} records
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search reference, subject, sender, office, remarks..."
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </label>

            <select
              aria-label="Filter by workflow status"
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1750px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {[
                  'PresOffice No.',
                  'Subject / Content',
                  'Transaction',
                  'Origin Office',
                  'Person Who Brought It',
                  'Storage Location',
                  'Urgency',
                  'Forwarding Date',
                  'Forwarding Time',
                  'Board Room Receipt',
                  'Workflow Status',
                  'Picked Up By',
                  'Return Date',
                  'Return Remarks',
                  'Origin Office Receipt',
                  'Actions',
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
                    colSpan={16}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle size={18} className="animate-spin" />
                      Loading Board Room records...
                    </span>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={16}
                    className="px-4 py-14 text-center"
                  >
                    <FileText size={34} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">
                      No documents found
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Try changing the search text or status filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map(({ workflow, document }) => {
                  const inCart = cart.some(
                    item => item.workflowId === workflow.id,
                  )

                  const canReturn = returnableStatuses.includes(
                    workflow.workflow_status,
                  )

                  return (
                    <tr
                      key={workflow.id}
                      className="align-top transition-colors hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-xs font-bold text-slate-900">
                        {document?.reference_number || '—'}
                      </td>

                      <td className="max-w-[260px] px-4 py-4">
                        <p className="break-words text-xs font-medium text-slate-800">
                          {document?.subject || document?.content || 'No subject'}
                        </p>
                        {document?.subject && document?.content && (
                          <p className="mt-1 max-w-[250px] whitespace-pre-wrap break-words text-[11px] text-slate-500">
                            {document.content}
                          </p>
                        )}
                        {document?.destination_folder && (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Destination: {document.destination_folder}
                          </p>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {document?.sender || '—'}
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-600">
                        {document?.origin_office ||
                          document?.current_office ||
                          'Not specified'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {workflow.transaction_person || '—'}
                      </td>

                      <td className="px-4 py-4">
                        <StorageBadge workflow={workflow} />
                      </td>

                      <td className="px-4 py-4">
                        <UrgencyBadge urgency={workflow.urgency} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {formatDateOnly(workflow.forwarding_date)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {formatTime(workflow.forwarding_time)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {formatDate(workflow.board_room_received_at)}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1.5 text-[10px] font-semibold ${statusClasses[workflow.workflow_status]}`}
                        >
                          {statusLabels[workflow.workflow_status]}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-600">
                        {workflow.returned_to_origin_person || '—'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {formatDate(workflow.returned_to_origin_at)}
                      </td>

                      <td className="max-w-[260px] px-4 py-4 text-xs text-slate-600">
                        <p className="whitespace-pre-wrap break-words">
                          {workflow.returned_to_origin_remarks?.trim() ||
                            (workflow.returned_to_origin_at
                              ? 'No remarks provided.'
                              : '—')}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                        {formatDate(workflow.origin_office_received_at)}
                      </td>

                      <td className="min-w-[170px] px-4 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <button
                            type="button"
                            onClick={() => setViewingRecord({ workflow, document })}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Eye size={14} />
                            View Details
                          </button>
                          {workflow.workflow_status === 'forwarded' && (
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => void receiveDocument(workflow.id)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
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
                              disabled={processing || inCart}
                              onClick={() => addToCart(workflow.id)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {inCart ? (
                                <Check size={14} />
                              ) : (
                                <ShoppingCart size={14} />
                              )}
                              {inCart ? 'Added to Cart' : 'Add to Return Cart'}
                            </button>
                          )}

                          {workflow.workflow_status === 'returned_to_origin' && (
                            <span className="text-[11px] font-medium text-orange-700">
                              Awaiting origin receipt
                            </span>
                          )}

                          {workflow.workflow_status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                              <CheckCircle2 size={13} />
                              Completed
                            </span>
                          )}

                          {!canReturn &&
                            workflow.workflow_status !== 'forwarded' &&
                            workflow.workflow_status !== 'returned_to_origin' &&
                            workflow.workflow_status !== 'completed' && (
                              <span className="text-[11px] text-slate-400">
                                No action available
                              </span>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>
            Showing {filteredRecords.length} of {records.length} records
          </span>
          <span>Scroll horizontally to view all columns.</span>
        </div>
      </section>

      {viewingRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-room-details-title"
            className="my-auto max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Board Room / Document Details</p>
                <h2 id="board-room-details-title" className="mt-1 break-words text-xl font-bold text-slate-900">
                  {viewingRecord.document?.reference_number || 'Document Details'}
                </h2>
                <p className="mt-1 break-words text-sm text-slate-500">
                  {viewingRecord.document?.subject || viewingRecord.document?.content || 'No subject provided'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                aria-label="Close document details"
                className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-150px)] space-y-6 overflow-y-auto p-5 sm:p-6">
              <section>
                <h3 className="mb-3 text-sm font-bold text-slate-900">Document Information</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {([
                    ['Reference Number', viewingRecord.document?.reference_number],
                    ['Record Type', viewingRecord.document?.record_type],
                    ['Subject', viewingRecord.document?.subject],
                    ['Content', viewingRecord.document?.content],
                    ['Sender', viewingRecord.document?.sender],
                    ['Bearer', viewingRecord.document?.bearer],
                    ['Origin Office', viewingRecord.document?.origin_office],
                    ['Current Office', viewingRecord.document?.current_office],
                    ['Destination Folder', viewingRecord.document?.destination_folder],
                    ['Date Received', viewingRecord.document?.date_received ? formatDateOnly(viewingRecord.document.date_received) : null],
                    ['Transaction Person', viewingRecord.workflow.transaction_person],
                    ['Storage Location', getStorageLabel(viewingRecord.workflow)],
                    ['Urgency', viewingRecord.workflow.urgency === 'urgent' ? 'Urgent' : 'Not Urgent'],
                    ['Forwarding Date', formatDateOnly(viewingRecord.workflow.forwarding_date)],
                    ['Forwarding Time', formatTime(viewingRecord.workflow.forwarding_time)],
                    ['Board Room Received', formatDate(viewingRecord.workflow.board_room_received_at)],
                    ['President Action Status', viewingRecord.workflow.president_action_status],
                    ['President Action Remarks', viewingRecord.workflow.president_action_remarks],
                    ['Action Completed At', formatDate(viewingRecord.workflow.president_action_completed_at)],
                    ['Returned To Origin', formatDate(viewingRecord.workflow.returned_to_origin_at)],
                    ['Picked Up By', viewingRecord.workflow.returned_to_origin_person],
                    ['Return Remarks', viewingRecord.workflow.returned_to_origin_remarks],
                    ['Origin Office Receipt', formatDate(viewingRecord.workflow.origin_office_received_at)],
                    ['Workflow Status', statusLabels[viewingRecord.workflow.workflow_status]],
                  ] as Array<[string, string | null | undefined]>).map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-lg border border-slate-200 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </section>

              {viewingRecord.document?.id ? (
                <AuditHistory documentId={viewingRecord.document.id} />
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Audit history is unavailable because this workflow has no linked receiving record.
                </p>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-cart-title"
            className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <ShoppingCart size={21} className="text-blue-700" />
                  <h2
                    id="return-cart-title"
                    className="text-lg font-bold text-slate-900"
                  >
                    Return Documents Cart
                  </h2>
                  <span className="rounded-full bg-blue-700 px-2.5 py-1 text-xs font-bold text-white">
                    {cartRecords.length}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Enter individual remarks if needed, then complete the shared
                  return details.
                </p>
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={closeCheckout}
                aria-label="Close return cart"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={submitReturn} className="space-y-5 p-5 sm:p-6">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-slate-600">
                    Selected Documents
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerSearch('')
                      setDocumentPickerOpen(true)
                    }}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    + Add documents
                  </button>
                </div>

                {cartRecords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                    <ShoppingCart size={32} className="mx-auto text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">
                      Your return cart is empty
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add eligible documents from the main table.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerSearch('')
                        setDocumentPickerOpen(true)
                      }}
                      className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                    >
                      Select Documents
                    </button>
                  </div>
                ) : (
                  <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                    {cartRecords.map(({ workflow, document, cartRemarks }) => (
                      <div
                        key={workflow.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">
                              {document?.reference_number || 'No reference number'}
                            </p>
                            <p className="mt-1 break-words text-sm text-slate-700">
                              {document?.subject ||
                                document?.content ||
                                'No subject'}
                            </p>
                            <p className="mt-2 text-xs text-slate-500">
                              Origin: {document?.origin_office || 'Not specified'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Status: {statusLabels[workflow.workflow_status]}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={processing}
                            onClick={() => removeFromCart(workflow.id)}
                            aria-label={`Remove ${document?.reference_number || 'document'} from cart`}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>

                        <label className="mt-4 block">
                          <span className="text-xs font-semibold text-slate-600">
                            Document Remarks (Optional)
                          </span>
                          <textarea
                            value={cartRemarks}
                            onChange={event =>
                              updateCartRemarks(workflow.id, event.target.value)
                            }
                            rows={2}
                            placeholder="Enter remarks for this document..."
                            className={inputClass}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                      placeholder="Remarks that apply to all returned documents..."
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
                      Automatically assigned to the authenticated Supabase
                      account.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {cartRecords.length} document(s) selected
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Individual remarks are saved with their respective
                    documents.
                  </p>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    disabled={processing}
                    onClick={closeCheckout}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={processing || cartRecords.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
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

      {documentPickerOpen && cartOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-picker-title"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    id="return-picker-title"
                    className="text-lg font-bold text-slate-900"
                  >
                    Add Documents to Return Cart
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Select documents already received by the Board Room.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setDocumentPickerOpen(false)}
                  aria-label="Close document picker"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="relative mt-4">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={event => setPickerSearch(event.target.value)}
                  placeholder="Search reference, subject, sender, office..."
                  className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-blue-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-blue-950">
                    {cart.length} in cart
                  </p>
                  <p className="text-xs text-slate-600">
                    {filteredReturnableRecords.length} matching eligible
                    documents
                  </p>
                </div>

                <button
                  type="button"
                  disabled={filteredReturnableRecords.length === 0}
                  onClick={toggleAllVisibleDocuments}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                >
                  {filteredReturnableRecords.length > 0 &&
                  filteredReturnableRecords.every(row =>
                    cart.some(item => item.workflowId === row.workflow.id),
                  )
                    ? 'Remove Visible'
                    : 'Add All Visible'}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filteredReturnableRecords.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText size={34} className="mx-auto text-slate-300" />
                  <p className="mt-3 font-semibold text-slate-700">
                    No eligible documents found
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Confirm Board Room receipt first. Returned or completed
                    workflows cannot be added again.
                  </p>
                </div>
              ) : (
                filteredReturnableRecords.map(({ workflow, document }) => {
                  const inCart = cart.some(
                    item => item.workflowId === workflow.id,
                  )

                  return (
                    <div
                      key={workflow.id}
                      className="mb-2 flex items-start gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-600">
                        <FileText size={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {document?.reference_number || 'No reference number'}
                        </p>
                        <p className="mt-1 break-words text-sm text-slate-700">
                          {document?.subject || document?.content || 'No subject'}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                            Origin: {document?.origin_office || 'Not specified'}
                          </span>
                          <StorageBadge workflow={workflow} />
                          <UrgencyBadge urgency={workflow.urgency} />
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          {statusLabels[workflow.workflow_status]}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          inCart
                            ? removeFromCart(workflow.id)
                            : addToCart(workflow.id)
                        }
                        className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${
                          inCart
                            ? 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-blue-700 text-white hover:bg-blue-800'
                        }`}
                      >
                        {inCart ? 'Remove' : 'Add to Cart'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-600">
                {cart.length} document(s) in cart
              </p>

              <button
                type="button"
                onClick={() => setDocumentPickerOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                <Check size={16} />
                Done Selecting
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
