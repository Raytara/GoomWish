import { UserFacingError } from './errors.ts'

// Les clés d'API sont lues dans le fichier .env (voir .env.example) ou dans l'environnement.
let envLoaded = false
function loadEnv() {
  if (envLoaded) return
  envLoaded = true
  try {
    process.loadEnvFile()
  } catch {
    // pas de fichier .env : on utilise seulement les variables d'environnement
  }
}

const trimSlash = (url: string) => url.replace(/\/$/, '')

const GROQ_URL = 'https://api.groq.com/openai/v1'

/**
 * Une seule clé suffit : GROQ_API_KEY sert à la fois au modèle de langage et à la transcription.
 * LLM_API_KEY et STT_API_KEY permettent d'utiliser deux fournisseurs différents si besoin.
 */
const keyFor = (specific: string | undefined) =>
  specific?.trim() || process.env.GROQ_API_KEY?.trim() || ''

/** API de modèle de langage compatible OpenAI (par défaut : Groq). */
export function llmConfig() {
  loadEnv()
  const apiKey = keyFor(process.env.LLM_API_KEY)
  if (!apiKey) {
    throw new UserFacingError(
      "La clé de l'API IA est manquante. Ajoute GROQ_API_KEY dans le fichier .env (voir .env.example). " +
        'Tu peux en attendant coller le texte de la recette à la main.',
    )
  }

  // Paramètres supplémentaires envoyés tels quels (facultatif, selon le fournisseur).
  let extraBody: Record<string, unknown> = {}
  const rawExtra = process.env.LLM_EXTRA_BODY?.trim()
  if (rawExtra) {
    try {
      extraBody = JSON.parse(rawExtra) as Record<string, unknown>
    } catch {
      throw new UserFacingError(
        "LLM_EXTRA_BODY n'est pas un JSON valide (voir .env.example).",
      )
    }
  }

  return {
    baseUrl: trimSlash(process.env.LLM_BASE_URL || GROQ_URL),
    apiKey,
    model: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
    extraBody,
  }
}

/** API de transcription audio compatible OpenAI (par défaut : Groq, Whisper large v3 turbo). */
export function sttConfig() {
  loadEnv()
  const apiKey = keyFor(process.env.STT_API_KEY)
  if (!apiKey) {
    throw new UserFacingError(
      "La clé de l'API de transcription est manquante. Ajoute GROQ_API_KEY dans le fichier .env " +
        '(voir .env.example). Tu peux en attendant coller la légende ou le texte à la main.',
    )
  }
  return {
    baseUrl: trimSlash(process.env.STT_BASE_URL || GROQ_URL),
    apiKey,
    model: process.env.STT_MODEL || 'whisper-large-v3-turbo',
    language: process.env.STT_LANGUAGE || 'fr',
  }
}

/** Message en français pour une réponse d'erreur d'une API. */
export async function apiHttpError(
  response: Response,
  service: string,
  vars: { key: string; model: string },
): Promise<UserFacingError> {
  const status = response.status
  // Le fournisseur explique souvent la cause dans { error: { message } }
  let detail = ''
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) detail = ` Détail : ${body.error.message}`
  } catch {
    // corps vide ou non JSON
  }

  if (status === 401 || status === 403) {
    return new UserFacingError(
      `La clé de ${service} est refusée (${status}). Vérifie ${vars.key} dans le fichier .env.`,
    )
  }
  if (status === 402) {
    return new UserFacingError(
      `Le crédit de ${service} est épuisé (402). Recharge ton compte chez le fournisseur.`,
    )
  }
  if (status === 404) {
    return new UserFacingError(
      `Modèle introuvable pour ${service} (404). Vérifie ${vars.model} dans le fichier .env.${detail}`,
    )
  }
  if (status === 429) {
    return new UserFacingError(
      `Trop de requêtes ou quota atteint pour ${service} (429). Réessaie dans un instant.${detail}`,
    )
  }
  if (status >= 500) {
    return new UserFacingError(
      `Le service de ${service} est temporairement indisponible (${status}). Réessaie plus tard.`,
    )
  }
  return new UserFacingError(
    `Le service de ${service} a refusé la demande (${status}).${detail}`,
  )
}
