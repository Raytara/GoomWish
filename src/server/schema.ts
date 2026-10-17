import { z } from 'zod'

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'web'] as const
export const JOB_STATUSES = ['pending', 'running', 'done', 'error'] as const
export const JOB_STEPS = ['download', 'transcribe', 'structure'] as const

export const PlatformSchema = z.enum(PLATFORMS)
export const JobStatusSchema = z.enum(JOB_STATUSES)
export const JobStepSchema = z.enum(JOB_STEPS)

export const IngredientSchema = z.object({
  quantity: z.number().nonnegative().nullable(),
  unit: z.string().default(''),
  name: z.string().trim().min(1),
  note: z.string().default(''),
})

export const RecipeSchema = z.object({
  title: z.string().trim().min(1),
  servings: z.number().int().min(1),
  prepMinutes: z.number().int().nonnegative().nullable(),
  cookMinutes: z.number().int().nonnegative().nullable(),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string().trim().min(1)),
  tips: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
})

export const SourceSchema = z.object({
  url: z.string().nullable().default(null),
  platform: PlatformSchema.nullable().default(null),
  author: z.string().nullable().default(null),
})

export type Ingredient = z.output<typeof IngredientSchema>
export type Recipe = z.output<typeof RecipeSchema>
export type RecipeInput = z.input<typeof RecipeSchema>
export type Source = z.output<typeof SourceSchema>
export type SourceInput = z.input<typeof SourceSchema>
export type Platform = z.infer<typeof PlatformSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type JobStep = z.infer<typeof JobStepSchema>

export type StoredRecipe = {
  id: number
  recipe: Recipe
  sourceUrl: string | null
  sourcePlatform: Platform | null
  sourceAuthor: string | null
  favorite: boolean
  createdAt: string
}

export type ImportJob = {
  id: number
  url: string
  status: JobStatus
  step: JobStep
  errorMessage: string | null
  recipeId: number | null
  createdAt: string
}

export const JobPatchSchema = z.object({
  status: JobStatusSchema.optional(),
  step: JobStepSchema.optional(),
  errorMessage: z.string().nullable().optional(),
  recipeId: z.number().int().nullable().optional(),
})
export type JobPatch = z.infer<typeof JobPatchSchema>

export type RecipeFilters = {
  /** Texte libre : cherche dans le titre, les tags et les ingrédients. */
  text?: string
  tag?: string
  platform?: Platform
  favorite?: boolean
}
