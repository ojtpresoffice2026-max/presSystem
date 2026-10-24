
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Holiday =
  | 'halloween'
  | 'christmas'
  | 'valentines'
  | 'newyear'
  | null

export type HolidayChoice =
  | 'automatic'
  | 'halloween'
  | 'christmas'
  | 'valentines'
  | 'newyear'
  | 'none'

export type AnimationStyle =
  | 'floating'
  | 'falling'
  | 'twinkling'
  | 'mixed'

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

  if ((month === 10 && day >= 20) || (month === 11 && day === 1)) {
    return 'halloween'
  }

  if (month === 12 && day >= 1 && day <= 26) {
    return 'christmas'
  }

  if ((month === 12 && day >= 27) || (month === 1 && day <= 3)) {
    return 'newyear'
  }

  if (month === 2 && day >= 7 && day <= 15) {
    return 'valentines'
  }

  return null
}

export function resolveHoliday(choice: HolidayChoice): Holiday {
  if (choice === 'none') return null
  if (choice === 'automatic') return getCurrentHoliday()
  return choice
}

function isAnimationStyle(value: unknown): value is AnimationStyle {
  return (
    value === 'floating' ||
    value === 'falling' ||
    value === 'twinkling' ||
    value === 'mixed'
  )
}

function isAnimationSpeed(value: unknown): value is AnimationSpeed {
  return value === 'slow' || value === 'normal' || value === 'fast'
}

function isDecorationDensity(value: unknown): value is DecorationDensity {
  return value === 'few' || value === 'medium' || value === 'many'
}

function isHolidayChoice(value: unknown): value is HolidayChoice {
  return (
    value === 'automatic' ||
    value === 'halloween' ||
    value === 'christmas' ||
    value === 'valentines' ||
    value === 'newyear' ||
    value === 'none'
  )
}

function normalizeSettings(
  data: Partial<SeasonalSettings>,
): SeasonalSettings {
  return {
    enabled:
      typeof data.enabled === 'boolean'
        ? data.enabled
        : DEFAULT_SEASONAL_SETTINGS.enabled,
    holiday: isHolidayChoice(data.holiday)
      ? data.holiday
      : DEFAULT_SEASONAL_SETTINGS.holiday,
    animation_style: isAnimationStyle(data.animation_style)
      ? data.animation_style
      : DEFAULT_SEASONAL_SETTINGS.animation_style,
    animation_speed: isAnimationSpeed(data.animation_speed)
      ? data.animation_speed
      : DEFAULT_SEASONAL_SETTINGS.animation_speed,
    decoration_density: isDecorationDensity(data.decoration_density)
      ? data.decoration_density
      : DEFAULT_SEASONAL_SETTINGS.decoration_density,
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
            'Unable to load seasonal animation settings:',
            error.message,
          )
          return
        }

        if (data) {
          setSettings(normalizeSettings(data as Partial<SeasonalSettings>))
        } else {
          console.warn(
            'No seasonal_animation_settings row found with id = 1.',
          )
        }
      } catch (error) {
        if (active) {
          console.error('Seasonal settings request failed:', error)
        }
      }
    }

    function handleSettingsChanged() {
      void loadSettings()
    }

    window.addEventListener(
      SEASONAL_SETTINGS_EVENT,
      handleSettingsChanged,
    )

    // Load saved settings when the component mounts.
    void loadSettings()

    // Refresh periodically to detect changes made in another tab.
    const refreshId = window.setInterval(() => {
      void loadSettings()
    }, 15000)

    return () => {
      active = false

      window.removeEventListener(
        SEASONAL_SETTINGS_EVENT,
        handleSettingsChanged,
      )

      window.clearInterval(refreshId)
    }
  }, [])

  return settings
}

const decorations: Record<Exclude<Holiday, null>, string[]> = {
  halloween: [
    '🎃', '🦇', '🕸️', '👻', '✨', '🎃',
    '🦇', '🕷️', '✨', '👻', '🎃', '🕸️',
  ],
  christmas: [
    '❄️', '🎄', '⭐', '❄️', '🎁', '✨',
    '❄️', '🎄', '🔔', '⭐', '❄️', '✨',
  ],
  valentines: [
    '💗', '💕', '♥️', '✨', '💖', '💌',
    '💕', '💗', '💘', '✨', '💖', '💕',
  ],
  newyear: [
    '✨', '⭐', '🎉', '🎆', '✨', '🥳',
    '🎊', '⭐', '🎇', '✨', '🎉', '🎆',
  ],
}

const positions = [
  { left: 8, top: 12 },
  { left: 25, top: 35 },
  { left: 45, top: 18 },
  { left: 65, top: 55 },
  { left: 82, top: 30 },
  { left: 92, top: 75 },
  { left: 15, top: 82 },
  { left: 72, top: 88 },
  { left: 52, top: 72 },
  { left: 35, top: 90 },
  { left: 90, top: 10 },
  { left: 5, top: 55 },
]

const speedSeconds: Record<AnimationSpeed, number> = {
  slow: 8,
  normal: 5,
  fast: 3,
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
      ? 4
      : settings.decoration_density === 'many'
        ? symbols.length
        : 8

  const particles = symbols.slice(0, count)
  const duration = speedSeconds[settings.animation_speed]

  return (
    <>
      <style>{`
        @keyframes seasonal-float {
          0%, 100% {
            transform: translate3d(0, 0, 0) rotate(-8deg);
          }
          50% {
            transform: translate3d(8px, 15px, 0) rotate(10deg);
          }
        }

        @keyframes seasonal-fall {
          0% {
            transform: translate3d(0, -25px, 0) rotate(0deg);
          }
          100% {
            transform: translate3d(12px, 75px, 0) rotate(35deg);
          }
        }

        @keyframes seasonal-twinkle {
          0%, 100% {
            opacity: .2;
            transform: scale(.8);
          }
          50% {
            opacity: .9;
            transform: scale(1.2);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .seasonal-particle {
            animation: none !important;
          }
        }
      `}</style>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
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
                fontSize: `${14 + (index % 3) * 3}px`,
                opacity: 0.65,
                animationName: animation,
                animationDuration: `${duration + (index % 3)}s`,
                animationDelay: `${index * -0.5}s`,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                animationDirection:
                  animation === 'seasonal-fall' ? 'normal' : 'alternate',
              }}
            >
              {symbol}
            </span>
          )
        })}
      </div>
    </>
  )
}
