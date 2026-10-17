import { aisleOf, type Aisle } from './aisles.ts'
import { getDb, getRecipe } from './db.ts'
import { UserFacingError } from './errors.ts'
import type { Recipe } from './schema.ts'
import { normalize } from './search.ts'

export type ShoppingRecipe = {
  recipeId: number
  title: string
  servings: number
}

export type ShoppingItem = {
  /** Identifiant stable de l'article (nom + famille d'unité), utilisé pour cocher. */
  key: string
  name: string
  /** Quantité totale ; null si aucune recette ne la précise. */
  quantity: number | null
  unit: string
  aisle: Aisle
  checked: boolean
  /** Article ajouté à la main (hors recette) : peut être supprimé. */
  custom: boolean
}

export type ShoppingList = {
  /** Le menu de la semaine : les recettes incluses dans la liste. */
  recipes: ShoppingRecipe[]
  items: ShoppingItem[]
  /** Nombre d'articles pas encore cochés. */
  toBuy: number
}

/* ---------- Unités ---------- */

// Les masses et les volumes sont convertis en g et en ml pour pouvoir être additionnés.
const TO_BASE: Record<string, { factor: number; unit: string }> = {
  g: { factor: 1, unit: 'g' },
  kg: { factor: 1000, unit: 'g' },
  ml: { factor: 1, unit: 'ml' },
  cl: { factor: 10, unit: 'ml' },
  dl: { factor: 100, unit: 'ml' },
  l: { factor: 1000, unit: 'ml' },
}

/** Quantité et unité de base d'un ingrédient (kg → g, l → ml, autres unités inchangées). */
function toBase(quantity: number, unit: string) {
  const base = TO_BASE[normalize(unit)]
  return base
    ? { quantity: quantity * base.factor, unit: base.unit }
    : { quantity, unit: unit.trim() }
}

/** Deux lignes s'additionnent si leur nom et leur famille d'unité sont identiques. */
export function itemKey(name: string, unit: string): string {
  const base = TO_BASE[normalize(unit)]
  return `${normalize(name)}|${base ? base.unit : normalize(unit)}`
}

/** Préfixe de la clé des articles ajoutés à la main (extra:12). */
const EXTRA_PREFIX = 'extra:'
const MAX_EXTRA_LENGTH = 100

/* ---------- Lecture ---------- */

type RecipeLine = { recipe_id: number; servings: number }

export function getShoppingList(): ShoppingList {
  const db = getDb()
  const lines = db
    .prepare(
      'SELECT recipe_id, servings FROM shopping_recipes ORDER BY added_at, recipe_id',
    )
    .all() as RecipeLine[]
  const state = new Map(
    (
      db
        .prepare('SELECT item_key, checked, hidden FROM shopping_items')
        .all() as {
        item_key: string
        checked: number
        hidden: number
      }[]
    ).map((r) => [r.item_key, r]),
  )

  const recipes: ShoppingRecipe[] = []
  const totals = new Map<
    string,
    { name: string; quantity: number | null; unit: string }
  >()

  for (const line of lines) {
    const stored = getRecipe(line.recipe_id)
    if (!stored) continue
    recipes.push({
      recipeId: stored.id,
      title: stored.recipe.title,
      servings: line.servings,
    })

    const factor = line.servings / stored.recipe.servings
    for (const ing of stored.recipe.ingredients) {
      const key = itemKey(ing.name, ing.unit)
      const base =
        ing.quantity === null ? null : toBase(ing.quantity * factor, ing.unit)
      const current = totals.get(key)
      if (!current) {
        totals.set(key, {
          name: ing.name,
          quantity: base?.quantity ?? null,
          unit: base?.unit ?? ing.unit.trim(),
        })
      } else if (base) {
        current.quantity = (current.quantity ?? 0) + base.quantity
        if (!current.unit) current.unit = base.unit
      }
    }
  }

  const items: ShoppingItem[] = []
  for (const [key, total] of totals) {
    const s = state.get(key)
    if (s?.hidden) continue
    items.push({
      key,
      ...total,
      aisle: aisleOf(total.name),
      checked: s?.checked === 1,
      custom: false,
    })
  }

  // Articles ajoutés à la main, hors recettes
  const extras = db
    .prepare('SELECT id, name, checked FROM shopping_extras ORDER BY id')
    .all() as { id: number; name: string; checked: number }[]
  for (const e of extras) {
    items.push({
      key: `${EXTRA_PREFIX}${e.id}`,
      name: e.name,
      quantity: null,
      unit: '',
      aisle: aisleOf(e.name),
      checked: e.checked === 1,
      custom: true,
    })
  }

  return { recipes, items, toBuy: items.filter((i) => !i.checked).length }
}

