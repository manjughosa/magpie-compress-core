// adapter.js — protocol-aware text segment extraction/rewrite for magpie gateway
// middleware. A "segment" is one editable text unit inside a request body.
// Engines never touch body shapes; they only see ordered segments.
//
// Segment: { text, role, toolOutput, index, set(next) }
//   role:       "system" | "user" | "assistant" | "tool" | "unknown"
//   toolOutput: true when the segment carries a tool/function result
//   index:      position of the owning message inside its conversation array
//               (system-level segments get -1)
//   set(next):  writes the (possibly compressed) text back in place
//
// Supported ctx.protocol values: "chat" | "responses" | "anthropic" | "gemini".
// Unknown protocols yield an empty view so engines no-op.

export function conversationView(body, protocol) {
  if (!body || typeof body !== "object") return null
  const segments = []
  if (protocol === "chat") chatSegments(body, segments)
  else if (protocol === "responses") responsesSegments(body, segments)
  else if (protocol === "anthropic") anthropicSegments(body, segments)
  else if (protocol === "gemini") geminiSegments(body, segments)
  else return null
  return { protocol, body, segments }
}

function push(segments, holder, key, role, toolOutput, index) {
  const text = holder[key]
  if (typeof text !== "string" || text.length === 0) return
  segments.push({
    text,
    role,
    toolOutput,
    index,
    set(next) {
      if (typeof next === "string" && next !== holder[key]) holder[key] = next
    },
  })
}

function normRole(role) {
  if (role === "system" || role === "developer") return "system"
  if (role === "user") return "user"
  if (role === "assistant" || role === "model") return "assistant"
  if (role === "tool" || role === "function") return "tool"
  return "unknown"
}

// ---- chat: OpenAI Chat Completions ----
// body.messages: [{role, content: string | [{type:"text", text} | ...]}]
function chatSegments(body, segments) {
  const msgs = body.messages
  if (!Array.isArray(msgs)) return
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (!m || typeof m !== "object") continue
    const role = normRole(m.role)
    const isTool = role === "tool"
    if (typeof m.content === "string") {
      push(segments, m, "content", role, isTool, i)
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
          push(segments, part, "text", role, isTool, i)
        }
      }
    }
  }
}

// ---- responses: OpenAI Responses API ----
// body.instructions?: string
// body.input: [{type:"message", role, content:[{type:"input_text"|"output_text", text}]}
//              | {role, content: string | parts}                       (loose message item)
//              | {type:"function_call_output", output: string}]
function responsesSegments(body, segments) {
  if (typeof body.instructions === "string") {
    push(segments, body, "instructions", "system", false, -1)
  }
  const items = body.input
  if (!Array.isArray(items)) return
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it || typeof it !== "object") continue
    if (it.type === "function_call_output" && typeof it.output === "string") {
      push(segments, it, "output", "tool", true, i)
      continue
    }
    // message items: explicit type "message" or loose {role, content}
    if (it.type !== undefined && it.type !== "message") continue
    const role = normRole(it.role)
    if (typeof it.content === "string") {
      push(segments, it, "content", role, false, i)
    } else if (Array.isArray(it.content)) {
      for (const part of it.content) {
        if (
          part &&
          typeof part === "object" &&
          (part.type === "input_text" || part.type === "output_text" || part.type === "text") &&
          typeof part.text === "string"
        ) {
          push(segments, part, "text", role, false, i)
        }
      }
    }
  }
}

// ---- anthropic: Claude Messages ----
// body.system?: string | [{type:"text", text}]
// body.messages: [{role:"user"|"assistant", content: string | blocks}]
//   text block:       {type:"text", text}
//   tool_result block:{type:"tool_result", content: string | [{type:"text", text}]}
function anthropicSegments(body, segments) {
  if (typeof body.system === "string") {
    push(segments, body, "system", "system", false, -1)
  } else if (Array.isArray(body.system)) {
    for (const part of body.system) {
      if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
        push(segments, part, "text", "system", false, -1)
      }
    }
  }
  const msgs = body.messages
  if (!Array.isArray(msgs)) return
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (!m || typeof m !== "object") continue
    const role = normRole(m.role)
    if (typeof m.content === "string") {
      push(segments, m, "content", role, false, i)
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (!part || typeof part !== "object") continue
        if (part.type === "text" && typeof part.text === "string") {
          push(segments, part, "text", role, false, i)
        } else if (part.type === "tool_result") {
          if (typeof part.content === "string") {
            push(segments, part, "content", "tool", true, i)
          } else if (Array.isArray(part.content)) {
            for (const sub of part.content) {
              if (sub && typeof sub === "object" && sub.type === "text" && typeof sub.text === "string") {
                push(segments, sub, "text", "tool", true, i)
              }
            }
          }
        }
      }
    }
  }
}

// ---- gemini: Google Generative AI ----
// body.systemInstruction?: {parts:[{text}]}
// body.contents: [{role:"user"|"model", parts:[{text}]}]
function geminiSegments(body, segments) {
  if (body.systemInstruction && typeof body.systemInstruction === "object" && Array.isArray(body.systemInstruction.parts)) {
    for (const part of body.systemInstruction.parts) {
      if (part && typeof part === "object" && typeof part.text === "string") {
        push(segments, part, "text", "system", false, -1)
      }
    }
  }
  const contents = body.contents
  if (!Array.isArray(contents)) return
  for (let i = 0; i < contents.length; i++) {
    const c = contents[i]
    if (!c || typeof c !== "object" || !Array.isArray(c.parts)) continue
    const role = normRole(c.role)
    for (const part of c.parts) {
      if (part && typeof part === "object" && typeof part.text === "string") {
        push(segments, part, "text", role, false, i)
      }
    }
  }
}
