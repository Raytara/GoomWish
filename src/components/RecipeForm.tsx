import { useRef, useState } from 'react'
import { Camera, Plus, TriangleAlert, X } from 'lucide-react'
import { ui } from '#/components/ui'
import { photoToDataUrl } from '#/lib/image'
import { formToRecipe, recipeToForm } from '#/lib/recipeForm'
import type { RecipeFormValues } from '#/lib/recipeForm'
import { readPhotosFn } from '#/server/api'

const emptyRow = { quantity: '', unit: '', name: '', note: '' }

/** Formulaire vide, avec 4 portions par défaut. */
export const EMPTY_FORM: RecipeFormValues = {
  title: '',
  servings: '4',
  prepMinutes: '',
  cookMinutes: '',
  ingredients: [{ ...emptyRow }],
  steps: '',
  tips: '',
  tags: '',
}

type RecipeData = Extract<
  ReturnType<typeof formToRecipe>,
  { ok: true }
>['recipe']

/**
 * Formulaire de recette, partagé par « nouvelle recette » et « modifier ».
 * onSave enregistre la recette et renvoie un message d'erreur (ou null si tout va bien) ;
 * la page qui l'utilise décide ensuite où aller.
 */
export function RecipeForm({
  initial,
  submitLabel,
  showPhoto,
  onSave,
}: {
  initial: RecipeFormValues
  submitLabel: string
  /** Propose de remplir le formulaire à partir d'une photo. */
  showPhoto: boolean
  onSave: (recipe: RecipeData) => Promise<string | null>
}) {
  const [form, setForm] = useState<RecipeFormValues>(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const [fromPhoto, setFromPhoto] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Met à jour un champ simple du formulaire
  function setField<TKey extends keyof RecipeFormValues>(
    key: TKey,
    value: RecipeFormValues[TKey],
  ) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setRow(index: number, patch: Partial<typeof emptyRow>) {
    setField(
      'ingredients',
      form.ingredients.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    )
  }

  // Envoie les photos choisies à l'IA, puis remplit le formulaire avec ce qu'elle a lu.
  // Rien n'est enregistré : tu relis et corriges avant de valider.
  async function readPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setError('')
    setReading(true)
    try {
      const photos = await Promise.all(
        Array.from(files).slice(0, 3).map(photoToDataUrl),
      )
      const result = await readPhotosFn({ data: { photos } })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setForm(recipeToForm(result.recipe))
      setFromPhoto(true)
    } catch {
      setError(
        "Impossible de lire cette photo. Vérifie que c'est bien une image, puis réessaie.",
      )
    } finally {
      setReading(false)
      if (fileInput.current) fileInput.current.value = '' // permet de rechoisir la même photo
    }
  }

  async function save() {
    // Vérification simple côté navigateur, puis le serveur revalide tout avec Zod
    const result = formToRecipe(form)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    setSaving(true)
    try {
      const problem = await onSave(result.recipe)
      if (problem) setError(problem)
    } catch {
      setError("Impossible d'enregistrer la recette. Réessaie dans un instant.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {showPhoto && (
        <section className="mt-2 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">
            Une page de livre, une fiche, ton carnet écrit à la main : prends-la
            en photo (3 photos maximum), l'IA remplit le formulaire. Tu relis et
            tu corriges avant d'enregistrer.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void readPhotos(e.target.files)}
          />
          <button
            type="button"
            disabled={reading}
            className={`${ui.btnSoft} mt-3 w-full`}
            onClick={() => fileInput.current?.click()}
          >
            <Camera className="size-5" aria-hidden />
            {reading ? 'Lecture de la photo…' : 'Remplir depuis une photo'}
          </button>
          {fromPhoto && !reading && (
            <p role="status" className={`${ui.bannerOk} mt-3`}>
              Recette lue sur la photo. Relis bien les quantités, surtout si
              c'est de l'écriture à la main.
            </p>
          )}
        </section>
      )}

      <form
        className="mt-5 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        noValidate
      >
        <div>
          <label htmlFor="title" className={ui.label}>
            Titre
          </label>
          <input
            id="title"
            className={ui.input}
            placeholder="Gâteau au yaourt de mamie"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="servings" className={ui.label}>
              Portions
            </label>
            <input
              id="servings"
              className={ui.input}
              inputMode="numeric"
              value={form.servings}
              onChange={(e) => setField('servings', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="prep" className={ui.label}>
              Prépa (min)
            </label>
            <input
              id="prep"
              className={ui.input}
              inputMode="numeric"
              value={form.prepMinutes}
              onChange={(e) => setField('prepMinutes', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cook" className={ui.label}>
              Cuisson (min)
            </label>
            <input
              id="cook"
              className={ui.input}
              inputMode="numeric"
              value={form.cookMinutes}
              onChange={(e) => setField('cookMinutes', e.target.value)}
            />
          </div>
        </div>

        <fieldset>
          <legend className={ui.label}>Ingrédients</legend>
          <ul className="flex flex-col gap-3">
            {form.ingredients.map((row, i) => (
              <li
                key={i}
                className="grid grid-cols-[5rem_5rem_1fr_auto] gap-2 rounded-2xl border border-line bg-surface p-2"
              >
                <input
                  aria-label={`Quantité de l'ingrédient ${i + 1}`}
                  className={ui.input}
                  inputMode="decimal"
                  placeholder="250"
                  value={row.quantity}
                  onChange={(e) => setRow(i, { quantity: e.target.value })}
                />
                <input
                  aria-label={`Unité de l'ingrédient ${i + 1}`}
                  className={ui.input}
                  placeholder="g"
                  value={row.unit}
                  onChange={(e) => setRow(i, { unit: e.target.value })}
                />
                <input
                  aria-label={`Nom de l'ingrédient ${i + 1}`}
                  className={ui.input}
                  placeholder="farine"
                  value={row.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Retirer l'ingrédient ${i + 1}`}
                  className="grid size-13 place-items-center rounded-full hover:bg-accent-soft"
                  onClick={() =>
                    setField(
                      'ingredients',
                      form.ingredients.filter((_, k) => k !== i),
                    )
                  }
                >
                  <X className="size-5" aria-hidden />
                </button>
                <input
                  aria-label={`Précision de l'ingrédient ${i + 1}`}
                  className={`${ui.input} col-span-4`}
                  placeholder="Précision (facultatif) : tamisée, en dés…"
                  value={row.note}
                  onChange={(e) => setRow(i, { note: e.target.value })}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${ui.btnSoft} mt-3`}
            onClick={() =>
              setField('ingredients', [...form.ingredients, { ...emptyRow }])
            }
          >
            <Plus className="size-5" aria-hidden />
            Ajouter un ingrédient
          </button>
        </fieldset>

        <div>
          <label htmlFor="steps" className={ui.label}>
            Étapes (une par ligne)
          </label>
          <textarea
            id="steps"
            className={`${ui.input} min-h-48 resize-y py-3 leading-normal`}
            placeholder={
              'Mélanger la farine et les œufs.\nCuire 40 minutes à 180 °C.'
            }
            value={form.steps}
            onChange={(e) => setField('steps', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="tips" className={ui.label}>
            Astuces (une par ligne, facultatif)
          </label>
          <textarea
            id="tips"
            className={`${ui.input} min-h-24 resize-y py-3 leading-normal`}
            value={form.tips}
            onChange={(e) => setField('tips', e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="tags" className={ui.label}>
            Tags (séparés par des virgules)
          </label>
          <input
            id="tags"
            className={ui.input}
            placeholder="Dessert, Rapide"
            value={form.tags}
            onChange={(e) => setField('tags', e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className={ui.bannerErr}>
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`${ui.btnPrimary} ${ui.btnLg} w-full`}
        >
          {saving ? 'Enregistrement…' : submitLabel}
        </button>
      </form>
    </>
  )
}
