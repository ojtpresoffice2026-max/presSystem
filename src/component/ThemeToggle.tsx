
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

function getSavedTheme(): Theme {
  try {
    return localStorage.getItem('presSystem-theme') === 'dark'
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getSavedTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme

    try {
      localStorage.setItem('presSystem-theme', theme)
    } catch {
      // Theme still works for the current page session.
    }
  }, [theme])

  useEffect(() => {
    function syncTheme() {
      setTheme(getSavedTheme())
    }

    window.addEventListener('storage', syncTheme)

    return () => {
      window.removeEventListener('storage', syncTheme)
    }
  }, [])

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
      }
      title={theme === 'light' ? 'Dark mode' : 'Light mode'}
      aria-pressed={theme === 'dark'}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  )
}
