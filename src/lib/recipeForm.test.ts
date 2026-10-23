import { describe, expect, it } from 'vitest'
import {
  formToRecipe,
  parseNumber,
  recipeToForm,
  splitSteps,
} from './recipeForm'
import type { RecipeFormValues } from './recipeForm'

const form: RecipeFormValues = {
  title: ' Crêpes ',
  servings: '4',
  prepMinutes: '10',
  cookMinutes: '',
  ingredients: [
    { quantity: '1,5', unit: ' l ', name: 'lait', note: '' },
    { quantity: '', unit: '', name: '', note: '' },
  ],
  steps: '1. Mélanger\n\n2) Cuire à la poêle',
  tips: 'Bien laisser reposer la pâte.\n',
  tags: 'Dessert, , Rapide',
}

describe('parseNumber', () => {
  it('accepte la virgule française', () => expect(parseNumber('1,5')).toBe(1.5))
  it('renvoie null pour un champ vide', () =>
    expect(parseNumber('  ')).toBeNull())
  it('renvoie NaN pour du texte', () => expect(parseNumber('deux')).toBeNaN())
})

describe('splitSteps', () => {
  it('retire les numéros et les lignes vides', () =>
    expect(splitSteps(form.steps)).toEqual(['Mélanger', 'Cuire à la poêle']))
})

describe('formToRecipe', () => {
  it('construit la recette et ignore les lignes vides', () => {
    const result = formToRecipe(form)
    expect(result).toMatchObject({
      ok: true,
      recipe: {
        title: 'Crêpes',
        servings: 4,
        prepMinutes: 10,
        cookMinutes: null,
        ingredients: [{ quantity: 1.5, unit: 'l', name: 'lait', note: '' }],
        tips: ['Bien laisser reposer la pâte.'],
        tags: ['Dessert', 'Rapide'],
      },
    })
  })

  it.each([
    ['titre vide', { title: '' }],
    ['portions invalides', { servings: '0' }],
    [
      'quantité invalide',
      { ingredients: [{ quantity: 'x', unit: '', name: 'lait', note: '' }] },
    ],
    [
      'ingrédient sans nom',
      { ingredients: [{ quantity: '2', unit: '', name: '', note: '' }] },
    ],
    ['recette vide', { ingredients: [], steps: '' }],
  ])('refuse : %s', (_, patch) => {
    expect(formToRecipe({ ...form, ...patch }).ok).toBe(false)
  })
})

describe('recipeToForm', () => {
  it('remplit le formulaire, et le formulaire redonne la même recette', () => {
    const recipe = {
      title: 'Crêpes',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: null,
      ingredients: [{ quantity: 1.5, unit: 'l', name: 'lait', note: 'tiède' }],
      steps: ['Mélanger', 'Cuire à la poêle'],
      tips: ['Laisser reposer.'],
      tags: ['Dessert'],
    }
    const values = recipeToForm(recipe)
    expect(values.ingredients[0]?.quantity).toBe('1,5')
    expect(values.cookMinutes).toBe('')
    expect(formToRecipe(values)).toEqual({ ok: true, recipe })
  })
})
