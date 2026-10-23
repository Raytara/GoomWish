import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { RecipeForm } from '#/components/RecipeForm'
import { recipeToForm } from '#/lib/recipeForm'
import { getRecipeFn, updateRecipeFn } from '#/server/api'

export const Route = createFileRoute('/modifier/$recipeId')({
  // Charge la recette à modifier ; un id invalide donne « introuvable ».
  loader: async ({ params }) => {
    const id = Number(params.recipeId)
    if (!Number.isInteger(id)) return null
    return (await getRecipeFn({ data: { id } })) ?? null
  },
  component: EditRecipePage,
})

function EditRecipePage() {
  const stored = Route.useLoaderData()
  const navigate = useNavigate()

  if (!stored) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display text-2xl">Recette introuvable</h1>
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
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-28 tablet:px-8 tablet:pb-8">
      <header className="flex min-h-16 items-center gap-2">
        <Link
          to="/recettes/$recipeId"
          params={{ recipeId: String(stored.id) }}
          aria-label="Retour à la recette"
          className="grid size-12 place-items-center rounded-full transition-colors hover:bg-accent-soft"
        >
          <ArrowLeft className="size-6" aria-hidden />
        </Link>
        <h1 className="font-display text-3xl leading-tight">
          Modifier la recette
        </h1>
      </header>

      <RecipeForm
        key={stored.id}
        initial={recipeToForm(stored.recipe)}
        submitLabel="Enregistrer les modifications"
        showPhoto={false}
        onSave={async (recipe) => {
          const saved = await updateRecipeFn({
            data: { id: stored.id, recipe },
          })
          if (!saved.ok) return saved.error
          await navigate({
            to: '/recettes/$recipeId',
            params: { recipeId: String(stored.id) },
          })
          return null
        }}
      />
    </main>
  )
}
