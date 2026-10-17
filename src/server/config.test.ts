import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { llmConfig, sttConfig } from './config'

const savedEnv = { ...process.env }
const VARS = [
  'GROQ_API_KEY',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'LLM_EXTRA_BODY',
  'STT_API_KEY',
  'STT_BASE_URL',
  'STT_MODEL',
  'STT_LANGUAGE',
]

beforeEach(() => {
  for (const v of VARS) delete process.env[v]
})
afterEach(() => {
  process.env = { ...savedEnv }
})

describe('configuration des API', () => {
  it('une seule clé Groq sert aux deux étapes, avec les réglages Groq par défaut', () => {
    process.env.GROQ_API_KEY = 'gsk-test'
    expect(llmConfig()).toMatchObject({
      apiKey: 'gsk-test',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-120b',
      extraBody: {},
    })
    expect(sttConfig()).toMatchObject({
      apiKey: 'gsk-test',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'whisper-large-v3-turbo',
      language: 'fr',
    })
  })

  it('les clés spécifiques ont priorité sur GROQ_API_KEY', () => {
    process.env.GROQ_API_KEY = 'gsk-test'
    process.env.LLM_API_KEY = 'autre-cle-llm'
    expect(llmConfig().apiKey).toBe('autre-cle-llm')
    expect(sttConfig().apiKey).toBe('gsk-test')
  })

  it("réclame GROQ_API_KEY quand aucune clé n'est définie", () => {
    expect(() => llmConfig()).toThrow(/GROQ_API_KEY/)
    expect(() => sttConfig()).toThrow(/GROQ_API_KEY/)
  })

  it("refuse un LLM_EXTRA_BODY qui n'est pas du JSON", () => {
    process.env.GROQ_API_KEY = 'gsk-test'
    process.env.LLM_EXTRA_BODY = '{pas du json'
    expect(() => llmConfig()).toThrow(/LLM_EXTRA_BODY/)
  })
})
