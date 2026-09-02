// =====================================================================
// clicker/stem-profile.js
//
// "Clicker from Image" — Phase 2 config.
//
// Every dimension that affects TOP's stem-socket, HOUSING's shape, or
// the color-region quantization lives HERE and only here.
//
// Units: millimeters, unless noted otherwise.
//
// -- Real-switch-housing revision note --
// This REPLACES the earlier `body`/`stem` sections (a flat offset
// backing plate + a printed cross-rib stem on its back). Direct
// inspection of a reference STL pair (Cat.stl / Cat_Base.stl) showed
// the real design uses an actual physical MX-compatible switch
// sandwiched between two printed parts:
//   - TOP carries a solid boss with a female cross-socket (topSocket.*
//     below) that clips onto the switch's own stem, exactly like the
//     underside of a normal mechanical-keyboard keycap.
//   - HOUSING (housing.* below) is a hollow shell that holds the
//     switch's body and its mounting plate/flange — it has NO printed
//     stem of its own.
// `body.targetSize` is kept (renamed nowhere — it's still the single
// auto-fit anchor both TOP and HOUSING scale from) but `body.height`
// and `body.offsetMM` are gone, replaced by housing.heightMM and
// housing.offsetMM respectively, since "the backing plate" no longer
// exists as a concept.
//
// Every housing.* value marked "measured" below was read directly off
// the reference STL pair via mesh cross-section slicing (not
// estimated/guessed) — see conversation history for the inspection
// method. Values marked "estimated" had no clean single measurement
// point and were chosen as reasonable defaults; adjust here after a
// real test print if a specific real switch doesn't fit.
//
// TOP uses a deliberately simple backside: solid full-silhouette
// backing plus the centered MX socket boss. Artwork stays unchanged.
// =====================================================================

