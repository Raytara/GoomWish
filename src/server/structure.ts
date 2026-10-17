import { z } from 'zod'
import { apiHttpError, llmConfig } from './config.ts'
import { UserFacingError } from './errors.ts'
import { RecipeSchema, type Recipe } from './schema.ts'
import { normalize } from './search.ts'

/** Délai maximum d'une réponse de l'API (un modèle « raisonneur » peut mettre une minute). */
const TIMEOUT_MS = 3 * 60 * 1000
/** Longueur maximale de la réponse, raisonnement du modèle compris. */
const MAX_OUTPUT_TOKENS = 3000
/** On coupe les textes très longs pour rester dans la fenêtre du modèle. */
const MAX_INPUT_CHARS = 10_000

const SYSTEM_PROMPT = `Tu es un assistant de cuisine. À partir de la légende et de la transcription d'une vidéo, tu extrais UNE recette, en français, et tu réponds uniquement avec un objet JSON qui respecte le schéma fourni.
Règles :
- N'invente rien : utilise seulement ce qui est dit dans le texte.
- Chaque ingrédient apparaît UNE seule fois dans ingredients, avec la quantité et l'unité données dans le texte.
- unit : l'unité de mesure seulement (g, kg, ml, l, c. à s., c. à c., gousse, pincée…). Pour un ingrédient compté (1 oignon), unit est "". Ne recopie jamais le nom de l'ingrédient dans unit.
- note : une précision propre à cet ingrédient (par exemple « râpé », « en dés »), sinon "". Ce n'est pas une étape de préparation.
- steps : uniquement des phrases complètes décrivant une action. Ne mets jamais de mots isolés, de nombres ni de tags dans steps.
- tips : uniquement des conseils explicitement donnés dans le texte, sinon une liste vide.
- Ne répète aucune liste.
- Si une quantité n'est pas donnée, mets quantity à null. Si elle n'a pas d'unité, mets unit à "".
- title : le nom court du plat (60 caractères maximum, par exemple « Pâtes ricotta et citron »). Ce n'est jamais la légende ni une phrase de présentation.
- steps : des actions courtes, dans l'ordre.
- servings : le nombre de portions (1 si inconnu).
- prepMinutes et cookMinutes : null si le temps n'est pas donné explicitement dans le texte.
- tags : 1 à 4 mots courts (ex. Rapide, Végétarien, Dessert).
- Si le texte ne contient pas de recette, renvoie ingredients et steps vides.

Réponds avec un seul objet JSON, sans texte autour, qui respecte ce schéma JSON :
${JSON.stringify(z.toJSONSchema(RecipeSchema))}`

const MAX_TITLE_CHARS = 80

/**
 * Garde-fou : si le modèle a recopié la légende dans le titre, on ne garde que le début
 * (jusqu'au premier séparateur), coupé proprement à la fin d'un mot.
 */
