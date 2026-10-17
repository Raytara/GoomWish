import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useEffect } from 'react'
import { Navbar } from '#/components/navbar'
import { THEME_COLOR, THEME_INIT_SCRIPT } from '#/lib/theme'
import { getShoppingCountFn } from '#/server/api'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Pastille « à acheter » de la barre de navigation
  loader: () => getShoppingCountFn(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { name: 'theme-color', content: THEME_COLOR.light },
    ],
    scripts: [{ children: THEME_INIT_SCRIPT }],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
  }, [])

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/*<meta name="viewport" content="width=device-width, initial-scale=1" /> */}
        <HeadContent />
      </head>

      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <Navbar />
        <div className="tablet:pl-[76px] desktop:pl-[232px]">{children}</div>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
