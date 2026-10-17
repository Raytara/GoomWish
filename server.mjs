// Serveur de production : sert les fichiers de dist/client puis laisse l'app répondre au reste.
// Lancement : npm run build && npm start   (port 3000 par défaut, PORT pour le changer)
import { serve } from 'srvx'
import { serveStatic } from 'srvx/static'
import app from './dist/server/server.js'

// Les clés d'API et le chemin de la base viennent du fichier .env
try {
  process.loadEnvFile()
} catch {
  // pas de fichier .env : on utilise les variables d'environnement
}

serve({
  port: Number(process.env.PORT) || 3000,
  // HOST=127.0.0.1 pour n'accepter que les connexions locales (derrière un tunnel ou un proxy)
  hostname: process.env.HOST || '0.0.0.0',
  middleware: [serveStatic({ dir: './dist/client' })],
  fetch: app.fetch,
})
