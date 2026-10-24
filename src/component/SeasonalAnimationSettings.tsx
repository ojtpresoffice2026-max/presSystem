
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_SEASONAL_SETTINGS,
  SEASONAL_SETTINGS_EVENT,
  type SeasonalSettings,
} from './SeasonalDecorations'

const fieldClass =
  'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100'

const SETTINGS_COLUMNS =
  'enabled, holiday, animation_style, animation_speed, decoration_density'

export default function SeasonalAnimationSettings() {
  const [settings, setSettings] =
    useState<SeasonalSettings>(DEFAULT_SEASONAL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [saveSucceeded, setSaveSucceeded] = useState(false)

  useEffect(() => {
    let active = true

    async function loadSettings() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
          throw new Error('Please sign in to access animation settings.')
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) {
          throw new Error(
            `Unable to verify administrator access: ${profileError.message}`,
          )
        }

        if (profile?.role !== 'admin') {
          throw new Error(
            'Only administrators can change these settings.',
          )
        }

        if (active) setIsAdmin(true)

        const { data, error } = await supabase
          .from('seasonal_animation_settings')
          .select(SETTINGS_COLUMNS)
          .eq('id', 1)
          .maybeSingle()

        if (error) {
          throw new Error(`Unable to load settings: ${error.message}`)
        }

        if (!data) {
          throw new Error(
            'No settings record with id = 1 exists. Create this row in Supabase before saving settings.',
          )
        }

        if (active) {
          setSettings({
            ...DEFAULT_SEASONAL_SETTINGS,
            ...data,
          } as SeasonalSettings)
          setMessage('')
        }
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to load animation settings.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSettings()

    return () => {
      active = false
    }
  }, [])

  function update<K extends keyof SeasonalSettings>(
    key: K,
    value: SeasonalSettings[K],
  ) {
    setSettings(current => ({
      ...current,
      [key]: value,
    }))
    setMessage('')
    setSaveSucceeded(false)
  }

  async function saveSettings() {
    if (saving || !isAdmin) return

    setSaving(true)
    setMessage('')
    setSaveSucceeded(false)

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error(
          'Your session has expired. Please sign in again.',
        )
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || profile?.role !== 'admin') {
        throw new Error(
          'Only administrators can save these settings.',
        )
      }

      // Insert row id = 1 if missing, or update it if it exists.
      const { data, error } = await supabase
        .from('seasonal_animation_settings')
        .upsert(
          {
            id: 1,
            enabled: settings.enabled,
            holiday: settings.holiday,
            animation_style: settings.animation_style,
            animation_speed: settings.animation_speed,
            decoration_density: settings.decoration_density,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        )
        .select(SETTINGS_COLUMNS)
        .single()

      if (error) {
        throw new Error(`Unable to save settings: ${error.message}`)
      }

      const savedSettings = {
        ...DEFAULT_SEASONAL_SETTINGS,
        ...data,
      } as SeasonalSettings

      setSettings(savedSettings)

      // Notify other components in this browser tab.
      window.dispatchEvent(new Event(SEASONAL_SETTINGS_EVENT))

      setSaveSucceeded(true)
      setMessage(
        'Settings saved successfully. Refresh the login page or sidebar if the decorations do not update.',
      )
    } catch (error) {
      console.error('Saving seasonal settings failed:', error)

      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save animation settings.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-500">
        Loading animation settings...
      </p>
    )
  }

  if (!isAdmin) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      >
        {message || 'Only administrators can access this page.'}
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Seasonal Animations
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Manage holiday decorations on the login page and application
          sidebar. Changes are saved to the database.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-semibold text-slate-800">
              Enable animations
            </span>
            <span className="text-sm text-slate-500">
              Turn all seasonal decorations on or off.
            </span>
          </span>

          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={saving}
            onChange={event =>
              update('enabled', event.target.checked)
            }
            className="h-5 w-5 accent-blue-600"
          />
        </label>

        <div>
          <label
            htmlFor="holiday-theme"
            className="font-semibold text-slate-800"
          >
            Holiday theme
          </label>

          <select
            id="holiday-theme"
            className={fieldClass}
            value={settings.holiday}
            disabled={saving}
            onChange={event =>
              update(
                'holiday',
                event.target.value as SeasonalSettings['holiday'],
              )
            }
          >
            <option value="automatic">Automatic by date</option>
            <option value="halloween">Halloween 🎃</option>
            <option value="christmas">Christmas 🎄</option>
            <option value="valentines">Valentine's Day 💗</option>
            <option value="newyear">New Year 🎆</option>
            <option value="none">No holiday theme</option>
          </select>

          <p className="mt-1 text-xs text-slate-500">
            Choose a specific holiday to test decorations at any time.
          </p>
        </div>

        <div>
          <label
            htmlFor="animation-style"
            className="font-semibold text-slate-800"
          >
            Animation style
          </label>

          <select
            id="animation-style"
            className={fieldClass}
            value={settings.animation_style}
            disabled={saving}
            onChange={event =>
              update(
                'animation_style',
                event.target.value as SeasonalSettings['animation_style'],
              )
            }
          >
            <option value="floating">Floating</option>
            <option value="falling">Falling</option>
            <option value="twinkling">Twinkling</option>
            <option value="mixed">Mixed animations</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="animation-speed"
            className="font-semibold text-slate-800"
          >
            Animation speed
          </label>

          <select
            id="animation-speed"
            className={fieldClass}
            value={settings.animation_speed}
            disabled={saving}
            onChange={event =>
              update(
                'animation_speed',
                event.target.value as SeasonalSettings['animation_speed'],
              )
            }
          >
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="decoration-density"
            className="font-semibold text-slate-800"
          >
            Decoration density
          </label>

          <select
            id="decoration-density"
            className={fieldClass}
            value={settings.decoration_density}
            disabled={saving}
            onChange={event =>
              update(
                'decoration_density',
                event.target.value as SeasonalSettings['decoration_density'],
              )
            }
          >
            <option value="few">Few decorations</option>
            <option value="medium">Medium</option>
            <option value="many">Many decorations</option>
          </select>
        </div>

        {message && (
          <p
            role={saveSucceeded ? 'status' : 'alert'}
            aria-live="polite"
            className={`rounded-xl p-3 text-sm ${
              saveSucceeded
                ? 'border border-green-200 bg-green-50 text-green-700'
                : 'border border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            {message}
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() => void saveSettings()}
          className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Animation Settings'}
        </button>
      </div>
    </section>
  )
}
