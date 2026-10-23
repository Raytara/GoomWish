// Prépare une photo avant l'envoi : les photos de téléphone font plusieurs Mo,
// on les réduit pour que l'envoi soit rapide et accepté par l'API.

/** Côté le plus long conservé : assez pour lire une écriture manuscrite. */
const MAX_SIDE = 2000

/** Réduit la photo et la renvoie en JPEG encodé « data:image/jpeg;base64,… ». */
export async function photoToDataUrl(file: File): Promise<string> {
  // createImageBitmap applique aussi l'orientation de la photo (téléphone tenu à l'horizontale)
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.fillStyle = '#fff' // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
