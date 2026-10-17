import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { escapeLike, normalize } from './search.ts'
import {
  JobPatchSchema,
  JobStatusSchema,
  JobStepSchema,
  PlatformSchema,
  RecipeSchema,
  SourceSchema,
  type ImportJob,
  type JobPatch,
  type Recipe,
  type RecipeFilters,
  type RecipeInput,
  type SourceInput,
  type StoredRecipe,
} from './schema.ts'

export const DEFAULT_DB_PATH = 'data/recipes.db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recipes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  data            TEXT    NOT NULL,
  source_url      TEXT,
  source_platform TEXT CHECK (source_platform IN ('instagram','tiktok','youtube','web')),
  source_author   TEXT,
  favorite        INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  search_text     TEXT    NOT NULL DEFAULT '',
  tags_norm       TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_recipes_platform ON recipes (source_platform);
CREATE INDEX IF NOT EXISTS idx_recipes_favorite ON recipes (favorite);

CREATE TABLE IF NOT EXISTS import_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  step          TEXT NOT NULL DEFAULT 'download' CHECK (step IN ('download','transcribe','structure')),
  error_message TEXT,
  recipe_id     INTEGER REFERENCES recipes (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Menu de la semaine : les recettes dont les ingrédients sont dans la liste de courses
CREATE TABLE IF NOT EXISTS shopping_recipes (
  recipe_id INTEGER PRIMARY KEY REFERENCES recipes (id) ON DELETE CASCADE,
  servings  INTEGER NOT NULL CHECK (servings >= 1),
  added_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Articles ajoutés à la main, hors recettes (« papier toilette », « 2 kg de pommes »…)
CREATE TABLE IF NOT EXISTS shopping_extras (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  checked    INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Planning de la semaine, un repas par case (day : 0 = lundi … 6 = dimanche ; l'affichage commence le samedi).
-- Soit une recette de l'app (recipe_id), soit un texte libre (label), jamais les deux.
CREATE TABLE IF NOT EXISTS menu_plan (
  day       INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  meal      TEXT    NOT NULL CHECK (meal IN ('midi','soir')),
  recipe_id INTEGER REFERENCES recipes (id) ON DELETE CASCADE,
  label     TEXT,
  PRIMARY KEY (day, meal),
  CHECK ((recipe_id IS NOT NULL) <> (label IS NOT NULL))
);

-- État des articles de la liste : cochés ou retirés
CREATE TABLE IF NOT EXISTS shopping_items (
  item_key TEXT PRIMARY KEY,
  checked  INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0,1)),
  hidden   INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1))
);
`

let current: Database.Database | null = null

/** Ouvre (et crée si besoin) la base, puis en fait la base courante. */
export function initDb(path: string = process.env.DB_PATH ?? DEFAULT_DB_PATH) {
  current?.close()
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  if (path !== ':memory:') db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  migrate(db)
  current = db
  return db
}

/** Met à niveau une base créée par une ancienne version de l'app, sans perdre de données. */
function migrate(db: Database.Database) {
  // Ancien planning : recipe_id obligatoire et pas de colonne label (repas écrit à la main)
  const columns = db.pragma('table_info(menu_plan)') as { name: string }[]
  if (!columns.some((c) => c.name === 'label')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE menu_plan_new (
          day       INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
          meal      TEXT    NOT NULL CHECK (meal IN ('midi','soir')),
          recipe_id INTEGER REFERENCES recipes (id) ON DELETE CASCADE,
          label     TEXT,
          PRIMARY KEY (day, meal),
          CHECK ((recipe_id IS NOT NULL) <> (label IS NOT NULL))
        );
        INSERT INTO menu_plan_new (day, meal, recipe_id) SELECT day, meal, recipe_id FROM menu_plan;
        DROP TABLE menu_plan;
        ALTER TABLE menu_plan_new RENAME TO menu_plan;
      `)
    })()
  }
}

/** Base courante ; ouverte au premier appel avec le chemin par défaut. */
export function getDb() {
  return current ?? initDb()
}

export function closeDb() {
  current?.close()
  current = null
}

/* ---------- recettes ---------- */

type RecipeRow = {
  id: number
  data: string
  source_url: string | null
  source_platform: string | null
  source_author: string | null
  favorite: number
  created_at: string
}

function toStored(row: RecipeRow): StoredRecipe {
  return {
    id: row.id,
    recipe: RecipeSchema.parse(JSON.parse(row.data)),
    sourceUrl: row.source_url,
    sourcePlatform: row.source_platform
      ? PlatformSchema.parse(row.source_platform)
      : null,
    sourceAuthor: row.source_author,
    favorite: row.favorite === 1,
    createdAt: row.created_at,
  }
}

