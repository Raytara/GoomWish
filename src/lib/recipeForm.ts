// Conversion des champs du formulaire « Nouvelle recette » (du texte) en recette.
// Fichier sans dépendance au serveur : il est aussi utilisé dans le navigateur.

export type IngredientRow = {
  quantity: string
  unit: string
  name: string
  note: string
}

export type RecipeFormValues = {
  title: string
  servings: string
  prepMinutes: string
  cookMinutes: string
  ingredients: IngredientRow[]
  /** Une étape par ligne. */
  steps: string
  /** Une astuce par ligne. */
  tips: string
  /** Séparés par des virgules. */
  tags: string
}

/** Inverse de formToRecipe : remplit le formulaire avec une recette (lue sur une photo). */
export function recipeToForm(recipe: {
  title: string
  servings: number
  prepMinutes: number | null
  cookMinutes: number | null
  ingredients: {
    quantity: number | null
    unit: string
    name: string
    note: string
  }[]
  steps: string[]
  tips: string[]
  tags: string[]
}): RecipeFormValues {
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: recipe.prepMinutes === null ? '' : String(recipe.prepMinutes),
    cookMinutes: recipe.cookMinutes === null ? '' : String(recipe.cookMinutes),
    ingredients: recipe.ingredients.map((i) => ({
      quantity: i.quantity === null ? '' : String(i.quantity).replace('.', ','),
      unit: i.unit,
      name: i.name,
      note: i.note,
    })),
    steps: recipe.steps.join('\n'),
    tips: recipe.tips.join('\n'),
    tags: recipe.tags.join(', '),
  }
}

/** « 1,5 » ou « 1.5 » → 1.5 ; vide → null ; texte invalide → NaN. */
export function parseNumber(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!clean) return null
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN
}

/** Une ligne par étape ; on retire les numéros écrits à la main (« 1. », « 2) »…). */
export function splitSteps(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\s*[.)-]\s*/, '').trim())
    .filter(Boolean)
}

/**
 * Renvoie la recette prête à être envoyée au serveur, ou un message d'erreur en français.
 * (Le serveur revalide tout avec Zod : ici on donne seulement un message clair.)
 */
export function formToRecipe(
  form: RecipeFormValues,
):
  | { ok: true; recipe: ReturnType<typeof buildRecipe> }
  | { ok: false; error: string } {
  if (!form.title.trim())
    return { ok: false, error: 'Donne un titre à la recette.' }

  const servings = parseNumber(form.servings)
  if (
    servings === null ||
    Number.isNaN(servings) ||
    !Number.isInteger(servings) ||
    servings < 1
  )
    return {
      ok: false,
      error: 'Les portions doivent être un nombre entier (1 ou plus).',
    }

  for (const [label, value] of [
    ['La préparation', form.prepMinutes],
    ['La cuisson', form.cookMinutes],
  ] as const) {
    const n = parseNumber(value)
    if (n !== null && (Number.isNaN(n) || !Number.isInteger(n)))
      return {
        ok: false,
        error: `${label} doit être un nombre de minutes entier.`,
      }
  }

  // Les lignes d'ingrédients entièrement vides sont ignorées.
  const rows = form.ingredients.filter(
    (r) => r.quantity.trim() || r.unit.trim() || r.name.trim() || r.note.trim(),
  )
  for (const r of rows) {
    if (!r.name.trim())
      return { ok: false, error: 'Chaque ingrédient doit avoir un nom.' }
    if (Number.isNaN(parseNumber(r.quantity)))
      return {
        ok: false,
        error: `La quantité de « ${r.name.trim()} » doit être un nombre (ex. 250 ou 1,5).`,
      }
  }

  const steps = splitSteps(form.steps)
  if (rows.length === 0 && steps.length === 0)
    return { ok: false, error: 'Ajoute au moins un ingrédient ou une étape.' }

  return { ok: true, recipe: buildRecipe(form, rows, steps) }
}

function buildRecipe(
  form: RecipeFormValues,
  rows: IngredientRow[],
  steps: string[],
) {
  return {
    title: form.title.trim(),
    servings: parseNumber(form.servings) ?? 1,
    prepMinutes: parseNumber(form.prepMinutes),
    cookMinutes: parseNumber(form.cookMinutes),
    ingredients: rows.map((r) => ({
      quantity: parseNumber(r.quantity),
      unit: r.unit.trim(),
      name: r.name.trim(),
      note: r.note.trim(),
    })),
    steps,
    tips: splitSteps(form.tips),
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  }
}
