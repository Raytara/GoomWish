import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, type Theme } from '#/lib/theme'

export default function ThemeToggle() {
  // Le thème réel est posé par le script d'initialisation avant l'hydratation
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light',
    )
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'
      }
      className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-surface transition-colors hover:bg-accent-soft"
    >
      <Icon className="size-6" aria-hidden />
    </button>
  )
}
