import { useEffect, useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronDown,
  Check,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { ui } from '#/components/ui'
import { qtyText } from '#/lib/quantities'
import { AISLE_LABEL, type Aisle } from '#/server/aisles'
import {
  addExtraFn,
  addMenuToShoppingFn,
  clearMenuPlanFn,
  clearShoppingFn,
  getMenuPlanFn,
  getRecipeOptionsFn,
  getShoppingListFn,
  removeCheckedItemsFn,
  removeExtraFn,
  removeShoppingRecipeFn,
  setMenuSlotFn,
  setShoppingItemFn,
} from '#/server/api'
import type { Meal, MenuChoice, MenuSlot } from '#/server/menuPlan'

export const Route = createFileRoute('/courses')({
  loader: async () => {
    const [list, plan, recipes] = await Promise.all([
      getShoppingListFn(),
      getMenuPlanFn(),
      getRecipeOptionsFn(),
    ])
    return { list, plan, recipes }
  },
  component: CoursesPage,
})

const AISLE_ORDER: Aisle[] = ['fruits-legumes', 'frais', 'epicerie', 'autres']
const DAYS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
]
// Ordre d'affichage : la semaine commence le samedi (les numéros restent 0 = lundi … 6 = dimanche)
const DAY_ORDER = [5, 6, 0, 1, 2, 3, 4]
const MEALS: { id: Meal; label: string }[] = [
  { id: 'midi', label: 'Midi' },
  { id: 'soir', label: 'Soir' },
]

