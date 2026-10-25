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
  ChevronDown,
  Search,
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

const NEW_DESTINATIONS = [
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

const DOCUMENT_CODES = ['BURS', 'DV', 'ORS', 'Payroll', 'Check']

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
  bearer: '',
  content: '',
  destinationFolder: '',
  receivingStaff: '',
  urgency: '',
  receiveTime: '',
  originOffice: '',
  payee: '',
  amountPeso: '',
  documentType: '',
  selectedCodes: [] as string[],
  orsBursAmount: '',
  dvAmount: '',
  checkAmount: '',
  campus: '',
  documentDate: '',
  batchNo: '',
  totalAmount: '',
  norsaType: '',
  serialNumber: '',
  amountToAdjust: '',
  adjustedAmount: '',
  officeDesignation: '',
  dateOfLetter: '',
  otherNotesRemarks: '',
}

const PRESOFFICE_CHARACTERS =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generatePresOfficeNumber(): string {
  const values = new Uint32Array(5)
  crypto.getRandomValues(values)
  return Array.from(
    values,
    value =>
      PRESOFFICE_CHARACTERS[
        value % PRESOFFICE_CHARACTERS.length
      ],
  ).join('')
}

/**
 * Converts currency-formatted text to a numeric value.
 *
 * Accepted examples:
 * ₱1,500.00
 * PHP 1,500.00
 * $1,500.00
 * 1500
 *
 * Empty fields return null.
 */

function toAmount(value: string): number | null {
  if (!value.trim()) return null
  const normalized = value
    .trim()
    .replace(/₱|[$€£¥]/g, '')
    .replace(/\bPHP\b/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(
      `Invalid amount: "${value}". Enter a valid amount, such as ₱1,500.00.`,
    )
  }
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) {
    throw new Error('Please enter a valid amount.')
  }
  return amount
}

function AmountInput({
  label,
  value,
  onChange,
  required = false,
  helpText,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  helpText?: string
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder="₱0.00"
        required={required}
        className={inputClass}
      />
      {helpText && (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {helpText}
        </span>
      )}
    </label>
  )
}

