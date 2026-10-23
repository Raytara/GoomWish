// Fonctions serveur appelées par l'interface. Elles ne contiennent aucune logique :
// tout le travail est fait par les modules de src/server/.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getJob, getRecipe, listRecipes, setFavorite } from './db'
import { UserFacingError } from './errors'
import {
  addMenuToShopping,
  clearMenuPlan,
  getMenuPlan,
  setMenuSlot,
} from './menuPlan'
import { startImport } from './importJob'
import { addManualRecipe, editRecipe } from './manualRecipe'
import { readRecipePhotos, PhotosSchema } from './photo'
import { RecipeSchema } from './schema'
import {
  addRecipeToShopping,
  clearShoppingList,
  getShoppingCount,
  getShoppingList,
  addExtraItem,
  getShoppingServings,
  removeExtraItem,
  removeCheckedItems,
  removeRecipeFromShopping,
  setItemChecked,
} from './shopping'

const StartImportInput = z.union([
  z.object({ url: z.string() }),
  z.object({ text: z.string() }),
])

/** Démarre un import. Renvoie l'id du job, ou un message d'erreur à afficher dans le formulaire. */
export const startImportFn = createServerFn({ method: 'POST' })
  .validator(StartImportInput)
  .handler(async ({ data }) => {
    try {
      const job = startImport(data)
      return { ok: true as const, jobId: job.id }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

/** Enregistre une recette écrite à la main. Renvoie son id, ou un message d'erreur à afficher. */
export const createRecipeFn = createServerFn({ method: 'POST' })
  .validator(RecipeSchema)
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, id: addManualRecipe(data).id }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

/** Modifie une recette existante. Renvoie un message d'erreur à afficher si besoin. */
export const updateRecipeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int(), recipe: RecipeSchema }))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, id: editRecipe(data.id, data.recipe).id }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

/** Lit une recette sur des photos. Rien n'est enregistré : le résultat remplit le formulaire. */
export const readPhotosFn = createServerFn({ method: 'POST' })
  .validator(z.object({ photos: PhotosSchema }))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, recipe: await readRecipePhotos(data.photos) }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

export const getJobFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ data }) => getJob(data.id) ?? null)

export const listRecipesFn = createServerFn({ method: 'GET' }).handler(
  async () => listRecipes(),
)

export const getRecipeFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ data }) => getRecipe(data.id) ?? null)

export const setFavoriteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int(), favorite: z.boolean() }))
  .handler(async ({ data }) => setFavorite(data.id, data.favorite) ?? null)

/* ---------- Liste de courses ---------- */

export const getShoppingListFn = createServerFn({ method: 'GET' }).handler(
  async () => getShoppingList(),
)

export const getShoppingCountFn = createServerFn({ method: 'GET' }).handler(
  async () => getShoppingCount(),
)

/** Portions de la recette dans le menu, ou null si elle n'y est pas encore. */
export const getShoppingServingsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ recipeId: z.number().int() }))
  .handler(async ({ data }) => getShoppingServings(data.recipeId))

export const addToShoppingFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      recipeId: z.number().int(),
      servings: z.number().int().min(1).max(99),
    }),
  )
  .handler(async ({ data }) => {
    try {
      addRecipeToShopping(data.recipeId, data.servings)
      return { ok: true as const }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

export const removeShoppingRecipeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ recipeId: z.number().int() }))
  .handler(async ({ data }) => removeRecipeFromShopping(data.recipeId))

export const setShoppingItemFn = createServerFn({ method: 'POST' })
  .validator(z.object({ key: z.string().min(1), checked: z.boolean() }))
  .handler(async ({ data }) => setItemChecked(data.key, data.checked))

export const removeCheckedItemsFn = createServerFn({ method: 'POST' }).handler(
  async () => removeCheckedItems(),
)

export const clearShoppingFn = createServerFn({ method: 'POST' }).handler(
  async () => clearShoppingList(),
)

/* ---------- Articles hors menu ---------- */

export const addExtraFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string() }))
  .handler(async ({ data }) => {
    try {
      addExtraItem(data.name)
      return { ok: true as const }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

export const removeExtraFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ data }) => removeExtraItem(data.id))

/* ---------- Menu de la semaine ---------- */

export const getMenuPlanFn = createServerFn({ method: 'GET' }).handler(
  async () => getMenuPlan(),
)

/** Titres des recettes, pour remplir les listes de choix du planning. */
export const getRecipeOptionsFn = createServerFn({ method: 'GET' }).handler(
  async () => listRecipes().map((r) => ({ id: r.id, title: r.recipe.title })),
)

export const setMenuSlotFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      day: z.number().int().min(0).max(6),
      meal: z.enum(['midi', 'soir']),
      // une recette de l'app, un texte libre, ou null pour vider le repas
      choice: z
        .union([
          z.object({ recipeId: z.number().int() }),
          z.object({ label: z.string() }),
        ])
        .nullable(),
    }),
  )
  .handler(async ({ data }) => {
    try {
      setMenuSlot(data.day, data.meal, data.choice)
      return { ok: true as const }
    } catch (err) {
      if (err instanceof UserFacingError)
        return { ok: false as const, error: err.message }
      throw err
    }
  })

export const clearMenuPlanFn = createServerFn({ method: 'POST' }).handler(
  async () => clearMenuPlan(),
)

/** Ajoute les recettes du planning à la liste de courses ; renvoie leur nombre. */
export const addMenuToShoppingFn = createServerFn({ method: 'POST' }).handler(
  async () => addMenuToShopping(),
)
