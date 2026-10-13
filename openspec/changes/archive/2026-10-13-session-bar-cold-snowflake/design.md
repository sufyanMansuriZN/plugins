# Design

## Context

The pills draw each icon inside their own `Svg` with a `glyph` drawer: a `<g>` scaled from the 24px Tabler box to `ICON`, with a stroke of `ICON_STROKE` after scaling, round caps and joins, and an ink class from a `prefers-color-scheme` `<style>` in each `Svg`, as an `Svg` cannot read the app's CSS variables.

The usage block rows are app `Text` in `Box` rows (two per line, or one per line under about 520px, with the name in a 34% column). A `Text` cannot hold an `Svg`, so a row icon is its own `Svg` beside the `Text`. A `Box` gap or padding is a whole cell (8px), and the app sets the text's size and dim color.

## Goals / Non-Goals

**Goals:**
- Match the approved mockup wherever the plugin draws the pixels: the icons, pills and meters inside its `Svg`s, and the block's card through `Box` props.

**Non-Goals:**
- The band's own gray strip, the app's text sizes and dim color, spacing finer than one cell.
- The pill layout and status colors the spec already sets.
- Icons in the terminal bar.

## Decisions

1. **One drawer, one size.** `glyph(x, y, paths, ink)` draws every icon at `ICON` 15px with a 1.5px stroke, so a row icon and its pill icon have one shape, size and stroke. The size first followed the pills' 18px; live, it stood larger and heavier than the block's text, so pills and rows both moved to the mockup's: about the text's height.
2. **Gaps.** Inside a pill, 5px between icon, label and value (`ICON_GAP`, the label-to-value gap as a `dx`). A row icon carries its gap inside its own `Svg` (`ROW_GAP` 2px): Desktop draws more room after an `Svg` than its box, and 2px measured as the pill's gap; a `Box gap` would be a whole 8px cell.
3. **Inks.** Pill icons are the primary ink, calm or not, as the mockup's; the label stays dim and the value primary. Row icons are the mockup's accent blue in their own `sb-a` class, lighter on dark. The status stays the meter's and the pill's color.
4. **Row icon alt text.** Desktop drew nothing for an `Svg` with an empty `alt`, not even its box. Each row icon's alt names the pill it matches (`context pill`, `5h pill`), the cache glyph its state (`cache warm`).
5. **1px up.** Centered on the text's line box, a row icon sat 1px under the baseline; the glyph is drawn at y -1.
6. **Meters.** A plain gray track with no outline and a solid fill in the window's color, as the mockup; the time-gone shadow stays, as the spec requires it, a darker gray over the track.
7. **Card.** The open block is a `Box` with `backgroundColor="inverseText"`, `borderStyle="round"`, `borderColor="promptBorder"` and 2 cells of padding (1 at one row a line, as the band's height runs out there). No theme key names a background, and `inverseText` is the light ground on a light theme. The gap above the pills drops from 3 cells to 1, as the card's border now sets the block apart.

8. **Contrast, measured.** Every text and icon is 4.5:1 or more on its pill, with a margin for Desktop drawing an `Svg`'s colors more saturated (`#d03b3b` read `#e82250`, `#173c95` read `#280695`). The dim label is `#555550` light, `#bdbcb4` dark; on an amber or red pill the label takes the main ink, as no dim gray passes there. A pill's text often sits on both its fill and its pale track, so an attention fill's opacity is per scheme rather than a per-fill ink: red .55 on light, amber .25 on dark, else .8 and .75. A meter fill mostly sits under 3:1 against the gray shadow, so a 2px gap in the card's color marks where they meet. The app's dim line text (3.6:1 on light) and the empty track are the app's or decorative, and stay.
9. **Writing colors for Desktop's shift.** Desktop draws an `Svg`'s colors shifted. A 3×3 matrix in linear light, fitted on three sampled pairs, predicted a fourth (`#009E73` drawn `#00ac74`). Its inverse gives the color to write: `#084f95` for the mockup's navy `#173c95`, and `#2c8e68` for a green that shows 3:1 on white. Neutral grays are not shifted. After a second designer review: meter track and band `#d9d9d9`/`#bdbdbd` (dark `#2f2f2e`/`#525250`), the dark red pill at .85, the dark calm blue pill at .6. The dark green and pink pills stay at .3, as a firmer fill drops their label under 4.5:1.

## Risks / Trade-offs

- [`inverseText` as a background is an assumption about the theme] → Checked live on a light theme; check a dark theme before release. If it reads wrong there, drop the background and keep the border and padding.
- [Pill widths are estimated from the character count, now at 12px] → The same known limit as before (the `shortcut:` comment above `STATUS`); a pill may be a pixel or two off on its right.
- [The accent blue and the inks follow the OS scheme, not the app's theme] → The same known limit as the pills.
