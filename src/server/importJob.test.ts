import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getJob, getRecipe, initDb, listRecipes } from './db'
import { UserFacingError } from './errors'
import { FetchSourceError } from './fetchSource'
import { runImport, startImport, type ImportDeps } from './importJob'
import type { Recipe } from './schema'

const recipe: Recipe = {
  title: 'Soupe de lentilles',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 25,
  ingredients: [
    { quantity: 250, unit: 'g', name: 'lentilles corail', note: '' },
  ],
  steps: ['Cuire.', 'Mixer.'],
  tips: [],
  tags: ['Rapide'],
}

function makeDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    fetchPage: vi.fn().mockResolvedValue({
      url: 'https://www.exemple.fr/soupe',
      title: 'Soupe de lentilles',
      text: 'Ingrédients : lentilles',
      site: 'exemple.fr',
    }),
    fetchSource: vi.fn().mockResolvedValue({
      platform: 'tiktok',
      author: 'lou',
      title: 'Soupe',
      caption: 'ma soupe',
      durationSeconds: 30,
      audioPath: 'tmp/x/audio.mp3',
    }),
    cleanupSource: vi.fn().mockResolvedValue(undefined),
    transcribeAudio: vi.fn().mockResolvedValue('on coupe les carottes'),
    structureRecipe: vi.fn().mockResolvedValue(recipe),
    ...overrides,
  }
}

beforeEach(() => {
  initDb(':memory:')
})
afterEach(() => {
  closeDb()
})

/** Attend la fin de l'import lancé en arrière-plan. */
async function waitFor(jobId: number) {
  for (let i = 0; i < 50; i++) {
    const job = getJob(jobId)!
    if (job.status === 'done' || job.status === 'error') return job
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('import trop long')
}

describe('import par lien', () => {
  it('télécharge, transcrit, structure, enregistre et nettoie', async () => {
    const deps = makeDeps()
    const job = startImport(
      { url: 'https://www.tiktok.com/@lou/video/1' },
      deps,
    )
    expect(job.status).toBe('pending')

    const done = await waitFor(job.id)
    expect(done).toMatchObject({ status: 'done', step: 'structure' })
    const stored = getRecipe(done.recipeId!)!
    expect(stored).toMatchObject({
      sourceUrl: 'https://www.tiktok.com/@lou/video/1',
      sourcePlatform: 'tiktok',
      sourceAuthor: 'lou',
    })
    expect(deps.structureRecipe).toHaveBeenCalledWith({
      title: 'Soupe',
      caption: 'ma soupe',
      transcript: 'on coupe les carottes',
    })
    expect(deps.cleanupSource).toHaveBeenCalledOnce()
  })

  it('refuse un lien invalide sans créer de job', () => {
    const deps = makeDeps()
    expect(() => startImport({ url: 'pas un lien' }, deps)).toThrow(
      FetchSourceError,
    )
    expect(deps.fetchSource).not.toHaveBeenCalled()
    expect(deps.fetchPage).not.toHaveBeenCalled()
  })

  it('lit une page web sans télécharger ni transcrire', async () => {
    const deps = makeDeps()
    const job = startImport({ url: 'https://www.exemple.fr/soupe' }, deps)
    const done = await waitFor(job.id)

    expect(done.status).toBe('done')
    expect(deps.fetchSource).not.toHaveBeenCalled()
    expect(deps.transcribeAudio).not.toHaveBeenCalled()
    expect(deps.structureRecipe).toHaveBeenCalledWith({
      title: 'Soupe de lentilles',
      caption: 'Ingrédients : lentilles',
      transcript: '',
    })
    const stored = getRecipe(done.recipeId!)!
    expect(stored.sourcePlatform).toBe('web')
    expect(stored.sourceAuthor).toBe('exemple.fr')
    expect(stored.sourceUrl).toBe('https://www.exemple.fr/soupe')
  })

  it("garde le message quand la page n'est pas lisible", async () => {
    const deps = makeDeps({
      fetchPage: vi
        .fn()
        .mockRejectedValue(new UserFacingError('Le site est introuvable.')),
    })
    const job = startImport({ url: 'https://www.exemple.fr/soupe' }, deps)
    const done = await waitFor(job.id)
    expect(done.status).toBe('error')
    expect(done.errorMessage).toBe('Le site est introuvable.')
  })

  it("garde le message et l'étape quand le téléchargement échoue", async () => {
    const deps = makeDeps({
      fetchSource: vi
        .fn()
        .mockRejectedValue(
          new FetchSourceError('PRIVATE_OR_LOGIN', 'Vidéo privée.'),
        ),
    })
    const job = startImport({ url: 'https://www.instagram.com/p/x/' }, deps)
    const failed = await waitFor(job.id)
    expect(failed).toMatchObject({
      status: 'error',
      step: 'download',
      errorMessage: 'Vidéo privée.',
    })
    expect(listRecipes()).toHaveLength(0)
  })

  it("nettoie l'audio et s'arrête à la transcription si elle échoue", async () => {
    const deps = makeDeps({
      transcribeAudio: vi
        .fn()
        .mockRejectedValue(
          new UserFacingError('La clé de transcription est manquante.'),
        ),
    })
    const job = startImport({ url: 'https://youtu.be/abc' }, deps)
    const failed = await waitFor(job.id)
    expect(failed).toMatchObject({
      status: 'error',
      step: 'transcribe',
      errorMessage: 'La clé de transcription est manquante.',
    })
    expect(deps.cleanupSource).toHaveBeenCalledOnce()
    expect(deps.structureRecipe).not.toHaveBeenCalled()
  })

  it('signale une erreur inattendue sans la masquer', async () => {
    const deps = makeDeps({
      structureRecipe: vi.fn().mockRejectedValue(new Error('boom')),
    })
    const job = startImport({ url: 'https://youtu.be/abc' }, deps)
    const failed = await waitFor(job.id)
    expect(failed).toMatchObject({ status: 'error', step: 'structure' })
    expect(failed.errorMessage).toContain('boom')
  })
})

describe('import par texte', () => {
  it('saute le téléchargement et la transcription', async () => {
    const deps = makeDeps()
    const job = startImport({ text: '250 g de lentilles. Cuire 25 min.' }, deps)
    expect(job.step).toBe('structure')

    const done = await waitFor(job.id)
    expect(done.status).toBe('done')
    expect(deps.fetchSource).not.toHaveBeenCalled()
    expect(deps.transcribeAudio).not.toHaveBeenCalled()
    expect(getRecipe(done.recipeId!)).toMatchObject({
      sourceUrl: null,
      sourcePlatform: null,
    })
  })

  it('refuse un texte vide', () => {
    expect(() => startImport({ text: '   ' }, makeDeps())).toThrow(
      UserFacingError,
    )
  })
})

describe('runImport', () => {
  it('ne lève jamais, même sur un job inexistant', async () => {
    await expect(
      runImport(999, { text: 'x' }, makeDeps()),
    ).resolves.toBeUndefined()
  })
})
