
import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { supabase } from '../lib/supabase'

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
]

const columns =
  'id, reference_number, record_type, subject, sender, description, system_code, bearer, content, destination_folder, receiving_staff, date_received, received_at, status, current_office, remarks, created_at'

const tableColumns: { label: string; field: SortField }[] = [
  { label: 'PresOffice No.', field: 'reference_number' },
  { label: 'Code', field: 'system_code' },
  { label: 'Content / Subject', field: 'content' },
  { label: 'Bearer', field: 'bearer' },
  { label: 'Receiving Staff', field: 'receiving_staff' },
  { label: 'Destination', field: 'destination_folder' },
  { label: 'Date Received', field: 'date_received' },
  { label: 'Status', field: 'status' },
]

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

export default function ReceivingRecords() {
  const navigate = useNavigate()

  const [records, setRecords] = useState<ReceivingRecord[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('ALL')
  const [selected, setSelected] = useState<ReceivingRecord | null>(null)
  const [draft, setDraft] = useState<EditableRecord | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [success, setSuccess] = useState('')

  const [sortField, setSortField] =
    useState<SortField>('date_received')
  const [sortDirection, setSortDirection] =
    useState<'asc' | 'desc'>('desc')

  async function loadRecords() {
    setLoading(true)
    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('receiving_records')
        .select(columns)
        .order('created_at', { ascending: false })

      if (queryError) {
        setError(queryError.message)
        setRecords([])
      } else {
        setRecords((data ?? []) as ReceivingRecord[])
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load receiving records.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  function openRecord(record: ReceivingRecord) {
    setSelected(record)
    setDraft(createDraft(record))
    setEditMode(false)
    setSaveError('')
    setSuccess('')
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
    }
  }

  function startEditing() {
    if (!selected) return

    setDraft(createDraft(selected))
    setEditMode(true)
    setSaveError('')
    setSuccess('')
  }

  function cancelEditing() {
    if (selected) {
      setDraft(createDraft(selected))
    }

    setEditMode(false)
    setSaveError('')
  }

  function closeModal() {
    if (saving) return

    setSelected(null)
    setDraft(null)
    setEditMode(false)
    setSaveError('')
    setSuccess('')
  }

  function updateDraft<K extends keyof EditableRecord>(
    field: K,
    value: EditableRecord[K]
  ) {
    setDraft(current =>
      current ? { ...current, [field]: value } : current
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
      setSaveError('Receiving Staff is required.')
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id)
        .select(columns)
        .single()

      if (updateError) {
        setSaveError(updateError.message)
        return
      }

      if (!data) {
        setSaveError(
          'No record was returned. Check your Supabase update permissions.'
        )
        return
      }

      const updatedRecord = data as ReceivingRecord

      setRecords(current =>
        current.map(record =>
          record.id === updatedRecord.id ? updatedRecord : record
        )
      )

      setSelected(updatedRecord)
      setDraft(createDraft(updatedRecord))
      setEditMode(false)
      setSuccess('Record updated successfully.')
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Unable to save changes.'
      )
    } finally {
      setSaving(false)
    }
  }

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
    record: ReceivingRecord,
    field: SortField
  ): string {
    switch (field) {
      case 'content':
        return record.content || record.subject || ''
      case 'bearer':
        return record.bearer || record.sender || ''
      case 'destination_folder':
        return record.destination_folder || record.current_office || ''
      default:
        return record[field] || ''
    }
  }

  // Folder filtering is immediate; text search is applied by the Search button.
  const filteredRecords = useMemo(() => {
    const term = appliedSearch.trim().toLowerCase()

    const filtered = records.filter(record => {
      const destination = (
        record.destination_folder ||
        record.current_office ||
        ''
      ).trim().toUpperCase()

      if (
        selectedFolder !== 'ALL' &&
        destination !== selectedFolder.toUpperCase()
      ) {
        return false
      }

      if (!term) return true

      return [
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
  }, [
    records,
    appliedSearch,
    selectedFolder,
    sortField,
    sortDirection,
  ])

  function formatDate(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString()
  }

  function formatDateTime(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString()
  }

  function displayStatus(status: string | null) {
    return (status || 'unknown').replaceAll('_', ' ')
  }

  function handleSearch() {
    setAppliedSearch(searchInput.trim())
  }

  function clearFilters() {
    setSearchInput('')
    setAppliedSearch('')
    setSelectedFolder('ALL')
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Workspace / Document Management
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

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

          <div className="flex flex-col gap-2 lg:flex-row">
            <select
              value={selectedFolder}
              onChange={event => setSelectedFolder(event.target.value)}
              aria-label="Filter by destination folder"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:w-48"
            >
              <option value="ALL">All Folders</option>

              {DESTINATION_FOLDERS.map(folder => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>

            <div className="relative min-w-0 flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    handleSearch()
                  }
                }}
                placeholder="Search by number, subject, sender..."
                aria-label="Search receiving records"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={handleSearch}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
            >
              <Search size={15} />
              Search
            </button>

            <button
              type="button"
              onClick={() => void loadRecords()}
              disabled={loading}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
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
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="m-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:flex-row sm:items-center sm:justify-between"
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] border-collapse text-left">
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
                      ? 'No matching records found for the selected folder and search criteria.'
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
                      {record.reference_number || '—'}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                      {record.system_code || '—'}
                    </td>

                    <td className="max-w-[220px] px-4 py-3.5 text-xs text-slate-700">
                      <span
                        className="block truncate"
                        title={record.content || record.subject || ''}
                      >
                        {record.content || record.subject || '—'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.bearer || record.sender || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.receiving_staff || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.destination_folder ||
                        record.current_office ||
                        '—'}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                      {formatDate(record.date_received)}
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

        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500">
            Showing {filteredRecords.length} record(s)
          </p>

          <p className="text-[11px] text-slate-400">
            Select a column heading to sort.
          </p>
        </div>
      </section>

      {selected && draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={closeModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receiving-detail-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
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
                    Receiving Staff *
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
                    Destination Folder *
                    <select
                      required
                      value={draft.destination_folder}
                      onChange={event =>
                        updateDraft('destination_folder', event.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="">Select destination folder</option>

                      {DESTINATION_FOLDERS.map(folder => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                    </select>
                  </label>

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
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    ['PresOffice Number', selected.reference_number],
                    ['System Code', selected.system_code],
                    ['Record Type', selected.record_type],
                    ['Content / Subject', selected.content || selected.subject],
                    ['Bearer / Sender', selected.bearer || selected.sender],
                    ['Receiving Staff', selected.receiving_staff],
                    ['Destination Folder', selected.destination_folder],
                    ['Date Received', formatDate(selected.date_received)],
                    ['Received At', formatDateTime(selected.received_at)],
                    ['Status', displayStatus(selected.status)],
                    ['Current Office', selected.current_office],
                    ['Description', selected.description],
                    ['Remarks', selected.remarks],
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
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {!editMode && (
                  <p className="text-[11px] text-slate-400">
                    Record ID: {selected.id}
                  </p>
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
