import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  classifyYtdlpError,
  cleanupSource,
  detectPlatform,
  fetchSource,
  FetchSourceError,
} from './fetchSource'

describe('detectPlatform', () => {
  it('accepte les 4 domaines et leurs sous-domaines', () => {
    expect(detectPlatform('https://www.instagram.com/reel/abc/')).toBe(
      'instagram',
    )
    expect(detectPlatform('https://vm.tiktok.com/xyz')).toBe('tiktok')
    expect(detectPlatform('https://www.youtube.com/watch?v=1')).toBe('youtube')
    expect(detectPlatform('https://m.youtube.com/watch?v=1')).toBe('youtube')
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube')
  })

  it('refuse les autres sites et les faux domaines', () => {
    for (const bad of [
      'https://example.com/video',
      'https://monfauxinstagram.com/x',
      'https://instagram.com.evil.fr/x',
      'https://evil.fr/?u=https://youtube.com',
    ]) {
      expect(() => detectPlatform(bad)).toThrow(/non pris en charge/)
    }
  })

  it("refuse ce qui n'est pas une URL web", () => {
    expect(() => detectPlatform('pas un lien')).toThrow(FetchSourceError)
    expect(() => detectPlatform('file:///etc/passwd')).toThrow(FetchSourceError)
    expect(() => detectPlatform('ftp://youtube.com/x')).toThrow(
      FetchSourceError,
    )
  })
})

describe('classifyYtdlpError', () => {
  const make = (props: object) =>
    Object.assign(new Error('Command failed'), props)

  it('distingue les erreurs principales', () => {
    expect(classifyYtdlpError(make({ code: 'ENOENT' })).code).toBe(
      'TOOL_MISSING',
    )
    expect(classifyYtdlpError(make({ killed: true })).code).toBe('TIMEOUT')
    expect(
      classifyYtdlpError(
        make({ stderr: 'ERROR: ffprobe and ffmpeg not found' }),
      ).code,
    ).toBe('TOOL_MISSING')
    expect(
      classifyYtdlpError(make({ stderr: 'ERROR: [Instagram] Login required' }))
        .code,
    ).toBe('PRIVATE_OR_LOGIN')
    expect(
      classifyYtdlpError(
        make({ stderr: 'ERROR: Video unavailable. This video is private' }),
      ).code,
    ).toBe('PRIVATE_OR_LOGIN')
    expect(
      classifyYtdlpError(
        make({ stderr: 'ERROR: Unsupported URL: https://www.tiktok.com/' }),
      ).code,
    ).toBe('UNSUPPORTED_URL')
    const other = classifyYtdlpError(make({ stderr: 'ERROR: boom' }))
    expect(other.code).toBe('FAILED')
    expect(other.message).toContain('boom')
  })

  it('suggère de coller la légende pour une vidéo privée', () => {
    expect(
      classifyYtdlpError(make({ stderr: 'Login required' })).message,
    ).toMatch(/légende/)
  })
})

// Faux yt-dlp : un script qui imite --dump-json et -x, pour tester sans réseau.
describe('fetchSource (faux yt-dlp)', () => {
  const base = join(process.cwd(), 'node_modules', '.cache')
  let dir: string
  const saved = { ...process.env }

  beforeAll(() => {
    mkdirSync(base, { recursive: true })
    dir = mkdtempSync(join(base, 'fake-ytdlp-'))
    const script = `#!/bin/bash
case "$*" in
  *--dump-json*)
    case "$*" in
      *private*) echo "ERROR: [Instagram] Login required" >&2; exit 1 ;;
      *long*) echo '{"title":"Long","duration":901}' ;;
      *nocaption*) echo '{"title":"Sans légende","uploader":"lou","duration":42.4}' ;;
      *) echo '{"title":"Pâtes","description":"Recette en légende","uploader":"lou","duration":60}' ;;
    esac ;;
  *)
    out=""; prev=""
    for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
    case "$*" in *failaudio*) echo "ERROR: boom" >&2; exit 1 ;; esac
    echo fake > "\${out/%.%(ext)s/.mp3}" ;;
esac
`
    writeFileSync(join(dir, 'yt-dlp'), script)
    chmodSync(join(dir, 'yt-dlp'), 0o755)
  })
  afterEach(() => {
    process.env = { ...saved, YTDLP_BIN: join(dir, 'yt-dlp') }
  })
  afterAll(() => {
    process.env = saved
    rmSync(dir, { recursive: true, force: true })
  })
  const use = () => {
    process.env.YTDLP_BIN = join(dir, 'yt-dlp')
  }

  it('renvoie les infos et un audio, puis nettoie', async () => {
    use()
    const s = await fetchSource('https://www.tiktok.com/@lou/video/1')
    expect(s).toMatchObject({
      platform: 'tiktok',
      author: 'lou',
      title: 'Pâtes',
      caption: 'Recette en légende',
      durationSeconds: 60,
    })
    expect(existsSync(s.audioPath)).toBe(true)
    expect(s.audioPath).toMatch(/^tmp\/[0-9a-f-]+\/audio\.mp3$/)
    await cleanupSource(s)
    expect(existsSync(s.audioPath)).toBe(false)
  })

  it('renvoie une légende vide sans erreur', async () => {
    use()
    const s = await fetchSource('https://www.youtube.com/watch?v=nocaption')
    expect(s.caption).toBe('')
    expect(s.durationSeconds).toBe(42)
    await cleanupSource(s)
  })

  it('refuse une vidéo de plus de 15 minutes', async () => {
    use()
    await expect(
      fetchSource('https://www.youtube.com/watch?v=long'),
    ).rejects.toMatchObject({ code: 'TOO_LONG' })
  })

  it('signale une vidéo privée', async () => {
    use()
    await expect(
      fetchSource('https://www.instagram.com/p/private/'),
    ).rejects.toMatchObject({
      code: 'PRIVATE_OR_LOGIN',
    })
  })

  it("supprime le dossier si le téléchargement de l'audio échoue", async () => {
    use()
    await expect(
      fetchSource('https://www.youtube.com/watch?v=failaudio'),
    ).rejects.toMatchObject({ code: 'FAILED' })
  })

  it('signale yt-dlp introuvable', async () => {
    process.env.YTDLP_BIN = join(dir, 'nexiste-pas')
    await expect(fetchSource('https://youtu.be/abc')).rejects.toMatchObject({
      code: 'TOOL_MISSING',
    })
  })

  it("n'appelle pas yt-dlp pour une URL refusée", async () => {
    process.env.YTDLP_BIN = join(dir, 'nexiste-pas')
    await expect(fetchSource('https://example.com/v')).rejects.toMatchObject({
      code: 'UNSUPPORTED_URL',
    })
  })
})
