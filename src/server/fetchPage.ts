import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { UserFacingError } from './errors.ts'

/** Délai maximum pour charger une page (20 secondes). */
const TIMEOUT_MS = 20_000
/** Taille maximale de la page lue (2 Mo) : au-delà, on coupe. */
const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5

export type FetchedPage = {
  /** Adresse finale, après les éventuelles redirections. */
  url: string
  title: string
  /** Texte de la recette (ou, à défaut, texte de la page). */
  text: string
  /** Nom du site, par exemple « marmiton.org ». */
  site: string
}

/* ---------- 1. Sécurité : ne jamais appeler le réseau privé ---------- */

/** Vrai si l'adresse IP est locale ou privée (127.x, 192.168.x, 10.x, ::1…). */
export function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)) // IPv4 écrite en IPv6
  if (isIP(lower) === 6) {
    return (
      lower === '::' ||
      lower === '::1' ||
      /^f[cd]/.test(lower) || // fc00::/7
      /^fe[89ab]/.test(lower) // fe80::/10
    )
  }
  const [a = 0, b = 0] = lower.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (Tailscale)
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

/**
 * Refuse les adresses qui pointent vers la machine ou le réseau local :
 * l'app tourne chez toi, on ne veut pas qu'un lien puisse lire ton routeur ou tes services.
 */
async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '')
  const blocked = new UserFacingError(
    'Ce lien pointe vers un réseau privé : il est refusé.',
  )
  if (host === 'localhost' || host.endsWith('.localhost')) throw blocked
  if (isIP(host)) {
    if (isPrivateIp(host)) throw blocked
    return
  }
  let addresses: { address: string }[]
  try {
    addresses = await lookup(host, { all: true })
  } catch {
    throw new UserFacingError(`Le site « ${host} » est introuvable.`)
  }
  if (addresses.some((a) => isPrivateIp(a.address))) throw blocked
}

/* ---------- 2. Téléchargement de la page ---------- */

/** Lit le corps de la réponse en s'arrêtant à MAX_BYTES. */
async function readLimited(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Télécharge la page web et en extrait le texte de la recette. */
export async function fetchPage(rawUrl: string): Promise<FetchedPage> {
  let url = new URL(rawUrl.trim())
  let html = ''
  try {
    // Les redirections sont suivies à la main pour revérifier chaque adresse.
    for (let hop = 0; ; hop++) {
      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new UserFacingError(
          'Seuls les liens http et https sont acceptés.',
        )
      await assertPublicHost(url.hostname)

      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GoomY perso)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr,en;q=0.8',
        },
      })

      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        if (hop >= MAX_REDIRECTS)
          throw new UserFacingError('Ce lien redirige trop de fois.')
        url = new URL(location, url)
        continue
      }
      if (!response.ok)
        throw new UserFacingError(
          `Le site a répondu par une erreur (${response.status}). Colle le texte de la recette à la main.`,
        )
      const type = response.headers.get('content-type') ?? ''
      if (type && !/html|xml/i.test(type))
        throw new UserFacingError(
          "Ce lien ne mène pas à une page web (c'est un fichier, une image…).",
        )
      html = await readLimited(response)
      break
    }
  } catch (err) {
    if (err instanceof UserFacingError) throw err
    if (err instanceof Error && err.name === 'TimeoutError')
      throw new UserFacingError(
        'Le site a mis trop de temps à répondre. Réessaie dans un instant.',
      )
    throw new UserFacingError(
      `Impossible de joindre ce site (${url.hostname}). Vérifie le lien et la connexion internet.`,
    )
  }

  const { title, text } = extractRecipeText(html)
  return {
    url: url.toString(),
    title,
    text,
    site: url.hostname.replace(/^www\./, ''),
  }
}

/* ---------- 3. Extraction du texte ---------- */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1].toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : all
    }
    return ENTITIES[code.toLowerCase()] ?? all
  })
}

/** Texte lisible d'un morceau de HTML : sans scripts, sans menus, sans balises. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|form|aside)\b[\s\S]*?<\/\1>/gi,
      ' ',
    )
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** « PT1H30M » → « 1 h 30 min ». Renvoie le texte tel quel s'il n'a pas ce format. */
function isoDuration(value: string): string {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(value.trim())
  if (!m || (!m[1] && !m[2])) return value
  return [m[1] && `${m[1]} h`, m[2] && `${m[2]} min`].filter(Boolean).join(' ')
}

/** Met à plat une valeur JSON-LD : texte, liste, ou objet { text } / { name }. */
function flattenText(value: unknown): string[] {
  if (typeof value === 'string') return [decodeEntities(value).trim()]
  if (Array.isArray(value)) return value.flatMap(flattenText)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // HowToSection : une liste d'étapes dans itemListElement
    if (obj.itemListElement) return flattenText(obj.itemListElement)
    return flattenText(obj.text ?? obj.name)
  }
  return []
}

/** Cherche l'objet « Recipe » dans les blocs JSON-LD de la page. */
function findRecipeNode(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const [, json = ''] of scripts) {
    let data: unknown
    try {
      data = JSON.parse(json.trim())
    } catch {
      continue
    }
    const queue: unknown[] = [data]
    while (queue.length > 0) {
      const node = queue.shift()
      if (Array.isArray(node)) queue.push(...node)
      else if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>
        const type = obj['@type']
        if (
          type === 'Recipe' ||
          (Array.isArray(type) && type.includes('Recipe'))
        )
          return obj
        if (obj['@graph']) queue.push(obj['@graph'])
      }
    }
  }
  return null
}

/**
 * Extrait la recette d'une page. La plupart des sites de recettes publient des données
 * structurées (schema.org/Recipe) : on les utilise en priorité, sinon on garde le texte de la page.
 */
export function extractRecipeText(html: string): {
  title: string
  text: string
} {
  const node = findRecipeNode(html)
  if (node) {
    const lines = [
      `Nom : ${flattenText(node.name).join(' ')}`,
      node.recipeYield &&
        `Portions : ${flattenText(node.recipeYield).join(' ')}`,
      typeof node.prepTime === 'string' &&
        `Préparation : ${isoDuration(node.prepTime)}`,
      typeof node.cookTime === 'string' &&
        `Cuisson : ${isoDuration(node.cookTime)}`,
      `Ingrédients :\n${flattenText(node.recipeIngredient)
        .map((i) => `- ${i}`)
        .join('\n')}`,
      `Étapes :\n${flattenText(node.recipeInstructions)
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n')}`,
    ]
    return {
      title: flattenText(node.name).join(' '),
      text: lines.filter(Boolean).join('\n'),
    }
  }

  const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  // On préfère le contenu de <article> ou <main> quand il existe : moins de bruit autour.
  const body =
    /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] ??
    /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ??
    html
  return {
    title: decodeEntities(rawTitle).replace(/\s+/g, ' ').trim(),
    text: htmlToText(body),
  }
}
