import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { closeDb, createRecipe, deleteRecipe, getDb, initDb } from './db'
import {
  addMenuToShopping,
  clearMenuPlan,
  getMenuPlan,
  setMenuSlot,
} from './menuPlan'
import type { RecipeInput } from './schema'
import {
  addExtraItem,
  clearShoppingList,
  getShoppingCount,
  getShoppingList,
  removeCheckedItems,
  removeExtraItem,
  setItemChecked,
} from './shopping'

const recipe = (title: string, servings: number): RecipeInput => ({
  title,
  servings,
  prepMinutes: null,
  cookMinutes: null,
  ingredients: [{ quantity: 100, unit: 'g', name: 'farine', note: '' }],
  steps: ['Mélanger tout.', 'Cuire le tout.'],
  tips: [],
  tags: [],
})

beforeEach(() => {
  initDb(':memory:')
})
afterEach(() => {
  closeDb()
})

describe('articles hors menu', () => {
  it('ajoute, classe par rayon et compte les articles', () => {
    addExtraItem('  papier   toilette ')
    addExtraItem('tomates')
    const { items, toBuy } = getShoppingList()
    expect(toBuy).toBe(2)
    expect(items.map((i) => [i.name, i.custom, i.quantity])).toEqual([
      ['papier toilette', true, null],
      ['tomates', true, null],
    ])
    expect(items[1]?.aisle).toBe('fruits-legumes')
    expect(items[0]?.aisle).toBe('autres')
    expect(items[0]?.key).toMatch(/^extra:\d+$/)
  })

  it('refuse un nom vide ou trop long', () => {
    expect(() => addExtraItem('   ')).toThrow(/Écris le nom/)
    expect(() => addExtraItem('x'.repeat(101))).toThrow(/trop long/)
    expect(getShoppingList().items).toHaveLength(0)
  })

  it('coche, retire les cochés et supprime un article', () => {
    addExtraItem('pain')
    addExtraItem('lait')
    addExtraItem('piles')
    const [pain, lait, piles] = getShoppingList().items
    setItemChecked(pain!.key, true)
    expect(getShoppingCount()).toBe(2)

    removeCheckedItems()
    expect(getShoppingList().items.map((i) => i.name)).toEqual([
      'lait',
      'piles',
    ])

    removeExtraItem(Number(lait!.key.slice('extra:'.length)))
    expect(getShoppingList().items.map((i) => i.name)).toEqual(['piles'])
    expect(piles).toBeDefined()
  })

  it('sont supprimés avec toute la liste', () => {
    addExtraItem('pain')
    clearShoppingList()
    expect(getShoppingList().items).toEqual([])
  })
})

describe('menu de la semaine', () => {
  it('choisit, remplace et vide un repas', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    const b = createRecipe(recipe('Soupe', 4))
    setMenuSlot(0, 'soir', { recipeId: a.id })
    setMenuSlot(0, 'midi', { recipeId: b.id })
    setMenuSlot(0, 'soir', { recipeId: b.id }) // remplace
    expect(getMenuPlan()).toEqual([
      { day: 0, meal: 'midi', recipeId: b.id, title: 'Soupe', custom: false },
      { day: 0, meal: 'soir', recipeId: b.id, title: 'Soupe', custom: false },
    ])
    setMenuSlot(0, 'midi', null)
    expect(getMenuPlan()).toHaveLength(1)
  })

  it('refuse un jour, un repas ou une recette invalide', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    expect(() => setMenuSlot(7, 'midi', { recipeId: a.id })).toThrow(/jour/)
    expect(() => setMenuSlot(-1, 'midi', { recipeId: a.id })).toThrow(/jour/)
    expect(() => setMenuSlot(0, 'gouter', { recipeId: a.id })).toThrow(/repas/)
    expect(() => setMenuSlot(0, 'midi', { recipeId: 999 })).toThrow(
      /introuvable/,
    )
    expect(getMenuPlan()).toEqual([])
  })

  it('retire du planning une recette supprimée', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    setMenuSlot(2, 'soir', { recipeId: a.id })
    deleteRecipe(a.id)
    expect(getMenuPlan()).toEqual([])
  })

  it('vide tout le planning', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    setMenuSlot(1, 'midi', { recipeId: a.id })
    setMenuSlot(3, 'soir', { recipeId: a.id })
    clearMenuPlan()
    expect(getMenuPlan()).toEqual([])
  })

  it('envoie le menu dans la liste, une recette prévue 2 fois compte double', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    const b = createRecipe(recipe('Soupe', 2))
    setMenuSlot(0, 'soir', { recipeId: a.id })
    setMenuSlot(2, 'soir', { recipeId: a.id }) // 2 repas de 4 portions = 8 portions
    setMenuSlot(1, 'midi', { recipeId: b.id })

    expect(addMenuToShopping()).toBe(2)
    const list = getShoppingList()
    expect(list.recipes.map((r) => [r.title, r.servings]).sort()).toEqual([
      ['Pâtes', 8],
      ['Soupe', 2],
    ])
    // Pâtes : 100 g pour 4 portions, donc 200 g pour 8. Soupe : 100 g pour 2. Total : 300 g
    expect(list.items.find((i) => i.name === 'farine')).toMatchObject({
      quantity: 300,
      unit: 'g',
    })
  })

  it('ne fait rien quand le planning est vide', () => {
    expect(addMenuToShopping()).toBe(0)
    expect(getShoppingList().recipes).toEqual([])
  })
})

