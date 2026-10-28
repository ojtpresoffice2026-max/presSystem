import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Save, X, FolderOpen, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Folder = {
  id: string
  code: string
  name: string
  is_active: boolean
  sort_order: number
}

type FieldType = 'text' | 'number' | 'date' | 'dropdown' | 'textarea' | 'checkbox'

type DraftField = {
  field_name: string
  field_type: FieldType
  is_required: boolean
  options: string[]
}

type FolderField = {
  id: string
  folder_id: string
  field_name: string
  field_type: FieldType
  is_required: boolean
  options: string[]
  sort_order: number
}

const fieldTypes: FieldType[] = [
  'text', 'number', 'date', 'dropdown', 'textarea', 'checkbox',
]

export default function DestinationFolderManagement() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [fields, setFields] = useState<FolderField[]>([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [folderName, setFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [fieldName, setFieldName] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [fieldRequired, setFieldRequired] = useState(false)
  const [fieldOptions, setFieldOptions] = useState('')
  const [draftFields, setDraftFields] = useState<DraftField[]>([])
  const [editingField, setEditingField] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showFieldsModal, setShowFieldsModal] = useState(false)
  const [folderSearch, setFolderSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [fieldCounts, setFieldCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadFolders = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('office_folders')
      .select('id, code, name, is_active, sort_order')
      .order('name', { ascending: true })

    if (loadError) {
      setError(loadError.message)
    } else {
      const rows = (data ?? []) as Folder[]
      setFolders(rows)

      const { data: fieldRows, error: countError } = await supabase
        .from('destination_folder_fields')
        .select('folder_id')

      if (!countError) {
        const counts: Record<string, number> = {}
        for (const field of fieldRows ?? []) {
          counts[field.folder_id] = (counts[field.folder_id] ?? 0) + 1
        }
        setFieldCounts(counts)
      }

      if (!selectedFolder && rows.length) {
        setSelectedFolder(rows.find(row => row.is_active)?.id ?? rows[0].id)
      }
    }
    setLoading(false)
  }, [selectedFolder])

  const loadFields = useCallback(async (folderId: string) => {
    if (!folderId) {
      setFields([])
      return
    }

    const { data, error: loadError } = await supabase
      .from('destination_folder_fields')
      .select('id, folder_id, field_name, field_type, is_required, options, sort_order')
      .eq('folder_id', folderId)
      .order('sort_order', { ascending: true })
      .order('field_name', { ascending: true })

    if (loadError) {
      setError(`Unable to load custom fields: ${loadError.message}`)
      setFields([])
      return
    }

    setFields((data ?? []) as FolderField[])
  }, [])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  useEffect(() => {
    void loadFields(selectedFolder)
  }, [selectedFolder, loadFields])

  async function saveFolder(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')

    const name = folderName.trim()
    if (!name) {
      setError('Enter a folder name.')
      return
    }

    const duplicate = folders.some(
      folder => folder.name.trim().toLowerCase() === name.toLowerCase() && folder.id !== editingFolder,
    )
    if (duplicate) {
      setError('A folder with this name already exists.')
      return
    }

    if (!editingFolder && draftFields.some(field => !field.field_name.trim())) {
      setError('Every custom field must have a name.')
      return
    }
    if (!editingFolder && draftFields.some(field => field.field_type === 'dropdown' && field.options.length === 0)) {
      setError('Every dropdown field must have at least one option.')
      return
    }

    setSaving(true)
    const generatedCode = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50)

    if (editingFolder) {
      const { error: updateError } = await supabase
        .from('office_folders')
        .update({ name })
        .eq('id', editingFolder)

      setSaving(false)
      if (updateError) {
        setError(`Unable to update folder: ${updateError.message}`)
        return
      }
      setFolderName('')
      setEditingFolder(null)
      setShowFolderModal(false)
      setNotice('Folder updated.')
      await loadFolders()
      return
    }

    // The RPC creates the folder and all draft fields in one database transaction.
    // If any insert or validation fails, PostgreSQL rolls back the entire operation.
    const { data: createdFolderId, error: createError } = await supabase.rpc(
      'create_destination_folder_with_fields',
      {
        p_name: name,
        p_code: `${generatedCode || 'FOLDER'}_${Date.now()}`,
        p_fields: draftFields,
      },
    )

    setSaving(false)
    if (createError) {
      setError(`Unable to create folder and custom fields: ${createError.message}`)
      return
    }

    setFolderName('')
    setDraftFields([])
    resetFieldForm()
    setEditingFolder(null)
    setShowFolderModal(false)
    if (typeof createdFolderId === 'string') setSelectedFolder(createdFolderId)
    setNotice(`Folder "${name}" and ${draftFields.length} custom field(s) created successfully.`)
    await loadFolders()
  }

  function addDraftField() {
    setError('')
    const name = fieldName.trim()
    if (!name) {
      setError('Enter a custom field name before adding it.')
      return
    }
    if (draftFields.some(field => field.field_name.toLowerCase() === name.toLowerCase())) {
      setError('A custom field with this name is already in the list.')
      return
    }
    const options = fieldOptions.split('\n').map(value => value.trim()).filter(Boolean)
    if (fieldType === 'dropdown' && options.length === 0) {
      setError('Enter at least one dropdown option, one per line.')
      return
    }
    setDraftFields(current => [...current, {
      field_name: name,
      field_type: fieldType,
      is_required: fieldRequired,
      options: fieldType === 'dropdown' ? options : [],
    }])
    setFieldName('')
    setFieldType('text')
    setFieldRequired(false)
    setFieldOptions('')
  }

  function editFolder(folder: Folder) {
    setEditingFolder(folder.id)
    setFolderName(folder.name)
    setShowFolderModal(true)
    setError('')
    setNotice('')
  }

  async function deleteFolder(folder: Folder) {
    const confirmed = window.confirm(
      `PERMANENTLY DELETE "${folder.name}"?\n\nIts custom-field definitions will also be removed if the database allows it. This action cannot be undone.`
    )
    if (!confirmed) return

    setError('')
    setNotice('')

    const { error: deleteError } = await supabase
      .from('office_folders')
      .delete()
      .eq('id', folder.id)

    if (deleteError) {
      setError(`Unable to delete folder: ${deleteError.message}`)
      return
    }

    if (selectedFolder === folder.id) {
      setSelectedFolder('')
      setFields([])
      setShowFieldsModal(false)
      resetFieldForm()
    }

    setNotice(`Folder "${folder.name}" permanently deleted.`)
    await loadFolders()
  }

  async function saveField(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!selectedFolder) {
      setError('Create or select a destination folder first.')
      return
    }

    const name = fieldName.trim()
    if (!name) {
      setError('Enter a field name.')
      return
    }

    const options = fieldOptions
      .split('\n')
      .map(value => value.trim())
      .filter(Boolean)

    if (fieldType === 'dropdown' && options.length === 0) {
      setError('Enter at least one dropdown option, one per line.')
      return
    }

    setSaving(true)

    const values = {
      folder_id: selectedFolder,
      field_name: name,
      field_type: fieldType,
      is_required: fieldRequired,
      options,
    }

    const result = editingField
      ? await supabase
          .from('destination_folder_fields')
          .update(values)
          .eq('id', editingField)
      : await supabase
          .from('destination_folder_fields')
          .insert({
            ...values,
            sort_order: fields.length,
          })

    setSaving(false)

    if (result.error) {
      setError(`Unable to save field: ${result.error.message}`)
      return
    }

    resetFieldForm()
    setNotice(editingField ? 'Custom field updated.' : 'Custom field added.')
    await loadFields(selectedFolder)
    await loadFolders()
  }

  function resetFieldForm() {
    setFieldName('')
    setFieldType('text')
    setFieldRequired(false)
    setFieldOptions('')
    setEditingField(null)
  }

  function editField(field: FolderField) {
    setEditingField(field.id)
    setFieldName(field.field_name)
    setFieldType(field.field_type)
    setFieldRequired(field.is_required)
    setFieldOptions((field.options ?? []).join('\n'))
    setError('')
    setNotice('')
  }

  async function deleteField(field: FolderField) {
    if (!window.confirm(`Delete the field "${field.field_name}"?`)) return

    const { error: deleteError } = await supabase
      .from('destination_folder_fields')
      .delete()
      .eq('id', field.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setNotice('Custom field deleted.')
    if (editingField === field.id) resetFieldForm()
    await loadFields(selectedFolder)
    await loadFolders()
  }

  const shownFolders = folders.filter(
    folder => showInactive || folder.is_active,
  )

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-12 md:p-6" style={{ minHeight: "100vh", overflowY: "auto" }}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">ADMINISTRATION</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Destination Folders</h1>
          <p className="mt-1 text-sm text-slate-500">View and manage destination folders.</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingFolder(null); setFolderName(''); setDraftFields([]); resetFieldForm(); setError(''); setNotice(''); setShowFolderModal(true) }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <Plus size={17} /> Add Folder
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowFolderModal(false) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="folder-modal-title" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="folder-modal-title" className="font-semibold text-slate-900">
                {editingFolder ? 'Edit Destination Folder' : 'Add Destination Folder'}
              </h2>
              <button type="button" onClick={() => { setShowFolderModal(false); setEditingFolder(null); setFolderName(''); setDraftFields([]); resetFieldForm() }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close dialog"><X size={18} /></button>
            </div>

        <form onSubmit={event => void saveFolder(event)} className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm font-medium text-slate-700">
            Folder Name *
            <input
              value={folderName}
              onChange={event => setFolderName(event.target.value)}
              placeholder="Enter destination folder name"
              maxLength={150}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </label>

          {!editingFolder && (
            <div className="w-full space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800">Custom Fields</h3>
                  <p className="text-xs text-slate-500">Add the fields before creating the folder.</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{draftFields.length} added</span>
              </div>

              {draftFields.length > 0 && (
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {draftFields.map((field, index) => (
                    <div key={`${field.field_name}-${index}`} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{field.field_name}</p>
                        <p className="text-xs text-slate-500">
                          {field.field_type} · {field.is_required ? 'Required' : 'Optional'}
                          {field.field_type === 'dropdown' ? ` · ${field.options.join(', ')}` : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => setDraftFields(current => current.filter((_, i) => i !== index))}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Field Name *
                  <input value={fieldName} onChange={event => setFieldName(event.target.value)} placeholder="e.g. Reference Number"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Field Type
                  <select value={fieldType} onChange={event => setFieldType(event.target.value as FieldType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                    {fieldTypes.map(type => <option key={type} value={type}>{type === 'textarea' ? 'Text Area' : type.charAt(0).toUpperCase() + type.slice(1)}</option>)}
                  </select>
                </label>
              </div>

              {fieldType === 'dropdown' && (
                <label className="block text-sm font-medium text-slate-700">
                  Dropdown Options * (one per line)
                  <textarea value={fieldOptions} onChange={event => setFieldOptions(event.target.value)} rows={3}
                    placeholder={'Pending\nApproved\nRejected'}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" />
                </label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={fieldRequired} onChange={event => setFieldRequired(event.target.checked)} />
                  Required field
                </label>
                <button type="button" onClick={addDraftField}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                  <Plus size={15} /> Add Custom Field
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {editingFolder ? <Save size={16} /> : <Plus size={16} />}
            {saving ? 'Saving...' : editingFolder ? 'Save Changes' : `Create Folder${draftFields.length ? ` + ${draftFields.length} Field(s)` : ''}`}
          </button>

          {editingFolder && (
            <button
              type="button"
              onClick={() => { setEditingFolder(null); setFolderName(''); setShowFolderModal(false) }}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          )}
        </form>
          </section>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <FolderOpen size={19} /> Destination Folders
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block">
              <span className="sr-only">Search destination folders</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={folderSearch}
                onChange={event => { setFolderSearch(event.target.value); setCurrentPage(1) }}
                placeholder="Search folders..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 sm:w-64"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={event => { setShowInactive(event.target.checked); setCurrentPage(1) }}
              />
              Show inactive
            </label>
          </div>
        </div>

        {loading ? (
          <p className="p-5 text-sm text-slate-500">Loading folders...</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Folder Name</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Custom Fields</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const filtered = shownFolders
                      .filter(folder => folder.name.toLowerCase().includes(folderSearch.trim().toLowerCase()))
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
                    const safePage = Math.min(currentPage, totalPages)
                    const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                            {folderSearch.trim() ? 'No folders match your search.' : 'No destination folders found.'}
                          </td>
                        </tr>
                      )
                    }

                    return pageRows.map(folder => (
                      <tr
                        key={folder.id}
                        className={`transition-colors hover:bg-slate-50 ${selectedFolder === folder.id ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setSelectedFolder(folder.id)}
                            className={`text-left font-semibold hover:text-blue-700 ${selectedFolder === folder.id ? 'text-blue-700' : 'text-slate-800'}`}
                          >
                            {folder.name}
                          </button>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                            {fieldCounts[folder.id] ?? 0}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${folder.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                            {folder.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setSelectedFolder(folder.id); resetFieldForm(); setShowFieldsModal(true) }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              <FolderOpen size={14} /> Manage Fields
                            </button>
                            <button
                              type="button"
                              onClick={() => editFolder(folder)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteFolder(folder)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={event => { setPageSize(Number(event.target.value)); setCurrentPage(1) }}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              {(() => {
                const filteredCount = shownFolders.filter(folder => folder.name.toLowerCase().includes(folderSearch.trim().toLowerCase())).length
                const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))
                const safePage = Math.min(currentPage, totalPages)
                const startRow = filteredCount === 0 ? 0 : (safePage - 1) * pageSize + 1
                const endRow = Math.min(safePage * pageSize, filteredCount)
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{startRow}–{endRow} of {filteredCount}</span>
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                      aria-label="Previous page"
                      className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium text-slate-700">Page {safePage} of {totalPages}</span>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                      aria-label="Next page"
                      className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )
              })()}
            </div>
          </>
        )}
      </section>

      {showFieldsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setShowFieldsModal(false) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="fields-modal-title" className="my-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="fields-modal-title" className="font-semibold text-slate-900">Manage Custom Fields</h2>
                <p className="mt-1 text-sm text-slate-500">{folders.find(folder => folder.id === selectedFolder)?.name ?? 'Selected folder'}</p>
              </div>
              <button type="button" onClick={() => { setShowFieldsModal(false); resetFieldForm() }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close custom fields"><X size={18} /></button>
            </div>
        <p className="mb-4 text-sm text-slate-500">
          Choose a folder, then add the fields that should belong to it.
        </p>

        <form onSubmit={event => void saveField(event)} className="mt-5 space-y-4 rounded-lg bg-slate-50 p-4">
          <h3 className="font-medium text-slate-800">
            {editingField ? 'Edit Custom Field' : 'Add Custom Field'}
          </h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Field Name *
              <input
                value={fieldName}
                onChange={event => setFieldName(event.target.value)}
                placeholder="e.g. Reference Number"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Field Type
              <select
                value={fieldType}
                onChange={event => setFieldType(event.target.value as FieldType)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              >
                {fieldTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'textarea' ? 'Text Area' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {fieldType === 'dropdown' && (
            <label className="block text-sm font-medium text-slate-700">
              Dropdown Options (one per line) *
              <textarea
                value={fieldOptions}
                onChange={event => setFieldOptions(event.target.value)}
                placeholder={'Pending\nApproved\nRejected'}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
              />
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fieldRequired}
              onChange={event => setFieldRequired(event.target.checked)}
            />
            Required field
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || !selectedFolder}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {editingField ? <Save size={16} /> : <Plus size={16} />}
              {saving ? 'Saving...' : editingField ? 'Save Field' : 'Add Field'}
            </button>
            {editingField && (
              <button
                type="button"
                onClick={resetFieldForm}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm"
              >
                <X size={16} /> Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mt-5 divide-y divide-slate-100 rounded-lg border">
          {!selectedFolder ? (
            <p className="p-4 text-sm text-slate-500">Select a folder to manage its fields.</p>
          ) : fields.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No custom fields have been configured for this folder.</p>
          ) : fields.map(field => (
            <div key={field.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{field.field_name}</p>
                <p className="text-xs text-slate-500">
                  {field.field_type} · {field.is_required ? 'Required' : 'Optional'}
                  {field.field_type === 'dropdown' && field.options?.length
                    ? ` · ${field.options.join(', ')}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => editField(field)}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                type="button"
                onClick={() => void deleteField(field)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          ))}
        </div>
          </section>
        </div>
      )}
    </main>
  )
}


