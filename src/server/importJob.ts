import { createJob, createRecipe, updateJob } from './db.ts'
import { UserFacingError } from './errors.ts'
import { cleanupSource, detectPlatform, fetchSource } from './fetchSource.ts'
import type { ImportJob } from './schema.ts'
import { structureRecipe } from './structure.ts'
import { transcribeAudio } from './transcribe.ts'

/** Un import part soit d'un lien, soit d'un texte collé à la main. */
export type ImportRequest = { url: string } | { text: string }

/** Les étapes du pipeline, remplaçables dans les tests. */
export type ImportDeps = {
  fetchSource: typeof fetchSource
  cleanupSource: typeof cleanupSource
  transcribeAudio: typeof transcribeAudio
  structureRecipe: typeof structureRecipe
}

const defaultDeps: ImportDeps = {
  fetchSource,
  cleanupSource,
  transcribeAudio,
  structureRecipe,
}

/**
 * Crée le job et lance l'import en arrière-plan : la fonction répond tout de suite,
 * l'interface suit l'avancement avec getJob().
 * Lève une erreur claire si le lien ou le texte est invalide (aucun job n'est créé).
 */
export function startImport(
  request: ImportRequest,
  deps: ImportDeps = defaultDeps,
): ImportJob {
  let job: ImportJob
  if ('url' in request) {
    detectPlatform(request.url) // vérifie le lien avant de créer quoi que ce soit
    job = createJob(request.url.trim())
  } else {
    if (!request.text.trim())
      throw new UserFacingError('Colle le texte ou la légende de la recette.')
    job = createJob('texte')
    // Pas de téléchargement ni de transcription : on démarre à la lecture de la recette.
    job = updateJob(job.id, { step: 'structure' }) ?? job
  }

  void runImport(job.id, request, deps)
  return job
}

/** Exécute le pipeline complet. Ne lève jamais : toute erreur est écrite dans le job. */
export async function runImport(
  jobId: number,
  request: ImportRequest,
  deps: ImportDeps = defaultDeps,
) {
  try {
    updateJob(jobId, { status: 'running' })

    let title = ''
    let caption = ''
    let transcript = ''
    let source: {
      url: string | null
      platform: 'instagram' | 'tiktok' | 'youtube' | null
      author: string | null
    } = {
      url: null,
      platform: null,
      author: null,
    }

    if ('text' in request) {
      caption = request.text
    } else {
      updateJob(jobId, { step: 'download' })
      const fetched = await deps.fetchSource(request.url)
      try {
        // Sur TikTok et Instagram, yt-dlp renvoie la légende comme titre : on l'ignore alors.
        title =
          fetched.title.length <= 100 && fetched.title !== fetched.caption
            ? fetched.title
            : ''
        caption = fetched.caption
        source = {
          url: request.url.trim(),
          platform: fetched.platform,
          author: fetched.author || null,
        }

        updateJob(jobId, { step: 'transcribe' })
        transcript = await deps.transcribeAudio(fetched.audioPath)
      } finally {
        // L'audio n'est plus utile une fois transcrit (ou si la transcription échoue).
        await deps.cleanupSource(fetched)
      }
    }

    updateJob(jobId, { step: 'structure' })
    const recipe = await deps.structureRecipe({ title, caption, transcript })

    const stored = createRecipe(recipe, source)
    updateJob(jobId, { status: 'done', recipeId: stored.id })
  } catch (err) {
    const message =
      err instanceof UserFacingError
        ? err.message
        : `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`
    updateJob(jobId, { status: 'error', errorMessage: message })
  }
}
