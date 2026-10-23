import { useEffect, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  ShoppingCart,
  ExternalLink,
  Heart,
  Minus,
  Pencil,
  Plus,
  TriangleAlert,
} from 'lucide-react'
import { ui } from '#/components/ui'
import { PLATFORM_LABEL } from '#/lib/platform'
import { qtyText } from '#/lib/quantities'
import {
  addToShoppingFn,
  getRecipeFn,
  getShoppingServingsFn,
  setFavoriteFn,
} from '#/server/api'
import type { StoredRecipe } from '#/server/schema'

export const Route = createFileRoute('/recettes/$recipeId')({
  // Charge la recette depuis la base ; un id invalide donne « introuvable ».
  loader: async ({ params }) => {
    const id = Number(params.recipeId)
    if (!Number.isInteger(id)) return null
    const [stored, shoppingServings] = await Promise.all([
      getRecipeFn({ data: { id } }),
      getShoppingServingsFn({ data: { recipeId: id } }),
    ])
    return stored ? { stored, shoppingServings } : null
  },
  component: RecipePage,
})

function RecipePage() {
  const data = Route.useLoaderData()

  if (!data) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-2xl">Recette introuvable</h1>
        <p className="text-muted">
          Cette recette n'existe pas ou a été supprimée.
        </p>
        <Link
          to="/"
          className="rounded-full bg-accent px-6 py-3 font-bold text-accent-ink"
        >
          Voir mes recettes
        </Link>
      </main>
    )
  }

  return (
    <RecipeView
      key={data.stored.id}
      stored={data.stored}
      shoppingServings={data.shoppingServings}
    />
  )
}