function CoursesPage() {
  const { list, plan, recipes } = Route.useLoaderData()
  const router = useRouter()
  const [confirmClear, setConfirmClear] = useState(false)

  // Chaque action est enregistrée sur le serveur, puis la page est rechargée.
  async function run<T>(action: () => Promise<T>): Promise<T> {
    const result = await action()
    await router.invalidate()
    return result
  }

  const anyChecked = list.items.some((i) => i.checked)
  const hasList = list.items.length > 0 || list.recipes.length > 0

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-28 tablet:px-8 tablet:pb-8">
      <header className="flex min-h-16 items-center">
        <div>
          <p className="text-sm font-semibold text-muted">
            {list.toBuy} à acheter
          </p>
          <h1 className="font-display text-3xl leading-tight">Courses</h1>
        </div>
      </header>

      <MenuPlanner plan={plan} recipes={recipes} run={run} />

      {/* Recettes dont les ingrédients sont dans la liste */}
      {list.recipes.length > 0 && (
        <section aria-labelledby="list-recipes-title" className="mt-8">
          <h2 id="list-recipes-title" className="mb-3 font-display text-xl">
            Recettes de la liste
          </h2>
          <ul className="flex flex-col gap-2">
            {list.recipes.map((r) => (
              <li
                key={r.recipeId}
                className="flex min-h-13 items-center gap-2 rounded-2xl border border-line bg-surface pr-1 pl-4"
              >
                <Link
                  to="/recettes/$recipeId"
                  params={{ recipeId: String(r.recipeId) }}
                  className="min-w-0 flex-1 truncate font-semibold hover:underline"
                >
                  {r.title}
                </Link>
                <span className="rounded-full bg-pill px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap">
                  {r.servings} portions
                </span>
                <button
                  type="button"
                  aria-label={`Retirer ${r.title} de la liste`}
                  onClick={() =>
                    void run(() =>
                      removeShoppingRecipeFn({
                        data: { recipeId: r.recipeId },
                      }),
                    )
                  }
                  className="grid size-12 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent-soft"
                >
                  <X className="size-6" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="items-title" className="mt-8">
        <h2 id="items-title" className="mb-3 font-display text-xl">
          Ma liste
        </h2>
        <AddItemForm run={run} />

        {!hasList ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="grid size-22 place-items-center rounded-full bg-accent-soft text-accent-text">
              <ShoppingCart className="size-10" aria-hidden />
            </div>
            <h3 className="font-display text-xl">Ta liste est vide</h3>
            <p className="max-w-[34ch] text-muted">
              Ajoute un article ci-dessus, ou une recette depuis sa fiche ou
              depuis ton menu de la semaine.
            </p>
            <Link to="/" className={ui.btnGhost}>
              Voir mes recettes
            </Link>
          </div>
        ) : (
          <div className="mt-6 desktop:columns-2 desktop:gap-8">
            {AISLE_ORDER.map((aisle) => {
              // Les articles cochés passent en bas de leur rayon
              const items = list.items
                .filter((i) => i.aisle === aisle)
                .sort((a, b) => Number(a.checked) - Number(b.checked))
              if (items.length === 0) return null
              return (
                <section key={aisle} className="mb-6 break-inside-avoid">
                  <h3 className="mb-0.5 text-sm font-bold tracking-wider text-muted uppercase">
                    {AISLE_LABEL[aisle]}
                  </h3>
                  <ul>
                    {items.map((i) => (
                      <li
                        key={i.key}
                        className="flex items-start border-b border-line"
                      >
                        <label className="flex min-h-14 flex-1 cursor-pointer items-start gap-3 py-2">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={i.checked}
                            onChange={(e) =>
                              void run(() =>
                                setShoppingItemFn({
                                  data: {
                                    key: i.key,
                                    checked: e.target.checked,
                                  },
                                }),
                              )
                            }
                          />
                          <span className="mx-1.5 mt-1 grid size-8 shrink-0 place-items-center rounded-[10px] border-2 border-muted bg-surface text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                            <Check className="size-5" aria-hidden />
                          </span>
                          <span
                            className={`flex-1 pt-1.5 ${i.checked ? 'text-muted line-through' : ''}`}
                          >
                            {i.quantity !== null && (
                              <span className="mr-1 font-bold whitespace-nowrap">
                                {qtyText(i.quantity, i.unit)}
                              </span>
                            )}
                            {i.name}
                          </span>
                        </label>
                        {i.custom && (
                          <button
                            type="button"
                            aria-label={`Supprimer ${i.name}`}
                            onClick={() =>
                              void run(() =>
                                removeExtraFn({
                                  data: {
                                    id: Number(i.key.slice('extra:'.length)),
                                  },
                                }),
                              )
                            }
                            className="grid size-12 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft"
                          >
                            <X className="size-5" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}

        {hasList && (
          <div className="mt-2 flex flex-col gap-2 tablet:flex-row">
            {anyChecked && (
              <button
                type="button"
                className={`${ui.btnGhost} tablet:flex-1`}
                onClick={() => void run(() => removeCheckedItemsFn())}
              >
                <Trash2 className="size-5" aria-hidden />
                Vider les éléments cochés
              </button>
            )}
            <button
              type="button"
              className={`${ui.btnDanger} tablet:flex-1`}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="size-5" aria-hidden />
              Supprimer toute la liste
            </button>
          </div>
        )}
      </section>

      {confirmClear && (
        <ConfirmClear
          onCancel={() => setConfirmClear(false)}
          onConfirm={async () => {
            setConfirmClear(false)
            await run(() => clearShoppingFn())
          }}
        />
      )}
    </main>
  )
}

type Run = <T>(action: () => Promise<T>) => Promise<T>

/** Champ pour ajouter un article hors recette (papier toilette, 2 kg de pommes…). */
function AddItemForm({ run }: { run: Run }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const result = await run(() => addExtraFn({ data: { name } }))
      if (result.ok) {
        setName('')
        setError('')
      } else {
        setError(result.error)
      }
    } catch {
      setError('Le serveur ne répond pas. Réessaie dans un instant.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="flex gap-2">
        <input
          className={ui.input}
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={100}
          aria-label="Ajouter un article hors menu"
          aria-describedby={error ? 'extra-error' : undefined}
          placeholder="Ajouter un article (ex. papier toilette)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className={`${ui.btnPrimary} shrink-0 px-4`}
        >
          <Plus className="size-6" aria-hidden />
          <span className="max-tablet:sr-only">Ajouter</span>
        </button>
      </div>
      {error && (
        <p
          id="extra-error"
          role="alert"
          className="mt-2 text-sm font-semibold text-err"
        >
          {error}
        </p>
      )}
    </form>
  )
}

/** Tableau de la semaine : une recette par jour et par repas (midi, soir). */
function MenuPlanner({
  plan,
  recipes,
  run,
}: {
  plan: MenuSlot[]
  recipes: { id: number; title: string }[]
  run: Run
}) {
  const [message, setMessage] = useState('')

  // Le message de confirmation disparaît seul
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3500)
    return () => clearTimeout(timer)
  }, [message])

  const slotAt = (day: number, meal: Meal) =>
    plan.find((s) => s.day === day && s.meal === meal)

  async function choose(day: number, meal: Meal, choice: MenuChoice) {
    const result = await run(() =>
      setMenuSlotFn({ data: { day, meal, choice } }),
    )
    if (!result.ok) setMessage(result.error)
  }

  async function addToList() {
    const count = await run(() => addMenuToShoppingFn())
    setMessage(
      count === 0
        ? 'Choisis au moins une recette dans le menu.'
        : `${count} recette${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''} à la liste.`,
    )
  }

  return (
    <section aria-labelledby="menu-title" className="mt-2">
      <h2
        id="menu-title"
        className="mb-1 flex items-center gap-2 font-display text-xl"
      >
        <CalendarDays className="size-6" aria-hidden />
        Menu de la semaine
      </h2>
      <p className="mb-3 text-sm text-muted">
        Choisis une recette pour chaque repas, puis envoie le menu dans ta
        liste.
      </p>

      {recipes.length === 0 ? (
        <p className="rounded-2xl bg-pill px-4 py-3 text-sm font-semibold text-muted">
          Importe d'abord une recette pour pouvoir composer ton menu.
        </p>
      ) : (
        <>
          <table className="w-full table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1.5">
            <thead>
              <tr className="text-left text-sm text-muted">
                <th scope="col" className="w-14 tablet:w-24">
                  <span className="sr-only">Jour</span>
                </th>
                {MEALS.map((m) => (
                  <th key={m.id} scope="col" className="px-1 font-semibold">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_ORDER.map((d) => [DAYS[d] as string, d] as const).map(
                ([dayName, day]) => (
                  <tr key={dayName}>
                    <th
                      scope="row"
                      className="text-left text-sm font-bold tablet:text-base"
                    >
                      <span className="tablet:hidden">
                        {dayName.slice(0, 3)}.
                      </span>
                      <span className="max-tablet:hidden">{dayName}</span>
                    </th>
                    {MEALS.map((m) => (
                      <td key={m.id} className="min-w-0">
                        <SlotCell
                          key={`${day}-${m.id}-${slotAt(day, m.id)?.recipeId ?? slotAt(day, m.id)?.title ?? ''}`}
                          label={`${dayName} ${m.label.toLowerCase()}`}
                          slot={slotAt(day, m.id)}
                          recipes={recipes}
                          onChoose={(choice) => choose(day, m.id, choice)}
                        />
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>

          <div className="mt-3 flex flex-col gap-2 tablet:flex-row">
            <button
              type="button"
              disabled={plan.length === 0}
              onClick={() => void addToList()}
              className={`${ui.btnPrimary} tablet:flex-1`}
            >
              <ShoppingCart className="size-5" aria-hidden />
              Ajouter le menu à la liste
            </button>
            {plan.length > 0 && (
              <button
                type="button"
                className={ui.btnGhost}
                onClick={() => void run(() => clearMenuPlanFn())}
              >
                <Trash2 className="size-5" aria-hidden />
                Vider le menu
              </button>
            )}
          </div>
          <p
            role="status"
            className="mt-2 min-h-6 text-sm font-semibold text-ok"
          >
            {message}
          </p>
        </>
      )}
    </section>
  )
}

/** Valeur de la liste déroulante pour « Autre (écrire…) ». */
const CUSTOM = 'custom'

/**
 * Une case du tableau : une recette de l'app, ou « Autre » pour écrire son propre repas.
 * Le texte est enregistré en quittant le champ ou avec la touche Entrée.
 */
function SlotCell({
  label,
  slot,
  recipes,
  onChoose,
}: {
  label: string
  slot: MenuSlot | undefined
  recipes: { id: number; title: string }[]
  onChoose: (choice: MenuChoice) => Promise<void>
}) {
  // « Autre » choisi dans la liste mais pas encore enregistré
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState(slot?.custom ? slot.title : '')
  const custom = writing || slot?.custom === true
  const selectValue = custom ? CUSTOM : (slot?.recipeId ?? '')

  function onSelect(value: string) {
    if (value === CUSTOM) {
      setWriting(true)
      return
    }
    setWriting(false)
    setText('')
    void onChoose(value === '' ? null : { recipeId: Number(value) })
  }

  function saveText() {
    const clean = text.trim()
    if (clean === (slot?.custom ? slot.title : '')) {
      // rien n'a changé : si le champ est resté vide, on referme
      if (!clean) setWriting(false)
      return
    }
    if (!clean) {
      setWriting(false)
      void onChoose(null)
      return
    }
    void onChoose({ label: clean })
  }

  // Mode « écrire mon repas » : seul le champ de texte est affiché
  if (custom) {
    return (
      <div className="relative">
        <input
          type="text"
          aria-label={`${label} : nom du repas`}
          className={`${ui.input} min-h-12 pr-10 pl-2 text-sm font-semibold`}
          placeholder="Ex. pizza chez Marc"
          maxLength={80}
          enterKeyHint="done"
          autoFocus={writing}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        {/* Retour à la liste des recettes (efface le texte écrit) */}
        <button
          type="button"
          aria-label={`${label} : choisir une recette dans la liste`}
          title="Choisir une recette dans la liste"
          onMouseDown={(e) => e.preventDefault()} // évite d'enregistrer le texte en quittant le champ
          onClick={() => {
            setWriting(false)
            setText('')
            if (slot?.custom) void onChoose(null)
          }}
          className="absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft"
        >
          <ChevronDown className="size-5" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <select
      aria-label={label}
      className={`${ui.input} min-h-12 truncate px-2 text-sm ${selectValue === '' ? 'text-muted' : 'font-semibold'}`}
      value={selectValue}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="">—</option>
      {recipes.map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
        </option>
      ))}
      <option value={CUSTOM}>Autre (écrire…)</option>
    </select>
  )
}

function ConfirmClear({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  // Échap ferme la boîte, comme un bouton « Garder »
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <>
      <button
        type="button"
        aria-label="Fermer"
        onClick={onCancel}
        className="fixed inset-0 z-[60] cursor-default bg-black/50"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-title"
        aria-describedby="clear-desc"
        className="fixed top-1/2 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-105 -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[28px] bg-surface p-6 shadow-xl"
      >
        <h2 id="clear-title" className="font-display text-xl">
          Supprimer toute la liste ?
        </h2>
        <p id="clear-desc" className="text-muted">
          Les recettes de la liste et tous les articles, y compris ceux que tu
          as ajoutés, seront retirés. Ton menu de la semaine et tes recettes ne
          sont pas supprimés.
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className={`${ui.btnDanger} ${ui.btnLg}`}
        >
          Supprimer
        </button>
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className={ui.btnGhost}
        >
          Garder
        </button>
      </div>
    </>
  )
}
