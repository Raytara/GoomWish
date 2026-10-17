import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aisleOf } from './aisles'
import { closeDb, createRecipe, deleteRecipe, initDb } from './db'
import type { RecipeInput } from './schema'
import {
  addRecipeToShopping,
  clearShoppingList,
  getShoppingCount,
  getShoppingList,
  getShoppingServings,
  removeCheckedItems,
  removeRecipeFromShopping,
  setItemChecked,
} from './shopping'

const ing = (name: string, quantity: number | null, unit = '') => ({
  quantity,
  unit,
  name,
  note: '',
})

const pates: RecipeInput = {
  title: 'Pâtes ricotta',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  ingredients: [
    ing('spaghetti', 400, 'g'),
    ing('ricotta', 250, 'g'),
    ing('citrons', 2),
    ing("huile d'olive", 2, 'c. à s.'),
  ],
  steps: ['Cuire les pâtes.', 'Mélanger avec la ricotta.'],
  tips: [],
  tags: [],
}

const gratin: RecipeInput = {
  title: 'Gratin',
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  ingredients: [
    ing('Ricotta', 0.5, 'kg'),
    ing('citrons', 1),
    ing('sel', null),
    ing('lait', 250, 'ml'),
  ],
  steps: ['Mélanger tout.', 'Enfourner une heure.'],
  tips: [],
  tags: [],
}

beforeEach(() => {
  initDb(':memory:')
})
afterEach(() => {
  closeDb()
})

describe('liste de courses', () => {
  it('est vide au départ', () => {
    expect(getShoppingList()).toEqual({ recipes: [], items: [], toBuy: 0 })
  })

  it("met les quantités à l'échelle des portions choisies", () => {
    const { id } = createRecipe(pates)
    addRecipeToShopping(id, 8) // 4 → 8 portions : ×2
    const list = getShoppingList()
    expect(list.recipes).toEqual([
      { recipeId: id, title: 'Pâtes ricotta', servings: 8 },
    ])
    expect(list.items.find((i) => i.name === 'spaghetti')).toMatchObject({
      quantity: 800,
      unit: 'g',
    })
    expect(list.items.find((i) => i.name === 'citrons')).toMatchObject({
      quantity: 4,
      unit: '',
    })
  })

  it('additionne les ingrédients communs, kg et g compris', () => {
    const a = createRecipe(pates)
    const b = createRecipe(gratin)
    addRecipeToShopping(a.id, 4)
    addRecipeToShopping(b.id, 2)
    const { items } = getShoppingList()
    expect(items.find((i) => i.name === 'ricotta')).toMatchObject({
      quantity: 750,
      unit: 'g',
    }) // 250 g + 0,5 kg
    expect(items.find((i) => i.name === 'citrons')).toMatchObject({
      quantity: 3,
    })
    expect(
      items.filter((i) => i.name.toLowerCase() === 'ricotta'),
    ).toHaveLength(1)
  })

  it('garde un article sans quantité', () => {
    const b = createRecipe(gratin)
    addRecipeToShopping(b.id, 2)
    expect(getShoppingList().items.find((i) => i.name === 'sel')).toMatchObject(
      { quantity: null },
    )
  })

  it('range les articles par rayon', () => {
    const a = createRecipe(pates)
    addRecipeToShopping(a.id, 4)
    const byName = Object.fromEntries(
      getShoppingList().items.map((i) => [i.name, i.aisle]),
    )
    expect(byName).toMatchObject({
      spaghetti: 'epicerie',
      ricotta: 'frais',
      citrons: 'fruits-legumes',
      "huile d'olive": 'epicerie',
    })
  })

  it('met à jour les portions sans doubler la recette', () => {
    const { id } = createRecipe(pates)
    addRecipeToShopping(id, 4)
    addRecipeToShopping(id, 6)
    expect(getShoppingList().recipes).toHaveLength(1)
    expect(getShoppingServings(id)).toBe(6)
    expect(getShoppingServings(999)).toBeNull()
  })

  it('refuse une recette inconnue ou des portions invalides', () => {
    const { id } = createRecipe(pates)
    expect(() => addRecipeToShopping(999, 2)).toThrow(/introuvable/)
    expect(() => addRecipeToShopping(id, 0)).toThrow(/invalide/)
  })

  it('coche, compte, puis retire les articles cochés', () => {
    const { id } = createRecipe(pates)
    addRecipeToShopping(id, 4)
    const total = getShoppingList().items.length
    expect(getShoppingCount()).toBe(total)

    const key = getShoppingList().items[0]!.key
    setItemChecked(key, true)
    expect(getShoppingList().items.find((i) => i.key === key)?.checked).toBe(
      true,
    )
    expect(getShoppingCount()).toBe(total - 1)

    removeCheckedItems()
    expect(getShoppingList().items).toHaveLength(total - 1)

    // Réajouter la recette fait revenir l'article retiré
    addRecipeToShopping(id, 4)
    expect(getShoppingList().items).toHaveLength(total)
    expect(getShoppingList().items.every((i) => !i.checked)).toBe(true)
  })

  it('retire une recette du menu, et repart propre quand il est vide', () => {
    const a = createRecipe(pates)
    const b = createRecipe(gratin)
    addRecipeToShopping(a.id, 4)
    addRecipeToShopping(b.id, 2)
    removeRecipeFromShopping(a.id)
    expect(getShoppingList().recipes.map((r) => r.recipeId)).toEqual([b.id])
    expect(getShoppingList().items.some((i) => i.name === 'spaghetti')).toBe(
      false,
    )

    setItemChecked(getShoppingList().items[0]!.key, true)
    removeRecipeFromShopping(b.id)
    addRecipeToShopping(b.id, 2)
    expect(getShoppingList().items.every((i) => !i.checked)).toBe(true)
  })

  it('supprime toute la liste', () => {
    const a = createRecipe(pates)
    const b = createRecipe(gratin)
    addRecipeToShopping(a.id, 4)
    addRecipeToShopping(b.id, 2)
    setItemChecked(getShoppingList().items[0]!.key, true)
    clearShoppingList()
    expect(getShoppingList()).toEqual({ recipes: [], items: [], toBuy: 0 })
  })

  it('retire une recette supprimée du menu', () => {
    const a = createRecipe(pates)
    addRecipeToShopping(a.id, 4)
    deleteRecipe(a.id)
    expect(getShoppingList().recipes).toEqual([])
  })
})

describe('aisleOf', () => {
  it.each([
    ['poivrons rouges', 'fruits-legumes'],
    ['pommes de terre', 'fruits-legumes'],
    ['filet de dinde', 'frais'],
    ['fromage blanc 0%', 'frais'],
    ['œufs', 'frais'],
    ['lait de coco', 'epicerie'],
    ['bouillon de poulet', 'epicerie'],
    ['lentilles corail', 'epicerie'],
    ['pâtes', 'epicerie'],
    ['papier sulfurisé', 'autres'],
  ])('%s → %s', (name, aisle) => {
    expect(aisleOf(name)).toBe(aisle)
  })
})
