
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Search,
  UserPlus,
  Users,
  RefreshCw,
  Eye,
  EyeOff,
  KeyRound,
  Trash2,
  X,
  ShieldAlert,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type UserRole = 'admin' | 'staff'

type Profile = {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string | null
}

const roles: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred.'
}

// Format timestamps in Philippine Standard Time.
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date)
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [search, setSearch] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<UserRole>('staff')

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [actionUserId, setActionUserId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // In-app modal state.
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  const modalOpen = Boolean(resetTarget || deleteTarget)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!currentUser) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      setCurrentUserId(currentUser.id)

      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .order('full_name', { ascending: true })

      if (queryError) throw queryError

      const profiles: Profile[] = (data ?? [])
        .filter(
          (profile): profile is typeof profile & { role: UserRole } =>
            profile.role === 'admin' || profile.role === 'staff',
        )
        .map(profile => ({
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          created_at: profile.created_at,
        }))

      setUsers(profiles)
    } catch (err) {
      console.error('Unable to load registered users:', err)
      setError(`Unable to load registered users. ${getErrorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  // Close the modal with Escape.
  useEffect(() => {
    if (!modalOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !modalLoading) {
        closeModals()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modalOpen, modalLoading])

  function closeModals() {
    if (modalLoading) return

    setResetTarget(null)
    setDeleteTarget(null)
    setNewPassword('')
    setConfirmPassword('')
    setShowResetPassword(false)
    setModalError('')
  }

  function openResetModal(user: Profile) {
    setError('')
    setMessage('')
    setModalError('')
    setNewPassword('')
    setConfirmPassword('')
    setShowResetPassword(false)
    setDeleteTarget(null)
    setResetTarget(user)
  }

  function openDeleteModal(user: Profile) {
    if (user.id === currentUserId) {
      setError('You cannot delete your own account.')
      return
    }

    setError('')
    setMessage('')
    setModalError('')
    setResetTarget(null)
    setDeleteTarget(user)
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')

    try {
      const cleanName = fullName.trim()
      const cleanEmail = email.trim().toLowerCase()

      if (!cleanName || !cleanEmail || !password) {
        throw new Error('Please complete all required fields.')
      }

      if (password.length < 8) {
        throw new Error('The password must contain at least 8 characters.')
      }

      if (role !== 'admin' && role !== 'staff') {
        throw new Error('Please select a valid account role.')
      }

      const { data, error: functionError } =
        await supabase.functions.invoke('admin-create-user', {
          body: {
            full_name: cleanName,
            email: cleanEmail,
            password,
            role,
          },
        })

      if (functionError) {
        let details = functionError.message

        try {
          const context = functionError.context

          if (context instanceof Response) {
            const responseBody = await context.clone().json()
            details = responseBody.error || responseBody.message || details
          }
        } catch {
          // Retain the original error message.
        }

        throw new Error(details)
      }

      if (data?.error) throw new Error(data.error)

      setMessage(`Account for ${cleanName} was created successfully.`)
      setFullName('')
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setRole('staff')

      // Reload profiles, including the new account's creation timestamp.
      await loadUsers()
    } catch (err) {
      console.error('Unable to create account:', err)
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function confirmPasswordReset() {
    if (!resetTarget) return

    setModalError('')

    if (newPassword.length < 8) {
      setModalError('The password must contain at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setModalError('The passwords do not match.')
      return
    }

    setModalLoading(true)
    setActionUserId(resetTarget.id)

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke('admin-reset-user-password', {
          body: {
            user_id: resetTarget.id,
            new_password: newPassword,
          },
        })

      if (functionError) {
        let details = functionError.message

        try {
          const context = functionError.context

          if (context instanceof Response) {
            const responseBody = await context.clone().json()
            details = responseBody.error || responseBody.message || details
          }
        } catch {
          // Retain the original error message.
        }

        throw new Error(details)
      }

      if (data?.error) throw new Error(data.error)

      const name = resetTarget.full_name || 'the selected user'

      setResetTarget(null)
      setNewPassword('')
      setConfirmPassword('')
      setShowResetPassword(false)
      setMessage(`Password reset successfully for ${name}.`)
    } catch (err) {
      console.error('Unable to reset password:', err)
      setModalError(getErrorMessage(err))
    } finally {
      setModalLoading(false)
      setActionUserId('')
    }
  }

  async function confirmDeleteUser() {
    if (!deleteTarget) return

    if (deleteTarget.id === currentUserId) {
      setModalError('You cannot delete your own account.')
      return
    }

    setModalLoading(true)
    setActionUserId(deleteTarget.id)
    setModalError('')

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke('admin-delete-user', {
          body: { user_id: deleteTarget.id },
        })

      if (functionError) {
        let details = functionError.message

        try {
          const context = functionError.context

          if (context instanceof Response) {
            const responseBody = await context.clone().json()
            details = responseBody.error || responseBody.message || details
          }
        } catch {
          // Retain the original error message.
        }

        throw new Error(details)
      }

      if (data?.error) throw new Error(data.error)

      const name = deleteTarget.full_name || 'Unnamed User'

      setDeleteTarget(null)
      setMessage(`Account for ${name} was deleted.`)

      await loadUsers()
    } catch (err) {
      console.error('Unable to delete user:', err)
      setModalError(getErrorMessage(err))
    } finally {
      setModalLoading(false)
      setActionUserId('')
    }
  }

  const filteredUsers = users.filter(user => {
    const query = search.trim().toLowerCase()
    const roleLabel =
      roles.find(item => item.value === user.role)?.label ?? user.role
    const createdAt = formatDateTime(user.created_at).toLowerCase()

    return (
      (user.full_name ?? '').toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query) ||
      roleLabel.toLowerCase().includes(query) ||
      user.id.toLowerCase().includes(query) ||
      createdAt.includes(query)
    )
  })

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium text-slate-500">
          Workspace / Administration
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          User Management
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Create accounts, assign roles, reset passwords, and manage users.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
        >
          {message}
        </div>
      )}

      {/* Create account form */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-3 text-blue-700">
            <UserPlus size={21} />
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">
              Create User Account
            </h3>
            <p className="text-xs text-slate-500">
              Set login credentials and assign a role.
            </p>
          </div>
        </div>

        <form
          onSubmit={createUser}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <label className="text-sm font-medium text-slate-700">
            Full Name
            <input
              required
              value={fullName}
              onChange={event => setFullName(event.target.value)}
              autoComplete="name"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Enter full name"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Email Address
            <input
              required
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="user@example.com"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Temporary Password
            <div className="relative mt-1.5">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="At least 8 characters"
              />

              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Assign Role
            <select
              value={role}
              onChange={event => setRole(event.target.value as UserRole)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {roles.map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus size={16} />
              {creating ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </section>

      {/* Registered users table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Users size={21} className="text-blue-700" />

            <div>
              <h3 className="font-semibold text-slate-900">
                Registered Users
              </h3>
              <p className="text-xs text-slate-500">
                {loading
                  ? 'Loading users...'
                  : `${filteredUsers.length} of ${users.length} user(s) shown`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search name, role, date, or ID..."
                aria-label="Search registered users"
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-blue-500 sm:w-64"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadUsers()}
              disabled={loading}
              aria-label="Refresh users"
              title="Refresh users"
              className="rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={loading ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Full Name
                </th>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Role
                </th>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Created At (PHT)
                </th>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  User ID
                </th>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading registered users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    {users.length === 0
                      ? 'No user profiles are visible. Check your Supabase permissions.'
                      : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const isSelf = user.id === currentUserId
                  const isBusy = actionUserId === user.id

                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-medium text-slate-800">
                        {user.full_name || 'Unnamed User'}
                        {isSelf && (
                          <span className="ml-2 text-xs text-slate-400">
                            (You)
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            user.role === 'admin'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {roles.find(item => item.value === user.role)?.label ??
                            user.role}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-600">
                        {formatDateTime(user.created_at)}
                      </td>

                      <td className="break-all px-5 py-3.5 font-mono text-xs text-slate-500">
                        {user.id}
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openResetModal(user)}
                            disabled={isBusy || modalLoading}
                            title="Set a new temporary password"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            <KeyRound size={14} />
                            Reset Password
                          </button>

                          <button
                            type="button"
                            onClick={() => openDeleteModal(user)}
                            disabled={isSelf || isBusy || modalLoading}
                            title={
                              isSelf
                                ? 'You cannot delete your own account'
                                : 'Delete user account'
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reset password modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget &&
              !modalLoading
            ) {
              closeModals()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-modal-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h3
                    id="reset-modal-title"
                    className="font-bold text-slate-900"
                  >
                    Reset Password
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {resetTarget.full_name || 'Selected user'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModals}
                disabled={modalLoading}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form
              onSubmit={event => {
                event.preventDefault()
                void confirmPasswordReset()
              }}
            >
              <div className="space-y-4 p-5">
                <p className="text-sm leading-6 text-slate-600">
                  Set a new temporary password for this account. Existing
                  passwords cannot be retrieved.
                </p>

                {modalError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    {modalError}
                  </div>
                )}

                <label className="block text-sm font-medium text-slate-700">
                  New Temporary Password
                  <div className="relative mt-1.5">
                    <input
                      required
                      type={showResetPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      value={newPassword}
                      onChange={event => setNewPassword(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowResetPassword(value => !value)
                      }
                      aria-label={
                        showResetPassword ? 'Hide password' : 'Show password'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                    >
                      {showResetPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Confirm New Password
                  <input
                    required
                    type={showResetPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Re-enter new password"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5">
                <button
                  type="button"
                  onClick={closeModals}
                  disabled={modalLoading}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {modalLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={event => {
            if (
              event.target === event.currentTarget &&
              !modalLoading
            ) {
              closeModals()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-red-50 p-3 text-red-600">
                  <ShieldAlert size={23} />
                </div>
                <div>
                  <h3
                    id="delete-modal-title"
                    className="font-bold text-slate-900"
                  >
                    Delete User Account?
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    This action requires confirmation.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModals}
                disabled={modalLoading}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-sm leading-6 text-slate-600">
                You are about to delete{' '}
                <strong className="text-slate-900">
                  {deleteTarget.full_name || 'this user'}
                </strong>
                . This action may permanently remove the account. Check
                associated records before proceeding.
              </p>

              {modalError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {modalError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5">
              <button
                type="button"
                onClick={closeModals}
                disabled={modalLoading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void confirmDeleteUser()}
                disabled={modalLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={15} />
                {modalLoading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
