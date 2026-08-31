// Every tunable value. The stated ranges are what each was tuned within, not
// hard limits.

/**
 * CRT parameters. The `sharp` preset: tight spot with peaking, fine grille, gun
 * drive above nominal, short persistence tail.
 */
export const SCREEN = {
  // --- beam ---
  /** Phosphor persistence. The beam pass is max(total, prev * decay): at 1 every
   *  lit pixel stays lit, above 1 the raster ramps to white. Max 0.98. */
  decay: 0.75,
  /** Horizontal spot sigma, in source pixels, so the same value is a finer spot
   *  on a taller face. Range 0.1..2. */
  beam: 0.55,
  /** Amplifier peaking: edge overshoot, horizontal only. 0 = off. Range 0..2. */
  sharpen: 1,
  /** Scanline thickness on dark pixels. Range 0.05..1. */
  scanMin: 0.41,
  /** Scanline thickness on full-brightness pixels. Range 0.05..1.5. */
  scanMax: 0.68,

  // --- bloom ---
  /** Glow cut-in. Range 0..1. */
  threshold: 0.5,
  /** Glow strength. Range 0..3. */
  bloomAmt: 1.44,

  // --- tube ---
  /** Screen size within the canvas. Range 0.4..1. */
  fill: 0.89,
  /** Barrel distortion. Range 0..0.15. */
  curve: 0.017,
  /** How far the glass sits outside the raster, in uv units. Range 0..0.15. */
  glass: 0.018,
  /** Corner falloff. Range 0..1. */
  vignette: 0.3,
  /** Gun drive. Range 0.2..2. */
  brightness: 1.31,
  /** Unlit-tube floor, tinted by the phosphor. Range 0..0.3. */
  bg: 0.11,
  // 2026-08-22, round 3 (live phone testing found the glow above and below
  // the interface too subtle) -- bumped toward the top of
  // ambient's documented range and let it reach a bit further, rather than
  // just cranking both uncapped; the goal is still a glow, not a flood.
  /** Light spilled onto the area around the tube. Range 0..0.15. */
  ambient: 0.135,
  /** How fast that spill fades with distance from the tube center -- lower
   *  lets it reach further into the surround. Range 0.5..4. */
  ambientFalloff: 1.8,

  // --- mask ---
  /** Aperture grille depth. Range 0..1. */
  maskAmt: 0.66,
  /** Device px per grille stripe. Range 1..8. */
  maskPitch: 2,
  /** Beam misconvergence, as a colour fringe. Range 0..3. */
  chroma: 0.2,

  // --- noise ---
  /** Grain amount. Modulated by a luma carrier and a per-line gain, which
   *  average well under 1, so this is higher than flat grain would need.
   *  Range 0..0.4. */
  noise: 0.13,
  /** Device px per noise cell, horizontally. 1 is isotropic film grain; higher
   *  smears each spike along the scanline. Range 1..12. */
  noiseStreak: 5.4,
  /** Fraction of cells that spark per frame. 0 = off. Range 0..0.01. */
  snow: 0.0046,
  /** Frame-to-frame brightness variation. Range 0..0.2. */
  flicker: 0.075,
  /** Rolling shutter bar depth. Range 0..0.6. */
  roll: 0.185,
  /** Screens per second the bar drifts. Independent of depth. Range 0..1.5. */
  rollSpeed: 0.33,
}

/**
 * Tints, as vec3 multipliers on the beam. The brightest channel is 1.00 in each.
 * Luminances are kept close (matrix .78, vt320 .67, brutalist .72, bubblegum
 * .63, white .91) so switching tint is not also a brightness change.
 */