export function shortTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (clean.length <= MAX_TITLE_CHARS) return clean

  const firstPart = clean.split(/\s[—–|-]\s|[\n.!?:#]/)[0]?.trim() || clean
  if (firstPart.length <= MAX_TITLE_CHARS) return firstPart

  const cut = firstPart.slice(0, MAX_TITLE_CHARS)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : MAX_TITLE_CHARS)}…`
}

const MIN_LINE_CHARS = 8
const MIN_STEP_WORDS = 2
/** Noms qui sont des unités ou des mentions, jamais de vrais ingrédients. */
const NOT_INGREDIENTS = new Set(['portion', 'portions'])

/**
 * Nettoie la sortie de l'IA, qui fait parfois des erreurs de forme :
 * ingrédients en double, nom recopié dans l'unité, notes répétées,
 * étapes d'un seul mot (morceaux de JSON), tags ou conseils en double.
 */
export function cleanRecipe(recipe: Recipe): Recipe {
  // Ingrédients : un seul exemplaire par nom, sans faux ingrédients
  const seenNames = new Set<string>()
  let ingredients = recipe.ingredients
    .map((i) => ({
      ...i,
      name: i.name.trim(),
      unit: i.unit.trim(),
      note: i.note.trim(),
    }))
    .filter((i) => {
      const key = normalize(i.name)
      if (!key || NOT_INGREDIENTS.has(key) || seenNames.has(key)) return false
      seenNames.add(key)
      return true
    })
    // « 1 poivron » : l'unité ne doit pas répéter le nom
    .map((i) =>
      normalize(i.unit) === normalize(i.name) ? { ...i, unit: '' } : i,
    )

  // Une même note sur 3 ingrédients ou plus a été recopiée à tort
  const noteCount = new Map<string, number>()
  for (const i of ingredients) {
    const key = normalize(i.note)
    if (key) noteCount.set(key, (noteCount.get(key) ?? 0) + 1)
  }
  ingredients = ingredients.map((i) =>
    (noteCount.get(normalize(i.note)) ?? 0) >= 3 ? { ...i, note: '' } : i,
  )

  const tags = uniqueBy(recipe.tags, normalize)
  const tagKeys = new Set(tags.map(normalize))

  // Étapes : phrases complètes uniquement (pas de « 1 », « Végétarien », ni un tag recopié)
  const steps = uniqueBy(
    recipe.steps
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(
        (s) =>
          s.length >= MIN_LINE_CHARS &&
          s.split(' ').length >= MIN_STEP_WORDS &&
          !tagKeys.has(normalize(s)),
      ),
    normalize,
  )

  const tips = uniqueBy(
    recipe.tips
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= MIN_LINE_CHARS),
    normalize,
  )

  return { ...recipe, ingredients, steps, tips, tags }
}

/** Garde le premier élément de chaque valeur de clé. */
function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export type StructureInput = {
  title: string
  caption: string
  transcript: string
}

function buildUserMessage({
  title,
  caption,
  transcript,
}: StructureInput): string {
  const text = [
    title && `Titre : ${title}`,
    caption && `Légende :\n${caption}`,
    transcript && `Transcription :\n${transcript}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return text.slice(0, MAX_INPUT_CHARS)
}

const ChatResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
})

/** Retire les balises ```json que certains modèles ajoutent autour de la réponse. */
function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
}

/** Appelle l'API IA une fois et renvoie le texte JSON produit par le modèle. */
async function askModel(userMessage: string): Promise<string> {
  const { baseUrl, apiKey, model, extraBody } = llmConfig()
  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        // Mode JSON : la réponse est forcée à être un objet JSON valide.
        response_format: { type: 'json_object' },
        max_tokens: MAX_OUTPUT_TOKENS,
        ...extraBody,
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new UserFacingError(
        "L'IA a mis trop de temps à répondre. Réessaie dans un instant.",
      )
    }
    throw new UserFacingError(
      `Impossible de joindre l'API IA (${baseUrl}). Vérifie la connexion internet.`,
    )
  }

  if (!response.ok)
    throw await apiHttpError(response, "l'API IA", {
      key: 'GROQ_API_KEY',
      model: 'LLM_MODEL',
    })

  const parsed = ChatResponseSchema.safeParse(await response.json())
  const content = parsed.success
    ? parsed.data.choices[0]?.message.content
    : null
  if (!content) throw new UserFacingError("Réponse inattendue de l'API IA.")
  return stripCodeFence(content)
}

/**
 * Demande à l'IA de transformer le texte en recette structurée.
 * La réponse est validée par Zod ; un second essai est tenté si elle est invalide.
 */
export async function structureRecipe(input: StructureInput): Promise<Recipe> {
  const userMessage = buildUserMessage(input)
  if (!userMessage.trim()) {
    throw new UserFacingError(
      "Aucun texte à analyser : la vidéo n'a ni légende ni parole détectée. Colle le texte de la recette à la main.",
    )
  }

  let parsed: Recipe | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const content = await askModel(userMessage)
    try {
      parsed = RecipeSchema.parse(JSON.parse(content))
    } catch {
      // Réponse invalide : on retente une fois.
    }
  }
  if (!parsed)
    throw new UserFacingError(
      "L'IA n'a pas réussi à produire une recette exploitable. Réessaie.",
    )
  const recipe = cleanRecipe(parsed)

  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    throw new UserFacingError(
      'Aucune recette trouvée dans ce contenu. Colle plutôt le texte de la recette à la main.',
    )
  }
  return { ...recipe, title: shortTitle(recipe.title) }
}
