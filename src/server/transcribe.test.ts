import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { transcribeAudio } from './transcribe'

describe('transcribeAudio (API mockée)', () => {
  const base = join(process.cwd(), 'node_modules', '.cache')
  let dir: string
  let audio: string
  const savedEnv = { ...process.env }

  beforeAll(() => {
    mkdirSync(base, { recursive: true })
    dir = mkdtempSync(join(base, 'fake-audio-'))
    audio = join(dir, 'audio.mp3')
    writeFileSync(audio, 'faux mp3')
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })
  beforeEach(() => {
    process.env.STT_API_KEY = 'cle-stt'
    process.env.STT_BASE_URL = 'https://stt.exemple.test/v1'
    process.env.STT_MODEL = 'whisper-test'
    process.env.STT_LANGUAGE = 'fr'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...savedEnv }
  })

  it('envoie le fichier et renvoie le texte transcrit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('  Bonjour, on fait des pâtes.\n'))
    vi.stubGlobal('fetch', fetchMock)

    expect(await transcribeAudio(audio)).toBe('Bonjour, on fait des pâtes.')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://stt.exemple.test/v1/audio/transcriptions')
    expect(init.headers.Authorization).toBe('Bearer cle-stt')
    const form = init.body as FormData
    expect(form.get('model')).toBe('whisper-test')
    expect(form.get('language')).toBe('fr')
    expect(form.get('response_format')).toBe('text')
    expect((form.get('file') as File).name).toBe('audio.mp3')
  })

  it("renvoie une chaîne vide quand il n'y a pas de parole", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')))
    expect(await transcribeAudio(audio)).toBe('')
  })

  it('demande la clé quand elle est absente, sans appeler le réseau', async () => {
    delete process.env.STT_API_KEY
    delete process.env.GROQ_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(transcribeAudio(audio)).rejects.toThrow(/GROQ_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explique une clé refusée et une API injoignable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    )
    await expect(transcribeAudio(audio)).rejects.toThrow(/GROQ_API_KEY/)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    )
    await expect(transcribeAudio(audio)).rejects.toThrow(
      /Impossible de joindre/,
    )
  })
})