export default function Receiving() {
  const [folders, setFolders] = useState<OfficeFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date())
  const [form, setForm] = useState(initialForm)
  const [generatedCode, setGeneratedCode] = useState('')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  // Searchable Destination Folder dropdown
  const [destinationDropdownOpen, setDestinationDropdownOpen] =
    useState(false)
  const [destinationSearch, setDestinationSearch] = useState('')
  const filteredDestinationFolders = DESTINATION_FOLDERS.filter(code => {
    const matchingFolder = folders.find(
      item =>
        item.code.trim().toUpperCase() === code ||
        item.name.trim().toUpperCase() === code,
    )
    const label =
      matchingFolder &&
      matchingFolder.name.trim().toUpperCase() !== code
        ? `${code} — ${matchingFolder.name}`
        : code
    return label
      .toLowerCase()
      .includes(destinationSearch.trim().toLowerCase())
  })
  const selectedDestination =
    form.destinationFolder.trim().toUpperCase()
  const showAdditionalFields =
    SPECIAL_DESTINATIONS.includes(selectedDestination)
  const showDvFields =
    selectedDestination.startsWith('DV') ||
    selectedDestination === 'ORS/BURS'
  const showPacsvalFields =
    selectedDestination === 'PACSVAL'
  const showNorsaFields =
    selectedDestination === 'NORSA/NBURSA'
  const isNewDestination =
    NEW_DESTINATIONS.includes(selectedDestination)
  const showLddapFields =
    selectedDestination === 'LDDAP'
  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) {
        throw new Error('Please sign in again.')
      }
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
          : 'Unable to load receiving data.',
      )
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void loadData()
  }, [])
  function updateField(
    field: keyof typeof initialForm,
    value: string | string[],
  ) {
    setForm(previous => ({
      ...previous,
      [field]: value,
    }))
    setError('')
  }
  function selectDestination(code: string) {
    updateField('destinationFolder', code)
    setDestinationSearch('')
    setDestinationDropdownOpen(false)
  }
  function toggleCode(code: string) {
    setForm(previous => {
      const selected = previous.selectedCodes.includes(code)
      return {
        ...previous,
        selectedCodes: selected
          ? previous.selectedCodes.filter(item => item !== code)
          : [...previous.selectedCodes, code],
      }
    })
    setError('')
  }
  function toggleAllCodes() {
    setForm(previous => ({
      ...previous,
      selectedCodes:
        previous.selectedCodes.length === DOCUMENT_CODES.length
          ? []
          : [...DOCUMENT_CODES],
    }))
    setError('')
  }
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) {
        throw new Error(
          'Your session has expired. Please sign in again.',
        )
      }
      const bearer = form.bearer.trim()
      const content = form.content.trim()
      const receivingStaff = form.receivingStaff.trim()
      const selectedFolder =
        form.destinationFolder.trim().toUpperCase()
      const folder = folders.find(
        item =>
          item.code.trim().toUpperCase() === selectedFolder ||
          item.name.trim().toUpperCase() === selectedFolder,
      )
      const destinationCode =
        folder?.code ??
        (DESTINATION_FOLDERS.includes(selectedFolder)
          ? selectedFolder
          : '')
      if (
        !bearer ||
        !content ||
        !receivingStaff ||
        !form.receiveTime ||
        !destinationCode
      ) {
        throw new Error(
          'Please complete all required fields and select a valid destination folder.',
        )
      }
      if (
        showDvFields &&
        form.selectedCodes.length === 0
      ) {
        throw new Error(
          'Please select at least one document code: BURS, DV, ORS, Payroll, or Check.',
        )
      }
      const now = new Date()
      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-')
      const receivedAt = new Date(
        `${localDate}T${form.receiveTime}:00`,
      )
      if (Number.isNaN(receivedAt.getTime())) {
        throw new Error('Please enter a valid receiving time.')
      }
      const amountPeso = showLddapFields
        ? toAmount(form.amountPeso)
        : null
      const orsBursAmount = showDvFields
        ? toAmount(form.orsBursAmount)
        : null
      const dvAmount = showDvFields
        ? toAmount(form.dvAmount)
        : null
      const checkAmount = showDvFields
        ? toAmount(form.checkAmount)
        : null
      const totalAmount = showPacsvalFields
        ? toAmount(form.totalAmount)
        : null
      const amountToAdjust = showNorsaFields
        ? toAmount(form.amountToAdjust)
        : null
      const adjustedAmount = showNorsaFields
        ? toAmount(form.adjustedAmount)
        : null
      const documentCode =
        form.selectedCodes.length > 0
          ? form.selectedCodes.join(', ')
          : null
      const officeDesignation = showAdditionalFields
        ? form.officeDesignation.trim() || null
        : null
      const dateOfLetter = showAdditionalFields
        ? form.dateOfLetter || null
        : null
      const otherNotesRemarks = showAdditionalFields
        ? form.otherNotesRemarks.trim() || null
        : null
      let savedCode = ''
      let saved = false
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generatePresOfficeNumber()
        const {
          data: existing,
          error: checkError,
        } = await supabase
          .from('receiving_records')
          .select('id')
          .eq('reference_number', candidate)
          .limit(1)
          .maybeSingle()
        if (checkError) throw checkError
        if (existing) continue
        const record: Record<string, unknown> = {
          reference_number: candidate,
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
          urgency: form.urgency || null,
          created_by: user.id,
          status: 'received',
          current_office: destinationCode,
        }
        if (showAdditionalFields) {
          record.office_designation = officeDesignation
          record.date_of_letter = dateOfLetter
          record.other_notes_remarks = otherNotesRemarks
        }
        if (isNewDestination) {
          record.origin_office =
            form.originOffice.trim() || null
          record.payee = form.payee.trim() || null
          record.document_type =
            form.documentType.trim() || null
        }
        if (showLddapFields) {
          record.amount_peso = amountPeso
        }
        if (showDvFields) {
          record.document_code = documentCode
          record.ors_burs_amount = orsBursAmount
          record.dv_amount = dvAmount
          record.check_amount = checkAmount
        }
        if (showPacsvalFields) {
          record.campus = form.campus || null
          record.document_date = form.documentDate || null
          record.batch_no = form.batchNo.trim() || null
          record.total_amount = totalAmount
        }
        if (showNorsaFields) {
          record.norsa_type = form.norsaType || null
          record.serial_number =
            form.serialNumber.trim() || null
          record.amount_to_adjust = amountToAdjust
          record.adjusted_amount = adjustedAmount
        }
        const { error: insertError } = await supabase
          .from('receiving_records')
          .insert(record as any)
        if (!insertError) {
          savedCode = candidate
          saved = true
          break
        }
        if (insertError.code === '23505') {
          continue
        }
        console.error(
          'Failed to save receiving record:',
          insertError,
        )
        throw new Error(
          [
            insertError.message,
            insertError.details,
            insertError.hint,
            insertError.code
              ? `Code: ${insertError.code}`
              : '',
          ]
            .filter(Boolean)
            .join(' — '),
        )
      }
      if (!saved) {
        throw new Error(
          'Unable to generate a unique PresOffice No. after several attempts. Please try again.',
        )
      }
      setGeneratedCode(savedCode)
      setCopyMessage('')
      setShowSuccessModal(true)
      setForm({ ...initialForm, selectedCodes: [] })
      setDestinationSearch('')
      setDestinationDropdownOpen(false)
      setReceiptDate(new Date())
    } catch (err) {
      console.error('Receiving form error:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save the record.',
      )
    } finally {
      setSaving(false)
    }
  }
  async function copyGeneratedCode() {
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopyMessage('PresOffice No. copied successfully.')
    } catch {
      setCopyMessage(
        'Copy failed. Please select and copy the code manually.',
      )
    }
  }
  function closeSuccessModal() {
    setShowSuccessModal(false)
    setGeneratedCode('')
    setCopyMessage('')
  }
  function clearForm() {
    setForm({ ...initialForm, selectedCodes: [] })
    setError('')
    setDestinationSearch('')
    setDestinationDropdownOpen(false)
  }
  return (
    <main className="h-[calc(100vh-3.5rem)] min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-y-contain bg-slate-50 p-4 text-slate-800 sm:p-6 lg:p-8">
      {/* Page heading */}
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
            {/* Searchable destination folder dropdown */}
            <div className="relative">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="destination-search"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={destinationDropdownOpen}
                  aria-controls="destination-folder-options"
                  autoComplete="off"
                  value={
                    destinationDropdownOpen
                      ? destinationSearch
                      : form.destinationFolder
                  }
                  onFocus={() => {
                    setDestinationSearch('')
                    setDestinationDropdownOpen(true)
                  }}
                  onChange={event => {
                    setDestinationSearch(event.target.value)
                    setDestinationDropdownOpen(true)
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Escape') {
                      setDestinationDropdownOpen(false)
                      setDestinationSearch('')
                    }
                    if (
                      event.key === 'Enter' &&
                      destinationDropdownOpen
                    ) {
                      event.preventDefault()
                      if (filteredDestinationFolders.length > 0) {
                        selectDestination(
                          filteredDestinationFolders[0],
                        )
                      }
                    }
                    if (event.key === 'ArrowDown') {
                      setDestinationDropdownOpen(true)
                    }
                  }}
                  placeholder="Search destination folder..."
                  className="w-full rounded-xl border border-blue-200 bg-white py-2.5 pl-9 pr-10 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  required={!form.destinationFolder}
                />
                <button
                  type="button"
                  aria-label="Toggle destination folder options"
                  onClick={() => {
                    if (destinationDropdownOpen) {
                      setDestinationDropdownOpen(false)
                      setDestinationSearch('')
                    } else {
                      setDestinationSearch('')
                      setDestinationDropdownOpen(true)
                    }
                  }}
                  className="absolute inset-y-0 right-0 z-10 flex items-center px-3 text-slate-500 hover:text-blue-700"
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${
                      destinationDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
              {destinationDropdownOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close destination folder options"
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => {
                      setDestinationDropdownOpen(false)
                      setDestinationSearch('')
                    }}
                  />
                  <div
                    id="destination-folder-options"
                    role="listbox"
                    className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={!form.destinationFolder}
                      onClick={() => selectDestination('')}
                      className="w-full px-3 py-2 text-left text-sm text-slate-500 transition hover:bg-blue-50"
                    >
                      Select destination folder
                    </button>
                    {filteredDestinationFolders.length > 0 ? (
                      filteredDestinationFolders.map(code => {
                        const matchingFolder = folders.find(
                          item =>
                            item.code.trim().toUpperCase() === code ||
                            item.name.trim().toUpperCase() === code,
                        )
                        const label =
                          matchingFolder &&
                          matchingFolder.name.trim().toUpperCase() !== code
                            ? `${code} — ${matchingFolder.name}`
                            : code
                        return (
                          <button
                            key={code}
                            type="button"
                            role="option"
                            aria-selected={
                              form.destinationFolder === code
                            }
                            onClick={() => selectDestination(code)}
                            className={`w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50 ${
                              form.destinationFolder === code
                                ? 'bg-blue-50 font-semibold text-blue-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })
                    ) : (
                      <p className="px-3 py-3 text-sm text-slate-500">
                        No matching destination folders found.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
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
      {/* Incoming documents banner */}
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
      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">
              Unable to process the record
            </p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        </div>
      )}
      {/* Receiving form */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-blue-950">
            Document Information
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fields marked with * are required. Additional fields appear according to the selected destination.
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
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Enter the existing system code, if applicable.
              </span>
            </label>
            <label className="text-sm font-semibold">
              PresOffice No.
              <input
                value="Generated automatically when saved"
                readOnly
                aria-readonly="true"
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-500`}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                A unique 5-character alphanumeric code is generated when you save.
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
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Today's date.
              </span>
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
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Enter the actual time the document was received.
              </span>
            </label>
            <label className="text-sm font-semibold">
              Inputed by *
              <input
                required
                value={form.receivingStaff}
                onChange={event =>
                  updateField('receivingStaff', event.target.value)
                }
                placeholder="Enter name of person inputting the record"
                className={inputClass}
              />
            </label>
              <label className="text-sm font-semibold">
                Urgency
                <span className="ml-2 font-normal text-slate-400">
                  Optional
                </span>
                <select
                  value={form.urgency}
                  onChange={event => updateField('urgency', event.target.value)}
                  className={inputClass}
                >
                  <option value="">Leave blank if not urgent</option>
                  <option value="Urgent">Urgent</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Choose Urgent only if the document needs priority handling. Otherwise, leave this blank.
                </span>
              </label>
            {isNewDestination && (
              <>
                <label className="text-sm font-semibold">
                  Origin of Document / Office
                  <input
                    value={form.originOffice}
                    onChange={event =>
                      updateField('originOffice', event.target.value)
                    }
                    placeholder="Enter originating office"
                    className={inputClass}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Payee
                  <input
                    value={form.payee}
                    onChange={event =>
                      updateField('payee', event.target.value)
                    }
                    placeholder="Enter payee name"
                    className={inputClass}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Document Type
                  <input
                    value={form.documentType}
                    onChange={event =>
                      updateField('documentType', event.target.value)
                    }
                    placeholder="Enter document type"
                    className={inputClass}
                  />
                </label>
              </>
            )}
            {showLddapFields && (
              <div className="md:col-span-2 xl:col-span-3">
                <AmountInput
                  label="Amount (₱)"
                  value={form.amountPeso}
                  onChange={value =>
                    updateField('amountPeso', value)
                  }
                  helpText="Currency symbols and comma separators are accepted."
                />
              </div>
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
          {/* Document codes and amounts */}
          {showDvFields && (
            <section className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-blue-950">
                    Document Codes
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Select one or more codes that apply to this record.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllCodes}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  {form.selectedCodes.length === DOCUMENT_CODES.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {DOCUMENT_CODES.map(code => (
                  <label
                    key={code}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                      form.selectedCodes.includes(code)
                        ? 'border-blue-600 bg-blue-100 text-blue-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.selectedCodes.includes(code)}
                      onChange={() => toggleCode(code)}
                      className="h-4 w-4 accent-blue-700"
                    />
                    {code}
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Selected:{' '}
                {form.selectedCodes.length > 0
                  ? form.selectedCodes.join(', ')
                  : 'None'}
              </p>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <AmountInput
                  label="ORS / BURS Amount"
                  value={form.orsBursAmount}
                  onChange={value =>
                    updateField('orsBursAmount', value)
                  }
                />
                <AmountInput
                  label="DV Amount"
                  value={form.dvAmount}
                  onChange={value =>
                    updateField('dvAmount', value)
                  }
                />
                <AmountInput
                  label="Check Amount"
                  value={form.checkAmount}
                  onChange={value =>
                    updateField('checkAmount', value)
                  }
                />
              </div>
            </section>
          )}
          {/* PACSVAL fields */}
          {showPacsvalFields && (
            <section className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 sm:p-6">
              <div>
                <h3 className="text-base font-bold text-blue-950">
                  PACSVAL Information
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Enter the campus, document date, batch number, and total amount.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Campus
                  <select
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
                  Document Date
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
                    value={form.batchNo}
                    onChange={event =>
                      updateField('batchNo', event.target.value)
                    }
                    placeholder="Enter batch number"
                    className={inputClass}
                  />
                </label>
                <AmountInput
                  label="Total Amount (₱)"
                  value={form.totalAmount}
                  onChange={value =>
                    updateField('totalAmount', value)
                  }
                />
              </div>
            </section>
          )}
          {/* NORSA / NBURSA fields */}
          {showNorsaFields && (
            <section className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 sm:p-6">
              <div>
                <h3 className="text-base font-bold text-blue-950">
                  NORSA / NBURSA Information
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Enter the document classification, serial number, and adjustment amounts.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Document Classification
                  <select
                    value={form.norsaType}
                    onChange={event =>
                      updateField('norsaType', event.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Select classification</option>
                    <option value="NORSA">NORSA</option>
                    <option value="NBURSA">NBURSA</option>
                  </select>
                </label>
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
                <AmountInput
                  label="Amount to Adjust"
                  value={form.amountToAdjust}
                  onChange={value =>
                    updateField('amountToAdjust', value)
                  }
                />
                <AmountInput
                  label="Adjusted Amount"
                  value={form.adjustedAmount}
                  onChange={value =>
                    updateField('adjustedAmount', value)
                  }
                />
              </div>
            </section>
          )}
          {/* Additional document information */}
          {showAdditionalFields && (
            <section className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-5 sm:p-6">
              <div>
                <h3 className="text-base font-bold text-blue-950">
                  Additional Document Information
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Additional details for {selectedDestination}. All fields in this section are optional.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Office / Designation
                  <span className="ml-2 font-normal text-slate-400">
                    Optional
                  </span>
                  <input
                    value={form.officeDesignation}
                    onChange={event =>
                      updateField(
                        'officeDesignation',
                        event.target.value,
                      )
                    }
                    placeholder="Enter office or designation"
                    className={inputClass}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Date of Letter
                  <span className="ml-2 font-normal text-slate-400">
                    Optional
                  </span>
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
                  Other Notes / Remarks
                  <span className="ml-2 font-normal text-slate-400">
                    Optional
                  </span>
                  <textarea
                    rows={3}
                    value={form.otherNotesRemarks}
                    onChange={event =>
                      updateField(
                        'otherNotesRemarks',
                        event.target.value,
                      )
                    }
                    placeholder="Enter any additional notes or remarks..."
                    className={inputClass}
                  />
                </label>
              </div>
            </section>
          )}
          {/* Form actions */}
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
      {/* Save confirmation modal */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={closeSuccessModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-modal-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2
                    size={21}
                    className="text-emerald-600"
                  />
                </div>
                <span className="text-sm font-semibold text-slate-800">
                  Save Confirmation
                </span>
              </div>
              <button
                type="button"
                onClick={closeSuccessModal}
                aria-label="Close confirmation"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 pb-6 pt-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
                <CheckCircle2
                  size={34}
                  className="text-emerald-600"
                />
              </div>
              <h2
                id="success-modal-title"
                className="mt-5 text-xl font-bold tracking-tight text-slate-900"
              >
                Record Received Successfully
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                The incoming document has been saved. Use this PresOffice No. to identify and track the record.
              </p>
              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/80 p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">
                  Generated PresOffice No.
                </p>
                <p className="mt-3 break-all font-mono text-3xl font-bold tracking-[0.18em] text-blue-950">
                  {generatedCode}
                </p>
                <button
                  type="button"
                  onClick={() => void copyGeneratedCode()}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  <Copy size={15} />
                  Copy PresOffice No.
                </button>
                {copyMessage && (
                  <p
                    role="status"
                    className="mt-3 text-xs text-slate-600"
                  >
                    {copyMessage}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeSuccessModal}
                className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                Done
              </button>
              <p className="mt-3 text-xs text-slate-400">
                Please keep this number for future reference.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
