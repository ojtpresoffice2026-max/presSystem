
import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  RefreshCw,
  Eye,
  X,
  ArrowUpDown,
  Send,
  FileText,
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
}

type SortField =
  | 'reference_number'
  | 'subject'
  | 'recipient'
  | 'destination_office'
  | 'releasing_staff'
  | 'release_date'
  | 'status'

const tableColumns: { label: string; field: SortField }[] = [
  { label: 'Reference No.', field: 'reference_number' },
  { label: 'Subject', field: 'subject' },
  { label: 'Recipient', field: 'recipient' },
  { label: 'Destination Office', field: 'destination_office' },
  { label: 'Releasing Staff', field: 'releasing_staff' },
  { label: 'Release Date', field: 'release_date' },
  { label: 'Status', field: 'status' },
]

export default function ReleasingRecords() {
  const [records, setRecords] = useState<ReleasingRecord[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReleasingRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [sortField, setSortField] =
    useState<SortField>('release_date')

  const [sortDirection, setSortDirection] =
    useState<'desc' | 'asc'>('desc')

  async function loadRecords() {
    setLoading(true)
    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('releasing_records')
        .select(
          'id, reference_number, subject, recipient, destination_office, releasing_staff, release_date, release_time, status, remarks, created_at'
        )
        .order('created_at', { ascending: false })

      if (queryError) {
        setError(queryError.message)
        setRecords([])
      } else {
        setRecords((data ?? []) as ReleasingRecord[])
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load releasing records.'
      )
      setRecords([])
    } finally {
      setLoading(false)
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
          Manage and review outgoing documents.
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
                Outgoing Documents
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
          <table className="w-full min-w-[1100px] border-collapse text-left">
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
                  Details
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
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
                    colSpan={8}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    Records could not be loaded. Check the error above.
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
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

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.recipient || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.destination_office || '—'}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600">
                      {record.releasing_staff || '—'}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600">
                      {formatDate(record.release_date)}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[10px] font-semibold capitalize text-red-700">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
                        {displayStatus(record.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => setSelected(record)}
                        aria-label={`View ${record.reference_number}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
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
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl"
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
                  ['Recipient', selected.recipient],
                  ['Destination Office', selected.destination_office],
                  ['Releasing Staff', selected.releasing_staff],
                  ['Release Date', formatDate(selected.release_date)],
                  ['Release Time', selected.release_time],
                  ['Status', displayStatus(selected.status)],
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
    </div>
  )
}
