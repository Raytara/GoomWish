import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanRecipe, shortTitle, structureRecipe } from './structure'

const good = {
  title: 'Cookies',
  servings: 12,
  prepMinutes: 15,
  cookMinutes: 12,
  ingredients: [{ quantity: 250, unit: 'g', name: 'farine', note: '' }],
  steps: ['Mélanger.', 'Cuire.'],
  tips: [],
  tags: ['Dessert'],
}

// Réponse au format « chat completions » compatible OpenAI
const reply = (content: unknown) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content:
              typeof content === 'string' ? content : JSON.stringify(content),
          },
        },
      ],
    }),
    { status: 200 },
  )

const input = {
  title: 'Cookies',
  caption: 'recette',
  transcript: 'mélange la farine',
}

const savedEnv = { ...process.env }

beforeEach(() => {
  process.env.LLM_API_KEY = 'cle-de-test'
  process.env.LLM_BASE_URL = 'https://api.exemple.test/v1/'
  process.env.LLM_MODEL = 'modele-test'
  delete process.env.LLM_EXTRA_BODY
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...savedEnv }
})

describe('structureRecipe', () => {
  it('renvoie une recette validée et envoie la bonne requête', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchMock)
    const recipe = await structureRecipe(input)
    expect(recipe.title).toBe('Cookies')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.exemple.test/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer cle-de-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('modele-test')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].content).toContain('"ingredients"') // le schéma est dans le prompt
    expect(body.messages[1].content).toContain('mélange la farine')
  })

  it('transmet les paramètres supplémentaires de LLM_EXTRA_BODY', async () => {
    process.env.LLM_EXTRA_BODY = '{"thinking":{"type":"disabled"}}'
    const fetchMock = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchMock)
    await structureRecipe(input)
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).thinking).toEqual({
      type: 'disabled',
    })
  })

  it('accepte une réponse entourée de balises ```json', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(reply('```json\n' + JSON.stringify(good) + '\n```')),
    )
    expect((await structureRecipe(input)).title).toBe('Cookies')
  })

  it('retente une fois si la réponse est invalide', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('pas du json'))
      .mockResolvedValueOnce(reply({ ...good, title: 'Réussi' }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await structureRecipe(input)).title).toBe('Réussi')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('échoue clairement après deux réponses invalides', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => reply({ title: '' })),
    )
    await expect(structureRecipe(input)).rejects.toThrow(/exploitable/)
  })

  it('demande la clé quand elle est absente, sans appeler le réseau', async () => {
    delete process.env.LLM_API_KEY
    delete process.env.GROQ_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(structureRecipe(input)).rejects.toThrow(/GROQ_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("explique les erreurs de l'API (clé, crédit, modèle, quota)", async () => {
    const failWith = (status: number) =>
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response('{}', { status })),
      )
    failWith(401)
    await expect(structureRecipe(input)).rejects.toThrow(
      /refusée.*GROQ_API_KEY/,
    )
    failWith(402)
    await expect(structureRecipe(input)).rejects.toThrow(/crédit/)
    failWith(404)
    await expect(structureRecipe(input)).rejects.toThrow(/LLM_MODEL/)
    failWith(429)
    await expect(structureRecipe(input)).rejects.toThrow(/quota/)
  })

  it('signale une API injoignable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    )
    await expect(structureRecipe(input)).rejects.toThrow(
      /Impossible de joindre/,
    )
  })

  it('refuse un contenu sans recette', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply({ ...good, ingredients: [], steps: [] })),
    )
    await expect(structureRecipe(input)).rejects.toThrow(/Aucune recette/)
  })

  it("n'appelle pas l'IA sans aucun texte", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      structureRecipe({ title: '', caption: '', transcript: '' }),
    ).rejects.toThrow(/Aucun texte/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('shortTitle', () => {
  it('garde un titre court tel quel', () => {
    expect(shortTitle('Pâtes ricotta et citron')).toBe(
      'Pâtes ricotta et citron',
    )
  })

  it('ne garde que le début quand la légende a été recopiée', () => {
    const caption =
      'Riz façon kebab à la dinde — One Pot Épisode 6 de ma série sur le thème des one pot meals. Retrouve tout sur mon site ! ' +
      '📊 Macros par portion — 2 portions 🔥 563 kcal'
    expect(shortTitle(caption)).toBe('Riz façon kebab à la dinde')
  })

  it("coupe à la fin d'un mot quand il n'y a aucun séparateur", () => {
    const long = 'mot '.repeat(60).trim()
    const out = shortTitle(long)
    expect(out.length).toBeLessThanOrEqual(81)
    expect(out.endsWith('…')).toBe(true)
  })

  it('est appliqué au résultat de structureRecipe', async () => {
    const longTitle = `Gratin dauphinois crémeux. ${'Blabla '.repeat(40)}`
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply({ ...good, title: longTitle })),
    )
    expect((await structureRecipe(input)).title).toBe(
      'Gratin dauphinois crémeux',
    )
  })
})

