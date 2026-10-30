// magpie moejs middleware: the same tested pipeline, or a no-op when the Bun
// companion has already compressed this request. Strategies ported from OmniRoute.
import { runPipeline, INTERNAL_MARKER, removeInternalMarker } from "./pipeline.js"

export function onRequest(body, ctx) {
  try {
    if (body && body[INTERNAL_MARKER]) {
      removeInternalMarker(body)
      return body
    }
    const options = ctx.options && typeof ctx.options === "object" ? ctx.options : {}
    // This path has no shared CCR store: the Bun hook owns it. Running ccr here
    // would replace blocks with markers whose originals were never persisted, so
    // the retrieve tool could never return them. Leave ccr to the Bun path.
    const safe = options.strategies && options.strategies.ccr
      ? { ...options, strategies: { ...options.strategies, ccr: false } }
      : options
    runPipeline(body, { ...ctx, state: {} }, safe)
    return body
  } catch (error) {
    // A failed compression never becomes a failed model request.
    console.log("compress-core: fail-open:", error && error.message)
    return
  }
}