function indexRecipe(recipe: Recipe) {
  const searchText = normalize(
    [
      recipe.title,
      ...recipe.tags,
      ...recipe.ingredients.map((i) => i.name),
    ].join(' '),
  )
  // Tags entourés de | pour un filtre exact : |vegetarien|rapide|
  const tagsNorm = `|${recipe.tags.map(normalize).join('|')}|`
  return { searchText, tagsNorm }
}

export function createRecipe(
  input: RecipeInput,
  source: SourceInput = {},
): StoredRecipe {
  const recipe = RecipeSchema.parse(input)
  const src = SourceSchema.parse(source)
  const { searchText, tagsNorm } = indexRecipe(recipe)
  const info = getDb()
    .prepare(
      `INSERT INTO recipes (title, data, source_url, source_platform, source_author, search_text, tags_norm)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      recipe.title,
      JSON.stringify(recipe),
      src.url,
      src.platform,
      src.author,
      searchText,
      tagsNorm,
    )
  return getRecipe(Number(info.lastInsertRowid))!
}

export function getRecipe(id: number): StoredRecipe | undefined {
  const row = getDb().prepare('SELECT * FROM recipes WHERE id = ?').get(id) as
    RecipeRow | undefined
  return row ? toStored(row) : undefined
}

/** Remplace le contenu de la recette ; la source et le favori sont conservés. */
export function updateRecipe(
  id: number,
  input: RecipeInput,
): StoredRecipe | undefined {
  const recipe = RecipeSchema.parse(input)
  const { searchText, tagsNorm } = indexRecipe(recipe)
  const info = getDb()
    .prepare(
      'UPDATE recipes SET title = ?, data = ?, search_text = ?, tags_norm = ? WHERE id = ?',
    )
    .run(recipe.title, JSON.stringify(recipe), searchText, tagsNorm, id)
  return info.changes ? getRecipe(id) : undefined
}

export function deleteRecipe(id: number): boolean {
  return getDb().prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0
}

export function setFavorite(
  id: number,
  favorite: boolean,
): StoredRecipe | undefined {
  const info = getDb()
    .prepare('UPDATE recipes SET favorite = ? WHERE id = ?')
    .run(favorite ? 1 : 0, id)
  return info.changes ? getRecipe(id) : undefined
}

export function listRecipes(filters: RecipeFilters = {}): StoredRecipe[] {
  const where: string[] = []
  const params: (string | number)[] = []

  // Chaque mot doit être présent (titre, tags ou ingrédients), sans accents ni casse.
  for (const word of normalize(filters.text ?? '')
    .split(' ')
    .filter(Boolean)) {
    where.push(`search_text LIKE ? ESCAPE '\\'`)
    params.push(`%${escapeLike(word)}%`)
  }
  if (filters.tag) {
    where.push(`tags_norm LIKE ? ESCAPE '\\'`)
    params.push(`%|${escapeLike(normalize(filters.tag))}|%`)
  }
  if (filters.platform) {
    where.push('source_platform = ?')
    params.push(PlatformSchema.parse(filters.platform))
  }
  if (filters.favorite !== undefined) {
    where.push('favorite = ?')
    params.push(filters.favorite ? 1 : 0)
  }

  const sql = `SELECT * FROM recipes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC`
  return (
    getDb()
      .prepare(sql)
      .all(...params) as RecipeRow[]
  ).map(toStored)
}

/* ---------- imports ---------- */

type JobRow = {
  id: number
  url: string
  status: string
  step: string
  error_message: string | null
  recipe_id: number | null
  created_at: string
}

function toJob(row: JobRow): ImportJob {
  return {
    id: row.id,
    url: row.url,
    status: JobStatusSchema.parse(row.status),
    step: JobStepSchema.parse(row.step),
    errorMessage: row.error_message,
    recipeId: row.recipe_id,
    createdAt: row.created_at,
  }
}

export function createJob(url: string): ImportJob {
  const info = getDb()
    .prepare('INSERT INTO import_jobs (url) VALUES (?)')
    .run(url)
  return getJob(Number(info.lastInsertRowid))!
}

export function getJob(id: number): ImportJob | undefined {
  const row = getDb()
    .prepare('SELECT * FROM import_jobs WHERE id = ?')
    .get(id) as JobRow | undefined
  return row ? toJob(row) : undefined
}

export function updateJob(id: number, patch: JobPatch): ImportJob | undefined {
  const p = JobPatchSchema.parse(patch)
  const columns: Record<string, string | number | null | undefined> = {
    status: p.status,
    step: p.step,
    error_message: p.errorMessage,
    recipe_id: p.recipeId,
  }
  const entries = Object.entries(columns).filter(([, v]) => v !== undefined)
  if (!entries.length) return getJob(id)
  const sets = entries.map(([k]) => `${k} = ?`).join(', ')
  const info = getDb()
    .prepare(`UPDATE import_jobs SET ${sets} WHERE id = ?`)
    .run(...entries.map(([, v]) => v as string | number | null), id)
  return info.changes ? getJob(id) : undefined
}
