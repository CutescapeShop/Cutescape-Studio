import ClipperLib from "./vendor/clipper-lib-6.4.2.esm.js";
import { computeOutline } from "./outline-clipper.js";

self.onmessage = ({ data: { id, paths, outlineMargin } }) => {
  try {
    const unitedPaths = computeOutline(ClipperLib, paths, outlineMargin);
    self.postMessage({ id, unitedPaths });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
