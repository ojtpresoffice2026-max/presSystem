import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Holiday = 'halloween' | 'christmas' | 'valentines' | 'newyear' | null
export type HolidayChoice =
  | 'automatic'
  | 'halloween'
  | 'christmas'
  | 'valentines'
  | 'newyear'
  | 'none'
export type AnimationStyle = 'floating' | 'falling' | 'twinkling' | 'mixed'
export type AnimationSpeed = 'slow' | 'normal' | 'fast'
export type DecorationDensity = 'few' | 'medium' | 'many'

export interface SeasonalSettings {
  enabled: boolean
  holiday: HolidayChoice
  animation_style: AnimationStyle
  animation_speed: AnimationSpeed
  decoration_density: DecorationDensity
}

export const DEFAULT_SEASONAL_SETTINGS: SeasonalSettings = {
  enabled: true,
  holiday: 'automatic',
  animation_style: 'mixed',
  animation_speed: 'normal',
  decoration_density: 'medium',
}

export const SEASONAL_SETTINGS_EVENT = 'seasonal-settings-changed'

export function getCurrentHoliday(): Holiday {
  const month = new Date().getMonth() + 1
  const day = new Date().getDate()

  if ((month === 10 && day >= 20) || (month === 11 && day === 1)) return 'halloween'
  if (month === 12 && day >= 1 && day <= 26) return 'christmas'
  if ((month === 12 && day >= 27) || (month === 1 && day <= 3)) return 'newyear'
  if (month === 2 && day >= 7 && day <= 15) return 'valentines'

  return null
}

export function resolveHoliday(choice: HolidayChoice): Holiday {
  if (choice === 'none') return null
  if (choice === 'automatic') return getCurrentHoliday()
  return choice
}

function normalizeSettings(data: Partial<SeasonalSettings>): SeasonalSettings {
  const holiday = String(data.holiday ?? '').trim().toLowerCase()
  const style = String(data.animation_style ?? '').trim().toLowerCase()
  const speed = String(data.animation_speed ?? '').trim().toLowerCase()
  const density = String(data.decoration_density ?? '').trim().toLowerCase()

  return {
    enabled:
      typeof data.enabled === 'boolean'
        ? data.enabled
        : DEFAULT_SEASONAL_SETTINGS.enabled,
    holiday: (
      ['automatic', 'halloween', 'christmas', 'valentines', 'newyear', 'none'].includes(
        holiday,
      )
        ? holiday
        : DEFAULT_SEASONAL_SETTINGS.holiday
    ) as HolidayChoice,
    animation_style: (
      ['floating', 'falling', 'twinkling', 'mixed'].includes(style)
        ? style
        : DEFAULT_SEASONAL_SETTINGS.animation_style
    ) as AnimationStyle,
    animation_speed: (
      ['slow', 'normal', 'fast'].includes(speed)
        ? speed
        : DEFAULT_SEASONAL_SETTINGS.animation_speed
    ) as AnimationSpeed,
    decoration_density: (
      ['few', 'medium', 'many'].includes(density)
        ? density
        : DEFAULT_SEASONAL_SETTINGS.decoration_density
    ) as DecorationDensity,
  }
}

export function useSeasonalSettings(): SeasonalSettings {
  const [settings, setSettings] = useState<SeasonalSettings>(
    DEFAULT_SEASONAL_SETTINGS,
  )

  useEffect(() => {
    let active = true
    let requestNumber = 0

    async function loadSettings() {
      const currentRequest = ++requestNumber

      try {
        const { data, error } = await supabase
          .from('seasonal_animation_settings')
          .select(
            'enabled, holiday, animation_style, animation_speed, decoration_density',
          )
          .eq('id', 1)
          .maybeSingle()

        if (!active || currentRequest !== requestNumber) return

        if (error) {
          console.error(
            '[SeasonalDecorations] Could not load settings:',
            error.message,
          )
          return
        }

        if (!data) {
          console.warn(
            '[SeasonalDecorations] No settings row found for id=1.',
          )
          return
        }

        setSettings(normalizeSettings(data as Partial<SeasonalSettings>))
      } catch (error) {
        if (active) {
          console.error(
            '[SeasonalDecorations] Settings request failed:',
            error,
          )
        }
      }
    }

    const handleSettingsChanged = () => {
      void loadSettings()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadSettings()
    }

    window.addEventListener(SEASONAL_SETTINGS_EVENT, handleSettingsChanged)
    window.addEventListener('focus', handleSettingsChanged)
    document.addEventListener('visibilitychange', handleVisibility)

    void loadSettings()

    const refreshId = window.setInterval(() => {
      void loadSettings()
    }, 4000)

    const channel = supabase
      .channel('seasonal-animation-settings-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'seasonal_animation_settings',
          filter: 'id=eq.1',
        },
        () => {
          void loadSettings()
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn(
            '[SeasonalDecorations] Realtime unavailable; polling remains active.',
          )
        }
      })

    return () => {
      active = false
      window.removeEventListener(SEASONAL_SETTINGS_EVENT, handleSettingsChanged)
      window.removeEventListener('focus', handleSettingsChanged)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearInterval(refreshId)
      void supabase.removeChannel(channel)
    }
  }, [])

  return settings
}

