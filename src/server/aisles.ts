import { normalize } from './search.ts'

export type Aisle = 'fruits-legumes' | 'frais' | 'epicerie' | 'autres'

export const AISLE_LABEL: Record<Aisle, string> = {
  'fruits-legumes': 'Fruits et légumes',
  frais: 'Frais',
  epicerie: 'Épicerie',
  autres: 'Autres',
}

// Mots-clés par rayon. Un mot seul est comparé mot à mot (pluriel ignoré) ;
// une expression de plusieurs mots est cherchée dans le nom entier.
const EPICERIE_FIRST = [
  'bouillon',
  'lait de coco',
  'creme de coco',
  'conserve',
  'sauce',
  'huile',
  'vinaigre',
]
const FRAIS = [
  'lait',
  'creme',
  'beurre',
  'fromage',
  'ricotta',
  'parmesan',
  'mozzarella',
  'yaourt',
  'oeuf',
  'jambon',
  'poulet',
  'dinde',
  'boeuf',
  'porc',
  'veau',
  'agneau',
  'saumon',
  'poisson',
  'thon frais',
  'lardon',
  'tofu',
  'feta',
  'chevre',
  'saucisse',
  'steak',
  'viande',
  'crevette',
  'mascarpone',
  'gruyere',
  'emmental',
  'fromage blanc',
]
const FRUITS_LEGUMES = [
  'tomate',
  'courgette',
  'aubergine',
  'poivron',
  'oignon',
  'echalote',
  'ail',
  'carotte',
  'pomme de terre',
  'patate',
  'citron',
  'orange',
  'pomme',
  'banane',
  'poire',
  'fraise',
  'salade',
  'champignon',
  'epinard',
  'poireau',
  'concombre',
  'avocat',
  'persil',
  'coriandre',
  'basilic',
  'menthe',
  'ciboulette',
  'gingembre',
  'brocoli',
  'chou',
  'courge',
  'potiron',
  'haricot vert',
  'celeri',
  'radis',
  'betterave',
  'mais',
  'petit pois',
  'fenouil',
  'mangue',
]
const EPICERIE = [
  'farine',
  'sucre',
  'riz',
  'pate',
  'spaghetti',
  'tagliatelle',
  'penne',
  'semoule',
  'sel',
  'poivre',
  'epice',
  'cumin',
  'paprika',
  'curry',
  'cannelle',
  'origan',
  'thym',
  'moutarde',
  'lentille',
  'pois chiche',
  'chocolat',
  'noisette',
  'amande',
  'noix',
  'miel',
  'levure',
  'cafe',
  'the',
  'stevia',
  'cacahuete',
  'cereale',
  'avoine',
  'herbes de provence',
  'vanille',
  'olive',
  'ketchup',
  'mayonnaise',
]

/** Un mot-clé simple est comparé aux mots du nom ; une expression est cherchée dans le nom. */
function matches(name: string, words: string[], keyword: string): boolean {
  if (keyword.includes(' ')) return name.includes(keyword)
  return words.includes(keyword)
}

/** Devine le rayon d'un ingrédient à partir de son nom (« poivrons rouges » → fruits et légumes). */
export function aisleOf(ingredientName: string): Aisle {
  const name = normalize(ingredientName)
  // Pluriels ignorés : « tomates » → « tomate », « pâtes » → « pate »
  const words = name
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[sx]$/, ''))
  const has = (list: string[]) => list.some((k) => matches(name, words, k))

  if (has(EPICERIE_FIRST)) return 'epicerie'
  if (has(FRAIS)) return 'frais'
  if (has(FRUITS_LEGUMES)) return 'fruits-legumes'
  if (has(EPICERIE)) return 'epicerie'
  return 'autres'
}
