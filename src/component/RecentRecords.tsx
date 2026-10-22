
import { useEffect, useState } from 'react'
import { Search, RefreshCw, Eye, X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ReceivingRecord = {
  id: string
  reference_number: string
  record_type: string
  subject: string
  sender: string
  description: string | null
  system_code: string | null
  bearer: string | null
  content: string | null
  destination_folder: string | null
  receiving_staff: string | null
  date_received: string
  received_at: string
  status: string
  current_office: string | null
  remarks: string | null
  created_at: string
}

function show(value: string | null | undefined) {
  return value?.trim() || '—'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export default function RecentRecords() {
  const [records, setRecords] = useState<ReceivingRecord[]>([])
  const [selected, setSelected] = useState<ReceivingRecord | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadRecords() {
    setLoading(true)
    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('receiving_records')
        .select(`
          id,
          reference_number,
          record_type,
          subject,
          sender,
          description,
          system_code,
          bearer,
          content,
          destination_folder,
          receiving_staff,
          date_received,
          received_at,
          status,
          current_office,
          remarks,
          created_at
        `)
        .order('received_at', { ascending: false })
        .limit(100)

      if (queryError) throw queryError

      setRecords((data ?? []) as ReceivingRecord[])
    } catch (err) {
      console.error('Could not load receiving records:', err)
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

  const filteredRecords = records.filter(record =>
    [
      record.reference_number,
      record.subject,
      record.content,
      record.record_type,
      record.status,
      record.bearer,
      record.sender,
      record.receiving_staff,
      record.destination_folder,
      record.system_code,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-blue-950">
              Recent Records
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Latest records registered in the receiving module.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                aria-label="Search records"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search records..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadRecords()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="m-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <AlertCircle size={18} className="shrink-0" />
            <div>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadRecords()}
                className="mt-1 font-semibold underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">PresOffice No.</th>
                <th className="px-5 py-4">Content / Subject</th>
                <th className="px-5 py-4">Bearer</th>
                <th className="px-5 py-4">Receiving Staff</th>
                <th className="px-5 py-4">Destination</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                    Loading records...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                    {search
                      ? 'No records match your search.'
                      : 'No receiving records found.'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr key={record.id} className="hover:bg-blue-50/60">
                    <td className="px-5 py-4 font-semibold text-blue-950">
                      {record.reference_number}
                    </td>
                    <td className="max-w-60 px-5 py-4">
                      <p className="truncate font-medium">
                        {show(record.content || record.subject)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(record.date_received)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {show(record.bearer || record.sender)}
                    </td>
                    <td className="px-5 py-4">
                      {show(record.receiving_staff)}
                    </td>
                    <td className="px-5 py-4">
                      {show(record.destination_folder)}
                    </td>
                    <td className="px-5 py-4">
                      {show(record.record_type)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                        {record.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelected(record)}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-700 hover:text-white"
                      >
                        <Eye size={15} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Showing {filteredRecords.length} of {records.length} records.
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSelected(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-details-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b bg-white p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Receiving Record Details
                </p>
                <h2 id="record-details-title" className="mt-1 text-xl font-bold text-blue-950">
                  {selected.reference_number}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={21} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              {[
                ['PresOffice No.', selected.reference_number],
                ['System Code', selected.system_code],
                ['Content / Subject', selected.content || selected.subject],
                ['Bearer', selected.bearer || selected.sender],
                ['Receiving Staff', selected.receiving_staff],
                ['Destination Folder', selected.destination_folder],
                ['Record Type', selected.record_type],
                ['Status', selected.status],
                ['Date Received', formatDate(selected.date_received)],
                ['Time Received', formatDateTime(selected.received_at)],
                ['Current Office', selected.current_office],
                ['Remarks', selected.remarks],
                ['Description', selected.description],
                ['Created At', formatDateTime(selected.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
                    {show(value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t p-5">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