const decorations: Record<Exclude<Holiday, null>, string[]> = {
  halloween: [
    '🎃', '🦇', '🕸️', '👻', '✨', '🎃', '🦇', '🕷️', '🧡', '🌙',
    '🕯️', '🦉', '🍂', '👻', '🎃', '🕸️', '🦇', '✨', '🕷️', '🎃',
  ],
  christmas: [
    '🎄', '❄️', '🎁', '✨', '🔔', '⭐', '🎅', '❄️', '🦌', '🎄',
    '🎀', '☃️', '❄️', '🕯️', '🎁', '🌟', '🧦', '🍬', '🎄', '❄️',
  ],
  valentines: [
    '💗', '💕', '♥️', '✨', '💖', '💌', '💞', '💗', '💘', '🌹',
    '💝', '💕', '💓', '💐', '💗', '💖', '💘', '🌹', '💕', '💝',
  ],
  newyear: [
    '✨', '🎉', '🎆', '🎊', '🥂', '🎇', '⭐', '✨', '🎉', '🎆',
    '🎊', '🌟', '🎇', '🎉', '✨', '🥂', '🎊', '🎆', '⭐', '🎉',
  ],
}

const positions = [
  { left: 3, top: 12 }, { left: 12, top: 36 }, { left: 23, top: 8 },
  { left: 34, top: 24 }, { left: 45, top: 12 }, { left: 57, top: 42 },
  { left: 68, top: 15 }, { left: 79, top: 35 }, { left: 91, top: 12 },
  { left: 96, top: 65 }, { left: 7, top: 73 }, { left: 18, top: 88 },
  { left: 31, top: 67 }, { left: 42, top: 86 }, { left: 54, top: 72 },
  { left: 64, top: 91 }, { left: 74, top: 66 }, { left: 84, top: 86 },
  { left: 52, top: 25 }, { left: 89, top: 48 },
]

const speedSeconds: Record<AnimationSpeed, number> = {
  slow: 12,
  normal: 7,
  fast: 4,
}

const mixedAnimations = [
  'seasonal-float',
  'seasonal-fall',
  'seasonal-twinkle',
] as const

export default function SeasonalDecorations() {
  const settings = useSeasonalSettings()
  const holiday = resolveHoliday(settings.holiday)

  if (!settings.enabled || !holiday) return null

  const symbols = decorations[holiday]
  const count =
    settings.decoration_density === 'few'
      ? 6
      : settings.decoration_density === 'many'
        ? symbols.length
        : 12

  const particles = symbols.slice(0, count)
  const duration = speedSeconds[settings.animation_speed]

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{
        contain: 'strict',
        isolation: 'isolate',
      }}
    >
      <style>{`
        @keyframes seasonal-float {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-12deg); }
          50% { transform: translate3d(12px, 22px, 0) rotate(14deg); }
        }
        @keyframes seasonal-fall {
          0% { transform: translate3d(0, -12%, 0) rotate(0deg); }
          100% { transform: translate3d(22px, 100%, 0) rotate(300deg); }
        }
        @keyframes seasonal-twinkle {
          0%, 100% { opacity: .35; transform: scale(.75) rotate(-8deg); }
          50% { opacity: 1; transform: scale(1.3) rotate(8deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .seasonal-particle { animation: none !important; }
        }
      `}</style>

      {particles.map((symbol, index) => {
        const position = positions[index]
        const animation =
          settings.animation_style === 'mixed'
            ? mixedAnimations[index % mixedAnimations.length]
            : settings.animation_style === 'floating'
              ? 'seasonal-float'
              : settings.animation_style === 'falling'
                ? 'seasonal-fall'
                : 'seasonal-twinkle'

        return (
          <span
            key={`${holiday}-${index}`}
            className="seasonal-particle absolute select-none"
            style={{
              left: `${position.left}%`,
              top: `${position.top}%`,
              fontSize: `${20 + (index % 4) * 5}px`,
              lineHeight: 1,
              opacity: 0.85,
              textShadow: '0 2px 10px rgba(0,0,0,0.25)',
              animationName: animation,
              animationDuration: `${duration + (index % 4)}s`,
              animationDelay: `${index * -0.45}s`,
              animationTimingFunction: 'ease-in-out',
              animationIterationCount: 'infinite',
              animationDirection:
                animation === 'seasonal-fall' ? 'normal' : 'alternate',
              willChange: 'transform, opacity',
            }}
          >
            {symbol}
          </span>
        )
      })}
    </div>
  )
}

