import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { apiHttpError, sttConfig } from './config.ts'
import { UserFacingError } from './errors.ts'

/** Délai maximum pour la transcription (envoi du fichier compris). */
const TIMEOUT_MS = 3 * 60 * 1000
/** Les API de transcription refusent en général les fichiers de plus de 25 Mo. */
const MAX_FILE_BYTES = 24 * 1024 * 1024

/**
 * Transcrit un fichier audio avec une API compatible OpenAI (Groq, OpenAI…).
 * Renvoie le texte ; chaîne vide si la vidéo ne contient pas de parole.
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  const { baseUrl, apiKey, model, language } = sttConfig()

  const { size } = await stat(audioPath)
  if (size > MAX_FILE_BYTES) {
    throw new UserFacingError(
      "L'audio est trop volumineux pour être transcrit (plus de 24 Mo).",
    )
  }

  const form = new FormData()
  form.append(
    'file',
    new Blob([await readFile(audioPath)], { type: 'audio/mpeg' }),
    basename(audioPath),
  )
  form.append('model', model)
  form.append('language', language)
  form.append('response_format', 'text')

  let response: Response
  try {
    response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new UserFacingError(
        'La transcription a pris trop de temps. Réessaie dans un instant.',
      )
    }
    throw new UserFacingError(
      `Impossible de joindre l'API de transcription (${baseUrl}). Vérifie la connexion internet.`,
    )
  }

  if (!response.ok)
    throw await apiHttpError(response, "l'API de transcription", {
      key: 'GROQ_API_KEY',
      model: 'STT_MODEL',
    })
  return (await response.text()).trim()
}