function RecipeView({
  stored,
  shoppingServings,
}: {
  stored: StoredRecipe
  shoppingServings: number | null
}) {
  const { recipe } = stored
  const router = useRouter()
  const [toast, setToast] = useState('')
  const inShopping = shoppingServings !== null

  // Message de confirmation qui disparaît seul
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2400)
    return () => clearTimeout(timer)
  }, [toast])

  // Ajoute la recette (avec les portions affichées) au menu de la semaine et à la liste de courses
  async function addToShopping() {
    try {
      const result = await addToShoppingFn({
        data: { recipeId: stored.id, servings },
      })
      if (!result.ok) {
        setToast(result.error)
        return
      }
      setToast(
        inShopping
          ? 'Liste de courses mise à jour'
          : 'Ajouté à la liste de courses',
      )
      await router.invalidate() // met à jour la pastille « à acheter » et le bouton
    } catch {
      setToast("Impossible d'ajouter à la liste. Réessaie.")
    }
  }
  const [servings, setServings] = useState(recipe.servings)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [fav, setFav] = useState(stored.favorite)

  // Le favori est enregistré tout de suite ; en cas d'échec on revient à l'état précédent.
  async function toggleFav() {
    const next = !fav
    setFav(next)
    try {
      await setFavoriteFn({ data: { id: stored.id, favorite: next } })
    } catch {
      setFav(!next)
    }
  }

  const total =
    recipe.prepMinutes === null && recipe.cookMinutes === null
      ? null
      : (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
  const sourceLabel = [
    stored.sourceAuthor,
    stored.sourcePlatform && PLATFORM_LABEL[stored.sourcePlatform],
  ]
    .filter(Boolean)
    .join(' · ')

  const toggleDone = (k: number) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <main className="min-h-dvh bg-bg pb-28 text-ink tablet:pb-8">
      <div className="mx-auto w-full max-w-5xl px-4 tablet:px-8">
        <header className="sticky top-0 z-10 flex min-h-16 items-center gap-2 bg-bg pt-[env(safe-area-inset-top)]">
          <Link
            to="/"
            aria-label="Retour aux recettes"
            className="grid size-12 place-items-center rounded-full transition-colors hover:bg-accent-soft"
          >
            <ArrowLeft className="size-6" aria-hidden />
          </Link>
          <div className="flex-1" />
          <Link
            to="/modifier/$recipeId"
            params={{ recipeId: String(stored.id) }}
            aria-label="Modifier la recette"
            className="grid size-12 place-items-center rounded-full transition-colors hover:bg-accent-soft"
          >
            <Pencil className="size-6" aria-hidden />
          </Link>
          <button
            type="button"
            aria-pressed={fav}
            aria-label="Favori"
            onClick={() => void toggleFav()}
            className={`grid size-12 place-items-center rounded-full transition-colors hover:bg-accent-soft ${fav ? 'text-accent' : ''}`}
          >
            <Heart
              className="size-6"
              fill={fav ? 'currentColor' : 'none'}
              aria-hidden
            />
          </button>
        </header>

        <h1 className="font-display text-3xl leading-tight tracking-tight">
          {recipe.title}
        </h1>
        {stored.sourceUrl ? (
          <a
            href={stored.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 font-bold text-accent-text underline underline-offset-4"
          >
            {sourceLabel || 'Voir la source'}
            <ExternalLink className="size-[18px]" aria-hidden />
          </a>
        ) : (
          <p className="flex min-h-11 items-center font-semibold text-muted">
            Ajoutée à partir d'un texte
          </p>
        )}

        {total !== null && (
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Fact
              value={
                recipe.prepMinutes === null ? '–' : `${recipe.prepMinutes} min`
              }
              label="Préparation"
            />
            <Fact
              value={
                recipe.cookMinutes === null ? '–' : `${recipe.cookMinutes} min`
              }
              label="Cuisson"
            />
            <Fact value={`${total} min`} label="Total" />
          </dl>
        )}

        <p className="mt-4 flex items-start gap-3 rounded-2xl bg-pill px-4 py-3 text-sm font-semibold text-muted">
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          Générée par IA, vérifie les quantités.
        </p>

        <div className="desktop:mt-2 desktop:grid desktop:grid-cols-[5fr_7fr] desktop:items-start desktop:gap-8">
          <section>
            <div className="mt-6 flex items-center justify-between gap-2">
              <h2 className="font-display text-xl">Ingrédients</h2>
              <Stepper value={servings} onChange={setServings} />
            </div>
            <ul className="mt-2">
              {recipe.ingredients.map((i, k) => (
                <li key={k} className="border-b border-line">
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={done.has(k)}
                      onChange={() => toggleDone(k)}
                    />
                    <span className="mx-1.5 mt-1 grid size-8 shrink-0 place-items-center rounded-[10px] border-2 border-muted bg-surface text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                      <Check className="size-5" aria-hidden />
                    </span>
                    <span
                      className={`flex-1 pt-1.5 ${done.has(k) ? 'text-muted line-through' : ''}`}
                    >
                      <span className="mr-1 font-bold whitespace-nowrap">
                        {i.quantity === null
                          ? i.unit
                          : qtyText(
                              (i.quantity * servings) / recipe.servings,
                              i.unit,
                            )}
                      </span>
                      {i.name}
                      {i.note && (
                        <span className="block text-sm text-muted">
                          {i.note}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mt-6 mb-3 font-display text-xl">Étapes</h2>
            <ol>
              {recipe.steps.map((s, k) => (
                <li key={k} className="flex gap-3 border-b border-line py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-text">
                    {k + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            {recipe.tips.length > 0 && (
              <>
                <h2 className="mt-6 mb-3 font-display text-xl">Conseils</h2>
                <ul className="list-disc rounded-2xl border border-dashed border-line bg-surface py-3 pr-4 pl-8">
                  {recipe.tips.map((t, k) => (
                    <li key={k} className="my-1.5">
                      {t}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-6">
              <button
                type="button"
                onClick={() => void addToShopping()}
                className={`${ui.btnSoft} ${ui.btnLg} w-full`}
              >
                <ShoppingCart className="size-6" aria-hidden />
                {inShopping ? 'Mettre à jour la liste' : 'Ajouter aux courses'}
              </button>
              {inShopping && (
                <p className="mt-2 text-center text-sm text-muted">
                  Dans ta liste pour {shoppingServings} portions.{' '}
                  <Link
                    to="/courses"
                    className="font-bold text-accent-text underline underline-offset-4"
                  >
                    Voir la liste
                  </Link>
                </p>
              )}
            </div>

            <ul className="mt-4 flex flex-wrap gap-2">
              {recipe.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold text-accent-text"
                >
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {toast && (
        <p
          role="status"
          className="fixed bottom-24 left-1/2 z-[60] w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-ink px-4 py-3 font-semibold text-bg shadow-lg tablet:bottom-6"
        >
          {toast}
        </p>
      )}
    </main>
  )
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center">
      <dd className="font-display text-lg font-bold">{value}</dd>
      <dt className="text-sm font-semibold text-muted">{label}</dt>
    </div>
  )
}

function Stepper({
  value,
  onChange,
}: {
  value: number
  onChange: (n: number) => void
}) {
  const btn =
    'grid size-12 place-items-center rounded-full bg-accent-soft text-accent-text disabled:opacity-50'
  return (
    <div
      role="group"
      aria-label="Nombre de portions"
      className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-line bg-surface p-1"
    >
      <button
        type="button"
        className={btn}
        aria-label="Moins de portions"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-6" aria-hidden />
      </button>
      <output
        aria-live="polite"
        className="min-w-16 text-center text-lg font-bold"
      >
        {value}
        <small className="block text-xs leading-none font-semibold text-muted">
          portions
        </small>
      </output>
      <button
        type="button"
        className={btn}
        aria-label="Plus de portions"
        disabled={value >= 99}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-6" aria-hidden />
      </button>
    </div>
  )
}
