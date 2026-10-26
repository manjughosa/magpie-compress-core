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
    runPipeline(body, { ...ctx, state: {} }, options)
    return body
  } catch (error) {
    // A failed compression never becomes a failed model request.
    console.log("compress-core: fail-open:", error && error.message)
    return
  }
}
