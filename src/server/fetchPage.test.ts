import { describe, expect, it } from 'vitest'
import { extractRecipeText, htmlToText, isPrivateIp } from './fetchPage'

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '192.168.1.20',
    '172.16.0.1',
    '172.31.255.1',
    '169.254.169.254',
    '100.100.1.1',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fd12::1',
    '::ffff:192.168.1.1',
  ])('%s est privée', (ip) => expect(isPrivateIp(ip)).toBe(true))

  it.each(['8.8.8.8', '172.32.0.1', '151.101.1.1', '2606:4700::1111'])(
    '%s est publique',
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  )
})

describe('extractRecipeText', () => {
  it('utilise les données schema.org/Recipe (dans un @graph)', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Un site' },
        {
          '@type': ['Recipe'],
          name: 'Tarte aux pommes',
          recipeYield: ['6', '6 parts'],
          prepTime: 'PT20M',
          cookTime: 'PT1H5M',
          recipeIngredient: ['3 pommes', '1 pâte brisée'],
          recipeInstructions: [
            { '@type': 'HowToStep', text: 'Éplucher les pommes.' },
            {
              '@type': 'HowToSection',
              itemListElement: [{ '@type': 'HowToStep', text: 'Cuire.' }],
            },
          ],
        },
      ],
    }
    const html = `<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`
    const { title, text } = extractRecipeText(html)
    expect(title).toBe('Tarte aux pommes')
    expect(text).toContain('Préparation : 20 min')
    expect(text).toContain('Cuisson : 1 h 5 min')
    expect(text).toContain('- 3 pommes')
    expect(text).toContain('1. Éplucher les pommes.')
    expect(text).toContain('2. Cuire.')
  })

  it('ignore un JSON-LD invalide et retombe sur le texte de la page', () => {
    const html = `<html><title>Ma soupe &amp; moi</title>
      <script type="application/ld+json">{ pas du json</script>
      <body><nav>Menu</nav><article><h1>Soupe</h1><p>Couper les carottes.</p></article></body></html>`
    const { title, text } = extractRecipeText(html)
    expect(title).toBe('Ma soupe & moi')
    expect(text).toBe('Soupe\nCouper les carottes.')
  })
})

describe('htmlToText', () => {
  it('retire scripts, styles et balises, et décode les entités', () => {
    const html =
      '<style>p{}</style><script>alert(1)</script><p>1&nbsp;&#233;uf &lt;frais&gt;</p><p>Sel</p>'
    expect(htmlToText(html)).toBe('1 éuf <frais>\nSel')
  })
})
