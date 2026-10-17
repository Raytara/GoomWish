import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, Clock, Heart, Users } from 'lucide-react'
import ThemeToggle from '#/components/ThemeToggle'
import { ui } from '#/components/ui'
import { listRecipesFn } from '#/server/api'

export const Route = createFileRoute('/')({
  loader: () => listRecipesFn(),
  component: App,
})

function App() {
  const recipes = Route.useLoaderData()

  return (
    <main className="min-h-dvh p-4 pb-28 tablet:p-8">
      <header className="flex items-center gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-muted">GoomY perso</p>
          <h1 className="font-display text-3xl leading-tight">Mes recettes</h1>
        </div>
        <ThemeToggle />
      </header>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <div className="grid size-22 place-items-center rounded-full bg-accent-soft text-accent-text">
            <BookOpen className="size-10" aria-hidden />
          </div>
          <h2 className="font-display text-xl">Bienvenue dans ton carnet</h2>
          <p className="max-w-[30ch] text-muted">
            Colle un lien de vidéo ou une légende pour créer ta première
            recette.
          </p>
          <Link to="/importLink" className={`${ui.btnPrimary} ${ui.btnLg}`}>
            Importer une recette
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 tablet:grid-cols-2">
          {recipes.map(({ id, recipe, favorite }) => {
            const minutes =
              (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
            return (
              <li key={id}>
                <Link
                  to="/recettes/$recipeId"
                  params={{ recipeId: String(id) }}
                  className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-accent-soft"
                >
                  <span className="flex items-start gap-2">
                    <span className="flex-1 line-clamp-2 font-display text-lg leading-snug font-bold">
                      {recipe.title}
                    </span>
                    {favorite && (
                      <Heart
                        className="size-5 shrink-0 fill-accent text-accent"
                        aria-label="Favori"
                      />
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted">
                    {minutes > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-4" aria-hidden />
                        {minutes} min
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-4" aria-hidden />
                      {recipe.servings} portions
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
