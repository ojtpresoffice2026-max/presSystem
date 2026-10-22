
import { useEffect, useState, type FormEvent } from 'react'
import {
  ClipboardList,
  RefreshCw,
  Save,
  Clock3,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type OfficeFolder = {
  id: string
  code: string
  name: string
  is_active: boolean
  sort_order: number
}

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

const inputClass =
  'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100'

const initialForm = {
  systemCode: '',
  referenceNumber: '',
  bearer: '',
  content: '',
  destinationFolder: '',
  receivingStaff: '',
  receiveTime: '',
}

export default function Receiving() {
  const [folders, setFolders] = useState<OfficeFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date())
  const [form, setForm] = useState(initialForm)

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')

      const { data, error: folderError } = await supabase
        .from('office_folders')
        .select('id, code, name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order')

      if (folderError) throw folderError

      setFolders(data ?? [])
      setReceiptDate(new Date())
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load receiving data.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  function updateField(field: keyof typeof initialForm, value: string) {
    setForm(previous => ({ ...previous, [field]: value }))
    setError('')
    setSuccess('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (saving) return

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

      const referenceNumber = form.referenceNumber.trim()
      const bearer = form.bearer.trim()
      const content = form.content.trim()
      const receivingStaff = form.receivingStaff.trim()
      const selectedFolder = form.destinationFolder.trim().toUpperCase()

      const folder = folders.find(
        item =>
          item.code.trim().toUpperCase() === selectedFolder ||
          item.name.trim().toUpperCase() === selectedFolder
      )

      const destinationCode =
        folder?.code ??
        (DESTINATION_FOLDERS.includes(selectedFolder)
          ? selectedFolder
          : '')

      if (
        !referenceNumber ||
        !bearer ||
        !content ||
        !receivingStaff ||
        !form.receiveTime ||
        !destinationCode
      ) {
        throw new Error(
          'Please complete all required fields and select a valid destination folder.'
        )
      }

      const now = new Date()

      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-')

      const receivedAt = new Date(
        `${localDate}T${form.receiveTime}:00`
      )

      if (Number.isNaN(receivedAt.getTime())) {
        throw new Error('Please enter a valid receiving time.')
      }

      const { error: insertError } = await supabase
        .from('receiving_records')
        .insert({
          reference_number: referenceNumber,
          record_type: 'Other',
          subject: content,
          sender: bearer,
          description: content,
          system_code: form.systemCode.trim() || null,
          bearer,
          content,
          destination_folder: destinationCode,
          date_received: localDate,
          received_at: receivedAt.toISOString(),
          receiving_staff: receivingStaff,
          created_by: user.id,
          status: 'received',
          current_office: destinationCode,
        })

      if (insertError) {
        console.error('Failed to save receiving record:', insertError)

        throw new Error(
          [
            insertError.message,
            insertError.details,
            insertError.hint,
            insertError.code ? `Code: ${insertError.code}` : '',
          ]
            .filter(Boolean)
            .join(' — ')
        )
      }

      setSuccess(
        `Record ${referenceNumber} was received successfully.`
      )

      setForm({ ...initialForm })
      setReceiptDate(new Date())
    } catch (err) {
      console.error('Receiving form error:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save the record.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-w-0 flex-1 space-y-6 bg-slate-50 p-4 text-slate-800 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            Workspace / Records / Receiving
          </p>

          <h1 className="mt-1 text-3xl font-bold text-blue-950">
            Receiving
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Register incoming documents and assign their destination office.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-72">
            <label
              htmlFor="destination-search"
              className="mb-1 block text-xs font-semibold text-slate-600"
            >
              Destination Folder
            </label>

            <select
              id="destination-search"
              value={form.destinationFolder}
              onChange={event =>
                updateField('destinationFolder', event.target.value)
              }
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              required
            >
              <option value="">Select destination folder</option>

              {DESTINATION_FOLDERS.map(code => {
                const matchingFolder = folders.find(
                  folder =>
                    folder.code.toUpperCase() === code ||
                    folder.name.toUpperCase() === code
                )

                return (
                  <option key={code} value={code}>
                    {code}
                    {matchingFolder &&
                    matchingFolder.name.toUpperCase() !== code
                      ? ` — ${matchingFolder.name}`
                      : ''}
                  </option>
                )
              })}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || saving}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-blue-50 disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 px-5 py-4 text-white shadow-sm sm:px-6">
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[16px] border-white/10" />

        <div className="relative flex items-center gap-4">
          <div className="shrink-0 rounded-xl bg-red-600 p-2.5">
            <ClipboardList size={22} />
          </div>

          <div>
            <p className="text-[10px] font-semibold tracking-widest text-blue-200">
              INCOMING DOCUMENTS
            </p>

            <h2 className="mt-1 text-lg font-bold sm:text-xl">
              Receive a new record
            </h2>

            <p className="mt-1 text-xs leading-5 text-blue-100 sm:text-sm">
              Register incoming documents, record receipt details, and assign a destination folder.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to process the record</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-blue-950">
            Document Information
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Fields marked with * are required.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 p-5 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-semibold">
              System Code
              <span className="ml-2 font-normal text-slate-400">
                Optional
              </span>

              <input
                value={form.systemCode}
                onChange={event =>
                  updateField('systemCode', event.target.value)
                }
                placeholder="Enter system code"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-semibold">
              PresOffice No. *

              <input
                required
                value={form.referenceNumber}
                onChange={event =>
                  updateField('referenceNumber', event.target.value)
                }
                placeholder="e.g. PR-2026-001A"
                className={inputClass}
              />

              <span className="mt-1 block text-xs font-normal text-slate-500">
                Enter the manually assigned reference number.
              </span>
            </label>

            <label className="text-sm font-semibold">
              Bearer *

              <input
                required
                value={form.bearer}
                onChange={event =>
                  updateField('bearer', event.target.value)
                }
                placeholder="Name of person delivering"
                className={inputClass}
              />
            </label>

            <label className="text-sm font-semibold">
              Date Receive

              <input
                readOnly
                value={receiptDate.toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'long',
                  day: '2-digit',
                })}
                className={`${inputClass} bg-slate-50 text-slate-600`}
              />

              <span className="mt-1 block text-xs font-normal text-slate-500">
                Today's date.
              </span>
            </label>

            <label className="text-sm font-semibold">
              Time Receive *

              <div className="relative">
                <Clock3
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-700"
                />

                <input
                  type="time"
                  required
                  value={form.receiveTime}
                  onChange={event =>
                    updateField('receiveTime', event.target.value)
                  }
                  className={`${inputClass} pl-10`}
                />
              </div>

              <span className="mt-1 block text-xs font-normal text-slate-500">
                Enter the actual time the document was received.
              </span>
            </label>

            <label className="text-sm font-semibold">
              Receiving Staff *

              <input
                required
                value={form.receivingStaff}
                onChange={event =>
                  updateField('receivingStaff', event.target.value)
                }
                placeholder="Enter receiving staff name"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-sm font-semibold">
            Content / Document Description *

            <textarea
              required
              rows={4}
              value={form.content}
              onChange={event =>
                updateField('content', event.target.value)
              }
              placeholder="Describe the document, subject, or purpose..."
              className={inputClass}
            />
          </label>

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => {
                setForm({ ...initialForm })
                setError('')
                setSuccess('')
              }}
              disabled={saving}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50"
            >
              Clear Form
            </button>

            <button
              type="submit"
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={18} />

              {saving
                ? 'Saving record...'
                : 'Save Received Record'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
