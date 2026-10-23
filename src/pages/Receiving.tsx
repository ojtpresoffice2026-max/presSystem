import { useEffect, useState, type FormEvent } from 'react'
import {
  ClipboardList,
  RefreshCw,
  Save,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Copy,
  X,
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

const DV_DESTINATIONS = [
  'DV MAIN',
  'DV BAIS',
  'DV BAYAWAN',
  'DV GUIHULNGAN',
  'DV MABINAY',
  'DV SIATION',
]

const CODE_OPTIONS = ['BURS', 'DV', 'ORS', 'Payroll', 'Check']

const CAMPUSES = [
  'Main Campus',
  'Bais Campus',
  'Bayawan Campus',
  'Guihulngan Campus',
  'Mabinay Campus',
  'Siaton Campus',
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

  originOffice: '',
  payee: '',
  amountPeso: '',
  otherRemarks: '',

  selectedCodes: [] as string[],
  orsBursAmount: '',
  dvAmount: '',
  checkAmount: '',

  campus: '',
  documentDate: '',
  batchNumber: '',
  totalAmount: '',

  serialNumber: '',
  norsaNbursaType: '',
  amountToAdjust: '',
  adjustedAmount: '',
  otherNotesRemarks: '',

  officeDesignation: '',
  dateOfLetter: '',
}

type FormState = typeof initialForm

function toAmount(value: string): number | null {
  const cleaned = value
    .trim()
    .replace(/₱|PHP|\$|€|£|¥/gi, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')

  if (!cleaned) return null

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(
      `Invalid amount "${value}". Enter an amount such as ₱1,500.00.`
    )
  }

  const amount = Number(cleaned)

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amounts must be valid non-negative numbers.')
  }

  return amount
}

function isFinancialFolder(folder: string) {
  return [
    'LDDAP',
    'ORS/BURS',
    ...DV_DESTINATIONS,
    'PACSVAL',
    'NORSA/NBURSA',
  ].includes(folder)
}

function isDvFolder(folder: string) {
  return DV_DESTINATIONS.includes(folder)
}

