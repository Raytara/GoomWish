import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { EMPTY_FORM, RecipeForm } from '#/components/RecipeForm'
import { createRecipeFn } from '#/server/api'

export const Route = createFileRoute('/nouvelleRecette')({
  component: NewRecipePage,
})

function NewRecipePage() {
  const navigate = useNavigate()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-28 tablet:px-8 tablet:pb-8">
      <header className="flex min-h-16 items-center gap-2">
        <Link
          to="/importLink"
          aria-label="Retour à l'import"
          className="grid size-12 place-items-center rounded-full transition-colors hover:bg-accent-soft"
        >
          <ArrowLeft className="size-6" aria-hidden />
        </Link>
        <h1 className="font-display text-3xl leading-tight">Ma recette</h1>
      </header>

      <RecipeForm
        initial={EMPTY_FORM}
        submitLabel="Enregistrer la recette"
        showPhoto
        onSave={async (recipe) => {
          const saved = await createRecipeFn({ data: recipe })
          if (!saved.ok) return saved.error
          await navigate({
            to: '/recettes/$recipeId',
            params: { recipeId: String(saved.id) },
          })
          return null
        }}
      />
    </main>
  )
}
