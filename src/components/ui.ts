// Styles partagés (boutons, champs, bandeaux) issus du design Open Design « GoomY perso ».
const btn =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-transparent px-6 font-bold transition-[transform,background-color] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

export const ui = {
  btnPrimary: `${btn} bg-accent text-accent-ink hover:brightness-110`,
  btnSoft: `${btn} bg-accent-soft text-accent-text`,
  btnGhost: `${btn} border-line bg-surface text-ink hover:bg-accent-soft`,
  btnDanger: `${btn} border-err bg-transparent text-err`,
  btnLg: 'min-h-16 text-lg',
  input:
    'min-h-13 w-full rounded-2xl border-[1.5px] border-line bg-surface px-4 text-base placeholder:text-muted/85',
  label: 'mb-1.5 block text-sm font-bold',
  bannerInfo:
    'flex items-start gap-3 rounded-2xl bg-pill px-4 py-3 text-sm font-semibold text-muted',
  bannerErr:
    'flex items-start gap-3 rounded-2xl bg-err-soft px-4 py-3 text-sm font-semibold text-err',
  bannerOk:
    'flex items-start gap-3 rounded-2xl bg-ok-soft px-4 py-3 text-sm font-semibold text-ok',
} as const
