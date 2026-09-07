// One running job and at most one pending request. Superseded callers get null.
export function createOutlineJobs(computeSynchronously, createWorker, timeoutMs = 120000) {
  let worker = null;
  let failed = false;
  let revision = 0;
  let active = null;
  let pending = null;

  function invalidate() {
    revision++;
    if (active) active.resolve(null);
    if (pending) pending.resolve(null);
    pending = null;
  }

  function finish(job, result, error) {
    clearTimeout(job.timer);
    if (active === job) active = null;
    if (job.id !== revision) job.resolve(null);
    else if (error) job.reject(error);
    else job.resolve(result);
    start();
  }

  function fallback(job) {
    if (job.id !== revision) return finish(job, null);
    try {
      finish(job, computeSynchronously(job.paths, job.outlineMargin));
    } catch (error) {
      finish(job, null, error);
    }
  }

  function failWorker() {
    failed = true;
    if (worker) worker.terminate();
    worker = null;
    if (active) fallback(active);
  }

  function start() {
    if (active || !pending) return;
    const job = pending;
    pending = null;
    active = job;
    if (failed) return fallback(job);
    try {
      if (!worker) {
        worker = createWorker();
        worker.onmessage = ({ data }) => {
          if (!active || data.id !== active.id) return;
          if (data.error || !Array.isArray(data.unitedPaths)) return failWorker();
          finish(active, data.unitedPaths);
        };
        worker.onerror = (event) => {
          event.preventDefault?.();
          failWorker();
        };
        worker.onmessageerror = failWorker;
      }
      job.timer = setTimeout(failWorker, timeoutMs);
      worker.postMessage({ id: job.id, paths: job.paths, outlineMargin: job.outlineMargin });
    } catch (_) {
      failWorker();
    }
  }

  return {
    invalidate,
    request(paths, outlineMargin) {
      invalidate();
      return new Promise((resolve, reject) => {
        pending = { id: revision, paths, outlineMargin, resolve, reject };
        start();
      });
    }
  };
}
