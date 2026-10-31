// magpie moejs middleware: the same tested pipeline, or a no-op when the Bun
// companion has already compressed this request. Strategies ported from OmniRoute.
import { runPipeline } from "./pipeline.js"

export function onRequest(body, ctx) {
  try {
    const options = ctx.options && typeof ctx.options === "object" ? ctx.options : {}
    // This path has no shared CCR store: the Bun hook owns it. ccr is on by default
    // (DEFAULT_STRATEGIES.ccr === true) and a fresh install passes options: {}, so the
    // guard has to be unconditional — otherwise markers are written here with no
    // originals persisted and the retrieve tool can never return them.
    const safe = { ...options, strategies: { ...(options.strategies || {}), ccr: false } }
    runPipeline(body, { ...ctx, state: {} }, safe)
    return body
  } catch (error) {
    // A failed compression never becomes a failed model request.
    console.log("compress-core: fail-open:", error && error.message)
    return
  }
}
