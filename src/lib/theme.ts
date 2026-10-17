export type Theme = 'light' | 'dark'

export const THEME_KEY = 'goomy-theme'

// Couleurs de fond du design, pour la barre d'état du navigateur
export const THEME_COLOR: Record<Theme, string> = {
  light: '#FBFAF8',
  dark: '#15131A',
}

// Exécuté avant l'hydratation pour éviter le flash : thème enregistré, sinon préférence du système
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'${THEME_COLOR.dark}':'${THEME_COLOR.light}')}catch(e){}})();`

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme])
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // stockage indisponible : le thème reste valable pour la session
  }
}
