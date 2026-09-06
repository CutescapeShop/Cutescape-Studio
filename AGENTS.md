# Cutescape-Studio

Browser-based studio for custom name keychains and image-based clickers, with
Three.js previews, printable STL exports, and Firebase design saving/loading.
The interface includes Thai text and Thai font shaping.

## Project map

- `index.html`, `style.css`: page structure, controls, and styling.
- `script.js`: shared UI, product selection, and design save/load workflows.
- `viewer.js`: keychain geometry, fonts, 3D preview, and STL export.
- `font-select-ui.js`: custom font picker linked to the native select.
- `clicker/`: image processing, color quantization, geometry, preview, and export.
  `stem-profile.js` holds mechanical dimensions; `geometry-math.js` holds shared math.
- `firebase-designs.js`: Firebase Realtime Database integration.
- `assets/`: fonts and artwork; `keychain-generator.scad`: OpenSCAD prototype.
- `firebase.json`: static hosting configuration serving the repository root.

## Runtime and validation

- Plain HTML/CSS/JavaScript; no configured build or development-server script.
  Serve the root over local HTTP to exercise browser modules and assets.
- Browser Three.js is pinned to `0.167.1` through the import map and CDN imports;
  the npm dependency is `^0.185.1`. Check both before changing dependencies.
- Browser dependencies also include CDN-loaded Clipper, HarfBuzz, and Firebase.
- Run `node clicker/geometry-math.test.mjs` for existing geometry assertions.
  `npm test` is a placeholder that intentionally fails.
- For application changes, check affected controls, browser console, 3D preview,
  and exported STL behavior. Check Thai rendering when changing text or fonts.

## Working instructions

- Name Keychain stable baseline: commit `6cc774a`.
- Do not modify Name Keychain geometry unless explicitly requested. Preserve current
  die-cut base rounding/smoothing, original font text geometry, circular ring shape,
  ring size, and ring position.
- Clicker is paused and hidden from customers. Do not modify it unless explicitly requested.
- Font-only tasks are limited to font assets/loading/list/dropdown/preview unless
  explicitly requested otherwise.
- Inspect the working-tree diff first and preserve existing user changes.
- Keep changes focused on the requested task and follow existing vanilla-JS patterns.
- Preserve DOM IDs, script ordering, and shared window callbacks used across files.
- Keep physical dimensions in millimeters and preserve alignment between exported
  parts; preview separation must not change STL coordinates.
- Respect the font usage guidance in `assets/fonts/README_PRIVATE_FONTS.txt`.
- Never commit, push, or deploy unless explicitly requested.
- Deployment workflow: commit → push → `firebase deploy --only hosting`.
- Write to the live Firebase database only when the task authorizes it.
