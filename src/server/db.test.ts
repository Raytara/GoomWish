import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDb,
  createJob,
  createRecipe,
  deleteRecipe,
  getDb,
  getJob,
  getRecipe,
  initDb,
  listRecipes,
  setFavorite,
  updateJob,
  updateRecipe,
} from './db'
import type { RecipeInput } from './schema'
import { ZodError } from 'zod'

const pates: RecipeInput = {
  title: 'Pâtes ricotta et citron',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  ingredients: [
    { quantity: 400, unit: 'g', name: 'spaghetti', note: '' },
    { quantity: 250, unit: 'g', name: 'ricotta', note: '' },
    { quantity: 2, unit: '', name: 'citrons', note: 'zeste et jus' },
  ],
  steps: ['Cuire les pâtes.', 'Mélanger avec la ricotta.'],
  tips: ['Garder un peu de zeste.'],
  tags: ['Rapide', 'Végétarien'],
}

const cookies: RecipeInput = {
  title: 'Cookies à la crème',
  servings: 12,
  prepMinutes: 15,
  cookMinutes: null,
  ingredients: [
    { quantity: 250, unit: 'g', name: 'farine', note: '' },
    { quantity: 1, unit: '', name: 'œuf', note: '' },
    { quantity: null, unit: '', name: 'sel', note: 'une pincée' },
  ],
  steps: ['Mélanger.', 'Cuire 12 min.'],
  tips: [],
  tags: ['Dessert'],
}

beforeEach(() => {
  initDb(':memory:')
})
afterEach(() => {
  closeDb()
})

