# Research: inline progress bars in terminal UIs

Question: how do well-regarded TUIs draw small one-row bars that read as a bar, and what should
session-bar's 5h/7d/ctx pills use instead of the current eighth-block bar?

Checked 2026-10-03 against source on each project's default branch. Glyph facts for Ghostty were also
checked locally with `ghostty +show-face --cp=0x…` on Ghostty 1.3.1 (the user's terminal).

## Recommendation for session-bar

**Why the current bar fails.** In `meter()`/`bar()` (`plugins/session-bar/hooks/register.tsx`) every bar
cell is an eighth block on a `#2F3540` track background. Background color always covers the full cell
height, and Ghostty draws block elements as sprites that also cover the full cell height
([block.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/block.zig)). So the
"bar" is exactly as tall as the pill around it. The eye reads it as a dark box sitting in a slightly
lighter box (track vs. pill contrast is 1.63:1), not as a line with a length. The pace `│` takes a
whole cell and swaps that cell's background, which cuts the bar in two. A bar only reads as a bar
when it is thinner than its container and runs as one continuous stroke. Every tool below that sits a
bar inside other chrome does this: rich, ratatui `LineGauge`, and the Fira Code progress glyphs.

**Use the rich / `LineGauge` line style, drawn on the pill background with no track background:**

| Part | Glyph | fg | bg |
|---|---|---|---|
| used, full cell | `━` U+2501 HEAVY HORIZONTAL | pill fg (`#F3F4F6` on slate) | pill bg |
| used, ends mid-cell | `╸` U+2578 HEAVY LEFT | pill fg | pill bg |
| first remaining cell when used ends on a cell edge | `╺` U+257A HEAVY RIGHT (makes a half-cell gap, as rich does) | remaining color | pill bg |
| remaining | `━` | remaining color = 40 % of the way from pill bg to pill fg (`#8E959E` on slate) | pill bg |
| pace tick (one cell) | `┿` U+253F (heavy horizontal, light vertical); use `╋` U+254B if the light stroke is too faint | accent (`#93C5FD` on slate; `#FFFFFF` on the orange/vermillion pills) | pill bg |

- Never set a background on bar cells other than the pill's own. Then the terminal's light/dark
  background never touches the bar. Only the pill edge meets the terminal: slate `#4B5563` against
  white is 7.56:1 and against `#1E1E1E` it is 2.21:1. All ratios here are WCAG ratios that I
  computed myself.
- Contrast on each pill. The ratios are bg vs. used / bg vs. remaining / used vs. remaining:
  - slate: 6.87 / 2.50 / 2.75
  - warn `#E69F00`+`#191919`: 7.81 / 2.18 (`#94690A`) / 3.59
  - strong `#D55E00`+`#191919`: 4.55 / 1.90 (`#8A420A`) / 2.40
  - hot `#D55E00`+`#FFFFFF`: 3.87 / 1.74 (`#E69E66`) / 2.22
- The accent `#93C5FD` is 4.19:1 on slate. The current `#60A5FA` is only 2.97:1.
- Resolution: use half cells, as rich does (16 steps over 8 cells). Drop the eighths. The pace tick
  works at whole-cell resolution (`min(7, floor(pace*8))`), and the tick wins if it lands on the gap
  cell.
- Use a solid fill, not a gradient. The pill already changes color at thresholds, and a gradient over
  8 cells only adds noise (see btop/bubbles below).
- Every glyph above is in U+2500–U+257F, which Ghostty draws itself as pixel-aligned sprites. Strokes
  meet seamlessly from cell to cell, whatever the font. Heavy = 2× the base box thickness
  ([common.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/common.zig)), and
  the user can thicken it with Ghostty's
  [`adjust-box-thickness`](https://ghostty.org/docs/config/reference).

**Example: 23 % used, pace 50 %, 8 cells.** Used halves = round(0.23 × 16) = 4, so 2 full cells. The
pace cell is floor(0.5 × 8) = 4.

```
━━╺━┿━━━
^^            used        fg #F3F4F6
  ^^          remaining   fg #8E959E  (cell 2 is ╺: a half-cell gap after the fill)
    ^         pace tick   fg #93C5FD
     ^^^      remaining   fg #8E959E
all cells bg = #4B5563 (pill)
```

For an odd number of halves (30 %: 5 halves) the fill ends with `╸` and the remainder starts with a
plain `━`: `━━╸━┿━━━`. When used is past pace (overrun), the tick lands inside the fill and stays
visible through its color.

**Alternative, if a chunkier "capsule" bar is wanted:** use the Fira Code progress glyphs U+EE00–EE05.
Ghostty 1.3.1 resolves them from its embedded "Symbols Nerd Font" (checked locally). They read
strongly as a progress bar, but they have whole-cell resolution only, no glyph for a marker, and they
are font glyphs rather than sprites. A pace tick would have to be a recolored cell. This is a second
choice.

## Findings per tool

### ratatui `Gauge` and `LineGauge`
Source: [ratatui-widgets/src/gauge.rs](https://github.com/ratatui/ratatui/blob/main/ratatui-widgets/src/gauge.rs)

- **`Gauge` (block style).** It fills cells with `symbols::block::FULL` (`█`), using `gauge_style.fg`
  as fg and `gauge_style.bg` as bg. With `use_unicode(true)` the last cell gets an eighth block chosen
  by `(frac * 8.0).round()` (`get_unicode_block`). The docs call this "8 extra fractional parts per
  cell".
- **`Gauge` label.** The label is centered. On filled cells under the label, the code draws a space
  with fg and bg swapped. The source comment says: "the background and foreground colors are swapped
  for the label part, otherwise the gauge will be inverted".
- **`Gauge` purpose.** It is a full-area block gauge, meant to be the container, not to sit inside one.
- **`LineGauge`.** The defaults are `filled_symbol: symbols::line::HORIZONTAL` and
  `unfilled_symbol: symbols::line::HORIZONTAL` (`─`). `filled_style`/`unfilled_style` default to
  `Style::default()`, so the two parts differ only by the style you give them. The doc example uses
  `.filled_symbol(symbols::line::THICK_HORIZONTAL)` (`━`) with
  `.filled_style(Style::new().white().on_black().bold())`.
- **`LineGauge` label.** The label is left-aligned before the line, not overlaid. The tests also
  exercise `▰`/`▱` as symbols.
- **Second marker.** Neither widget has one.

### Charm `bubbles/progress`
Source: [progress/progress.go](https://github.com/charmbracelet/bubbles/blob/master/progress/progress.go)

- Default full char is `DefaultFullCharHalfBlock = '▌'`, with an alternative `'█'`. Default empty char
  is `DefaultEmptyCharBlock = '░'`.
- Default colors are `defaultFullColor = "#7571F9"` and `defaultEmptyColor = "#606060"`, a mid grey
  that works on both light and dark terminals.
- Gradient: `WithDefaultBlend()` runs `#5A56E0` → `#EE6FF8` via `lipgloss.Blend1D`. It is optionally
  scaled to the filled part only (`scaleBlend`).
- The `▌` half block is used so one cell can carry two gradient stops: fg = `blend[i]`,
  bg = `blend[i+1]`. The source comment says it "allows more granular color blending control".
- Whole-cell resolution. The percentage is appended as text (`" %3.0f%%"`), not overlaid. There is no
  second marker.
- `░` is a font glyph, and its dot pattern varies by font.

### Python `rich` ProgressBar
Source: [rich/progress_bar.py](https://github.com/Textualize/rich/blob/master/rich/progress_bar.py),
styles in [rich/default_styles.py](https://github.com/Textualize/rich/blob/master/rich/default_styles.py)

- The bar is `"━"` (ASCII fallback `"-"`), with `half_bar_right = "╸"` and `half_bar_left = "╺"`.
- `complete_halves = int(width * 2 * completed / total)`, so it has half-cell resolution.
- Complete part: `━` × full cells, then `╸` if the count of halves is odd.
- Remaining part: the same `━` in the back style. When the fill ended on a cell edge, the remainder
  starts with `╺`: `if not half_bar_count and bar_count: yield _Segment(half_bar_left, style)`. So
  there is always a half-cell gap between used and remaining.
- Colors are foreground only, with no background:
  - `bar.back` = `grey23`
  - `bar.complete` = `rgb(249,38,114)`
  - `bar.finished` = `rgb(114,156,31)`
  - `bar.pulse` = `rgb(249,38,114)`
- The remaining part is drawn only when color is available (`if not console.no_color`).
- There is no second marker.

### btop
Sources: [src/btop_draw.cpp](https://github.com/aristocratos/btop/blob/main/src/btop_draw.cpp),
[src/btop_theme.cpp](https://github.com/aristocratos/btop/blob/main/src/btop_theme.cpp)

- `Symbols::meter = "■"`. `Meter::operator()` paints each filled cell with
  `Theme::g(color_gradient).at(y)` at that cell's position. Unfilled cells repeat `■` in `meter_bg`.
- The default theme has `"meter_bg", "#40"` (grey 0x40) and `cpu_start/mid/end` =
  `#77ca9b`/`#cbc06c`/`#dc4c4c`. Gradients are 101 steps.
- The gradient encodes position, so a 30 % bar only ever shows the green end.
- If a theme has no `meter_bg`, it falls back to `inactive_fg`.
- Fill is foreground only, at whole-cell resolution. There is no second marker.
- `■` is a font glyph with side bearings, so there are visible gaps between cells. That is btop's
  "segmented" look.

### htop
Source: [Meter.c](https://github.com/htop-dev/htop/blob/main/Meter.c) (`BarMeterMode_draw`)

- The bar is framed by `[` and `]` and filled with `|`. Monochrome schemes use `"|#*@$%&."`, one
  character per item.
- The value text is right-aligned inside the bar. The source comment: "The text in the bar is right
  aligned".
- The unfilled area takes the `BAR_SHADOW` color.
- **Several values on one bar** are drawn as consecutive segments, each in its own color
  (`blockSizes[i] = ceil((value / total) * w)`). This stacked-segment approach is how htop puts
  used/buffers/cache on one row.
- The graph mode uses braille (`GraphMeterMode_dotsUtf8`).

### bottom (btm)
Source: [src/canvas/components/pipe_gauge.rs](https://github.com/ClementTsang/bottom/blob/main/src/canvas/components/pipe_gauge.rs)

- htop-style `[|||   50%]`. `BarType::Pipe` (`|`), `Block` (`█` + fractional blocks) and `Square`
  (`■`) are available.
- The label is right-aligned inside the bar.
- `gauge_style` has its background removed for the bar. The source carries
  `FIXME: '[' and ']' don't look that great with block bars`, which is an admission that full-height
  blocks clash with surrounding chrome.

### Fira Code / Nerd Fonts progress glyphs (U+EE00–EE0B)
- Fira Code 6.0 changelog: "Added U+EE00..U+EE0B Progress Bar"
  ([CHANGELOG.md](https://github.com/tonsky/FiraCode/blob/master/CHANGELOG.md)).
- The README lists Ghostty under "works"
  ([README.md](https://github.com/tonsky/FiraCode/blob/master/README.md)).
- Names, from [glyphnames.json](https://github.com/ryanoasis/nerd-fonts/blob/master/glyphnames.json):
  - `extra-progress_empty_left/mid/right` = EE00/EE01/EE02
  - `extra-progress_full_left/mid/right` = EE03/EE04/EE05
  - `extra-progress_spinner_1..6` = EE06–EE0B
- Nerd Fonts patches them from `extraglyphs.sfd` as the "Progress Indicators" set, under
  `basics_enabled` ([font-patcher](https://github.com/ryanoasis/nerd-fonts/blob/master/font-patcher);
  [Glyph Sets wiki](https://github.com/ryanoasis/nerd-fonts/wiki/Glyph-Sets-and-Code-Points)).
- Ghostty embeds `nerd_fonts_symbols_only`
  ([embedded.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/embedded.zig)). Locally:
  `U+EE00 found in face "Symbols Nerd Font"`, and the same for EE04. Ghostty does not draw them as
  sprites; [special.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/special.zig)
  only has cursors and underlines.
- Visual shape (outlined capsule, filled interior): from the Fira Code README image. I did not measure
  it in Ghostty, so this is unverified.

### Powerline / starship / tmux
- Powerline-style segments are colored backgrounds joined by separator glyphs. That is already the
  session-bar pill pattern, and none of these ship a built-in inline meter.
- Ghostty draws U+E0B0–E0D4 (including the pill caps E0B4/E0B6) as sprites
  ([powerline.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/powerline.zig);
  confirmed locally: `U+E0B4 … handled by Ghostty's internal sprites`). So the caps line up exactly
  with the cell background.
- tmux and starship: I did not research them further. Unverified whether either has a bar primitive.
  I am not aware of one.

### Second marker: the bullet graph convention
Stephen Few's
[Bullet Graph Design Specification](https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf)
says the comparative measure "should always be encoded as a short line that runs perpendicular to the
orientation of the graph". It should be "less visually dominant than the featured measure, but easy to
see". In one terminal row, the perpendicular line has to share its cell with the bar, which is why the
recommendation uses a crossing glyph (`┿`/`╋`) rather than `│`/`┃`. A plain vertical stroke leaves a
gap on both sides of it in that cell. htop's stacked segments are the other one-row option: color
[used..pace] differently from [pace..end]. This gives only cell resolution, and it reads as a third
value rather than as a mark.

## Glyph comparison (as rendered by Ghostty 1.3.1, default font JetBrains Mono / DejaVu fallback)

| Glyphs | Who uses it | Drawn by | Reads as | Problems inside a pill |
|---|---|---|---|---|
| `█` + eighths `▏▎▍▌▋▊▉` with bg track | ratatui `Gauge`, bottom Block, session-bar today | Ghostty sprite (U+2580–259F, [block.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/block.zig), widths rounded to whole pixels) | full-height slab | Same height as the pill, so no figure/ground. The partial cell is left-aligned, with track showing on its right. Sub-pixel rounding at small cell widths makes the eighths uneven. A tick has to replace a whole cell. |
| `━` + `╸`/`╺` | rich, ratatui `LineGauge` (THICK) | Ghostty sprite (U+2500–257F, [box.zig](https://github.com/ghostty-org/ghostty/blob/main/src/font/sprite/draw/box.zig)) | continuous centered line | Thin (2× base thickness), but it is the only centered, continuous, font-independent option. Ticks via `┿`/`╋` stay continuous. |
| `─` light | ratatui `LineGauge` default | sprite | hairline | Too faint to tell used from remaining by color alone. |
| `■` / `□` | btop, bottom Square | font (JetBrains Mono here) | segmented dots | Gaps between cells, and it depends on the font. |
| `▰` / `▱` | ratatui tests | font. **Not in JetBrains Mono**: falls back to DejaVu Sans Mono here | segments | Mixed font metrics in one row. Avoid. |
| `▌` / `▀▄` half blocks | bubbles (for two colors per cell) | sprite | full-height (▌) or half-height but top/bottom-aligned (▀▄) | Not vertically centered. Fine for gradients, poor as an inline bar. |
| `\|` / `░` | htop, bottom Pipe / bubbles empty | font | texture | `░`'s pattern differs per font. `\|` needs brackets. |
| U+EE00–EE05 | Fira Code progress | Symbols Nerd Font (embedded in Ghostty) | capsule bar | Whole cells only, no marker glyph, needs a Nerd Font outside Ghostty. |

Unicode references: [Box Drawing chart U+2500](https://www.unicode.org/charts/PDF/U2500.pdf),
[Block Elements chart U+2580](https://www.unicode.org/charts/PDF/U2580.pdf),
[Geometric Shapes U+25A0](https://www.unicode.org/charts/PDF/U25A0.pdf).

## Colour across light and dark backgrounds

- **rich:** foreground-only colors, and back = `grey23`. That suits dark terminals and reads as
  near-black on light ones (default_styles.py).
- **bubbles:** fixed hex. The empty color `#606060` is mid-grey, so it shows on both.
- **btop:** ships separate themes. The default `meter_bg #404040` assumes a dark background.
- **The common robust move:** mid-luminance colors, or own the background. session-bar's pills
  already own the background, so the bar should take its colors from the pill (pill fg for used, a
  pill-bg/pill-fg mix for remaining) and never paint its own track.
- **Gradient vs. solid:**
  - btop's gradient maps to cell position, not to value.
  - bubbles' gradient is decorative.
  - At 8 cells both just add hue noise to a pill that already signals state by changing color.
    Recommend solid.

## Sources

- ratatui gauge.rs: https://github.com/ratatui/ratatui/blob/main/ratatui-widgets/src/gauge.rs
- bubbles progress.go: https://github.com/charmbracelet/bubbles/blob/master/progress/progress.go
- rich progress_bar.py: https://github.com/Textualize/rich/blob/master/rich/progress_bar.py
- rich default_styles.py: https://github.com/Textualize/rich/blob/master/rich/default_styles.py
- btop btop_draw.cpp: https://github.com/aristocratos/btop/blob/main/src/btop_draw.cpp
- btop btop_theme.cpp: https://github.com/aristocratos/btop/blob/main/src/btop_theme.cpp
- htop Meter.c: https://github.com/htop-dev/htop/blob/main/Meter.c
- bottom pipe_gauge.rs: https://github.com/ClementTsang/bottom/blob/main/src/canvas/components/pipe_gauge.rs
- Ghostty sprite drawing: https://github.com/ghostty-org/ghostty/tree/main/src/font/sprite/draw (block.zig, box.zig, powerline.zig, special.zig, common.zig)
- Ghostty embedded fonts: https://github.com/ghostty-org/ghostty/blob/main/src/font/embedded.zig
- Ghostty config reference (adjust-box-thickness): https://ghostty.org/docs/config/reference
- Local check: `ghostty +show-face --cp=0x2501|0x2588|0x2578|0x257a|0x2503|0xe0b4|0xee00|0x25a0|0x25b0` on Ghostty 1.3.1
- Fira Code README / CHANGELOG: https://github.com/tonsky/FiraCode
- Nerd Fonts glyphnames.json: https://github.com/ryanoasis/nerd-fonts/blob/master/glyphnames.json
- Nerd Fonts font-patcher: https://github.com/ryanoasis/nerd-fonts/blob/master/font-patcher
- Nerd Fonts glyph sets wiki: https://github.com/ryanoasis/nerd-fonts/wiki/Glyph-Sets-and-Code-Points
- Unicode charts: https://www.unicode.org/charts/PDF/U2500.pdf, https://www.unicode.org/charts/PDF/U2580.pdf, https://www.unicode.org/charts/PDF/U25A0.pdf
- Stephen Few, Bullet Graph Design Specification: https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
