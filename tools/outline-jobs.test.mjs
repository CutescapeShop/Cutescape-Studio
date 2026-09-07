import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../outline-jobs.js", import.meta.url), "utf8");
const { createOutlineJobs } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function fixture(factoryError = false, timeout = 1000) {
  const sent = [], fallback = [];
  const worker = {
    postMessage(data) { sent.push(data); },
    terminate() { this.terminated = true; }
  };
  const jobs = createOutlineJobs((paths) => { fallback.push(paths); return paths; }, () => {
    if (factoryError) throw new Error("Worker unavailable");
    return worker;
  }, timeout);
  const reply = (index, result) => worker.onmessage({ data: { id: sent[index].id, unitedPaths: result } });
  return { jobs, sent, fallback, worker, reply };
}

test("latest input wins; pending jobs coalesce without an unbounded worker queue", async () => {
  const f = fixture();
  const first = f.jobs.request([1], .18);
  const middle = f.jobs.request([2], .18);
  const latest = f.jobs.request([3], .18);
  assert.equal(await first, null);
  assert.equal(await middle, null);
  assert.equal(f.sent.length, 1);
  f.reply(0, [1]);
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent[1].paths, [3]);
  f.reply(0, [99]); // A duplicate old reply must not finish the latest job.
  f.reply(1, [3]);
  assert.deepEqual(await latest, [3]);
});

test("invalidation before debounce rejects running and queued work", async () => {
  const f = fixture();
  const first = f.jobs.request([1], .18);
  const pending = f.jobs.request([2], .18);
  f.jobs.invalidate();
  assert.equal(await first, null);
  assert.equal(await pending, null);
  f.reply(0, [1]);
  assert.equal(f.sent.length, 1);
});

test("initialization failure uses synchronous fallback", async () => {
  const f = fixture(true);
  assert.deepEqual(await f.jobs.request([1], .18), [1]);
  assert.deepEqual(await f.jobs.request([2], .18), [2]);
  assert.equal(f.fallback.length, 2);
});

for (const failure of ["error", "messageerror", "execution", "postMessage"]) {
  test(`${failure} failure falls back without publishing stale work`, async () => {
    const f = fixture();
    if (failure === "postMessage") f.worker.postMessage = () => { throw new Error("clone failed"); };
    const result = f.jobs.request([7], .32);
    if (failure === "error") f.worker.onerror({ preventDefault() {} });
    if (failure === "messageerror") f.worker.onmessageerror();
    if (failure === "execution") f.worker.onmessage({ data: { id: f.sent[0].id, error: "failed" } });
    assert.deepEqual(await result, [7]);
    assert.equal(f.worker.terminated, true);
  });
}

test("failure skips stale fallback and computes only the newest queued input", async () => {
  const f = fixture();
  const stale = f.jobs.request([1], .18);
  const latest = f.jobs.request([2], .18);
  f.worker.onerror({});
  assert.equal(await stale, null);
  assert.deepEqual(await latest, [2]);
  assert.deepEqual(f.fallback, [[2]]);
});

test("unresponsive worker times out to fallback", async () => {
  const f = fixture(false, 10);
  assert.deepEqual(await f.jobs.request([1], .18), [1]);
});

test("fallback computation errors reject rather than returning invalid geometry", async () => {
  const jobs = createOutlineJobs(() => { throw new Error("geometry failure"); }, () => { throw new Error("unavailable"); });
  await assert.rejects(jobs.request([], .18), /geometry failure/);
});