describe('base de données', () => {
  it('crée les tables automatiquement', () => {
    const tables = getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toEqual(expect.arrayContaining(['recipes', 'import_jobs']))
  })

  it('crée le fichier et son dossier au premier lancement', () => {
    const base = join(process.cwd(), 'node_modules', '.cache')
    mkdirSync(base, { recursive: true })
    const dir = mkdtempSync(join(base, 'goomwish-test-'))
    try {
      const path = join(dir, 'sous', 'dossier', 'test.db')
      initDb(path)
      expect(existsSync(path)).toBe(true)
      expect(createRecipe(pates).id).toBe(1)
    } finally {
      closeDb()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('recettes', () => {
  it('crée puis relit une recette avec sa source', () => {
    const created = createRecipe(pates, {
      url: 'https://www.instagram.com/p/abc',
      platform: 'instagram',
      author: '@lou',
    })
    expect(created.id).toBe(1)
    expect(created.favorite).toBe(false)
    expect(created.sourcePlatform).toBe('instagram')
    expect(getRecipe(created.id)?.recipe.title).toBe('Pâtes ricotta et citron')
    expect(getRecipe(created.id)?.recipe.ingredients).toHaveLength(3)
  })

  it('applique les valeurs par défaut (tips, tags, unit, note)', () => {
    const r = createRecipe({
      title: 'Toast',
      servings: 1,
      prepMinutes: null,
      cookMinutes: null,
      ingredients: [{ quantity: 2, name: 'pain' }],
      steps: ['Griller.'],
    })
    expect(r.recipe.tips).toEqual([])
    expect(r.recipe.tags).toEqual([])
    expect(r.recipe.ingredients[0]).toMatchObject({ unit: '', note: '' })
  })

  it('refuse une recette invalide sans rien écrire', () => {
    expect(() => createRecipe({ ...pates, title: '   ' })).toThrow(ZodError)
    expect(() => createRecipe({ ...pates, servings: 0 })).toThrow(ZodError)
    expect(() =>
      createRecipe({
        ...pates,
        ingredients: [{ quantity: -1, unit: 'g', name: 'x', note: '' }],
      }),
    ).toThrow(ZodError)
    expect(() =>
      createRecipe(pates, { platform: 'facebook' as never }),
    ).toThrow(ZodError)
    expect(listRecipes()).toHaveLength(0)
  })

  it('met à jour une recette et refuse une mise à jour invalide', () => {
    const { id } = createRecipe(pates, { platform: 'web' })
    setFavorite(id, true)
    const updated = updateRecipe(id, {
      ...pates,
      title: 'Pâtes au citron',
      tags: ['Été'],
    })
    expect(updated?.recipe.title).toBe('Pâtes au citron')
    expect(updated?.sourcePlatform).toBe('web')
    expect(updated?.favorite).toBe(true)
    expect(listRecipes({ tag: 'ete' })).toHaveLength(1)
    expect(listRecipes({ tag: 'rapide' })).toHaveLength(0)

    expect(() => updateRecipe(id, { ...pates, steps: [''] })).toThrow(ZodError)
    expect(getRecipe(id)?.recipe.title).toBe('Pâtes au citron')
    expect(updateRecipe(999, pates)).toBeUndefined()
  })

  it('supprime une recette et détache les imports liés', () => {
    const { id } = createRecipe(pates)
    const job = createJob('https://exemple.fr')
    updateJob(job.id, { status: 'done', recipeId: id })
    expect(deleteRecipe(id)).toBe(true)
    expect(deleteRecipe(id)).toBe(false)
    expect(getRecipe(id)).toBeUndefined()
    expect(getJob(job.id)?.recipeId).toBeNull()
  })

  it('gère les favoris', () => {
    const a = createRecipe(pates)
    createRecipe(cookies)
    expect(setFavorite(a.id, true)?.favorite).toBe(true)
    expect(listRecipes({ favorite: true }).map((r) => r.id)).toEqual([a.id])
    expect(listRecipes({ favorite: false })).toHaveLength(1)
    setFavorite(a.id, false)
    expect(listRecipes({ favorite: true })).toHaveLength(0)
    expect(setFavorite(999, true)).toBeUndefined()
  })
})

describe('listRecipes', () => {
  beforeEach(() => {
    createRecipe(pates, { platform: 'instagram' })
    createRecipe(cookies, { platform: 'tiktok' })
  })

  it('renvoie les plus récentes d’abord', () => {
    expect(listRecipes().map((r) => r.recipe.title)).toEqual([
      'Cookies à la crème',
      'Pâtes ricotta et citron',
    ])
  })

  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(listRecipes({ text: 'PATES' })).toHaveLength(1) // titre : Pâtes
    expect(listRecipes({ text: 'creme' })[0]?.recipe.title).toBe(
      'Cookies à la crème',
    )
    expect(listRecipes({ text: 'vegetarien' })).toHaveLength(1) // tag : Végétarien
    expect(listRecipes({ text: 'oeuf' })).toHaveLength(1) // ingrédient : œuf
    expect(listRecipes({ text: 'ricotta citron' })).toHaveLength(1) // tous les mots
    expect(listRecipes({ text: 'ricotta farine' })).toHaveLength(0)
    expect(listRecipes({ text: 'pasteque' })).toHaveLength(0)
  })

  it('ne traite pas % et _ comme des jokers', () => {
    expect(listRecipes({ text: '%' })).toHaveLength(0)
    expect(listRecipes({ text: '_' })).toHaveLength(0)
  })

  it('filtre par tag exact, plateforme, et combine les filtres', () => {
    expect(listRecipes({ tag: 'dessert' }).map((r) => r.recipe.title)).toEqual([
      'Cookies à la crème',
    ])
    expect(listRecipes({ tag: 'vegeta' })).toHaveLength(0) // exact, pas partiel
    expect(listRecipes({ platform: 'tiktok' })).toHaveLength(1)
    expect(listRecipes({ platform: 'youtube' })).toHaveLength(0)
    expect(listRecipes({ tag: 'rapide', platform: 'tiktok' })).toHaveLength(0)
    expect(
      listRecipes({ text: 'ricotta', platform: 'instagram', tag: 'RAPIDE' }),
    ).toHaveLength(1)
  })
})

describe('imports', () => {
  it('suit le cycle de vie d’un import', () => {
    const job = createJob('https://www.tiktok.com/@x/video/1')
    expect(job).toMatchObject({
      status: 'pending',
      step: 'download',
      errorMessage: null,
      recipeId: null,
    })

    const running = updateJob(job.id, { status: 'running', step: 'transcribe' })
    expect(running).toMatchObject({ status: 'running', step: 'transcribe' })

    const recipe = createRecipe(pates)
    const done = updateJob(job.id, {
      status: 'done',
      step: 'structure',
      recipeId: recipe.id,
    })
    expect(done).toMatchObject({
      status: 'done',
      step: 'structure',
      recipeId: recipe.id,
    })
    expect(getJob(job.id)).toEqual(done)
  })

  it('enregistre une erreur', () => {
    const job = createJob('https://exemple.fr')
    const failed = updateJob(job.id, {
      status: 'error',
      errorMessage: 'Vidéo privée',
    })
    expect(failed).toMatchObject({
      status: 'error',
      errorMessage: 'Vidéo privée',
      step: 'download',
    })
  })

  it('refuse un statut inconnu et un import inexistant', () => {
    const job = createJob('https://exemple.fr')
    expect(() => updateJob(job.id, { status: 'oups' as never })).toThrow(
      ZodError,
    )
    expect(updateJob(999, { status: 'running' })).toBeUndefined()
    expect(getJob(999)).toBeUndefined()
  })
})
