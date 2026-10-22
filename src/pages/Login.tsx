
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

      if (loginError) throw loginError

      if (!data.session) {
        throw new Error('Unable to establish a session.')
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError) throw profileError

      const role = profile?.role

      if (role !== 'admin' && role !== 'receiving_staff') {
        await supabase.auth.signOut()

        throw new Error(
          'Your account has no authorized presSystem role. Contact your administrator.'
        )
      }

      if (role === 'receiving_staff') {
        navigate('/receiving', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl md:grid-cols-2">
        <section className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-blue-600 p-8 text-white md:p-12">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border-[35px] border-white/10" />
          <div className="absolute -bottom-20 -left-12 h-64 w-64 rounded-full border-[35px] border-red-500/40" />

          <div className="relative flex items-center gap-3">
            <div className="rounded-2xl bg-red-600 p-3">
              <ClipboardList size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">presSystem</h1>
              <p className="text-sm text-blue-100">Management Portal</p>
            </div>
          </div>

          <div className="relative mt-12">
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
              Register incoming records, forward them to the right destination,
              and track progress until completion.
            </p>
          </div>

          <p className="relative mt-12 text-xs text-blue-200">
            Secure access for authorized personnel only.
          </p>
        </section>

        <section className="flex items-center p-6 sm:p-10 md:p-12">
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

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <label className="block text-sm font-semibold text-slate-700">
                Email address
                <div className="relative mt-2">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="staff@example.com"
                    className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Password
                <div className="relative mt-2">
                  <LockKeyhole
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-12 font-normal outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-blue-700 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In'}
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
