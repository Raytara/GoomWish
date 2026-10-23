import { createRecipe, updateRecipe } from './db.ts'
import { UserFacingError } from './errors.ts'
import { RecipeSchema   } from './schema.ts'
import type {Recipe, RecipeInput, StoredRecipe } from './schema.ts';
import { cleanRecipe } from './structure.ts'

/** Valide une recette écrite à la main, puis la nettoie comme pour un import. */
function checkRecipe(input: RecipeInput): Recipe {
  const parsed = RecipeSchema.safeParse(input)
  if (!parsed.success)
    throw new UserFacingError(
      'La recette est incomplète : vérifie le titre, les portions et les ingrédients.',
    )
  const recipe = cleanRecipe(parsed.data)
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0)
    throw new UserFacingError('Ajoute au moins un ingrédient ou une étape.')
  return recipe
}

/** Enregistre une recette écrite à la main (aucune source, aucune IA). */
export function addManualRecipe(input: RecipeInput): StoredRecipe {
  return createRecipe(checkRecipe(input))
}

/** Remplace le contenu d'une recette ; la source, le favori et les listes de courses sont conservés. */
export function editRecipe(id: number, input: RecipeInput): StoredRecipe {
  const stored = updateRecipe(id, checkRecipe(input))
  if (!stored) throw new UserFacingError("Cette recette n'existe plus.")
  return stored
}
