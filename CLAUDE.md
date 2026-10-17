# GoomY perso

Application web personnelle (un seul utilisateur) de carnet de recettes.
Je colle un lien Instagram, TikTok ou YouTube, l'app récupère la légende et
l'audio de la vidéo, transcrit l'audio, puis une IA en tire une recette
structurée (ingrédients, étapes, temps, portions).

## Stack
- TypeScript strict, TanStack Start (mode SPA), Vite
- SQLite avec better-sqlite3 (fichier data/recipes.db)
- Zod pour valider toutes les données externes (IA, formulaires)
- yt-dlp et ffmpeg, appelés comme programmes externes
- Pas de comptes utilisateurs, pas de partie communautaire

## Règles
- Je débute en TypeScript : code simple, commenté en français, pas de
  sur-ingénierie, pas de dépendance inutile.
- Le code serveur (base de données, import, IA) reste dans src/server/,
  indépendant de l'interface.
- Ne jamais lancer un programme externe avec une commande en chaîne de
  caractères : utiliser execFile avec un tableau d'arguments.
- Après chaque fonctionnalité : lancer le typage (tsc --noEmit) et les tests.