export function getShoppingCount(): number {
  return getShoppingList().toBuy
}

/** Portions choisies pour une recette du menu, ou null si elle n'y est pas. */
export function getShoppingServings(recipeId: number): number | null {
  const row = getDb()
    .prepare('SELECT servings FROM shopping_recipes WHERE recipe_id = ?')
    .get(recipeId) as { servings: number } | undefined
  return row?.servings ?? null
}

/* ---------- Écriture ---------- */

function ingredientKeys(recipe: Recipe) {
  return recipe.ingredients.map((i) => itemKey(i.name, i.unit))
}

/** Ajoute la recette au menu (ou met à jour ses portions) et remet ses articles dans la liste. */
export function addRecipeToShopping(recipeId: number, servings: number): void {
  const stored = getRecipe(recipeId)
  if (!stored) throw new UserFacingError('Cette recette est introuvable.')
  if (!Number.isInteger(servings) || servings < 1)
    throw new UserFacingError('Le nombre de portions est invalide.')

  const db = getDb()
  db.transaction(() => {
    db.prepare(
      `INSERT INTO shopping_recipes (recipe_id, servings) VALUES (?, ?)
       ON CONFLICT (recipe_id) DO UPDATE SET servings = excluded.servings`,
    ).run(recipeId, servings)
    // Les articles de cette recette qui avaient été retirés ou cochés reviennent à acheter.
    const remove = db.prepare('DELETE FROM shopping_items WHERE item_key = ?')
    for (const key of ingredientKeys(stored.recipe)) remove.run(key)
  })()
}

export function removeRecipeFromShopping(recipeId: number): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM shopping_recipes WHERE recipe_id = ?').run(recipeId)
    // Plus aucune recette : on repart d'une liste propre.
    const left = db
      .prepare('SELECT COUNT(*) AS n FROM shopping_recipes')
      .get() as { n: number }
    if (left.n === 0) db.prepare('DELETE FROM shopping_items').run()
  })()
}

export function setItemChecked(key: string, checked: boolean): void {
  if (key.startsWith(EXTRA_PREFIX)) {
    getDb()
      .prepare('UPDATE shopping_extras SET checked = ? WHERE id = ?')
      .run(checked ? 1 : 0, Number(key.slice(EXTRA_PREFIX.length)))
    return
  }
  getDb()
    .prepare(
      `INSERT INTO shopping_items (item_key, checked) VALUES (?, ?)
       ON CONFLICT (item_key) DO UPDATE SET checked = excluded.checked`,
    )
    .run(key, checked ? 1 : 0)
}

/** Retire de la liste les articles cochés. */
export function removeCheckedItems(): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(
      'UPDATE shopping_items SET hidden = 1, checked = 0 WHERE checked = 1',
    ).run()
    db.prepare('DELETE FROM shopping_extras WHERE checked = 1').run()
  })()
}

/** Ajoute un article hors recette (« papier toilette »). */
export function addExtraItem(name: string): void {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!clean) throw new UserFacingError("Écris le nom de l'article à ajouter.")
  if (clean.length > MAX_EXTRA_LENGTH) {
    throw new UserFacingError(
      `Le nom est trop long (${MAX_EXTRA_LENGTH} caractères maximum).`,
    )
  }
  getDb().prepare('INSERT INTO shopping_extras (name) VALUES (?)').run(clean)
}

export function removeExtraItem(id: number): void {
  getDb().prepare('DELETE FROM shopping_extras WHERE id = ?').run(id)
}

/**
 * Supprime toute la liste : recettes, articles ajoutés à la main et état des articles.
 * Le planning de la semaine est conservé.
 */
export function clearShoppingList(): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM shopping_recipes').run()
    db.prepare('DELETE FROM shopping_items').run()
    db.prepare('DELETE FROM shopping_extras').run()
  })()
}
