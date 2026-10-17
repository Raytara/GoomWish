import { Link, getRouteApi, useRouterState } from '@tanstack/react-router'
import { BookOpen, Download, ShoppingCart } from 'lucide-react'

const tabs = [
  {
    to: '/',
    label: 'Recettes',
    icon: BookOpen,
    match: (p: string) => p === '/' || p.startsWith('/recettes'),
  },
  {
    to: '/importLink',
    label: 'Importer',
    icon: Download,
    match: (p: string) => p.startsWith('/importLink'),
  },
  {
    to: '/courses',
    label: 'Courses',
    icon: ShoppingCart,
    match: (p: string) => p.startsWith('/courses'),
  },
] as const

const rootRoute = getRouteApi('__root__')

// Mobile : barre d'onglets en bas. Dès 481px : rail d'icônes à gauche. Dès 900px : barre latérale avec libellés.
export function Navbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Nombre d'articles à acheter, chargé par la route racine
  const toBuy = rootRoute.useLoaderData()

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] tablet:inset-y-0 tablet:right-auto tablet:w-[76px] tablet:border-t-0 tablet:border-r tablet:px-3 tablet:py-6 desktop:w-[232px]"
    >
      <p className="hidden px-3 pb-4 font-display text-xl font-bold desktop:block">
        GoomY <span className="text-accent">perso</span>
      </p>
      <ul className="flex gap-1 tablet:flex-col tablet:gap-2">
        {tabs.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          const badge = to === '/courses' && toBuy > 0 ? toBuy : 0
          return (
            <li key={to} className="flex-1 tablet:flex-none">
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-sm font-semibold transition-colors tablet:flex-row tablet:justify-center tablet:gap-3 desktop:justify-start desktop:px-4 desktop:text-base ${
                  active
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-muted hover:bg-pill'
                }`}
              >
                <Icon className="size-6 shrink-0" aria-hidden />
                <span className="tablet:sr-only desktop:not-sr-only">
                  {label}
                </span>
                {badge > 0 && (
                  <span
                    aria-label={`${badge} à acheter`}
                    className="absolute top-1 left-[calc(50%+6px)] grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-xs leading-none font-bold text-accent-ink desktop:static desktop:ml-auto"
                  >
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