export const CLICKER_PROFILE = {
  body: {
    // The uploaded silhouette is auto-scaled to roughly this overall
    // size (computeAutoFitTransform balances both axes so narrow/
    // elongated silhouettes still get enough real-world room). Both
    // TOP and HOUSING scale from this SAME anchor, which is what
    // keeps their footprints locked together regardless of image
    // shape.
    // Nudged up slightly from 30.0 — real test prints at 30mm left
    // too little headroom around the rear cavity wall + MX pedestal/
    // socket boss on some silhouettes.
    targetSize: 34.0,
  },

  topSocket: {
    // Solid cylindrical boss attached to the backing — a female MX-compatible cross-socket hole
    // through it — mirrors how a real Cherry-style keycap underside is
    // actually built (thick boss + "+" cavity, not thin free-standing
    // ribs). Always centered at X=0,Y=0.
    bossDiameterMM: 5.5,   // measured (5.51)
    bossDepthMM: 5.7,      // measured

    // Nominal Cherry MX cross-stem dimensions (industry-standard,
    // matches direct measurement of the reference almost exactly:
    // measured arm envelope ~4.0mm tip-to-tip, ~1.17mm arm thickness).
    crossWidth: 4.1,
    crossArmThickness: 1.17,

    // Added to crossWidth/crossArmThickness ONLY when cutting the
    // socket HOLE (never reused for any printed-peg sizing — a female
    // hole and a male peg need opposite-signed tolerance adjustments,
    // so this is deliberately its own separate value, not shared with
    // any other tolerance in this file). Positive = looser fit.
    // Start here after a real print's test-fit and adjust up/down in
    // ~0.02mm steps.
    socketToleranceMM: 0.125,
  },

  topShell: {
    // Z=0 is topBase's back face. The solid backing extends backward
    // to -transitionThicknessMM; the centered boss continues behind it.

    // Reference-only: the reference's OWN front artwork layer measured
    // ~0.79mm thick. Our actual front artwork is topBase.thicknessMM +
    // accent.thicknessMM = 0.6mm — kept exactly as-is per an explicit
    // instruction not to touch the color pipeline this round, so this
    // value is NOT used to position any geometry; it's recorded here
    // only so the discrepancy (0.79 measured vs 0.6 actual) is visible
    // and easy to find later if the two are ever reconciled.
    frontThicknessMM: 0.79, // measured, reference-only (see note above)

    transitionThicknessMM: 0.95, // measured
    bodyDepthMM: 5.7,
    minimumWallMM: 1.6,
    bossKeepOutMM: 0.8,
  },

  housing: {
    // How far HOUSING's outer edge is offset OUTWARD (in real mm, not
    // pixels) beyond TOP's own outer silhouette, forming the visible
    // rim around the switch housing. Config-only for now — a future
    // version may expose this as a live slider.
    offsetMM: 2.7, // measured (median of ~2.5-3.0mm range)

    // Total housing height, floor to open top rim.
    heightMM: 17.237, // measured (reference mesh: 17.2372mm)

    // Solid floor thickness, Z=[0, floorThicknessMM].
    floorThicknessMM: 1.6, // measured

    // Outer wall thickness of the upper open chamber ONLY (layers 1-3
    // below the plate are solid blocks, not thin-walled — see
    // housing-geometry.js's header comment for why).
    wallThicknessMM: 3.2, // measured (varies 3.0-3.7 around the rim; using a representative middle value)

    switchCavity: {
      // XY footprint of the pocket holding the switch's lower
      // housing body, Z=[floorThicknessMM, floorThicknessMM+heightMM].
      widthMM: 15.5,       // measured
      depthMM: 15.4,       // measured
      heightMM: 7.85,      // measured (Z-extent of this layer)
      cornerRadiusMM: 1.5, // estimated (visibly rounded in the reference, exact radius not cleanly isolated)

      // Added uniformly to widthMM/depthMM so a variety of real
      // switches (which vary slightly by manufacturer) fit without
      // needing the reference's exact (and switch-model-specific)
      // asymmetric relief notches, which are deliberately NOT
      // reproduced here. Increase if a specific switch is too tight.
      clearanceMM: 0.3, // estimated
    },

    switchPlateCutout: {
      // The standard MX plate-mount hole — a switch's upper-housing
      // flange rests on this layer's TOP face (the "ledge"). NOT
      // hardcoded into the geometry code — read from here so it can
      // be adjusted in one place after a real test print.
      widthMM: 13.85,        // measured
      depthMM: 13.84,        // measured
      thicknessMM: 1.45,     // measured (Z-extent of the plate layer)
      cornerRadiusMM: 0.5,   // estimated (small radius, standard for laser/CNC-cut plates)
    },
  },

  topBase: {
    // TOP's "canvas" layer: the FULL outer silhouette (same outline as
    // HOUSING's own un-offset footprint) filled with the single
    // AUTO-DETECTED dominant (largest-area) color from the uploaded
    // image. TOP ARTWORK — unrelated to the housing/socket revision
    // above, unchanged.
    // Z = [0, thicknessMM]
    thicknessMM: 0.4,
  },

  accent: {
    // The K-1 non-dominant auto-detected colors, each as their own
    // region(s), stacked directly on top of topBase.
    // Z = [topBase.thicknessMM, topBase.thicknessMM + thicknessMM]
    thicknessMM: 0.2,

    // Below this size (mm²), a same-color island is merged into
    // whichever neighboring color touches it most — never just
    // deleted (see image-processing.js's buildColorRegions /
    // color-quantization.js's cleanupSmallRegions).
    minRegionAreaMM2: 0.6,

    // How many flat colors the TOP is quantized into (1 dominant +
    // up to colorCount-1 accents). Exposed as a live "จำนวนสี" UI
    // slider — these bounds define its range.
    colorCount: {
      default: 4,
      min: 2,
      max: 6,
    },
  },

  scale: {
    // User zoom multiplier applied ON TOP of the automatic
    // targetSize-based fit (1.0 = auto-fit size exactly). Applies to
    // TOP (canvas + accents + socket boss) and HOUSING together —
    // they always share one transform (see clicker-viewer.js).
    default: 1.0,
    min: 0.5,
    max: 2.5,
  },
};
