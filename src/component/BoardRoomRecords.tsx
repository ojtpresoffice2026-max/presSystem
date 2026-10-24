
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
  LoaderCircle,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
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

function StorageUrgency({
  workflow,
}: {
  workflow: WorkflowRecord
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
        Brought by: {workflow.transaction_person || 'Not specified'}
      </span>

      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
        {getStorageLabel(workflow)}
      </span>

      <span
        className={`rounded-md px-2 py-1 text-xs font-semibold ${
          workflow.urgency === 'urgent'
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        {workflow.urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}
      </span>
    </div>
  )
}

export default function BoardRoomRecords() {
  const [records, setRecords] = useState<DisplayRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState<'all' | WorkflowStatus>('all')

  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Selected documents for a single return transaction.
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  // Shared return checkout details.
  const [returnPerson, setReturnPerson] = useState('')
  const [sharedReturnRemarks, setSharedReturnRemarks] = useState('')
  const [returnDate, setReturnDate] = useState(getManilaDate)
  const [returnTime, setReturnTime] = useState('')

  // Shared storage and urgency settings applied to every document in the return cart.
  const [returnStorageType, setReturnStorageType] = useState<'folder' | 'box'>('folder')
  const [returnFolderColor, setReturnFolderColor] = useState('')
  const [returnBoxNumber, setReturnBoxNumber] = useState('')
  const [returnUrgency, setReturnUrgency] = useState<'urgent' | 'not_urgent'>('not_urgent')

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

      setSelectedId(previous => {
        if (previous && combined.some(row => row.workflow.id === previous)) {
          return previous
        }

        return combined[0]?.workflow.id ?? null
      })

      // Keep only documents that are still eligible for return.
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
    setPickerSearch('')
    setCartOpen(true)
  }

  function addToCart(workflowId: string) {
    setCart(current => {
      if (current.some(item => item.workflowId === workflowId)) {
        return current
      }

      return [...current, { workflowId, remarks: '' }]
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
          p_storage_type: returnStorageType,
          p_folder_color: returnStorageType === 'folder' ? returnFolderColor.trim() : null,
          p_box_number: returnStorageType === 'box' ? returnBoxNumber.trim() : null,
          p_urgency: returnUrgency,
        },
      )

      if (rpcError) throw rpcError

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
      setReturnUrgency('not_urgent')

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
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
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
          <button
            type="button"
            onClick={openCart}
            disabled={processing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
          >
            <FileText size={17} />
            Return Documents
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
      </div>

      {/* Alerts */}
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

      {/* Summary cards */}
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

      {/* Document list */}
      <div className="grid grid-cols-1 gap-6">
        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
                <LoaderCircle size={19} className="animate-spin" />
                Loading Board Room records...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <FileText size={34} className="mx-auto text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">No documents found</p>
                <p className="mt-1 text-sm text-slate-500">Try changing your search or status filter.</p>
              </div>
            ) : (
              <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-5 py-3 font-semibold">Document</th>
                    <th className="px-5 py-3 font-semibold">Transaction Person</th>
                    <th className="px-5 py-3 font-semibold">Storage</th>
                    <th className="px-5 py-3 font-semibold">Urgency</th>
                    <th className="px-5 py-3 font-semibold">Forwarded</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map(({ workflow, document }) => {
                    const active = selectedId === workflow.id
                    const inCart = cart.some(item => item.workflowId === workflow.id)
                    const canReturn = returnableStatuses.includes(workflow.workflow_status)
                    return (
                      <tr
                        key={workflow.id}
                        onClick={() => setSelectedId(workflow.id)}
                        className={`cursor-pointer transition-colors ${active ? 'bg-green-50/70' : 'bg-white hover:bg-slate-50'}`}
                      >
                        <td className="max-w-[300px] px-5 py-4">
                          <div className="font-semibold text-slate-900">{document?.reference_number || 'No reference number'}</div>
                          <div className="mt-1 truncate text-xs text-slate-500" title={document?.subject || document?.content || ''}>
                            {document?.subject || document?.content || 'No subject provided'}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{workflow.transaction_person || '—'}</td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{getStorageLabel(workflow)}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${workflow.urgency === 'urgent' ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200' : 'bg-slate-100 text-slate-600'}`}>
                            {workflow.urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-600">
                          <div>{formatDateOnly(workflow.forwarding_date)}</div>
                          <div className="mt-1 text-slate-400">{formatTime(workflow.forwarding_time)}</div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses[workflow.workflow_status]}`}>
                            {statusLabels[workflow.workflow_status]}
                          </span>
                        </td>
                        <td className="px-5 py-4" onClick={event => event.stopPropagation()}>
                          <div className="flex min-w-[170px] flex-wrap gap-2">
                            <button type="button" onClick={() => { setSelectedId(workflow.id); setViewDetailsOpen(true) }} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                              <FileText size={14} /> View
                            </button>
                            {workflow.workflow_status === 'forwarded' && (
                              <button type="button" disabled={processing} onClick={() => void receiveDocument(workflow.id)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50">
                                {processing ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Confirm Receipt
                              </button>
                            )}
                            {canReturn && (
                              <button type="button" disabled={inCart} onClick={() => addToCart(workflow.id)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                                {inCart ? <Check size={14} /> : <FileText size={14} />}
                                {inCart ? 'Selected' : 'Select for Return'}
                              </button>
                            )}
                            {workflow.workflow_status !== 'forwarded' && !canReturn && <span className="text-xs text-slate-400">No actions</span>}
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

      {/* Document details modal — opened only when View is clicked */}
      {viewDetailsOpen && selected && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="document-details-title" className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Document details</p>
                <h2 id="document-details-title" className="mt-1 text-xl font-bold text-slate-900">{selected.document?.reference_number || 'No reference number'}</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.document?.subject || selected.document?.content || 'No subject provided'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[selected.workflow.workflow_status]}`}>{statusLabels[selected.workflow.workflow_status]}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{getStorageLabel(selected.workflow)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected.workflow.urgency === 'urgent' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{selected.workflow.urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}</span>
                </div>
              </div>
              <button type="button" onClick={() => setViewDetailsOpen(false)} aria-label="Close document details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button>
            </div>
            <div className="p-6">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Document information</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['Record type', selected.document?.record_type],
                  ['Sender', selected.document?.sender],
                  ['Person who brought it', selected.workflow.transaction_person],
                  ['Originating office', selected.document?.origin_office],
                  ['Destination folder', selected.document?.destination_folder],
                  ['Storage location', getStorageLabel(selected.workflow)],
                  ['Urgency', selected.workflow.urgency === 'urgent' ? 'Urgent' : 'Not Urgent'],
                  ['Forwarding date', formatDateOnly(selected.workflow.forwarding_date)],
                  ['Forwarding time', formatTime(selected.workflow.forwarding_time)],
                  ['Forwarded at', selected.workflow.forwarded_at ? new Date(selected.workflow.forwarded_at).toLocaleString() : null],
                  ['Board Room receipt', selected.workflow.board_room_received_at ? new Date(selected.workflow.board_room_received_at).toLocaleString() : null],
                  ['President action', selected.workflow.president_action_status],
                  ['Action remarks', selected.workflow.president_action_remarks],
                  ['Returned to origin', selected.workflow.returned_to_origin_at ? new Date(selected.workflow.returned_to_origin_at).toLocaleString() : null],
                  ['Returned by', selected.workflow.returned_to_origin_person],
                  ['Return remarks', selected.workflow.returned_to_origin_remarks],
                  ['Origin office receipt', selected.workflow.origin_office_received_at ? new Date(selected.workflow.origin_office_received_at).toLocaleString() : null],
                ].map(([label, value]) => (
                  <div key={label as string} className="min-w-0 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 break-words text-sm font-medium text-slate-900">{value ? String(value) : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-6 py-4">
              <button type="button" onClick={() => setViewDetailsOpen(false)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Close</button>
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
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={submitReturn} className="space-y-5 p-5 sm:p-6">
              {/* Search and select documents directly in this return form */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Documents to Return *
                </label>
                <div className="relative">
                  <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                      <p className="text-xs font-semibold text-slate-700">Eligible Board Room documents</p>
                      <p className="mt-0.5 text-xs text-slate-500">{filteredReturnableRecords.length} matching document(s)</p>
                    </div>
                    <button
                      type="button"
                      disabled={filteredReturnableRecords.length === 0}
                      onClick={toggleAllVisibleDocuments}
                      className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {filteredReturnableRecords.length > 0 && filteredReturnableRecords.every(row => cart.some(item => item.workflowId === row.workflow.id)) ? 'Remove matches' : 'Add all matches'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2">
                    {filteredReturnableRecords.length === 0 ? (
                      <div className="p-5 text-center">
                        <p className="text-sm font-semibold text-slate-700">No eligible documents found</p>
                        <p className="mt-1 text-xs text-slate-500">Only documents received by the Board Room and not yet returned can be selected.</p>
                      </div>
                    ) : (
                      filteredReturnableRecords.map(({ workflow, document }) => {
                        const isSelected = cart.some(item => item.workflowId === workflow.id)
                        return (
                          <div key={workflow.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => isSelected ? removeFromCart(workflow.id) : addToCart(workflow.id)}
                              aria-label={`${isSelected ? 'Remove' : 'Select'} ${document?.reference_number || 'document'}`}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-900">{document?.reference_number || 'No reference number'}</p>
                              <p className="mt-0.5 break-words text-xs text-slate-600">{document?.subject || document?.content || 'No subject provided'}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{statusLabels[workflow.workflow_status]} · {workflow.urgency === 'urgent' ? 'Urgent' : 'Not Urgent'}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                              {isSelected ? 'Selected' : 'Select'}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-blue-950">Selected Documents</p>
                      <p className="mt-0.5 text-xs text-slate-600">Add separate remarks for each paper before returning.</p>
                    </div>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-700 px-2 text-xs font-bold text-white">{cartRecords.length}</span>
                  </div>

                  {cartRecords.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No documents selected yet.</p>
                  ) : (
                    <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
                      {cartRecords.map(({ workflow, document, cartRemarks }) => (
                        <div key={workflow.id} className="rounded-lg border border-blue-100 bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{document?.reference_number || 'No reference number'}</p>
                              <p className="mt-0.5 break-words text-xs text-slate-600">{document?.subject || document?.content || 'No subject provided'}</p>
                            </div>
                            <button type="button" onClick={() => removeFromCart(workflow.id)} disabled={processing} className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50">Remove</button>
                          </div>
                          <label className="mt-3 block">
                            <span className="text-xs font-semibold text-slate-600">Remarks for this paper (Optional)</span>
                            <textarea
                              value={cartRemarks}
                              onChange={event => updateCartRemarks(workflow.id, event.target.value)}
                              rows={2}
                              placeholder="Enter remarks specific to this document..."
                              className={inputClass}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Shared storage and urgency settings */}
              <div className="border-t border-slate-200 pt-5">
                <h3 className="text-sm font-bold text-slate-900">
                  Shared Storage and Urgency
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  These settings will be applied to every document selected in this return.
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
                        onChange={event => setReturnFolderColor(event.target.value)}
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
                        onChange={event => setReturnBoxNumber(event.target.value)}
                        placeholder="Enter box number"
                        className={inputClass}
                      />
                    </label>
                  )}

                  <div>
                    <span className="text-xs font-semibold text-slate-600">
                      Urgency *
                    </span>
                    <div className="mt-2 flex flex-wrap gap-5">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="returnUrgency"
                          value="urgent"
                          checked={returnUrgency === 'urgent'}
                          onChange={() => setReturnUrgency('urgent')}
                        />
                        <AlertCircle size={15} className="text-red-600" />
                        Urgent
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="returnUrgency"
                          value="not_urgent"
                          checked={returnUrgency === 'not_urgent'}
                          onChange={() => setReturnUrgency('not_urgent')}
                        />
                        Not Urgent
                      </label>
                    </div>
                  </div>
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
                      onChange={event => setSharedReturnRemarks(event.target.value)}
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
                    Individual remarks are saved with their respective documents.
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

    </div>
  )
}
