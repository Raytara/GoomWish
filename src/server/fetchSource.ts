import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { UserFacingError } from './errors.ts'
import type { Platform } from './schema.ts'

const execFileAsync = promisify(execFile)

/** Dossier où sont rangés les téléchargements temporaires : tmp/<id>/ */
export const TMP_ROOT = 'tmp'
/** Délai maximum accordé à chaque appel de yt-dlp (3 minutes). */
export const TIMEOUT_MS = 3 * 60 * 1000
/** Durée maximale acceptée pour une vidéo (15 minutes). */
export const MAX_DURATION_SECONDS = 15 * 60

export type SourcePlatform = Exclude<Platform, 'web'>

export type FetchedSource = {
  platform: SourcePlatform
  author: string
  title: string
  /** Légende de la vidéo ; chaîne vide s'il n'y en a pas. */
  caption: string
  durationSeconds: number
  /** Fichier mp3 dans tmp/<id>/. À supprimer avec cleanupSource(). */
  audioPath: string
}

export type FetchSourceErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_URL'
  | 'TOOL_MISSING'
  | 'PRIVATE_OR_LOGIN'
  | 'TOO_LONG'
  | 'TIMEOUT'
  | 'FAILED'

/** Erreur de récupération : le message est affichable tel quel à l'utilisateur. */
export class FetchSourceError extends UserFacingError {
  code: FetchSourceErrorCode

  constructor(code: FetchSourceErrorCode, message: string) {
    super(message)
    this.name = 'FetchSourceError'
    this.code = code
  }
}

/* ---------- 1. Validation de l'URL ---------- */

const ALLOWED_HOSTS: { host: string; platform: SourcePlatform }[] = [
  { host: 'instagram.com', platform: 'instagram' },
  { host: 'tiktok.com', platform: 'tiktok' },
  { host: 'youtube.com', platform: 'youtube' },
  { host: 'youtu.be', platform: 'youtube' },
]

const UNSUPPORTED_MESSAGE =
  'Lien non pris en charge : seuls les liens instagram.com, tiktok.com, youtube.com et youtu.be sont acceptés.'

/** Vérifie l'URL et renvoie la plateforme. Accepte les sous-domaines (www., m., vm.…). */
export function detectPlatform(rawUrl: string): SourcePlatform {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new FetchSourceError(
      'INVALID_URL',
      "Ce texte n'est pas un lien valide.",
    )
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new FetchSourceError(
      'INVALID_URL',
      "Ce texte n'est pas un lien web valide (http ou https).",
    )
  }
  const hostname = url.hostname.toLowerCase()
  // Le point devant évite d'accepter « monfauxinstagram.com ».
  const found = ALLOWED_HOSTS.find(
    (h) => hostname === h.host || hostname.endsWith(`.${h.host}`),
  )
  if (!found) throw new FetchSourceError('UNSUPPORTED_URL', UNSUPPORTED_MESSAGE)
  return found.platform
}

/* ---------- Appel des programmes externes ---------- */

// Les chemins peuvent être surchargés (utile si yt-dlp n'est pas dans le PATH, et pour les tests).
const ytdlpBin = () => process.env.YTDLP_BIN || 'yt-dlp'
const ffmpegBin = () => process.env.FFMPEG_BIN || 'ffmpeg'

const YTDLP_MISSING_MESSAGE =
  'yt-dlp est introuvable. Installe-le sur Linux : « sudo dnf install yt-dlp » (Fedora), ' +
  '« sudo apt install yt-dlp » (Debian/Ubuntu) ou « pipx install yt-dlp ».'
const FFMPEG_MISSING_MESSAGE =
  "ffmpeg est introuvable (il sert à extraire l'audio). Installe-le sur Linux : " +
  '« sudo dnf install ffmpeg-free » (Fedora) ou « sudo apt install ffmpeg » (Debian/Ubuntu).'

const PRIVATE_MESSAGE =
  "Cette vidéo est privée ou demande d'être connecté. " +
  'Colle plutôt la légende à la main, ou définis YTDLP_COOKIES_FROM_BROWSER (ex. « firefox ») pour utiliser ta session.'

type ExecError = Error & {
  code?: string | number
  killed?: boolean
  stderr?: string
}