export default function Receiving() {
  const [folders, setFolders] = useState<OfficeFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savedReference, setSavedReference] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date())
  const [form, setForm] = useState<FormState>({ ...initialForm })

  const selectedFolder = form.destinationFolder.trim().toUpperCase()
  const isLddap = selectedFolder === 'LDDAP'
  const isOrsBurs = selectedFolder === 'ORS/BURS'
  const isDv = isDvFolder(selectedFolder)
  const isPacsval = selectedFolder === 'PACSVAL'
  const isNorsaNbursa = selectedFolder === 'NORSA/NBURSA'
  const isSpecialDestination =
    SPECIAL_DESTINATIONS.includes(selectedFolder)

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

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) {
    setForm(previous => ({ ...previous, [field]: value }))
    setError('')
    setSuccess('')
  }

  function toggleCode(code: string) {
    setForm(previous => ({
      ...previous,
      selectedCodes: previous.selectedCodes.includes(code)
        ? previous.selectedCodes.filter(item => item !== code)
        : [...previous.selectedCodes, code],
    }))
    setError('')
  }

  function clearForm() {
    setForm({ ...initialForm })
    setError('')
    setSuccess('')
    setSavedReference('')
    setReceiptDate(new Date())
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
        throw new Error(
          'Your session has expired. Please sign in again.'
        )
      }

      const referenceNumber = form.referenceNumber.trim()
      const bearer = form.bearer.trim()
      const content = form.content.trim()
      const receivingStaff = form.receivingStaff.trim()
      const originOffice = form.originOffice.trim()

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
          'Please complete all required fields and select a destination folder.'
        )
      }

      if (isFinancialFolder(selectedFolder) && !originOffice) {
        throw new Error(
          'Please enter the Origin of the Document (Office).'
        )
      }

      if (isOrsBurs && !form.norsaNbursaType && false) {
        // Intentionally unused; ORS/BURS has its own selection below.
      }

      if (isLddap && !form.payee.trim()) {
        throw new Error('Please enter the LDDAP payee.')
      }

      if (isOrsBurs && !form.norsaNbursaType && false) {
        throw new Error('Please select ORS or BURS.')
      }

      if (isOrsBurs && !form.payee.trim()) {
        throw new Error('Please enter the payee.')
      }

      if (isDv && !form.payee.trim()) {
        throw new Error('Please enter the payee.')
      }

      if (isPacsval && !form.campus) {
        throw new Error('Please select a campus for PACSVAL.')
      }

      if (isNorsaNbursa && !form.norsaNbursaType) {
        throw new Error('Please select NORSA or NBURSA.')
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

      // Common fields used for all destinations.
      const record: Record<string, unknown> = {
        reference_number: referenceNumber,
        record_type: 'Other',
        subject: content,
        sender: bearer,
        description: content,
        system_code: isLddap
          ? 'LDDAP'
          : form.systemCode.trim() || null,
        bearer,
        content,
        destination_folder: destinationCode,
        date_received: localDate,
        received_at: receivedAt.toISOString(),
        receiving_staff: receivingStaff,
        created_by: user.id,
        status: 'received',
        current_office: destinationCode,
      }

      // Financial-folder origin office.
      if (isFinancialFolder(selectedFolder)) {
        record.origin_office = originOffice
      }

      // LDDAP fields.
      if (isLddap) {
        record.system_code = 'LDDAP'
        record.amount_peso = toAmount(form.amountPeso)
        record.payee = form.payee.trim()
        record.other_remarks = form.otherRemarks.trim() || null
      }

      // ORS/BURS fields.
      if (isOrsBurs) {
        record.document_code = form.systemCode.trim() || null
        record.ors_burs_type = form.systemCode.trim() || null
        record.payee = form.payee.trim()
        record.amount_peso = toAmount(form.amountPeso)
        record.other_remarks = form.otherRemarks.trim() || null
      }

      // DV folder fields.
      if (isDv) {
        record.document_codes = form.selectedCodes
        record.payee = form.payee.trim()
        record.ors_burs_amount = toAmount(form.orsBursAmount)
        record.dv_amount = toAmount(form.dvAmount)
        record.check_amount = toAmount(form.checkAmount)
        record.other_remarks = form.otherRemarks.trim() || null
      }

      // PACSVAL fields.
      if (isPacsval) {
        record.campus = form.campus
        record.document_date = form.documentDate || null
        record.batch_number = form.batchNumber.trim() || null
        record.total_amount = toAmount(form.totalAmount)
        record.other_remarks = form.otherRemarks.trim() || null
      }

      // NORSA/NBURSA fields.
      if (isNorsaNbursa) {
        record.serial_number = form.serialNumber.trim() || null
        record.norsa_nbursa_type = form.norsaNbursaType
        record.amount_to_adjust = toAmount(form.amountToAdjust)
        record.adjusted_amount = toAmount(form.adjustedAmount)
        record.other_notes_remarks =
          form.otherNotesRemarks.trim() || null
      }

      // Preserve the existing special destination fields.
      if (isSpecialDestination) {
        record.office_designation =
          form.officeDesignation.trim() || null
        record.date_of_letter = form.dateOfLetter || null
        record.other_notes_remarks =
          form.otherNotesRemarks.trim() || null
      }

      const { error: insertError } = await supabase
        .from('receiving_records')
        .insert(record)

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

      setSavedReference(referenceNumber)
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

  async function copyReference() {
    if (!savedReference) return

    try {
      await navigator.clipboard.writeText(savedReference)
      setSuccess(`Reference number ${savedReference} copied.`)
    } catch {
      setError('Unable to copy the reference number.')
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
              htmlFor="destination-folder"
              className="mb-1 block text-xs font-semibold text-slate-600"
            >
              Destination Folder
            </label>

            <select
              id="destination-folder"
              value={form.destinationFolder}
              onChange={event => {
                const value = event.target.value
                setForm(previous => ({
                  ...previous,
                  destinationFolder: value,
                  systemCode:
                    value.toUpperCase() === 'LDDAP'
                      ? 'LDDAP'
                      : '',
                }))
                setError('')
                setSuccess('')
              }}
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
              Complete the receiving information and the fields required
              for the selected destination folder.
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

          <div className="min-w-0 flex-1">
            <p>{success}</p>

            {savedReference && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-green-200 bg-white px-3 py-1.5 font-semibold">
                  {savedReference}
                </span>

                <button
                  type="button"
                  onClick={() => void copyReference()}
                  className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white px-3 py-1.5 font-semibold hover:bg-green-100"
                >
                  <Copy size={15} />
                  Copy reference
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setSuccess('')
              setSavedReference('')
            }}
            aria-label="Dismiss success message"
            className="rounded-lg p-1 hover:bg-green-100"
          >
            <X size={17} />
          </button>
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
          {/* Common fields */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {isLddap ? (
              <label className="text-sm font-semibold">
                System Code
                <input
                  value="LDDAP"
                  readOnly
                  className={`${inputClass} cursor-not-allowed bg-slate-100 font-semibold text-slate-600`}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Fixed system code for LDDAP.
                </span>
              </label>
            ) : (
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
            )}

            <label className="text-sm font-semibold">
              PresOffice No. *
              <input
                required
                value={form.referenceNumber}
                onChange={event =>
                  updateField('referenceNumber', event.target.value)
                }
                placeholder="Enter PresOffice number"
                className={inputClass}
              />
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
              Date Received
              <input
                readOnly
                value={receiptDate.toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'long',
                  day: '2-digit',
                })}
                className={`${inputClass} bg-slate-50 text-slate-600`}
              />
            </label>

            <label className="text-sm font-semibold">
              Time Received *
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

            {isFinancialFolder(selectedFolder) && (
              <label className="text-sm font-semibold">
                Origin of the Document (Office) *
                <input
                  required
                  value={form.originOffice}
                  onChange={event =>
                    updateField('originOffice', event.target.value)
                  }
                  placeholder="Enter originating office"
                  className={inputClass}
                />
              </label>
            )}
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

          {/* LDDAP-specific fields */}
          {isLddap && (
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
              <h3 className="font-bold text-blue-950">
                LDDAP Information
              </h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Amount in Peso
                  <input
                    value={form.amountPeso}
                    onChange={event =>
                      updateField('amountPeso', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Payee *
                  <input
                    required
                    value={form.payee}
                    onChange={event =>
                      updateField('payee', event.target.value)
                    }
                    placeholder="Enter payee name"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold md:col-span-2">
                  Other Remarks
                  <textarea
                    rows={3}
                    value={form.otherRemarks}
                    onChange={event =>
                      updateField('otherRemarks', event.target.value)
                    }
                    placeholder="Enter other remarks (optional)"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {/* ORS/BURS-specific fields */}
          {isOrsBurs && (
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
              <h3 className="font-bold text-blue-950">
                ORS/BURS Information
              </h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  ORS/BURS Selection *
                  <select
                    required
                    value={form.systemCode}
                    onChange={event =>
                      updateField('systemCode', event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Select ORS or BURS</option>
                    <option value="ORS">ORS</option>
                    <option value="BURS">BURS</option>
                  </select>
                </label>

                <label className="text-sm font-semibold">
                  Payee *
                  <input
                    required
                    value={form.payee}
                    onChange={event =>
                      updateField('payee', event.target.value)
                    }
                    placeholder="Enter payee name"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Amount in Peso
                  <input
                    value={form.amountPeso}
                    onChange={event =>
                      updateField('amountPeso', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold md:col-span-2">
                  Other Remarks
                  <textarea
                    rows={3}
                    value={form.otherRemarks}
                    onChange={event =>
                      updateField('otherRemarks', event.target.value)
                    }
                    placeholder="Enter other remarks (optional)"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {/* DV-specific fields */}
          {isDv && (
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
              <h3 className="font-bold text-blue-950">
                DV Information
              </h3>

              <div>
                <p className="text-sm font-semibold">Code</p>
                <p className="mt-1 text-xs text-slate-500">
                  Select one or more codes if needed.
                </p>

                <div className="mt-3 flex flex-wrap gap-3">
                  {CODE_OPTIONS.map(code => (
                    <label
                      key={code}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.selectedCodes.includes(code)}
                        onChange={() => toggleCode(code)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700"
                      />
                      {code}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Payee *
                  <input
                    required
                    value={form.payee}
                    onChange={event =>
                      updateField('payee', event.target.value)
                    }
                    placeholder="Enter payee name"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  ORS/BURS Amount in Peso (Optional)
                  <input
                    value={form.orsBursAmount}
                    onChange={event =>
                      updateField('orsBursAmount', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  DV Amount (Optional)
                  <input
                    value={form.dvAmount}
                    onChange={event =>
                      updateField('dvAmount', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Check Amount (Optional)
                  <input
                    value={form.checkAmount}
                    onChange={event =>
                      updateField('checkAmount', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold md:col-span-2">
                  Other Remarks
                  <textarea
                    rows={3}
                    value={form.otherRemarks}
                    onChange={event =>
                      updateField('otherRemarks', event.target.value)
                    }
                    placeholder="Enter other remarks (optional)"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {/* PACSVAL-specific fields */}
          {isPacsval && (
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
              <h3 className="font-bold text-blue-950">
                PACSVAL Information
              </h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Campus *
                  <select
                    required
                    value={form.campus}
                    onChange={event =>
                      updateField('campus', event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Select campus</option>
                    {CAMPUSES.map(campus => (
                      <option key={campus} value={campus}>
                        {campus}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-semibold">
                  Date of the Document
                  <input
                    type="date"
                    value={form.documentDate}
                    onChange={event =>
                      updateField('documentDate', event.target.value)
                    }
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Batch No.
                  <input
                    value={form.batchNumber}
                    onChange={event =>
                      updateField('batchNumber', event.target.value)
                    }
                    placeholder="Enter batch number"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Total Amount
                  <input
                    value={form.totalAmount}
                    onChange={event =>
                      updateField('totalAmount', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold md:col-span-2">
                  Other Remarks
                  <textarea
                    rows={3}
                    value={form.otherRemarks}
                    onChange={event =>
                      updateField('otherRemarks', event.target.value)
                    }
                    placeholder="Enter other remarks (optional)"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {/* NORSA/NBURSA-specific fields */}
          {isNorsaNbursa && (
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
              <h3 className="font-bold text-blue-950">
                NORSA/NBURSA Information
              </h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Serial Number
                  <input
                    value={form.serialNumber}
                    onChange={event =>
                      updateField('serialNumber', event.target.value)
                    }
                    placeholder="Enter serial number"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Document Type *
                  <select
                    required
                    value={form.norsaNbursaType}
                    onChange={event =>
                      updateField('norsaNbursaType', event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Select document type</option>
                    <option value="NORSA">NORSA</option>
                    <option value="NBURSA">NBURSA</option>
                  </select>
                </label>

                <label className="text-sm font-semibold">
                  Amount to Adjust
                  <input
                    value={form.amountToAdjust}
                    onChange={event =>
                      updateField('amountToAdjust', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Adjusted Amount
                  <input
                    value={form.adjustedAmount}
                    onChange={event =>
                      updateField('adjustedAmount', event.target.value)
                    }
                    placeholder="₱1,500.00"
                    inputMode="decimal"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold md:col-span-2">
                  Other Notes/Remarks
                  <textarea
                    rows={3}
                    value={form.otherNotesRemarks}
                    onChange={event =>
                      updateField('otherNotesRemarks', event.target.value)
                    }
                    placeholder="Enter other notes or remarks"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Existing special destination fields */}
          {isSpecialDestination && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-bold text-blue-950">
                Additional Office Information
              </h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Office Designation
                  <input
                    value={form.officeDesignation}
                    onChange={event =>
                      updateField('officeDesignation', event.target.value)
                    }
                    placeholder="Enter office designation"
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold">
                  Date of Letter
                  <input
                    type="date"
                    value={form.dateOfLetter}
                    onChange={event =>
                      updateField('dateOfLetter', event.target.value)
                    }
                    className={inputClass}
                  />
                </label>

                <label className="text-sm font-semibold md:col-span-2">
                  Other Notes/Remarks
                  <textarea
                    rows={3}
                    value={form.otherNotesRemarks}
                    onChange={event =>
                      updateField('otherNotesRemarks', event.target.value)
                    }
                    placeholder="Enter other notes or remarks"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={clearForm}
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
              {saving ? 'Saving record...' : 'Save Received Record'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}