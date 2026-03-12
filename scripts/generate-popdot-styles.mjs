import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const TOKENS_PATH = path.join(ROOT_DIR, 'src/ui/typography/popdotTokens.ts')
const GENERATED_DIR = path.join(ROOT_DIR, 'src/styles/generated')

async function loadTokensModule() {
  const source = await fs.readFile(TOKENS_PATH, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
  return import(moduleUrl)
}

function formatShadowText(offsets, fallbackColor) {
  return offsets
    .map((offset) => `${offset}px ${offset}px 0 var(--ui-shadow-color, ${fallbackColor})`)
    .join(', ')
}

function buildFontVariationSettings(axes, includeWght = true) {
  const parts = []
  if (includeWght) parts.push(`"wght" ${axes.wght}`)
  parts.push(`"slnt" ${axes.slnt}`)
  parts.push(`"wdth" ${axes.wdth}`)
  parts.push(`"SQRE" ${axes.SQRE}`)
  return parts.join(', ')
}

function buildBanner(title) {
  return `/* AUTO-GENERATED FILE: ${title}\n * Source: src/ui/typography/popdotTokens.ts\n * Do not edit directly.\n */\n\n`
}

async function writeGeneratedFiles(tokens) {
  await fs.mkdir(GENERATED_DIR, { recursive: true })

  const styleKeys = Object.keys(tokens.POPDOT_STYLE_AXES).sort()
  const fallbackColor = tokens.POPDOT_SHADOW_COLOR_FALLBACK
  const style5Axes = tokens.POPDOT_STYLE_AXES.style5
  const style5WeightRange = tokens.POPDOT_CANVAS_STYLE5_WEIGHT_RANGE

  const fontFacesCss = [
    buildBanner('POPDOT font faces'),
    '@font-face {',
    '  font-family: "popdot";',
    '  src: url("/POPDOTVF.ttf") format("truetype");',
    '  font-display: swap;',
    '}',
    '',
  ]

  for (const key of styleKeys) {
    const axes = tokens.POPDOT_STYLE_AXES[key]
    const styleIndex = key.replace('style', '')
    fontFacesCss.push('@font-face {')
    fontFacesCss.push(`  font-family: "popdot-canvas-style${styleIndex}";`)
    fontFacesCss.push('  src: url("/POPDOTVF.ttf") format("truetype");')
    fontFacesCss.push('  font-display: swap;')
    if (key === 'style5') {
      fontFacesCss.push(`  font-weight: ${style5WeightRange.min} ${style5WeightRange.max};`)
      fontFacesCss.push(`  font-variation-settings: ${buildFontVariationSettings(style5Axes, false)};`)
    } else {
      fontFacesCss.push(`  font-variation-settings: ${buildFontVariationSettings(axes, true)};`)
    }
    fontFacesCss.push('}')
    fontFacesCss.push('')
  }

  const varsCss = [
    buildBanner('POPDOT CSS vars'),
    ':root {',
    `  --ui-shadow-color: ${fallbackColor};`,
    `  --popdot-font-family: ${tokens.POPDOT_TEXT_BASE.fontFamily};`,
    `  --popdot-line-height: ${tokens.POPDOT_TEXT_BASE.lineHeight};`,
    `  --popdot-letter-spacing: ${tokens.POPDOT_TEXT_BASE.letterSpacing};`,
    `  --popdot-font-variant-ligatures: ${tokens.POPDOT_TEXT_BASE.fontVariantLigatures};`,
    `  --popdot-font-feature-settings: ${tokens.POPDOT_TEXT_BASE.fontFeatureSettings};`,
  ]

  for (const key of styleKeys) {
    const styleIndex = key.replace('style', '')
    const axes = tokens.POPDOT_STYLE_AXES[key]
    varsCss.push(`  --popdot-style${styleIndex}-wght: ${axes.wght};`)
    varsCss.push(`  --popdot-style${styleIndex}-slnt: ${axes.slnt};`)
    varsCss.push(`  --popdot-style${styleIndex}-wdth: ${axes.wdth};`)
    varsCss.push(`  --popdot-style${styleIndex}-sqre: ${axes.SQRE};`)
  }

  for (const size of [2, 4, 8, 12, 16]) {
    const offsets = tokens.resolvePopdotShadowOffsets(size)
    varsCss.push(`  --popdot-shadow-${size}: ${formatShadowText(offsets, fallbackColor)};`)
  }
  varsCss.push('}')
  varsCss.push('')

  const utilitiesCss = [
    buildBanner('POPDOT utility classes'),
    '.popdot-text-base {',
    '  font-family: var(--popdot-font-family);',
    '  line-height: var(--popdot-line-height);',
    '  letter-spacing: var(--popdot-letter-spacing);',
    '  font-variant-ligatures: var(--popdot-font-variant-ligatures);',
    '  font-feature-settings: var(--popdot-font-feature-settings);',
    '}',
    '',
  ]

  for (const key of styleKeys) {
    const styleIndex = key.replace('style', '')
    utilitiesCss.push(`.popdot-style-${styleIndex} {`)
    utilitiesCss.push(
      `  font-variation-settings: "wght" var(--popdot-style${styleIndex}-wght), ` +
      `"slnt" var(--popdot-style${styleIndex}-slnt), "wdth" var(--popdot-style${styleIndex}-wdth), "SQRE" var(--popdot-style${styleIndex}-sqre);`,
    )
    utilitiesCss.push(`  font-weight: var(--popdot-style${styleIndex}-wght);`)
    utilitiesCss.push('}')
    utilitiesCss.push('')
  }

  for (const size of [2, 4, 8, 12, 16]) {
    utilitiesCss.push(`.popdot-shadow-${size} {`)
    utilitiesCss.push(`  text-shadow: var(--popdot-shadow-${size});`)
    utilitiesCss.push('}')
    utilitiesCss.push('')
  }

  const utilitiesScss = [
    buildBanner('POPDOT utility mixins + classes'),
    '@mixin popdot-text-base {',
    '  font-family: var(--popdot-font-family);',
    '  line-height: var(--popdot-line-height);',
    '  letter-spacing: var(--popdot-letter-spacing);',
    '  font-variant-ligatures: var(--popdot-font-variant-ligatures);',
    '  font-feature-settings: var(--popdot-font-feature-settings);',
    '}',
    '',
    '@mixin popdot-style($style-index) {',
    '  font-variation-settings: "wght" var(--popdot-style#{$style-index}-wght), "slnt" var(--popdot-style#{$style-index}-slnt), "wdth" var(--popdot-style#{$style-index}-wdth), "SQRE" var(--popdot-style#{$style-index}-sqre);',
    '  font-weight: var(--popdot-style#{$style-index}-wght);',
    '}',
    '',
    '@mixin popdot-shadow($size) {',
    '  text-shadow: var(--popdot-shadow-#{$size});',
    '}',
    '',
    '.popdot-text-base {',
    '  @include popdot-text-base;',
    '}',
    '',
  ]

  for (const key of styleKeys) {
    const styleIndex = key.replace('style', '')
    utilitiesScss.push(`.popdot-style-${styleIndex} {`)
    utilitiesScss.push(`  @include popdot-style(${styleIndex});`)
    utilitiesScss.push('}')
    utilitiesScss.push('')
  }

  for (const size of [2, 4, 8, 12, 16]) {
    utilitiesScss.push(`.popdot-shadow-${size} {`)
    utilitiesScss.push(`  @include popdot-shadow(${size});`)
    utilitiesScss.push('}')
    utilitiesScss.push('')
  }

  await fs.writeFile(path.join(GENERATED_DIR, 'popdot-fontfaces.css'), fontFacesCss.join('\n'))
  await fs.writeFile(path.join(GENERATED_DIR, 'popdot-vars.css'), varsCss.join('\n'))
  await fs.writeFile(path.join(GENERATED_DIR, 'popdot-utilities.css'), utilitiesCss.join('\n'))
  await fs.writeFile(path.join(GENERATED_DIR, 'popdot-utilities.scss'), utilitiesScss.join('\n'))
}

const tokens = await loadTokensModule()
await writeGeneratedFiles(tokens)
console.log('Generated POPDOT style artifacts in src/styles/generated')

