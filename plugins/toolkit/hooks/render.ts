/**
 * A node script that draws mermaid diagrams without a browser: beautiful-mermaid lays each one out
 * as SVG and resvg turns it into a transparent PNG, once per theme.
 *
 * Usage: `node render.mjs <renderer dir> (<input.mmd> <out prefix>)...`. For each pair it writes
 * `<out>-light.png`, `<out>-dark.png`, a `-full.png` of each on its theme's background, then
 * `<out>.json` with both sizes. The JSON comes last, so a
 * run cut short leaves nothing to reuse. A diagram it cannot draw ends the run: exit 1, the reason
 * on stderr.
 */
export const RENDER_MJS = `import { execFileSync } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// mask paints behind edge labels, so lines do not run through them.
const THEMES = {
  light: { text: '#1F1F1F', muted: '#6B6B6B', line: '#9A9A9A', border: '#C4C4C4', accent: '#D77757', mask: '#FFFFFF' },
  dark: { text: '#E4E4E4', muted: '#9A9A9A', line: '#7A7A7A', border: '#4A4A4A', accent: '#D77757', mask: '#1E1E1E' },
}

// resvg reads neither CSS variables nor color-mix, so each theme's colors are written in.
const flatten = (svg, t) => {
  const colors = {
    '--bg': 'none', '--fg': t.text, '--_text': t.text, '--_text-sec': t.muted, '--_text-muted': t.muted, '--_text-faint': t.muted,
    '--_line': t.line, '--_arrow': t.accent, '--_node-fill': 'none', '--_node-stroke': t.border, '--_group-fill': 'none',
    '--_group-hdr': 'none', '--_inner-stroke': t.border, '--_key-badge': t.border,
  }
  return svg
    .replace(/@import[^;]+;/g, '')
    .replace(/<style>[\\s\\S]*?<\\/style>/, '<style>text { font-family: Inter, "Noto Sans", sans-serif; }</style>')
    .replace(/background:var\\(--bg\\)/, '')
    .replace(/fill="var\\(--bg\\)"/g, \`fill="\${t.mask}"\`)
    .replace(/var\\((--[\\w-]+)[^)]*\\)/g, (all, name) => colors[name] ?? all)
}

// fontconfig answers its closest sans when Noto Sans is not installed; macOS has no fontconfig.
const sans = () => {
  try {
    return execFileSync('fc-match', ['-f', '%{family[0]}', 'Noto Sans'], { encoding: 'utf8' }).trim() || 'Noto Sans'
  } catch {
    return process.platform === 'darwin' ? 'Helvetica' : 'Noto Sans'
  }
}

try {
  const [pkgs, ...jobs] = process.argv.slice(2)
  const { renderMermaid } = await import(pathToFileURL(\`\${pkgs}/node_modules/beautiful-mermaid/dist/index.js\`).href)
  const { Resvg } = createRequire(\`\${pkgs}/package.json\`)('@resvg/resvg-js')
  const family = sans()
  const font = { loadSystemFonts: true, sansSerifFamily: family, defaultFontFamily: family }
  for (let i = 0; i + 1 < jobs.length; i += 2) {
    const out = jobs[i + 1]
    const svg = await renderMermaid(readFileSync(jobs[i], 'utf8'))
    const sizes = {}
    for (const [theme, colors] of Object.entries(THEMES)) {
      const flat = flatten(svg, colors)
      const png = new Resvg(flat, { fitTo: { mode: 'zoom', value: 2 }, font }).render()
      writeFileSync(\`\${out}-\${theme}.part.png\`, png.asPng())
      renameSync(\`\${out}-\${theme}.part.png\`, \`\${out}-\${theme}.png\`)
      // An image viewer draws transparency as white or a checkerboard, so the copy opened at full
      // size gets the theme's own background.
      const full = new Resvg(flat, { fitTo: { mode: 'zoom', value: 2 }, background: colors.mask, font }).render()
      writeFileSync(\`\${out}-\${theme}-full.part.png\`, full.asPng())
      renameSync(\`\${out}-\${theme}-full.part.png\`, \`\${out}-\${theme}-full.png\`)
      sizes[theme] = { width: png.width, height: png.height }
    }
    writeFileSync(\`\${out}.json\`, JSON.stringify(sizes))
  }
} catch (err) {
  process.stderr.write(String(err?.message ?? err).split('\\n')[0] + '\\n')
  process.exit(1)
}
`
