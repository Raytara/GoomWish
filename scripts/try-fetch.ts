// Essai à la main : npm run try-fetch -- <url>
import {
  cleanupSource,
  fetchSource,
  FetchSourceError,
} from '../src/server/fetchSource.ts'

const url = process.argv[2]
if (!url) {
  console.error(
    'Usage : npm run try-fetch -- <url instagram | tiktok | youtube>',
  )
  process.exit(1)
}

try {
  const source = await fetchSource(url)
  console.log(source)
  // Le fichier existe encore ici : tu peux l'écouter avant la suppression.
  await cleanupSource(source)
  console.log('Dossier temporaire supprimé.')
} catch (err) {
  if (err instanceof FetchSourceError) {
    console.error(`Erreur (${err.code}) : ${err.message}`)
  } else {
    console.error(err)
  }
  process.exit(1)
}
