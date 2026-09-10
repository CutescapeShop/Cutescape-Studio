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
    // Longest side of TOP artwork, preserving the source aspect ratio.
    // Mechanical dimensions are independent of this image transform.
    targetSize: 35.0,
    minSizeMM: 35,
    maxSizeMM: 100,
  },

  topSocket: {
    // Solid cylindrical boss attached to the backing — a female MX-compatible cross-socket hole
    // through it — mirrors how a real Cherry-style keycap underside is
    // actually built (thick boss + "+" cavity, not thin free-standing
    // ribs). Always centered at X=0,Y=0.
    bossDiameterMM: 5.5118,
    bossDepthMM: 5.6374,
    // CAT/Fish 3MF sections: [distance behind backing, outer radius].
    // The curved foot becomes a straight cylinder after 1.7461 mm.
    bossFlareProfileMM: [
      [0, 3.9478], [0.0244, 3.8884], [0.1018, 3.7299],
      [0.1937, 3.5793], [0.2994, 3.4381], [0.4179, 3.3074],
      [0.5482, 3.1885], [0.6890, 3.0823], [0.8393, 2.9898],
      [0.9975, 2.9118], [1.1624, 2.8491], [1.3324, 2.8021],
      [1.5061, 2.7713], [1.6819, 2.7570], [1.7461, 2.7559],
    ],

    // Nominal Cherry MX cross-stem dimensions (industry-standard,
    // matches direct measurement of the reference almost exactly:
    // measured arm envelope ~4.0mm tip-to-tip, ~1.17mm arm thickness).
    crossWidth: 4.0386,
    crossArmThickness: 1.1938,

    // Added to crossWidth/crossArmThickness ONLY when cutting the
    // socket HOLE (never reused for any printed-peg sizing — a female
    // hole and a male peg need opposite-signed tolerance adjustments,
    // so this is deliberately its own separate value, not shared with
    // any other tolerance in this file). Positive = looser fit.
    // Start here after a real print's test-fit and adjust up/down in
    // ~0.02mm steps.
    socketToleranceMM: 0,
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
    bodyDepthMM: 5.6374,
    minimumWallMM: 1.6,
    bossKeepOutMM: 0.8,
    // Preserve the existing shared TOP/HOUSING switch position while
    // refining TOP geometry. These are placement clearances, not solids.
    switchPlacement: {
      radiusMM: 3.55,
      cavityClearRadiusMM: 2.3125,
    },
  },

  housing: {
    movingClearanceMM: 0.4, // Fixed XY clearance per side of the complete moving TOP.
    // Legacy outline margin used to preserve the existing functional
    // chamber candidate. Final outer walls are derived from the enlarged
    // moving-TOP chamber plus wallThicknessMM, not this margin.
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
    //
    // 0.15 (not the original 0.6) — audited against Bird/Fish/Cat plus
    // synthetic ground-truth images: real anti-aliasing/dither noise in
    // all three photos tops out at 0.01mm², while confirmed legitimate
    // small details (Bird's eye 0.22mm², Fish's highlights 0.23mm²,
    // Cat's facial details 0.38-0.47mm²) sit in an empty gap well above
    // it. 0.15 keeps 15x+ margin over observed noise and 46-213% margin
    // under every confirmed real detail, while clearing the ~0.4mm
    // nozzle minimum-feature-width floor (0.6 discarded all of them).
    minRegionAreaMM2: 0.15,

    // How many flat colors the TOP is quantized into (1 dominant +
    // up to colorCount-1 accents). Exposed as a live "จำนวนสี" UI
    // slider — these bounds define its range.
    colorCount: {
      default: 4,
      min: 2,
      max: 16,
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

  // Optional keychain loop. Attaches to HOUSING ONLY, never to TOP —
  // HOUSING is the structural part that stays permanently on the
  // keyring, while TOP only connects to it via the MX switch's own
  // clip mechanism, which is built for click-actuation force, not for
  // carrying a keychain's pull/swing load. Modeled the same way Name
  // Keychain's own ring is (viewer.js's createRingMesh): an outer
  // ellipse with a circular hole, added as a separate, overlapping
  // solid mesh into the same STL group — no CSG boolean. See
  // keychain-loop.js.
  keychainLoop: {
    enabledDefault: false,

    // Fixed mm, independent of body.targetSize/the size slider — same
    // convention as every other mechanical dimension in this file
    // ("Only artwork uses the selected size; all mechanical builders
    // use mm" — see clicker-viewer.js).
    outerWidthMM: 8,    // across the attachment point (tangent to the silhouette)
    outerLengthMM: 10,  // tip-to-tip along the pointing-outward direction
    holeDiameterMM: 4.2, // fits a standard small keyring wire
    thicknessMM: 3.5,   // Z=[0, thicknessMM] — within HOUSING's solid floor+pocket region on any normally-proportioned silhouette

    // How far the loop's near edge is pushed back INTO HOUSING's own
    // solid material, so it's a real overlapping join rather than a
    // single-point touch (same idea as Name Keychain's ringOverlap).
    overlapMM: 1.8,
    // Never place a loop with less overlap than this — below it, reject
    // the position outright (return no geometry) rather than risk a
    // weak or intersecting attachment. See keychain-loop.js's tiered
    // overlap search.
    minOverlapMM: 0.6,

    // 0° = the image's own local +Y axis ("up" as originally drawn) —
    // fixed in the model's own coordinate frame, not camera/screen
    // space, so the loop's position follows the silhouette regardless
    // of how the 3D preview is orbited. Rotate-left/right buttons step
    // by this amount and wrap continuously modulo 360 (25 does not
    // evenly divide 360 — repeatedly rotating one direction cycles
    // through all 72 multiples of 5° before returning to the exact
    // starting angle, rather than a clean 15-position loop; this is a
    // deliberate consequence of the requested step size, not a bug).
    angleStepDeg: 25,
    angleDefaultDeg: 0,
  },
};
