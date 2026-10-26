
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import ThemeToggle from '../component/ThemeToggle'

type UserRole = 'admin' | 'staff'

const INACTIVE_ACCOUNT_MESSAGE =
  'Login denied: your account has been deactivated. Please contact your system administrator to restore access.'

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setError('')
    setLoading(true)

    let authenticatedUserId: string | null = null

    try {
      const normalizedEmail = email.trim().toLowerCase()

      // Check account status before password authentication.
      const { data: status, error: statusError } =
        await supabase.functions.invoke(
          'check-account-status',
          {
            body: { email: normalizedEmail },
          }
        )

      if (statusError) {
        console.error(
          'Account status check failed:',
          statusError
        )

        throw new Error(
          'Unable to verify your account status. Please try again or contact your administrator.'
        )
      }

      if (status?.status === 'inactive') {
        setError(INACTIVE_ACCOUNT_MESSAGE)
        return
      }

      if (status?.status !== 'active') {
        throw new Error(
          'Unable to verify your account. Please contact your administrator.'
        )
      }

      // Authenticate only after confirming the account is active.
      const {
        data,
        error: loginError,
      } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (loginError) throw loginError

      if (!data.session || !data.user) {
        throw new Error('Unable to establish a session.')
      }

      authenticatedUserId = data.user.id

      // Recheck the profile after authentication.
      // This helps catch status changes during the login process.
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('role, full_name, is_active')
        .eq('id', authenticatedUserId)
        .maybeSingle()

      if (profileError) {
        console.error('Profile lookup failed:', profileError)

        throw new Error(
          'Unable to verify your account. Please contact your administrator.'
        )
      }

      if (!profile) {
        throw new Error(
          'Your account profile was not found. Contact your administrator.'
        )
      }

      if (profile.is_active !== true) {
        throw new Error(INACTIVE_ACCOUNT_MESSAGE)
      }

      const role = profile.role as UserRole | undefined

      if (role !== 'admin' && role !== 'staff') {
        throw new Error(
          'Your account has no authorized presSystem role. Contact your administrator.'
        )
      }

      const accountName =
        profile.full_name?.trim() || 'there'

      sessionStorage.setItem(
        'loginWelcome',
        `Welcome, ${accountName}! Have a good day.`
      )

      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('Login failed:', err)

      const message =
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.'

      if (authenticatedUserId) {
        try {
          const { error: signOutError } =
            await supabase.auth.signOut()

          if (signOutError) {
            console.error(
              'Could not clear rejected login session:',
              signOutError
            )
          }
        } catch (signOutError) {
          console.error(
            'Could not clear rejected login session:',
            signOutError
          )
        }

        sessionStorage.removeItem('loginWelcome')
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-100 p-4 transition-colors duration-300">
      <div className="fixed right-5 top-5 z-50">
        <ThemeToggle />
      </div>

      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl transition-colors duration-300 md:grid-cols-2">
        {/* LEFT PANEL */}
        <section className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600 p-8 text-white md:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border-[35px] border-white/10"
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full border-[35px] border-red-500/30"
          />

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white p-1">
              <img
                src="/logo.jpg"
                alt="presSystem logo"
                className="h-full w-full rounded-xl object-contain"
              />
            </div>

            <div>
              <h1 className="text-2xl font-bold">
                presSystem
              </h1>
              <p className="text-sm text-blue-100">
                Management Portal
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-12">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-red-200">
              Receiving &amp; Tracking
            </p>

            <h2 className="text-3xl font-bold leading-tight md:text-4xl">
              Every record.
              <br />
              Every step.
              <br />
              Accounted for.
            </h2>

            <p className="mt-4 max-w-sm text-sm leading-6 text-blue-100">
              Register incoming records, forward them to the right
              destination, and track progress until completion.
            </p>
          </div>

          <p className="relative z-10 mt-12 text-xs text-blue-200">
            Secure access for authorized personnel only.
          </p>
        </section>

        {/* RIGHT PANEL */}
        <section className="flex items-center bg-white p-6 transition-colors duration-300 sm:p-10 md:p-12">
          <div className="w-full">
            <div className="mb-8">
              <p className="text-sm font-semibold text-red-600">
                WELCOME BACK
              </p>

              <h2 className="mt-2 text-3xl font-bold text-slate-900">
                Sign in
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Enter your authorized staff account credentials.
              </p>
            </div>

            {/* ERROR MESSAGE */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-200 font-bold text-red-800"
                >
                  !
                </span>

                <p className="leading-6">{error}</p>
              </div>
            )}

            <form
              onSubmit={handleLogin}
              className="space-y-5"
            >
              <label className="block text-sm font-semibold text-slate-700">
                Email address

                <div className="relative mt-2">
                  <Mail
                    size={18}
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (error) setError('')
                    }}
                    placeholder="staff@example.com"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Password

                <div className="relative mt-2">
                  <LockKeyhole
                    size={18}
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      if (error) setError('')
                    }}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-12 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((value) => !value)
                    }
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  >
                    {showPassword
                      ? <EyeOff size={18} />
                      : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Checking account...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-slate-500">
              Need access? Contact your system administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
