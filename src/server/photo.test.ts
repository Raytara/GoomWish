import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError } from './errors'
import { readRecipePhotos } from './photo'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
const savedEnv = { ...process.env }

const recipe = {
  title: 'Gâteau au yaourt',
  servings: 6,
  prepMinutes: 10,
  cookMinutes: 35,
  ingredients: [{ quantity: 1, unit: '', name: 'yaourt', note: '' }],
  steps: ['Mélanger tous les ingrédients.'],
  tips: [],
  tags: ['Dessert'],
}

const reply = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  )

beforeEach(() => {
  process.env.VISION_API_KEY = 'cle-test'
  process.env.VISION_BASE_URL = 'https://vision.exemple.test/v1'
  process.env.VISION_MODEL = 'modele-test'
})
afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...savedEnv }
})

describe('readRecipePhotos (API mockée)', () => {
  it('envoie les photos au modèle et renvoie la recette', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(recipe))
    vi.stubGlobal('fetch', fetchMock)

    const result = await readRecipePhotos([PHOTO, PHOTO])
    expect(result.title).toBe('Gâteau au yaourt')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://vision.exemple.test/v1/chat/completions')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('modele-test')
    const images = body.messages[1].content.filter(
      (p: { type: string }) => p.type === 'image_url',
    )
    expect(images).toHaveLength(2)
  })

  it('refuse un fichier qui n’est pas une image, sans appeler l’API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      readRecipePhotos(['data:text/html;base64,PGgxPg==']),
    ).rejects.toThrow(UserFacingError)
    await expect(readRecipePhotos([])).rejects.toThrow(UserFacingError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signale une photo sans recette', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(reply({ ...recipe, ingredients: [], steps: [] })),
    )
    await expect(readRecipePhotos([PHOTO])).rejects.toThrow(/Aucune recette/)
  })

  it('réessaie une fois si la réponse est invalide', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ n: 'importe quoi' }))
      .mockResolvedValueOnce(reply(recipe))
    vi.stubGlobal('fetch', fetchMock)
    await expect(readRecipePhotos([PHOTO])).resolves.toMatchObject({
      title: 'Gâteau au yaourt',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explique une clé refusée', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    )
    await expect(readRecipePhotos([PHOTO])).rejects.toThrow(/GROQ_API_KEY/)
  })
})
