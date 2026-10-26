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
  Pencil,
  Power,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type UserRole = 'admin' | 'staff'

const DEFAULT_OFFICE = 'Office of the President - NORSU'

type Profile = {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string | null
  avatar_path: string | null
  office: string | null
  is_active: boolean
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
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const [avatarPreviewUser, setAvatarPreviewUser] = useState<Profile | null>(null)
  const [search, setSearch] = useState('')

  // Create-user form
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<UserRole>('staff')

  // Page state
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [statusChangingUserId, setStatusChangingUserId] = useState('')
  const [actionUserId, setActionUserId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Modal state
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [editTarget, setEditTarget] = useState<Profile | null>(null)
  const [statusTarget, setStatusTarget] = useState<Profile | null>(null)

  const [editFullName, setEditFullName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  const modalOpen = Boolean(resetTarget || deleteTarget || editTarget || statusTarget)

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
        .select('id, full_name, role, created_at, avatar_path, office, is_active')
        .order('created_at', { ascending: false, nullsFirst: false })

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
          avatar_path: profile.avatar_path ?? null,
          office: profile.office ?? DEFAULT_OFFICE,
          is_active: profile.is_active === true,
        }))

      setCurrentUserRole(profiles.find(profile => profile.id === currentUser.id)?.role ?? null)
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
    setEditTarget(null)
    setStatusTarget(null)
    setEditFullName('')
    setNewPassword('')
    setConfirmPassword('')
    setShowResetPassword(false)
    setModalError('')
  }

  function openEditModal(user: Profile) {
    setError('')
    setMessage('')
    setModalError('')
    setResetTarget(null)
    setDeleteTarget(null)
    setStatusTarget(null)
    setEditTarget(user)
    setEditFullName(user.full_name ?? '')
  }

  function openResetModal(user: Profile) {
    setError('')
    setMessage('')
    setModalError('')
    setNewPassword('')
    setConfirmPassword('')
    setShowResetPassword(false)
    setDeleteTarget(null)
    setEditTarget(null)
    setStatusTarget(null)
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
    setEditTarget(null)
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
            office: DEFAULT_OFFICE,
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
          // Keep the original error message.
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

      await loadUsers()
    } catch (err) {
      console.error('Unable to create account:', err)
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function saveUserName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editTarget) return

    const cleanName = editFullName.trim()

    if (!cleanName) {
      setModalError('Full name is required.')
      return
    }

    if (cleanName.length > 150) {
      setModalError('Full name cannot exceed 150 characters.')
      return
    }

    setModalLoading(true)
    setActionUserId(editTarget.id)
    setModalError('')

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: cleanName })
        .eq('id', editTarget.id)

      if (updateError) throw updateError

      setUsers(currentUsers =>
        currentUsers.map(user =>
          user.id === editTarget.id
            ? { ...user, full_name: cleanName }
            : user,
        ),
      )

      const updatedUserId = editTarget.id
      const isSelf = updatedUserId === currentUserId

      setEditTarget(null)
      setEditFullName('')
      setMessage(
        isSelf
          ? 'Your name was updated successfully.'
          : `Name updated successfully to "${cleanName}".`,
      )

      if (isSelf) {
        window.dispatchEvent(new Event('profile-avatar-updated'))
      }
    } catch (err) {
      console.error('Unable to update user name:', err)
      setModalError(getErrorMessage(err))
    } finally {
      setModalLoading(false)
      setActionUserId('')
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
          // Keep the original error message.
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
          // Keep the original error message.
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

  function openStatusModal(user: Profile) {
    if (user.id === currentUserId) {
      setError('You cannot change your own account status.')
      return
    }

    setError('')
    setMessage('')
    setModalError('')
    setResetTarget(null)
    setDeleteTarget(null)
    setEditTarget(null)
    setStatusTarget(user)
  }

  async function confirmUserStatusChange() {
    if (!statusTarget) return

    if (statusTarget.id === currentUserId) {
      setModalError('You cannot change your own account status.')
      return
    }

    const user = statusTarget
    const nextStatus = !user.is_active
    const action = nextStatus ? 'activate' : 'deactivate'
    const name = user.full_name || 'this user'

    setModalLoading(true)
    setStatusChangingUserId(user.id)
    setModalError('')
    setError('')
    setMessage('')

    try {
      // Request the updated row back so an RLS-blocked or unmatched update
      // cannot be reported as successful.
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: nextStatus })
        .eq('id', user.id)
        .select('id, is_active')
        .maybeSingle()

      if (updateError) throw updateError

      if (!updatedProfile) {
        throw new Error(
          'Supabase did not update this profile. Check the profiles table UPDATE policy and confirm that your signed-in account is an administrator.',
        )
      }

      if (updatedProfile.is_active !== nextStatus) {
        throw new Error(
          'The database returned a different account status than requested. Refresh the page and check your Supabase policies.',
        )
      }

      // Reload from Supabase so the table reflects the persisted database value.
      await loadUsers()

      setStatusTarget(null)
      setMessage(
        `${name}'s account was ${updatedProfile.is_active ? 'activated' : 'deactivated'} successfully.`,
      )
    } catch (err) {
      console.error('Unable to change account status:', err)
      setModalError(`Unable to ${action} this account. ${getErrorMessage(err)}`)
    } finally {
      setModalLoading(false)
      setStatusChangingUserId('')
    }
  }

  function getAvatarUrl(user: Profile): string {
    if (!user.avatar_path) return ''
    return supabase.storage.from('avatars').getPublicUrl(user.avatar_path).data.publicUrl
  }

  const canPreviewAvatars = currentUserRole === 'admin'

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
      (user.office ?? '').toLowerCase().includes(query) ||
      createdAt.includes(query) ||
      (user.is_active ? 'active' : 'inactive').includes(query)
    )
  })

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      {/* Page header */}
      <header className="shrink-0">
        <p className="text-xs font-medium text-slate-500">
          Workspace / Administration
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          User Management
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Create accounts, edit names, reset passwords, and activate or deactivate users.
        </p>
      </header>

      {/* Status messages */}
      {(error || message) && (
        <div className="shrink-0 space-y-2">
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
        </div>
      )}

      {/* Create account form */}
      <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
              maxLength={150}
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

      {/* Registered users table: this section fills the remaining height */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Table toolbar stays fixed */}
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
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

        {/* Only this area scrolls vertically and horizontally */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1450px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  No.
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Photo
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Full Name
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Role
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Office
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Account Status
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Created At (PHT)
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  User ID
                </th>
                <th className="whitespace-nowrap bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading registered users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    {users.length === 0
                      ? 'No user profiles are visible. Check your Supabase permissions.'
                      : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => {
                  const isSelf = user.id === currentUserId
                  const isBusy = actionUserId === user.id

                  return (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate-500">
                        {filteredUsers.length - index}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {getAvatarUrl(user) ? (
                          canPreviewAvatars ? (
                            <button
                              type="button"
                              onClick={() => setAvatarPreviewUser(user)}
                              className="group rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                              title={`View ${user.full_name || 'user'} profile picture`}
                              aria-label={`View ${user.full_name || 'user'} profile picture`}
                            >
                              <img
                                src={getAvatarUrl(user)}
                                alt={`${user.full_name || 'User'} profile`}
                                className="h-11 w-11 rounded-full border border-slate-200 object-cover transition group-hover:scale-105"
                              />
                            </button>
                          ) : (
                            <img
                              src={getAvatarUrl(user)}
                              alt={`${user.full_name || 'User'} profile`}
                              className="h-11 w-11 rounded-full border border-slate-200 object-cover"
                            />
                          )
                        ) : (
                          <div
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500"
                            aria-label="No profile picture"
                            title="No profile picture"
                          >
                            {(user.full_name?.trim().charAt(0) || '?').toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-800">
                        {user.full_name || 'Unnamed User'}
                        {isSelf && (
                          <span className="ml-2 text-xs text-slate-400">
                            (You)
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-5 py-3.5">
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
                        {user.office || '—'}
                      </td>

                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            user.is_active
                              ? 'bg-green-50 text-green-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-600">
                        {formatDateTime(user.created_at)}
                      </td>

                      <td className="break-all px-5 py-3.5 font-mono text-xs text-slate-500">
                        {user.id}
                      </td>

                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(user)}
                            disabled={isBusy || modalLoading}
                            title={`Edit name for ${user.full_name || 'this user'}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Pencil size={14} />
                            Edit Name
                          </button>

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
                            onClick={() => openStatusModal(user)}
                            disabled={isSelf || isBusy || modalLoading || statusChangingUserId === user.id}
                            title={
                              isSelf
                                ? 'You cannot change your own account status'
                                : user.is_active
                                  ? 'Deactivate account'
                                  : 'Activate account'
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                              user.is_active
                                ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                : 'border-green-200 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            <Power size={14} />
                            {statusChangingUserId === user.id
                              ? 'Saving...'
                              : user.is_active
                                ? 'Deactivate'
                                : 'Activate'}
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

      {/* Admin-only enlarged profile picture preview */}
      {canPreviewAvatars && avatarPreviewUser && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setAvatarPreviewUser(null)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setAvatarPreviewUser(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-preview-title"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white p-5 text-center shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setAvatarPreviewUser(null)}
              aria-label="Close profile picture preview"
              className="absolute right-3 top-3 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X size={20} />
            </button>
            <h3 id="avatar-preview-title" className="mb-4 pr-8 text-left font-semibold text-slate-900">
              {avatarPreviewUser.full_name || 'User'} — Profile Picture
            </h3>
            {getAvatarUrl(avatarPreviewUser) ? (
              <img
                src={getAvatarUrl(avatarPreviewUser)}
                alt={`${avatarPreviewUser.full_name || 'User'} enlarged profile`}
                className="mx-auto max-h-[65vh] w-auto max-w-full rounded-xl object-contain"
              />
            ) : (
              <p className="py-12 text-sm text-slate-500">This account has no profile picture.</p>
            )}
          </section>
        </div>
      )}

      {/* Edit user name modal */}
      {editTarget && (
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
            aria-labelledby="edit-name-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <h3
                  id="edit-name-title"
                  className="font-bold text-slate-900"
                >
                  Edit User Name
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Update the selected user's full name.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModals}
                disabled={modalLoading}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveUserName}>
              <div className="space-y-4 p-5">
                {modalError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    {modalError}
                  </div>
                )}

                <p className="text-sm text-slate-600">
                  Editing account:
                  <span className="ml-1 font-semibold text-slate-900">
                    {editTarget.full_name || 'Unnamed User'}
                    {editTarget.id === currentUserId ? ' (You)' : ''}
                  </span>
                </p>

                <label className="block text-sm font-medium text-slate-700">
                  Full Name
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={150}
                    value={editFullName}
                    onChange={event => setEditFullName(event.target.value)}
                    placeholder="Enter full name"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil size={15} />
                  {modalLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

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

      {/* In-system account status confirmation modal */}
      {statusTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !modalLoading) {
              closeModals()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-modal-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-3 ${statusTarget.is_active ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                  <Power size={23} />
                </div>
                <div>
                  <h3 id="status-modal-title" className="font-bold text-slate-900">
                    {statusTarget.is_active ? 'Deactivate Account?' : 'Activate Account?'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Confirm this account status change.
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
                Are you sure you want to {statusTarget.is_active ? 'deactivate' : 'activate'}{' '}
                <strong className="text-slate-900">
                  {statusTarget.full_name || 'this user'}
                </strong>
                's account?
              </p>
              <div className={`rounded-lg border p-3 text-sm leading-5 ${statusTarget.is_active ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                {statusTarget.is_active
                  ? 'The account will be marked inactive. The user should be prevented from signing in by the login and session authorization checks.'
                  : 'The account will be marked active and may sign in again, subject to the system’s authorization checks.'}
              </div>
              {modalError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
                onClick={() => void confirmUserStatusChange()}
                disabled={modalLoading}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${statusTarget.is_active ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-700 hover:bg-green-800'}`}
              >
                <Power size={15} />
                {modalLoading
                  ? 'Saving...'
                  : statusTarget.is_active
                    ? 'Deactivate Account'
                    : 'Activate Account'}
              </button>
            </div>
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