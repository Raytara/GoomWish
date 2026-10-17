import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Check,
  ClipboardPaste,
  Link as LinkIcon,
  List,
  TriangleAlert,
  X,
} from 'lucide-react'
import { ui } from '#/components/ui'
import { getJobFn, startImportFn } from '#/server/api'
import type { ImportJob } from '#/server/schema'

export const Route = createFileRoute('/importLink')({ component: ImportPage })

type Mode = 'link' | 'text'

// Étapes affichées (mêmes libellés que le design) ; la dernière est « Terminé ».
const STEPS = [
  "Téléchargement de l'audio",
  'Transcription',
  'Lecture de la recette',
  'Terminé',
]
const STEP_INDEX = { download: 0, transcribe: 1, structure: 2 } as const
const POLL_MS = 1000

function ImportPage() {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<ImportJob | null>(null)

  // Numéro d'import en cours : permet d'ignorer les réponses d'un import annulé.
  const token = useRef(0)

  // Suivi de l'avancement : on interroge le serveur jusqu'à « done » ou « error ».
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return
    const mine = token.current
    const timer = setTimeout(async () => {
      const fresh = await getJobFn({ data: { id: job.id } }).catch(() => null)
      if (fresh && mine === token.current) setJob(fresh)
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [job])

  async function start() {
    const value = (mode === 'link' ? url : text).trim()
    if (!value) {
      setFormError(
        mode === 'link'
          ? 'Colle un lien pour continuer.'
          : 'Colle le texte de la recette pour continuer.',
      )
      return
    }
    setFormError('')
    setSubmitting(true)
    try {
      const result = await startImportFn({
        data: mode === 'link' ? { url: value } : { text: value },
      })
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      const fresh = await getJobFn({ data: { id: result.jobId } })
      token.current += 1
      setJob(fresh)
    } catch {
      setFormError('Le serveur ne répond pas. Réessaie dans un instant.')
    } finally {
      setSubmitting(false)
    }
  }

  async function paste() {
    try {
      const clip = await navigator.clipboard.readText()
      if (clip) setUrl(clip.trim())
    } catch {
      setFormError(
        'Impossible de lire le presse-papiers : colle le lien à la main dans le champ.',
      )
    }
  }

  function backToForm(nextMode?: Mode) {
    token.current += 1 // annule le suivi : l'import continue côté serveur mais n'est plus affiché
    setJob(null)
    if (nextMode) setMode(nextMode)
  }

  if (job) {
    return (
      <Progress
        job={job}
        onRetry={() => {
          setJob(null)
          void start()
        }}
        onPasteText={() => backToForm('text')}
        onCancel={() => backToForm()}
      />
    )
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-28 tablet:px-8 tablet:pb-8">
      <header className="flex min-h-16 items-center">
        <h1 className="font-display text-3xl leading-tight">Importer</h1>
      </header>

      <p className="text-muted">
        Colle un lien Instagram, TikTok ou YouTube. L'audio est transcrit, puis
        l'IA en tire la recette.
      </p>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          void start()
        }}
        noValidate
      >
        {mode === 'link' ? (
          <>
            <label htmlFor="url" className={ui.label}>
              Lien de la vidéo
            </label>
            <input
              id="url"
              className={ui.input}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.tiktok.com/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby={formError ? 'form-error' : undefined}
            />
            <button
              type="button"
              onClick={() => void paste()}
              className={`${ui.btnGhost} mt-3 w-full`}
            >
              <ClipboardPaste className="size-6" aria-hidden />
              Coller depuis le presse-papiers
            </button>
          </>
        ) : (
          <>
            <label htmlFor="txt" className={ui.label}>
              Texte ou légende
            </label>
            <textarea
              id="txt"
              className={`${ui.input} min-h-56 resize-y py-3 leading-normal`}
              placeholder="Ingrédients, étapes, légende de la vidéo…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={formError ? 'form-error' : undefined}
            />
          </>
        )}

        {formError && (
          <p id="form-error" role="alert" className={`${ui.bannerErr} mt-3`}>
            <TriangleAlert className="size-5 shrink-0" aria-hidden />
            {formError}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className={`${ui.btnPrimary} ${ui.btnLg} w-full`}
          >
            {submitting ? 'Envoi…' : 'Créer la recette'}
          </button>
          <button
            type="button"
            className={ui.btnSoft}
            onClick={() => {
              setFormError('')
              setMode(mode === 'link' ? 'text' : 'link')
            }}
          >
            {mode === 'link' ? (
              <>
                <List className="size-5" aria-hidden />
                ou colle le texte / la légende
              </>
            ) : (
              <>
                <LinkIcon className="size-5" aria-hidden />
                Utiliser un lien à la place
              </>
            )}
          </button>
        </div>
      </form>

      <p className={`${ui.bannerInfo} mt-6`}>
        <TriangleAlert className="size-5 shrink-0" aria-hidden />
        Instagram bloque parfois le téléchargement. La légende suffit alors.
      </p>
    </main>
  )
}

function Progress({
  job,
  onRetry,
  onPasteText,
  onCancel,
}: {
  job: ImportJob
  onRetry: () => void
  onPasteText: () => void
  onCancel: () => void
}) {
  const done = job.status === 'done'
  const failed = job.status === 'error'
  const current = done ? 3 : STEP_INDEX[job.step]

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-28 tablet:px-8 tablet:pb-8">
      <header className="flex min-h-16 items-center">
        <h1 className="font-display text-3xl leading-tight">
          {failed
            ? 'Import impossible'
            : done
              ? 'Import terminé'
              : 'Import en cours'}
        </h1>
      </header>

      <ol aria-label="Progression" className="mt-2 flex flex-col gap-3">
        {STEPS.map((label, i) => {
          const state =
            failed && i === current
              ? 'err'
              : i < current || (done && i === 3)
                ? 'done'
                : i === current
                  ? 'active'
                  : 'todo'
          return (
            <li
              key={label}
              data-state={state}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border bg-surface px-4 font-semibold ${
                state === 'active'
                  ? 'border-accent text-ink'
                  : state === 'todo'
                    ? 'border-line text-muted'
                    : 'border-line text-ink'
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full border-2 ${
                  state === 'done'
                    ? 'border-ok bg-ok text-accent-ink'
                    : state === 'err'
                      ? 'border-err bg-err text-accent-ink'
                      : state === 'active'
                        ? 'animate-spin border-accent border-t-transparent motion-reduce:animate-none'
                        : 'border-line'
                }`}
              >
                {state === 'done' && (
                  <Check className="size-[18px]" aria-hidden />
                )}
                {state === 'err' && <X className="size-[18px]" aria-hidden />}
              </span>
              {label}
            </li>
          )
        })}
      </ol>

      {failed ? (
        <>
          <div role="alert" className={`${ui.bannerErr} mt-6`}>
            <TriangleAlert className="size-[22px] shrink-0" aria-hidden />
            <div>
              Import impossible
              <p className="mt-0.5 text-base font-medium text-ink">
                {job.errorMessage}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={onPasteText}
              className={`${ui.btnPrimary} ${ui.btnLg} w-full`}
            >
              Coller la légende
            </button>
            <button type="button" onClick={onRetry} className={ui.btnGhost}>
              Réessayer
            </button>
          </div>
        </>
      ) : done ? (
        <>
          <p role="status" className={`${ui.bannerOk} mt-6`}>
            <Check className="size-[22px] shrink-0" aria-hidden />
            Recette prête. Vérifie les quantités avant de cuisiner.
          </p>
          <div className="mt-6">
            <Link
              to="/recettes/$recipeId"
              params={{ recipeId: String(job.recipeId) }}
              className={`${ui.btnPrimary} ${ui.btnLg} w-full`}
            >
              Ouvrir la recette
            </Link>
          </div>
        </>
      ) : (
        <>
          <p aria-live="polite" className="mt-4 text-muted">
            Ça prend généralement moins d'une minute.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={onCancel} className={ui.btnGhost}>
              Annuler
            </button>
          </div>
        </>
      )}
    </main>
  )
}
