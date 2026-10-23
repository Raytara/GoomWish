import { z } from 'zod'
import { apiHttpError, visionConfig } from './config.ts'
import { UserFacingError } from './errors.ts'
import { RecipeSchema } from './schema.ts'
import type { Recipe } from './schema.ts'
import {
  ChatResponseSchema,
  cleanRecipe,
  shortTitle,
  stripCodeFence,
} from './structure.ts'

/** Délai maximum d'une réponse de l'API. */
const TIMEOUT_MS = 2 * 60 * 1000
const MAX_OUTPUT_TOKENS = 3000
/** Nombre maximal de photos (une recette peut tenir sur plusieurs pages). */
export const MAX_PHOTOS = 3
/** Taille maximale d'une photo une fois encodée (l'API refuse au-delà de 4 Mo). */
export const MAX_PHOTO_CHARS = 4 * 1024 * 1024

/** Une photo envoyée par le navigateur : « data:image/jpeg;base64,… ». */
export const PhotosSchema = z
  .array(
    z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
      .max(MAX_PHOTO_CHARS),
  )
  .min(1)
  .max(MAX_PHOTOS)

const SYSTEM_PROMPT = `Tu es un assistant de cuisine. Tu reçois une ou plusieurs photos d'UNE recette (page de livre, fiche, carnet écrit à la main, capture d'écran). Tu recopies cette recette, en français, et tu réponds uniquement avec un objet JSON qui respecte le schéma fourni.
Règles :
- Recopie fidèlement ce qui est écrit ; n'invente rien. Si un mot ou un nombre est illisible, ne le devine pas : omets l'élément concerné.
- Chaque ingrédient apparaît UNE seule fois, avec la quantité et l'unité écrites.
- unit : l'unité de mesure seulement (g, kg, ml, l, c. à s., c. à c., gousse, pincée…). Pour un ingrédient compté (1 oignon), unit est "".
- note : une précision propre à l'ingrédient (« râpé », « en dés »), sinon "".
- steps : des phrases complètes, dans l'ordre, sans numéro.
- tips : uniquement des conseils écrits sur la photo, sinon une liste vide.
- title : le nom court du plat (60 caractères maximum).
- servings : le nombre de portions (1 si inconnu).
- prepMinutes et cookMinutes : null si le temps n'est pas écrit.
- tags : 1 à 4 mots courts (ex. Rapide, Végétarien, Dessert).
- Si les photos ne montrent pas de recette, renvoie ingredients et steps vides.

Réponds avec un seul objet JSON, sans texte autour, qui respecte ce schéma JSON :
${JSON.stringify(z.toJSONSchema(RecipeSchema))}`

async function askVisionModel(photos: string[]): Promise<string> {
  const { baseUrl, apiKey, model } = visionConfig()
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
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Voici la recette en photo.' },
              ...photos.map((url) => ({
                type: 'image_url',
                image_url: { url },
              })),
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new UserFacingError(
        "L'IA a mis trop de temps à lire la photo. Réessaie dans un instant.",
      )
    }
    throw new UserFacingError(
      `Impossible de joindre l'API IA (${baseUrl}). Vérifie la connexion internet.`,
    )
  }

  if (!response.ok)
    throw await apiHttpError(response, "l'API de lecture de photos", {
      key: 'GROQ_API_KEY',
      model: 'VISION_MODEL',
    })

  const parsed = ChatResponseSchema.safeParse(await response.json())
  const content = parsed.success
    ? parsed.data.choices[0]?.message.content
    : null
  if (!content) throw new UserFacingError("Réponse inattendue de l'API IA.")
  return stripCodeFence(content)
}

/**
 * Lit la recette visible sur les photos. Rien n'est enregistré : l'interface affiche
 * le résultat dans le formulaire pour que tu le relises avant de sauvegarder.
 */
export async function readRecipePhotos(photos: string[]): Promise<Recipe> {
  const checked = PhotosSchema.safeParse(photos)
  if (!checked.success)
    throw new UserFacingError(
      `Photos non valides : ${MAX_PHOTOS} images maximum (JPEG, PNG ou WebP), de taille raisonnable.`,
    )

  let parsed: Recipe | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const content = await askVisionModel(checked.data)
    try {
      parsed = RecipeSchema.parse(JSON.parse(content))
    } catch {
      // Réponse invalide : on retente une fois.
    }
  }
  if (!parsed)
    throw new UserFacingError(
      "L'IA n'a pas réussi à lire une recette sur la photo. Essaie une photo plus nette.",
    )
  const recipe = cleanRecipe(parsed)
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0)
    throw new UserFacingError(
      'Aucune recette trouvée sur la photo. Essaie une photo plus nette, bien cadrée.',
    )
  return { ...recipe, title: shortTitle(recipe.title) }
}