/** Traduit une erreur de yt-dlp en erreur claire en français. */
export function classifyYtdlpError(err: ExecError): FetchSourceError {
  if (err.code === 'ENOENT')
    return new FetchSourceError('TOOL_MISSING', YTDLP_MISSING_MESSAGE)
  if (err.killed) {
    return new FetchSourceError(
      'TIMEOUT',
      'Délai dépassé : la récupération a pris plus de 3 minutes.',
    )
  }

  const text = `${err.stderr ?? ''}\n${err.message}`
  if (
    /ffmpeg|ffprobe/i.test(text) &&
    /not found|not installed|no such file/i.test(text)
  ) {
    return new FetchSourceError('TOOL_MISSING', FFMPEG_MISSING_MESSAGE)
  }
  if (
    /private|login required|log in|logged in|sign in|requiring login|cookies|authentication|rate-limit|empty media response/i.test(
      text,
    )
  ) {
    return new FetchSourceError('PRIVATE_OR_LOGIN', PRIVATE_MESSAGE)
  }
  if (/unsupported url|no video|is not a valid url|not a video/i.test(text)) {
    return new FetchSourceError(
      'UNSUPPORTED_URL',
      'Lien non pris en charge : aucune vidéo trouvée à cette adresse (photo, compte, page…).',
    )
  }

  // Dernière ligne « ERROR: … » de yt-dlp, pour garder une piste sans noyer l'utilisateur.
  const last = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR'))
    .pop()
  const detail = last ? ` Détail : ${last.replace(/^ERROR:\s*/, '')}` : ''
  return new FetchSourceError(
    'FAILED',
    `La récupération de la vidéo a échoué.${detail}`,
  )
}

/** Lance yt-dlp avec un tableau d'arguments (jamais une commande en chaîne). */
async function runYtdlp(args: string[]): Promise<string> {
  // Cookies du navigateur : utile pour Instagram, qui demande souvent d'être connecté.
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim()
  const cookies = browser ? ['--cookies-from-browser', browser] : []
  try {
    const { stdout } = await execFileAsync(ytdlpBin(), [...cookies, ...args], {
      timeout: TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
    })
    return stdout
  } catch (err) {
    throw classifyYtdlpError(err as ExecError)
  }
}

async function assertFfmpeg() {
  try {
    await execFileAsync(ffmpegBin(), ['-version'], { timeout: 15_000 })
  } catch {
    throw new FetchSourceError('TOOL_MISSING', FFMPEG_MISSING_MESSAGE)
  }
}

/* ---------- 2. Métadonnées ---------- */

// On ne garde que les champs utiles ; tout le reste du JSON de yt-dlp est ignoré.
const MetadataSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  uploader: z.string().nullish(),
  channel: z.string().nullish(),
  uploader_id: z.string().nullish(),
  duration: z.number().nullish(),
})

async function fetchMetadata(url: string) {
  const stdout = await runYtdlp([
    '--dump-json',
    '--no-download',
    '--no-playlist',
    '--',
    url,
  ])
  const firstLine = stdout.trim().split('\n')[0] ?? ''
  try {
    return MetadataSchema.parse(JSON.parse(firstLine))
  } catch {
    throw new FetchSourceError(
      'FAILED',
      'Réponse inattendue de yt-dlp : impossible de lire les informations de la vidéo.',
    )
  }
}

/* ---------- 3. Fonction principale ---------- */

/**
 * Récupère les infos et l'audio (mp3) d'une vidéo Instagram, TikTok ou YouTube.
 * Quand tu as fini, appelle cleanupSource() pour supprimer le dossier temporaire.
 */
export async function fetchSource(rawUrl: string): Promise<FetchedSource> {
  const url = rawUrl.trim()
  const platform = detectPlatform(url)

  const meta = await fetchMetadata(url)
  const durationSeconds = Math.round(meta.duration ?? 0)
  if (durationSeconds > MAX_DURATION_SECONDS) {
    const minutes = Math.round(durationSeconds / 60)
    throw new FetchSourceError(
      'TOO_LONG',
      `Vidéo trop longue (${minutes} min) : la limite est de ${MAX_DURATION_SECONDS / 60} minutes.`,
    )
  }

  await assertFfmpeg()

  // Dossier unique : deux imports en même temps ne se marchent pas dessus.
  const dir = join(TMP_ROOT, randomUUID())
  await mkdir(dir, { recursive: true })
  try {
    await runYtdlp([
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '9',
      '--no-playlist',
      '-o',
      join(dir, 'audio.%(ext)s'),
      '--',
      url,
    ])
    const audioPath = join(dir, 'audio.mp3')
    if (!existsSync(audioPath)) {
      throw new FetchSourceError(
        'FAILED',
        "L'audio n'a pas pu être extrait de la vidéo.",
      )
    }
    return {
      platform,
      author: meta.uploader ?? meta.channel ?? meta.uploader_id ?? '',
      title: meta.title ?? '',
      caption: meta.description ?? '',
      durationSeconds,
      audioPath,
    }
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    throw err
  }
}

/** Supprime le dossier temporaire d'une source (sans effet s'il n'existe plus). */
export async function cleanupSource(
  source: Pick<FetchedSource, 'audioPath'>,
): Promise<void> {
  const dir = resolve(dirname(source.audioPath))
  // Garde-fou : on ne supprime jamais rien en dehors de tmp/.
  if (!dir.startsWith(resolve(TMP_ROOT) + sep)) return
  await rm(dir, { recursive: true, force: true })
}
