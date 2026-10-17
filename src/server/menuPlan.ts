import { getDb, getRecipe } from './db.ts'
import { UserFacingError } from './errors.ts'
import { addRecipeToShopping } from './shopping.ts'

export const MEALS = ['midi', 'soir'] as const
export type Meal = (typeof MEALS)[number]

/** Jours de la semaine : 0 = lundi … 6 = dimanche. */
export const DAY_COUNT = 7

/**
 * Un repas du planning : une recette de l'app (recipeId) ou un texte libre (custom).
 * title contient le titre de la recette ou le texte écrit à la main.
 */
export type MenuSlot = {
  day: number
  meal: Meal
  recipeId: number | null
  title: string
  custom: boolean
}

/** Ce que l'on met dans une case : une recette de l'app, un texte libre, ou rien (null). */
export type MenuChoice = { recipeId: number } | { label: string } | null

const MAX_SERVINGS = 99
const MAX_LABEL_LENGTH = 80

function checkSlot(day: number, meal: string) {
  if (!Number.isInteger(day) || day < 0 || day >= DAY_COUNT)
    throw new UserFacingError('Ce jour est invalide.')
  if (!(MEALS as readonly string[]).includes(meal))
    throw new UserFacingError('Ce repas est invalide.')
}

/** Les repas planifiés, dans l'ordre de la semaine. */
export function getMenuPlan(): MenuSlot[] {
  return (
    getDb()
      .prepare(
        `SELECT p.day, p.meal, p.recipe_id, p.label, r.title
           FROM menu_plan p LEFT JOIN recipes r ON r.id = p.recipe_id
          ORDER BY p.day, p.meal`,
      )
      .all() as {
      day: number
      meal: Meal
      recipe_id: number | null
      label: string | null
      title: string | null
    }[]
  ).map((r) => ({
    day: r.day,
    meal: r.meal,
    recipeId: r.recipe_id,
    title: r.title ?? r.label ?? '',
    custom: r.recipe_id === null,
  }))
}

/** Remplit un repas avec une recette de l'app ou un texte libre ; null vide le repas. */
export function setMenuSlot(
  day: number,
  meal: string,
  choice: MenuChoice,
): void {
  checkSlot(day, meal)
  const db = getDb()

  if (choice === null) {
    db.prepare('DELETE FROM menu_plan WHERE day = ? AND meal = ?').run(
      day,
      meal,
    )
    return
  }

  let recipeId: number | null = null
  let label: string | null = null
  if ('recipeId' in choice) {
    if (!getRecipe(choice.recipeId))
      throw new UserFacingError('Cette recette est introuvable.')
    recipeId = choice.recipeId
  } else {
    label = choice.label.replace(/\s+/g, ' ').trim()
    if (!label) throw new UserFacingError('Écris le nom du repas.')
    if (label.length > MAX_LABEL_LENGTH) {
      throw new UserFacingError(
        `Le nom est trop long (${MAX_LABEL_LENGTH} caractères maximum).`,
      )
    }
  }

  db.prepare(
    `INSERT INTO menu_plan (day, meal, recipe_id, label) VALUES (?, ?, ?, ?)
     ON CONFLICT (day, meal) DO UPDATE SET recipe_id = excluded.recipe_id, label = excluded.label`,
  ).run(day, meal, recipeId, label)
}

export function clearMenuPlan(): void {
  getDb().prepare('DELETE FROM menu_plan').run()
}

/**
 * Met les recettes du planning dans la liste de courses.
 * Une recette prévue plusieurs fois compte plusieurs fois (2 repas de 4 portions = 8 portions).
 * Les repas écrits à la main n'ont pas d'ingrédients connus : ils sont ignorés.
 * Renvoie le nombre de recettes ajoutées ou mises à jour.
 */
export function addMenuToShopping(): number {
  const counts = new Map<number, number>()
  for (const slot of getMenuPlan()) {
    if (slot.recipeId !== null)
      counts.set(slot.recipeId, (counts.get(slot.recipeId) ?? 0) + 1)
  }

  for (const [recipeId, count] of counts) {
    const stored = getRecipe(recipeId)
    if (stored)
      addRecipeToShopping(
        recipeId,
        Math.min(stored.recipe.servings * count, MAX_SERVINGS),
      )
  }
  return counts.size
}
