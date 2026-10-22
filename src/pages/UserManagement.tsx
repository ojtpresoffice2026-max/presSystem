
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Search, UserPlus, Users, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type UserRole = 'admin' | 'receiving_staff' | 'releasing_staff'

type Profile = {
  id: string
  full_name: string | null
  role: UserRole
}

const roles: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'receiving_staff', label: 'Receiving Staff' },
  { value: 'releasing_staff', label: 'Releasing Staff' },
]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred.'
}

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('receiving_staff')

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Load every profile the current user is authorized to view.
  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name', { ascending: true })

      if (queryError) throw queryError

      const validRoles = roles.map(item => item.value)

      const profiles: Profile[] = (data ?? [])
        .filter(
          (profile): profile is typeof profile & { role: UserRole } =>
            validRoles.includes(profile.role as UserRole)
        )
        .map(profile => ({
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
        }))

      setUsers(profiles)
    } catch (err) {
      console.error('Unable to load registered users:', err)
      setError(
        `Unable to load registered users. ${getErrorMessage(err)}`
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  // Create accounts through the secure Supabase Edge Function.
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
        console.error('Account creation function failed:', functionError)

        let details = functionError.message

        try {
          const context = functionError.context

          if (context instanceof Response) {
            const responseBody = await context.clone().json()
            details =
              responseBody.error ||
              responseBody.message ||
              details
          }
        } catch {
          // Keep the original error when no JSON response is available.
        }

        throw new Error(details)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setMessage(
        `Account for ${cleanName} was created successfully.`
      )

      setFullName('')
      setEmail('')
      setPassword('')
      setRole('receiving_staff')

      // Refresh the table after successful account creation.
      await loadUsers()
    } catch (err) {
      console.error('Unable to create account:', err)
      setError(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const filteredUsers = users.filter(user => {
    const query = search.trim().toLowerCase()

    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query) ||
      roles
        .find(item => item.value === user.role)
        ?.label.toLowerCase()
        .includes(query) ||
      user.id.toLowerCase().includes(query)
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
          Create staff accounts and assign system access roles.
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
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="At least 8 characters"
            />
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
                placeholder="Search name, role, or ID..."
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
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Full Name
                </th>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Role
                </th>
                <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  User ID
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading registered users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    {users.length === 0
                      ? 'No user profiles are visible. Check your Supabase permissions.'
                      : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {user.full_name || 'Unnamed User'}
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.role === 'admin'
                            ? 'bg-blue-50 text-blue-700'
                            : user.role === 'receiving_staff'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {roles.find(item => item.value === user.role)?.label ??
                          user.role}
                      </span>
                    </td>

                    <td className="break-all px-5 py-3.5 font-mono text-xs text-slate-500">
                      {user.id}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
