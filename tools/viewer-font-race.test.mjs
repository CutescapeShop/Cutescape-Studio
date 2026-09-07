import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../viewer.js", import.meta.url), "utf8");
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const loadFont = extract("function loadSelectedFont()", "// Event");
const loadShaping = extract("async function loadHarfBuzzFont(", "// สำรองไว้");

function fixture() {
  const callbacks = {}, fetches = {};
  const ttfLoader = { load(url, callback) { callbacks[url] = callback; } };
  const fetch = (url) => new Promise((resolve) => {
    fetches[url] = (value) => resolve({ ok: true, arrayBuffer: async () => new Uint8Array([value]).buffer });
  });
  const hb = {
    createBlob: (data) => data[0],
    createFace: (blob) => blob,
    createFont: (face) => ({ id: face, setScale() {} })
  };
  const api = new Function("ttfLoader", "fetch", "hb", `
    let fontLoadRevision=0,fontLoading=false,loadedFont=null;
    let harfBuzzBlob,harfBuzzFace,harfBuzzFont,harfBuzzFontUrl;
    let rebuilds=0;
    const fontSelect={value:'A'},fontFiles={A:'A.ttf',B:'B.ttf'};
    const fontLoader={parse:value=>value};
    const initHarfBuzz=async()=>hb;
    function destroyHarfBuzzFont(){harfBuzzFont=null;}
    function patchThaiCombiningMarks(){}
    function invalidateGeometry(){}
    function rebuildProduct(){rebuilds++;}
    ${loadShaping}
    ${loadFont}
    return {select(name){fontSelect.value=name;loadSelectedFont();},state(){return {loadedFont,harfBuzzFontUrl,harfBuzzFont,fontLoading,rebuilds};}};
  `)(ttfLoader, fetch, hb);
  return { api, callbacks, fetches };
}

test("late HarfBuzz fetch cannot replace the newest font or shaping state", async () => {
  const f = fixture();
  f.api.select("A");
  const old = f.callbacks["A.ttf"]("font A");
  await Promise.resolve();
  f.api.select("B");
  const latest = f.callbacks["B.ttf"]("font B");
  await Promise.resolve();
  f.fetches["B.ttf"](2);
  await latest;
  f.fetches["A.ttf"](1);
  await old;
  assert.equal(f.api.state().loadedFont, "font B");
  assert.equal(f.api.state().harfBuzzFontUrl, "B.ttf");
  assert.equal(f.api.state().harfBuzzFont.id, 2);
  assert.equal(f.api.state().rebuilds, 1);
  assert.equal(f.api.state().fontLoading, false);
});

test("late TTF callback is ignored before parsing or starting shaping fetch", async () => {
  const f = fixture();
  f.api.select("A");
  f.api.select("B");
  await f.callbacks["A.ttf"]("font A");
  assert.equal(f.fetches["A.ttf"], undefined);
  const latest = f.callbacks["B.ttf"]("font B");
  await Promise.resolve();
  f.fetches["B.ttf"](2);
  await latest;
  assert.equal(f.api.state().loadedFont, "font B");
  assert.equal(f.api.state().rebuilds, 1);
});