describe('cleanRecipe', () => {
  const base = {
    title: 'Riz kebab',
    servings: 2,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: [],
    steps: [],
    tips: [],
    tags: [],
  }
  const ing = (name: string, extra: object = {}) => ({
    quantity: 1,
    unit: '',
    name,
    note: '',
    ...extra,
  })

  it('supprime les ingrédients en double', () => {
    const r = cleanRecipe({
      ...base,
      ingredients: [
        ing('Poivron'),
        ing('riz', { quantity: 140, unit: 'g' }),
        ing('poivron'),
        ing('RIZ'),
      ],
    })
    expect(r.ingredients.map((i) => i.name)).toEqual(['Poivron', 'riz'])
    expect(r.ingredients[1]).toMatchObject({ quantity: 140, unit: 'g' })
  })

  it("vide l'unité quand elle répète le nom, et retire « portion »", () => {
    const r = cleanRecipe({
      ...base,
      ingredients: [
        ing('poivron', { unit: 'poivron' }),
        ing('portion', { unit: 'portion' }),
        ing('farine', { unit: 'g' }),
      ],
    })
    expect(r.ingredients.map((i) => i.name)).toEqual(['poivron', 'farine'])
    expect(r.ingredients[0]?.unit).toBe('')
    expect(r.ingredients[1]?.unit).toBe('g')
  })

  it('efface une note recopiée sur au moins 3 ingrédients', () => {
    const r = cleanRecipe({
      ...base,
      ingredients: [
        ing('a', { note: 'Couper en morceaux' }),
        ing('b', { note: 'Couper en morceaux' }),
        ing('c', { note: 'couper en morceaux' }),
        ing('d', { note: 'râpé' }),
      ],
    })
    expect(r.ingredients.map((i) => i.note)).toEqual(['', '', '', 'râpé'])
  })

  it('retire les étapes trop courtes, les tags recopiés et les doublons', () => {
    const r = cleanRecipe({
      ...base,
      tags: ['Végétarien', 'One Pot'],
      steps: [
        'Couper la dinde en morceaux et la faire griller.',
        'tags',
        '1',
        'Végétarien',
        'One Pot',
        'Servir.',
        'Couper la dinde en morceaux et la faire griller.',
        'Mélanger tout.',
      ],
    })
    expect(r.steps).toEqual([
      'Couper la dinde en morceaux et la faire griller.',
      'Mélanger tout.',
    ])
  })

  it('retire les conseils trop courts et les tags en double', () => {
    const r = cleanRecipe({
      ...base,
      tips: ['ok', 'Laisser reposer 5 minutes.', 'laisser reposer 5 minutes.'],
      tags: ['Rapide', 'rapide', 'Dessert'],
    })
    expect(r.tips).toEqual(['Laisser reposer 5 minutes.'])
    expect(r.tags).toEqual(['Rapide', 'Dessert'])
  })
})
