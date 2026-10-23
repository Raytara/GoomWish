import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createRecipe, getRecipe, initDb, setFavorite } from './db'
import { UserFacingError } from './errors'
import { addManualRecipe, editRecipe } from './manualRecipe'

beforeEach(() => {
  initDb(':memory:')
})
afterEach(() => {
  closeDb()
})

const base = {
  title: 'Gâteau de mamie',
  servings: 6,
  prepMinutes: 15,
  cookMinutes: 40,
  ingredients: [{ quantity: 200, unit: 'g', name: 'farine', note: '' }],
  steps: ['Mélanger la farine avec les œufs.'],
  tips: [],
  tags: ['Dessert'],
}

describe('addManualRecipe', () => {
  it('enregistre la recette sans source', () => {
    const stored = addManualRecipe(base)
    expect(getRecipe(stored.id)?.recipe.title).toBe('Gâteau de mamie')
    expect(stored.sourceUrl).toBeNull()
    expect(stored.sourcePlatform).toBeNull()
  })

  it('refuse une recette sans ingrédient ni étape', () => {
    expect(() =>
      addManualRecipe({ ...base, ingredients: [], steps: [] }),
    ).toThrow(UserFacingError)
  })

  it('refuse un titre vide', () => {
    expect(() => addManualRecipe({ ...base, title: '  ' })).toThrow(
      UserFacingError,
    )
  })
})

describe('editRecipe', () => {
  it('modifie la recette et garde la source et le favori', () => {
    const original = createRecipe(base, {
      url: 'https://x.fr/a',
      platform: 'web',
    })
    setFavorite(original.id, true)

    const edited = editRecipe(original.id, {
      ...base,
      title: 'Gâteau amélioré',
    })
    expect(edited.recipe.title).toBe('Gâteau amélioré')
    expect(edited.favorite).toBe(true)
    expect(edited.sourceUrl).toBe('https://x.fr/a')
    expect(getRecipe(original.id)?.recipe.title).toBe('Gâteau amélioré')
  })

  it('refuse une recette vide et une recette inexistante', () => {
    const { id } = addManualRecipe(base)
    expect(() =>
      editRecipe(id, { ...base, ingredients: [], steps: [] }),
    ).toThrow(UserFacingError)
    expect(() => editRecipe(9999, base)).toThrow(/n'existe plus/)
  })
})
