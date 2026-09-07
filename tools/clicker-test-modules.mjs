import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Browser modules live in a CommonJS package and import Clipper from a CDN.
// Resolve those imports in memory without changing the application sources.
export async function loadClickerModules(overrides = {}) {
  const require = createRequire(import.meta.url);
  const threeURL = process.env.CLICKER_TEST_THREE
    ? pathToFileURL(resolve(process.env.CLICKER_TEST_THREE)).href
    : pathToFileURL(require.resolve("three").replace(/three\.cjs$/, "three.module.js")).href;
  const cache = new Map();
  async function moduleURL(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file);
    let source = overrides[file] ?? await readFile(file, "utf8");
    const imports = [...source.matchAll(/from\s*"([^"]+)"/g)];
    for (const [statement, specifier] of imports) {
      const url = specifier === "three" ? threeURL
        : specifier.includes("clipper-lib@") ? await moduleURL("vendor/clipper-lib-6.4.2.esm.js")
        : specifier.startsWith(".") ? await moduleURL(resolve(dirname(file), specifier.split("?")[0]))
        : specifier;
      source = source.replace(statement, `from ${JSON.stringify(url)}`);
    }
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    cache.set(file, url);
    return url;
  }
  const modules = {};
  for (const name of ["geometry-math", "keycap-geometry", "housing-geometry", "image-processing", "stem-profile", "color-quantization", "keychain-loop"]) {
    modules[name] = await import(await moduleURL(`clicker/${name}.js`));
  }
  modules.three = await import(threeURL);
  return modules;
}