export const PHOSPHORS = {
  matrix:    [0.18, 1.00, 0.36],  // P1
  vt320:     [1.00, 0.62, 0.14],  // P3
  brutalist: [0.42, 0.78, 1.00],
  // Not a real phosphor. The blue keeps it a rose rather than a salmon.
  bubblegum: [1.00, 0.50, 0.82],
  white:     [0.86, 0.92, 1.00],  // P4
  // 2026-08-22 -- forced-only tint for program.js's secret NIN station.
  // Deliberately not in DISPLAY_MODES / the [C] cycle, so it's never
  // user-selectable on its own -- program.js's applyPhosphor() is the only
  // caller, and only while locked onto that one station. Not held to the
  // luminance-matching note above for that reason: it's meant to read as
  // an alarming departure from the other tints, not blend in with them.
  red:       [1.00, 0.12, 0.10],
  // 2026-08-23 -- forced-only tint built for GREEN HOUSE, a second secret
  // station in program.js that was pulled before shipping (2026-08-24,
  // parked for now) -- currently unused, but left
  // defined since program.js's SECRET_STATIONS array/forcedPhosphor
  // machinery is generic and any future secret station can reuse this
  // directly. Same pattern as 'red' above (not in DISPLAY_MODES / the [C]
  // cycle, only ever set by applyPhosphor() while locked to that station).
  // Kept closer to the normal-mode luminance band than 'red' is -- meant to
  // read as a hazy, legible violet glow, not an alarm -- and pushed well
  // clear of 'bubblegum' (the only other pink/purple-adjacent tint on the
  // roster) by dropping red and pushing blue.
  purple:    [0.52, 0.24, 1.00],
  // 2026-08-26 -- forced-only tint for GREEN ROOM, the second secret
  // station (stations.js). Same pattern as 'red'/'purple' above: not in
  // DISPLAY_MODES, never in the [C] cycle, only ever set by
  // applyPhosphor() while locked to that station.
  //
  // Deliberately NOT 'matrix'. A green station forcing the green the tube
  // already boots in would be a no-op for most visitors -- setPhosphor()
  // literally no-ops when the tint is already up -- so anyone sitting in
  // GREEN PHOSPHOR would get no tint change at all and the reveal would
  // land on them as nothing happening. This is a warm yellow-green
  // against matrix's cool spring green ([0.18, 1.00, 0.36]): red up from
  // 0.18 to 0.62, blue down from 0.36 to 0.24, so the hue swings toward
  // gold and reads as the tube glowing THROUGH something rather than as a
  // different phosphor.
  //
  // Luminance is ~.85 against the .63-.91 band the cycle tints sit in --
  // slightly hot, and the only tint here that departs upward ('red' .31
  // and 'purple' .36 both go dark). That is the intent: this station's
  // whole CRT profile is soft and bloomed rather than hostile, and a
  // brighter ground is what makes the haze read as glow instead of grime.
  haze:      [0.62, 1.00, 0.24],
}

/** Which tint the tube starts in. */
export const PHOSPHOR = 'matrix'

/**
 * Mobile lite detection (45th pass) -- a different, more legible mobile
 * layout for a portrait touch experience. Off-
 * detection only, no manual toggle -- a narrow, portrait, touch-primary
 * viewport gets the lite grid below; everything else gets the normal one.
 * Checked once at module load, not live on rotation -- the grid is fixed for
 * the life of the Term/CRT instances mount() builds from it (see screen.js),
 * so re-flowing on an in-session rotation would need a real re-mount, which
 * is out of scope for this pass.
 */
export const MOBILE_LITE =
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  matchMedia('(max-width: 600px) and (orientation: portrait)').matches

/**
 * Grid size in cells, and the unlit margin around it in framebuffer pixels.
 *
 * The faceplate is 4:3 whatever is set here; the framebuffer is stretched onto
 * it. 80x25 in an 8x16 face is a 26% horizontal squash, as VGA text mode was on
 * a 4:3 monitor. That stretch-to-fit means cols/rows are free to be any shape
 * -- the mobile grid below is deliberately much narrower than 80 (see
 * MOBILE_LITE), so each column gets far more of the phone's actual width per
 * character, instead of 80 columns of the desktop layout all being crammed
 * into a screen a fraction of a desktop monitor's width.
 */
export const GRID = MOBILE_LITE
  ? { cols: 42, rows: 22, padX: 6, padY: 5 }
  : { cols: 80, rows: 25, padX: 6, padY: 5 }

/**
 * The face. Any BDF up to 16px wide.
 *
 * bold is used where present; without it BOLD is a one-pixel smear. italic
 * likewise falls back to roman. Terminus has no oblique.
 */
export const FONT = {
  regular: new URL('./fonts/ter-u16n.bdf', import.meta.url).href,
  bold: new URL('./fonts/ter-u16b.bdf', import.meta.url).href,
  italic: null,
}

export const RENDER = {
  /** Beam and persistence buffer size, as a multiple of the source. */
  superSample: 2,
  /** Pixel cap for the composite pass, the only one that scales with the canvas
   *  size. */
  pixelBudget: 2.6e6,
  /** Cursor blink period, ms. */
  blinkMs: 480,
  /** Whether the block cursor is drawn. A program using one sets term.showCursor
   *  and moves term.cx/term.cy. */
  cursor: false,
}