describe('repas écrits à la main', () => {
  it("accepte un texte libre à la place d'une recette", () => {
    const a = createRecipe(recipe('Pâtes', 4))
    setMenuSlot(4, 'soir', { label: '  Pizza   chez   Marc ' })
    setMenuSlot(4, 'midi', { recipeId: a.id })
    expect(getMenuPlan()).toEqual([
      { day: 4, meal: 'midi', recipeId: a.id, title: 'Pâtes', custom: false },
      {
        day: 4,
        meal: 'soir',
        recipeId: null,
        title: 'Pizza chez Marc',
        custom: true,
      },
    ])
  })

  it('remplace une recette par un texte libre, et inversement', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    setMenuSlot(0, 'soir', { recipeId: a.id })
    setMenuSlot(0, 'soir', { label: 'Restes' })
    expect(getMenuPlan()[0]).toMatchObject({
      recipeId: null,
      title: 'Restes',
      custom: true,
    })
    setMenuSlot(0, 'soir', { recipeId: a.id })
    expect(getMenuPlan()[0]).toMatchObject({
      recipeId: a.id,
      title: 'Pâtes',
      custom: false,
    })
    setMenuSlot(0, 'soir', null)
    expect(getMenuPlan()).toEqual([])
  })

  it('refuse un texte vide ou trop long', () => {
    expect(() => setMenuSlot(0, 'midi', { label: '   ' })).toThrow(
      /nom du repas/,
    )
    expect(() => setMenuSlot(0, 'midi', { label: 'x'.repeat(81) })).toThrow(
      /trop long/,
    )
    expect(getMenuPlan()).toEqual([])
  })

  it('survit à la suppression des recettes et reste hors de la liste de courses', () => {
    const a = createRecipe(recipe('Pâtes', 4))
    setMenuSlot(1, 'soir', { label: 'Resto' })
    setMenuSlot(2, 'soir', { recipeId: a.id })
    deleteRecipe(a.id)
    expect(getMenuPlan()).toHaveLength(1)

    const b = createRecipe(recipe('Soupe', 2))
    setMenuSlot(3, 'midi', { recipeId: b.id })
    expect(addMenuToShopping()).toBe(1) // seul « Soupe » a des ingrédients
    expect(getMenuPlan()).toHaveLength(2)
  })
})

describe('migration du planning', () => {
  it("conserve les repas d'une ancienne base (sans colonne label)", () => {
    const base = join(process.cwd(), 'node_modules', '.cache')
    mkdirSync(base, { recursive: true })
    const dir = mkdtempSync(join(base, 'migration-'))
    const path = join(dir, 'ancienne.db')
    try {
      // Base normale, puis planning ramené à l'ancienne forme (recipe_id obligatoire, pas de label)
      initDb(path)
      createRecipe(recipe('Pâtes', 4))
      closeDb()
      const old = new Database(path)
      old.exec(`
        DROP TABLE menu_plan;
        CREATE TABLE menu_plan (
          day INTEGER NOT NULL, meal TEXT NOT NULL,
          recipe_id INTEGER NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
          PRIMARY KEY (day, meal)
        );
        INSERT INTO menu_plan VALUES (0, 'soir', 1);
      `)
      old.close()

      closeDb()
      initDb(path) // ouvre, crée ce qui manque et migre
      expect(getMenuPlan()).toEqual([
        { day: 0, meal: 'soir', recipeId: 1, title: 'Pâtes', custom: false },
      ])
      setMenuSlot(1, 'midi', { label: 'Restes' })
      expect(getMenuPlan()).toHaveLength(2)
      initDb(path) // une seconde ouverture ne change rien
      expect(getMenuPlan()).toHaveLength(2)
      expect(getDb()).toBeDefined()
    } finally {
      closeDb()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
