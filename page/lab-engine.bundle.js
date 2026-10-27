(() => {
  var __defProp = Object.defineProperty;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // engines/session-dedup.js
  var exports_session_dedup = {};
  __export(exports_session_dedup, {
    apply: () => apply2,
    applySessionDedup: () => applySessionDedup,
    callerSupportsCcrRetrieve: () => callerSupportsCcrRetrieve,
    defaultOn: () => defaultOn2,
    findNearDuplicates: () => findNearDuplicates,
    id: () => id2,
    jaccard: () => jaccard,
    restoreDedup: () => restoreDedup,
    shingles: () => shingles
  });

  // hash.js
  var K = [
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ];
  function rotr(x, n) {
    return x >>> n | x << 32 - n;
  }
  function sha256hex(input) {
    const bytes = [];
    for (let i = 0;i < input.length; i++) {
      let c = input.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < input.length) {
        const c2 = input.charCodeAt(i + 1);
        if (c2 >= 56320 && c2 <= 57343) {
          c = 65536 + (c - 55296 << 10) + (c2 - 56320);
          i++;
        }
      }
      if (c < 128)
        bytes.push(c);
      else if (c < 2048)
        bytes.push(192 | c >> 6, 128 | c & 63);
      else if (c < 65536)
        bytes.push(224 | c >> 12, 128 | c >> 6 & 63, 128 | c & 63);
      else
        bytes.push(240 | c >> 18, 128 | c >> 12 & 63, 128 | c >> 6 & 63, 128 | c & 63);
    }
    const bitLen = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56)
      bytes.push(0);
    bytes.push(0, 0, 0, 0, bitLen >>> 24 & 255, bitLen >>> 16 & 255, bitLen >>> 8 & 255, bitLen & 255);
    let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
    let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
    const w = new Array(64);
    for (let off = 0;off < bytes.length; off += 64) {
      for (let t = 0;t < 16; t++) {
        w[t] = bytes[off + t * 4] << 24 | bytes[off + t * 4 + 1] << 16 | bytes[off + t * 4 + 2] << 8 | bytes[off + t * 4 + 3];
      }
      for (let t = 16;t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ w[t - 15] >>> 3;
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ w[t - 2] >>> 10;
        w[t] = w[t - 16] + s0 + w[t - 7] + s1 | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let t = 0;t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = e & f ^ ~e & g;
        const temp1 = h + S1 + ch + K[t] + w[t] | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = a & b ^ a & c ^ b & c;
        const temp2 = S0 + maj | 0;
        h = g;
        g = f;
        f = e;
        e = d + temp1 | 0;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2 | 0;
      }
      h0 = h0 + a | 0;
      h1 = h1 + b | 0;
      h2 = h2 + c | 0;
      h3 = h3 + d | 0;
      h4 = h4 + e | 0;
      h5 = h5 + f | 0;
      h6 = h6 + g | 0;
      h7 = h7 + h | 0;
    }
    const hs = [h0, h1, h2, h3, h4, h5, h6, h7];
    let out = "";
    for (const h of hs)
      out += (h >>> 0).toString(16).padStart(8, "0");
    return out;
  }

  // engines/lite.js
  var exports_lite = {};
  __export(exports_lite, {
    apply: () => apply,
    applyLiteCompression: () => applyLiteCompression,
    collapseWhitespace: () => collapseWhitespace,
    compressToolResults: () => compressToolResults,
    createCompressionStats: () => createCompressionStats,
    dedupSystemPrompt: () => dedupSystemPrompt,
    defaultOn: () => defaultOn,
    id: () => id,
    isUsableLiteMaxToolLength: () => isUsableLiteMaxToolLength,
    isVisionModelId: () => isVisionModelId,
    removeRedundantContent: () => removeRedundantContent,
    replaceImageUrls: () => replaceImageUrls,
    resolveLiteMaxToolLength: () => resolveLiteMaxToolLength
  });

  // adapter.js
  function conversationView(body, protocol) {
    if (!body || typeof body !== "object")
      return null;
    const segments = [];
    if (protocol === "chat")
      chatSegments(body, segments);
    else if (protocol === "responses")
      responsesSegments(body, segments);
    else if (protocol === "anthropic")
      anthropicSegments(body, segments);
    else if (protocol === "gemini")
      geminiSegments(body, segments);
    else
      return null;
    return { protocol, body, segments };
  }
  function push(segments, holder, key, role, toolOutput, index) {
    const text = holder[key];
    if (typeof text !== "string" || text.length === 0)
      return;
    segments.push({
      text,
      role,
      toolOutput,
      index,
      set(next) {
        if (typeof next === "string" && next !== holder[key])
          holder[key] = next;
      }
    });
  }
  function normRole(role) {
    if (role === "system" || role === "developer")
      return "system";
    if (role === "user")
      return "user";
    if (role === "assistant" || role === "model")
      return "assistant";
    if (role === "tool" || role === "function")
      return "tool";
    return "unknown";
  }
  function chatSegments(body, segments) {
    const msgs = body.messages;
    if (!Array.isArray(msgs))
      return;
    for (let i = 0;i < msgs.length; i++) {
      const m = msgs[i];
      if (!m || typeof m !== "object")
        continue;
      const role = normRole(m.role);
      const isTool = role === "tool";
      if (typeof m.content === "string") {
        push(segments, m, "content", role, isTool, i);
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
            push(segments, part, "text", role, isTool, i);
          }
        }
      }
    }
  }
  function responsesSegments(body, segments) {
    if (typeof body.instructions === "string") {
      push(segments, body, "instructions", "system", false, -1);
    }
    const items = body.input;
    if (!Array.isArray(items))
      return;
    for (let i = 0;i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it !== "object")
        continue;
      if (it.type === "function_call_output" && typeof it.output === "string") {
        push(segments, it, "output", "tool", true, i);
        continue;
      }
      if (it.type !== undefined && it.type !== "message")
        continue;
      const role = normRole(it.role);
      if (typeof it.content === "string") {
        push(segments, it, "content", role, false, i);
      } else if (Array.isArray(it.content)) {
        for (const part of it.content) {
          if (part && typeof part === "object" && (part.type === "input_text" || part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
            push(segments, part, "text", role, false, i);
          }
        }
      }
    }
  }
  function anthropicSegments(body, segments) {
    if (typeof body.system === "string") {
      push(segments, body, "system", "system", false, -1);
    } else if (Array.isArray(body.system)) {
      for (const part of body.system) {
        if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
          push(segments, part, "text", "system", false, -1);
        }
      }
    }
    const msgs = body.messages;
    if (!Array.isArray(msgs))
      return;
    for (let i = 0;i < msgs.length; i++) {
      const m = msgs[i];
      if (!m || typeof m !== "object")
        continue;
      const role = normRole(m.role);
      if (typeof m.content === "string") {
        push(segments, m, "content", role, false, i);
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (!part || typeof part !== "object")
            continue;
          if (part.type === "text" && typeof part.text === "string") {
            push(segments, part, "text", role, false, i);
          } else if (part.type === "tool_result") {
            if (typeof part.content === "string") {
              push(segments, part, "content", "tool", true, i);
            } else if (Array.isArray(part.content)) {
              for (const sub of part.content) {
                if (sub && typeof sub === "object" && sub.type === "text" && typeof sub.text === "string") {
                  push(segments, sub, "text", "tool", true, i);
                }
              }
            }
          }
        }
      }
    }
  }
  function geminiSegments(body, segments) {
    if (body.systemInstruction && typeof body.systemInstruction === "object" && Array.isArray(body.systemInstruction.parts)) {
      for (const part of body.systemInstruction.parts) {
        if (part && typeof part === "object" && typeof part.text === "string") {
          push(segments, part, "text", "system", false, -1);
        }
      }
    }
    const contents = body.contents;
    if (!Array.isArray(contents))
      return;
    for (let i = 0;i < contents.length; i++) {
      const c = contents[i];
      if (!c || typeof c !== "object" || !Array.isArray(c.parts))
        continue;
      const role = normRole(c.role);
      for (const part of c.parts) {
        if (part && typeof part === "object" && typeof part.text === "string") {
          push(segments, part, "text", role, false, i);
        }
      }
    }
  }

  // engines/lite.js
  var DEFAULT_MAX_TOOL_LENGTH = 2000;
  var MIN_MAX_TOOL_LENGTH = 256;
  var MAX_MAX_TOOL_LENGTH = 1e6;
  var TOOL_TRUNCATION_LOOKBACK = 80;
  var TRUNCATION_SUFFIX = `
...[truncated]`;
  var VISION_MODEL_ID_FRAGMENTS = [
    "pixtral",
    "llava",
    "bakllava",
    "qwen-vl",
    "qwen2-vl",
    "qwen2.5-vl",
    "qwen3-vl",
    "qvq",
    "internvl",
    "minicpm-v",
    "moondream",
    "mimo-vl",
    "mimo-v2.5",
    "mimo-v2.6-pro",
    "mimo-v2.6-flash",
    "step-3.7-flash",
    "kimi-vl",
    "glm-4v",
    "glm-4.5v",
    "glm-4.6v",
    "glm-5.3",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4-turbo",
    "gpt-4-vision",
    "gpt-5",
    "gemini-1.5",
    "gemini-2",
    "gemini-3",
    "gemini-4",
    "gemini-exp",
    "claude-3",
    "claude-fable",
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-haiku-4",
    "claude-fable",
    "mistral-medium-3",
    "minimax-m3",
    "kimi-k2.",
    "hcx-005",
    "-vision",
    "multimodal"
  ];
  function isVisionModelId(modelId) {
    if (!modelId)
      return false;
    const normalized = String(modelId).toLowerCase();
    if (/(?:^|\/)mimo-v2\.5-pro(?:$|[:/])/i.test(normalized))
      return false;
    if (/(?:^|\/)mimo-v2-pro(?:$|[:/])/i.test(normalized))
      return false;
    return VISION_MODEL_ID_FRAGMENTS.some((f) => normalized.includes(f));
  }
  function isUsableLiteMaxToolLength(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
      return false;
    const n = Math.floor(value);
    return n >= MIN_MAX_TOOL_LENGTH && n <= MAX_MAX_TOOL_LENGTH;
  }
  function resolveLiteMaxToolLength(maxToolLength) {
    if (isUsableLiteMaxToolLength(maxToolLength))
      return Math.floor(maxToolLength);
    return DEFAULT_MAX_TOOL_LENGTH;
  }
  function normalizeMessageWhitespace(content) {
    if (!content)
      return "";
    return content.replace(/\n{3,}/g, `

`).replace(/[ \t]+$/gm, "");
  }
  function collapseWhitespace(body, options) {
    options = options || {};
    if (!body.messages)
      return { body, applied: false };
    let applied = false;
    const messages = body.messages.map((msg) => {
      if (options.preserveSystemPrompt === true && msg.role === "system")
        return msg;
      if (typeof msg.content !== "string")
        return msg;
      const normalized = normalizeMessageWhitespace(msg.content);
      if (normalized !== msg.content)
        applied = true;
      return { ...msg, content: normalized };
    });
    return { body: { ...body, messages }, applied };
  }
  function dedupSystemPrompt(body, options) {
    options = options || {};
    if (!body.messages)
      return { body, applied: false };
    if (options.preserveSystemPrompt === true)
      return { body, applied: false };
    const seen = new Set;
    let applied = false;
    const messages = body.messages.filter((msg) => {
      if (msg.role !== "system" || typeof msg.content !== "string")
        return true;
      const key = msg.content.trim().slice(0, 200);
      if (seen.has(key)) {
        applied = true;
        return false;
      }
      seen.add(key);
      return true;
    });
    return { body: { ...body, messages }, applied };
  }
  function isWordChar(char) {
    return char !== undefined && /\S/.test(char);
  }
  function findWhitespaceBackward(content, cutIndex) {
    const windowStart = Math.max(0, cutIndex - TOOL_TRUNCATION_LOOKBACK);
    for (let i = cutIndex;i > windowStart; i--) {
      if (!isWordChar(content[i - 1]))
        return i - 1;
    }
    return -1;
  }
  function findWhitespaceForward(content, cutIndex) {
    const windowEnd = Math.min(content.length, cutIndex + TOOL_TRUNCATION_LOOKBACK);
    for (let i = cutIndex;i < windowEnd; i++) {
      if (!isWordChar(content[i]))
        return i;
    }
    return -1;
  }
  function backOffToWordBoundary(content, cutIndex) {
    const onWordBoundary = !isWordChar(content[cutIndex - 1]) || !isWordChar(content[cutIndex]);
    if (onWordBoundary)
      return cutIndex;
    const backward = findWhitespaceBackward(content, cutIndex);
    if (backward !== -1)
      return backward;
    const forward = findWhitespaceForward(content, cutIndex);
    if (forward !== -1)
      return forward;
    return cutIndex;
  }
  function truncateToolText(text, maxLength) {
    if (typeof text !== "string" || text.length <= maxLength)
      return text;
    const headBudget = Math.max(1, Math.floor(maxLength / 2));
    const tailBudget = Math.max(1, maxLength - headBudget);
    const headCut = backOffToWordBoundary(text, headBudget);
    const tailStart = text.length - tailBudget;
    const tailCut = backOffToWordBoundary(text, tailStart);
    if (tailCut <= headCut)
      return text.slice(0, headCut) + TRUNCATION_SUFFIX;
    return text.slice(0, headCut) + TRUNCATION_SUFFIX + text.slice(tailCut);
  }
  function truncateToolResultBlocks(msg, maxLength) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) {
      return { message: msg, applied: false };
    }
    let applied = false;
    const content = msg.content.map((block) => {
      if (!block || typeof block !== "object" || block.type !== "tool_result")
        return block;
      const inner = block.content;
      if (typeof inner === "string") {
        if (inner.length <= maxLength)
          return block;
        applied = true;
        return { ...block, content: truncateToolText(inner, maxLength) };
      }
      if (Array.isArray(inner)) {
        let innerApplied = false;
        const newInner = inner.map((part) => {
          if (!part || typeof part !== "object" || part.type !== "text")
            return part;
          if (typeof part.text !== "string" || part.text.length <= maxLength)
            return part;
          innerApplied = true;
          return { ...part, text: truncateToolText(part.text, maxLength) };
        });
        if (innerApplied) {
          applied = true;
          return { ...block, content: newInner };
        }
        return block;
      }
      return block;
    });
    if (applied)
      return { message: { ...msg, content }, applied: true };
    return { message: msg, applied: false };
  }
  function compressToolResults(body, options) {
    options = options || {};
    if (!body.messages)
      return { body, applied: false };
    const MAX_TOOL_LENGTH = resolveLiteMaxToolLength(options.maxToolLength);
    let lastAssistant = -1;
    for (let i = body.messages.length - 1;i >= 0; i--) {
      if (body.messages[i] && body.messages[i].role === "assistant") {
        lastAssistant = i;
        break;
      }
    }
    const currentTurnStart = lastAssistant === -1 ? body.messages.length : lastAssistant + 1;
    let applied = false;
    const messages = body.messages.map((msg, index) => {
      if (index >= currentTurnStart)
        return msg;
      if (msg.role === "tool" && typeof msg.content === "string") {
        if (msg.content.length <= MAX_TOOL_LENGTH)
          return msg;
        applied = true;
        return { ...msg, content: truncateToolText(msg.content, MAX_TOOL_LENGTH) };
      }
      const r = truncateToolResultBlocks(msg, MAX_TOOL_LENGTH);
      if (r.applied)
        applied = true;
      return r.message;
    });
    return { body: { ...body, messages }, applied };
  }
  function removeRedundantContent(body, options) {
    options = options || {};
    if (!body.messages)
      return { body, applied: false };
    let applied = false;
    const messages = [];
    for (let i = 0;i < body.messages.length; i++) {
      const msg = body.messages[i];
      if (options.preserveSystemPrompt === true && msg.role === "system") {
        messages.push(msg);
        continue;
      }
      const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const prev = i > 0 ? body.messages[i - 1] : undefined;
      if (i > 0 && msg.role !== "tool" && prev && prev.role === msg.role && typeof prev.content === "string" && prev.content === contentStr) {
        applied = true;
        continue;
      }
      messages.push(msg);
    }
    return { body: { ...body, messages }, applied };
  }
  function replaceImageUrls(body, options) {
    if (!body.messages)
      return { body, applied: false };
    let supportsVision;
    if (typeof options === "string") {
      supportsVision = isVisionModelId(options);
    } else if (options && typeof options === "object") {
      supportsVision = options.supportsVision;
    }
    if (supportsVision !== false)
      return { body, applied: false };
    let applied = false;
    const messages = body.messages.map((msg) => {
      if (!Array.isArray(msg.content))
        return msg;
      const newContent = msg.content.map((part) => {
        if (part && typeof part === "object" && part.type === "image_url" && part.image_url && typeof part.image_url === "object" && part.image_url.url) {
          const url = String(part.image_url.url);
          if (url.startsWith("data:image/")) {
            applied = true;
            const format = url.slice(url.indexOf("/") + 1, url.indexOf(";")) || "unknown";
            return { type: "text", text: "[image: " + format + "]" };
          }
        }
        return part;
      });
      return { ...msg, content: newContent };
    });
    return { body: { ...body, messages }, applied };
  }
  function estimateTokensMin(value) {
    if (!value)
      return 0;
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return Math.ceil(s.length / 4);
  }
  function createCompressionStats(originalBody, compressedBody, mode, techniquesUsed) {
    const originalTokens = estimateTokensMin(originalBody);
    const compressedTokens = estimateTokensMin(compressedBody);
    const savingsPercent = originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 1e4) / 100 : 0;
    return { originalTokens, compressedTokens, savingsPercent, techniquesUsed, mode, timestamp: Date.now() };
  }
  function applyLiteCompression(body, options) {
    options = options || {};
    const originalBody = body;
    let current = body;
    const techniquesApplied = [];
    let r = collapseWhitespace(current, options);
    if (r.applied)
      techniquesApplied.push("whitespace");
    current = r.body;
    r = dedupSystemPrompt(current, options);
    if (r.applied)
      techniquesApplied.push("system-dedup");
    current = r.body;
    if (options.compressToolResults !== false) {
      r = compressToolResults(current, options);
      if (r.applied)
        techniquesApplied.push("tool-compress");
      current = r.body;
    }
    r = removeRedundantContent(current, options);
    if (r.applied)
      techniquesApplied.push("redundant-remove");
    current = r.body;
    r = replaceImageUrls(current, options);
    if (r.applied)
      techniquesApplied.push("image-placeholder");
    current = r.body;
    const compressed = techniquesApplied.length > 0;
    return {
      body: current,
      compressed,
      techniquesApplied,
      stats: compressed ? createCompressionStats(originalBody, current, "lite", techniquesApplied) : null
    };
  }
  var id = "lite";
  var defaultOn = true;
  function apply(body, ctx, cfg) {
    if (!body || typeof body !== "object")
      return false;
    const opts = {
      preserveSystemPrompt: cfg && cfg.preserveSystemPrompt === true,
      compressToolResults: !(cfg && cfg.compressToolResults === false),
      maxToolLength: cfg ? cfg.maxToolLength : undefined,
      supportsVision: cfg && typeof cfg.supportsVision === "boolean" ? cfg.supportsVision : isVisionModelId(body.model)
    };
    if (Array.isArray(body.messages)) {
      const r = applyLiteCompression(body, opts);
      if (!r.compressed)
        return false;
      body.messages = r.body.messages;
      if (ctx && ctx.state)
        ctx.state.lite = { techniques: r.techniquesApplied, stats: r.stats };
      return true;
    }
    const view = conversationView(body, ctx && ctx.protocol);
    if (!view)
      return false;
    let changed = false;
    for (const seg of view.segments) {
      if (opts.preserveSystemPrompt === true && seg.role === "system")
        continue;
      const next = normalizeMessageWhitespace(seg.text);
      if (next !== seg.text) {
        seg.set(next);
        changed = true;
      }
    }
    if (changed && ctx && ctx.state)
      ctx.state.lite = { techniques: ["whitespace"], fallback: "segments" };
    return changed;
  }

  // engines/session-dedup.js
  var DEFAULT_MIN_BLOCK_CHARS = 80;
  var MIN_BLOCK_LINES = 3;
  var MAX_SUFFIX_STARTS = 2000;
  var MAX_TOTAL_BLOCK_BYTES = 8 * 1024 * 1024;
  function hashBlock(text) {
    return sha256hex(text).slice(0, 24);
  }
  function findSuffixBlocks(lines, minBlockChars) {
    const n = lines.length;
    const seen = new Set;
    const results = [];
    const maxStarts = Math.min(n, MAX_SUFFIX_STARTS);
    let totalBlockBytes = 0;
    for (let start = 0;start < maxStarts; start++) {
      const block = lines.slice(start).join(`
`);
      const blockLines = n - start;
      if (blockLines >= MIN_BLOCK_LINES && block.length >= minBlockChars && !seen.has(block)) {
        seen.add(block);
        results.push({ block, startLine: start });
        totalBlockBytes += block.length;
        if (totalBlockBytes >= MAX_TOTAL_BLOCK_BYTES)
          break;
      }
    }
    return results;
  }
  function countLiteralOccurrences(text, needle) {
    if (!needle)
      return 0;
    let count = 0;
    let offset = 0;
    while (true) {
      const idx = text.indexOf(needle, offset);
      if (idx === -1)
        return count;
      count++;
      offset = idx + needle.length;
    }
  }
  function replaceLiteralOccurrencesAfterFirst(text, needle, replacement) {
    if (!needle)
      return text;
    const first = text.indexOf(needle);
    if (first === -1)
      return text;
    let result = text.slice(0, first + needle.length);
    let offset = first + needle.length;
    while (true) {
      const idx = text.indexOf(needle, offset);
      if (idx === -1) {
        result += text.slice(offset);
        return result;
      }
      result += text.slice(offset, idx) + replacement;
      offset = idx + needle.length;
    }
  }
  function dedupeWithinMessage(text, minBlockChars, blockMap, deadline) {
    const lines = text.split(`
`);
    const blocks = findSuffixBlocks(lines, minBlockChars);
    if (blocks.length < 2)
      return { deduped: text, changed: false };
    const blockFreq = new Map;
    for (const { block } of blocks) {
      blockFreq.set(block, (blockFreq.get(block) || 0) + 1);
    }
    const sortedBlocks = [...blocks].sort((a, b) => {
      const freqDiff = (blockFreq.get(b.block) || 0) - (blockFreq.get(a.block) || 0);
      return freqDiff !== 0 ? freqDiff : b.block.length - a.block.length;
    });
    let result = text;
    let changed = false;
    for (const { block } of sortedBlocks) {
      if (deadline && Date.now() > deadline)
        break;
      const occurrences = countLiteralOccurrences(result, block);
      if (occurrences < 2)
        continue;
      const sha = hashBlock(block);
      const marker = `[dedup:ref sha=${sha}]`;
      result = replaceLiteralOccurrencesAfterFirst(result, block, marker);
      changed = true;
      if (blockMap && !blockMap.has(sha))
        blockMap.set(sha, block);
    }
    return { deduped: result, changed };
  }
  function dedupMessageTexts(msgTexts, minBlockChars, currentTurnStart, blockMap, deadline) {
    const deduped = new Map;
    let dedupCount = 0;
    const over = () => deadline && Date.now() > deadline;
    if (msgTexts.length === 1) {
      const { text, msgIdx } = msgTexts[0];
      const r = dedupeWithinMessage(text, minBlockChars, blockMap, deadline);
      if (r.changed) {
        deduped.set(msgIdx, r.deduped);
        dedupCount++;
      }
      return { deduped, dedupCount };
    }
    const perSlot = [];
    for (const { msgIdx, messageIndex, text } of msgTexts) {
      if (over()) {
        perSlot.push({ msgIdx, messageIndex, text, blocks: [] });
        continue;
      }
      perSlot.push({
        msgIdx,
        messageIndex,
        text,
        blocks: findSuffixBlocks(text.split(`
`), minBlockChars).map(({ block }) => ({
          block,
          sha: hashBlock(block)
        }))
      });
    }
    const firstSeen = new Map;
    for (const { msgIdx, blocks } of perSlot) {
      for (const { block, sha } of blocks) {
        if (!firstSeen.has(sha)) {
          firstSeen.set(sha, { ownerMsgIdx: msgIdx, block });
        }
      }
    }
    if (blockMap) {
      for (const [sha, { block }] of firstSeen) {
        if (!blockMap.has(sha))
          blockMap.set(sha, block);
      }
    }
    for (const { msgIdx, messageIndex, text, blocks } of perSlot) {
      if (messageIndex >= currentTurnStart)
        continue;
      const dupBlocks = [];
      for (const { block, sha } of blocks) {
        const owner = firstSeen.get(sha);
        if (owner && owner.ownerMsgIdx < msgIdx && owner.block === block) {
          dupBlocks.push({ block, sha });
        }
      }
      if (dupBlocks.length === 0)
        continue;
      dupBlocks.sort((a, b) => b.block.length - a.block.length);
      let result = text;
      let changed = false;
      const replaced = new Set;
      for (const { block, sha } of dupBlocks) {
        if ([...replaced].some((r) => r.includes(block)))
          continue;
        const idx = result.indexOf(block);
        if (idx !== -1) {
          const marker = `[dedup:ref sha=${sha}]`;
          result = result.slice(0, idx) + marker + result.slice(idx + block.length);
          changed = true;
          replaced.add(block);
          break;
        }
      }
      if (changed) {
        deduped.set(msgIdx, result);
        dedupCount++;
      }
    }
    return { deduped, dedupCount };
  }
  function collectTextSlots(msg) {
    if (typeof msg.content === "string")
      return [msg.content];
    if (!Array.isArray(msg.content))
      return [];
    const texts = [];
    for (const part of msg.content) {
      if (part["type"] === "text" && typeof part["text"] === "string") {
        texts.push(part["text"]);
        continue;
      }
      if (part["type"] !== "tool_result")
        continue;
      const inner = part["content"];
      if (typeof inner === "string") {
        texts.push(inner);
      } else if (Array.isArray(inner)) {
        for (const block of inner) {
          if (block["type"] === "text" && typeof block["text"] === "string") {
            texts.push(block["text"]);
          }
        }
      }
    }
    return texts;
  }
  function applyTextSlots(msg, baseKey, deduped) {
    if (typeof msg.content === "string") {
      const replacement = deduped.get(baseKey + 1);
      return replacement !== undefined ? { ...msg, content: replacement } : { ...msg };
    }
    if (!Array.isArray(msg.content))
      return { ...msg };
    let slot = 0;
    let changed = false;
    const newContent = msg.content.map((part) => {
      if (part["type"] === "text" && typeof part["text"] === "string") {
        slot++;
        const replacement = deduped.get(baseKey + slot);
        if (replacement !== undefined) {
          changed = true;
          return { ...part, text: replacement };
        }
        return part;
      }
      if (part["type"] !== "tool_result")
        return part;
      const inner = part["content"];
      if (typeof inner === "string") {
        slot++;
        const replacement = deduped.get(baseKey + slot);
        if (replacement !== undefined) {
          changed = true;
          return { ...part, content: replacement };
        }
        return part;
      }
      if (!Array.isArray(inner))
        return part;
      let innerChanged = false;
      const newInner = inner.map((block) => {
        if (block["type"] !== "text" || typeof block["text"] !== "string")
          return block;
        slot++;
        const replacement = deduped.get(baseKey + slot);
        if (replacement !== undefined) {
          innerChanged = true;
          return { ...block, text: replacement };
        }
        return block;
      });
      if (!innerChanged)
        return part;
      changed = true;
      return { ...part, content: newInner };
    });
    return changed ? { ...msg, content: newContent } : { ...msg };
  }
  function processMessages(messages, minBlockChars, blockMap, deadline) {
    const msgTexts = [];
    for (let i = 0;i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "system")
        continue;
      const slots = collectTextSlots(msg);
      for (let s = 0;s < slots.length; s++) {
        msgTexts.push({ msgIdx: i * 1e5 + s + 1, messageIndex: i, text: slots[s] });
      }
    }
    if (msgTexts.length === 0)
      return { messages, dedupCount: 0 };
    let currentTurnStart = 0;
    for (let i = messages.length - 1;i >= 0; i--) {
      if (messages[i].role === "assistant") {
        currentTurnStart = i + 1;
        break;
      }
    }
    const { deduped, dedupCount } = dedupMessageTexts(msgTexts, minBlockChars, currentTurnStart, blockMap, deadline);
    if (dedupCount === 0)
      return { messages, dedupCount: 0 };
    const result = messages.map((msg, i) => {
      if (msg.role === "system")
        return { ...msg };
      return applyTextSlots(msg, i * 1e5, deduped);
    });
    const dedupMap = [];
    const seenRefs = new Set;
    const refPattern = /\[dedup:ref sha=([0-9a-f]{24})\]/g;
    for (const [, text] of deduped) {
      for (const match of text.matchAll(refPattern)) {
        const sha = match[1];
        if (!seenRefs.has(sha) && blockMap.has(sha)) {
          seenRefs.add(sha);
          dedupMap.push([sha, blockMap.get(sha)]);
        }
      }
    }
    return { messages: result, dedupCount, dedupMap };
  }
  var MAX_FUZZY_BLOCKS = 200;
  var CCR_RETRIEVE_TOOL_NAME = "omniroute_ccr_retrieve";
  var CCR_RETRIEVE_TOOL_NAME_SEPARATORS = ["__", ".", "/", ":"];
  function fnv1a(s) {
    let h = 2166136261;
    for (let i = 0;i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function shingles(text, k) {
    k = k === undefined ? 3 : k;
    const words = text.split(/\s+/).filter(Boolean);
    const out = new Set;
    if (words.length < k)
      return out;
    for (let i = 0;i + k <= words.length; i++) {
      out.add(fnv1a(words.slice(i, i + k).join(" ")));
    }
    return out;
  }
  function jaccard(a, b) {
    if (a.size === 0 && b.size === 0)
      return 0;
    const small = a.size <= b.size ? a : b;
    const large = a.size <= b.size ? b : a;
    let inter = 0;
    for (const x of small)
      if (large.has(x))
        inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }
  function findNearDuplicates(blocks, minJaccard, maxBlocks, shingleSize) {
    if (blocks.length > maxBlocks)
      return [];
    const sets = blocks.map((b) => shingles(b.text, shingleSize === undefined ? 3 : shingleSize));
    const out = [];
    for (let i = 0;i < blocks.length; i++) {
      let best = -1;
      let bestSim = 0;
      for (let j = 0;j < i; j++) {
        const sim = jaccard(sets[i], sets[j]);
        if (sim >= minJaccard && sim > bestSim) {
          bestSim = sim;
          best = j;
        }
      }
      if (best >= 0) {
        out.push({ block: blocks[i], matchedIndex: blocks[best].index, similarity: bestSim });
      }
    }
    return out;
  }
  function buildCcrMarker(hash, charCount) {
    return `[CCR retrieve hash=${hash} chars=${charCount}]`;
  }
  function matchesCcrRetrieveToolName(name) {
    if (typeof name !== "string")
      return false;
    if (name === CCR_RETRIEVE_TOOL_NAME)
      return true;
    return CCR_RETRIEVE_TOOL_NAME_SEPARATORS.some((sep) => name.endsWith(`${sep}${CCR_RETRIEVE_TOOL_NAME}`));
  }
  function callerSupportsCcrRetrieve(body) {
    const tools = body["tools"];
    if (!Array.isArray(tools))
      return false;
    return tools.some((tool) => {
      const flatName = tool && typeof tool.name === "string" ? tool.name : undefined;
      const fn = tool && tool.function && typeof tool.function.name === "string" ? tool.function.name : undefined;
      return matchesCcrRetrieveToolName(flatName) || matchesCcrRetrieveToolName(fn);
    });
  }
  function applyFuzzyPass(messages, opts, store) {
    try {
      const blocks = [];
      for (let i = 0;i < messages.length; i++) {
        const m = messages[i];
        if (m.role === "system")
          continue;
        if (typeof m.content === "string" && m.content.length >= opts.minBlockChars) {
          blocks.push({ text: m.content, index: i });
        }
      }
      if (blocks.length < 2)
        return { messages, fuzzyCount: 0 };
      const nearDups = findNearDuplicates(blocks, opts.minJaccard, opts.maxBlocks, opts.shingleSize);
      if (nearDups.length === 0)
        return { messages, fuzzyCount: 0 };
      const replacements = new Map;
      for (const nd of nearDups) {
        const hash = hashBlock(nd.block.text);
        store.set(hash, nd.block.text);
        const marker = buildCcrMarker(hash, nd.block.text.length);
        if (marker.length < nd.block.text.length)
          replacements.set(nd.block.index, marker);
      }
      if (replacements.size === 0)
        return { messages, fuzzyCount: 0 };
      const out = messages.map((m, i) => replacements.has(i) ? { ...m, content: replacements.get(i) } : m);
      return { messages: out, fuzzyCount: replacements.size, store };
    } catch {
      return { messages, fuzzyCount: 0 };
    }
  }
  function runFuzzyPass(messages, stepConfig, minBlockChars, callerCanRetrieve, store) {
    const raw = stepConfig["fuzzy"];
    const cfg = typeof raw === "boolean" ? { enabled: raw } : raw;
    if (!cfg || !cfg.enabled)
      return { messages, fuzzyCount: 0 };
    if (!callerCanRetrieve)
      return { messages, fuzzyCount: 0 };
    return applyFuzzyPass(messages, {
      minJaccard: typeof cfg.minJaccard === "number" ? cfg.minJaccard : 0.85,
      shingleSize: typeof cfg.shingleSize === "number" ? cfg.shingleSize : 3,
      maxBlocks: MAX_FUZZY_BLOCKS,
      minBlockChars
    }, store);
  }
  function applySessionDedup(body, stepConfig) {
    stepConfig = stepConfig || {};
    if (stepConfig["enabled"] === false)
      return { body, compressed: false, stats: null };
    const minBlockChars = typeof stepConfig["minBlockChars"] === "number" ? stepConfig["minBlockChars"] : DEFAULT_MIN_BLOCK_CHARS;
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const start = Date.now();
    const budgetMs = typeof stepConfig["timeBudgetMs"] === "number" ? stepConfig["timeBudgetMs"] : 120;
    const deadline = typeof stepConfig["deadlineAt"] === "number" ? stepConfig["deadlineAt"] : budgetMs > 0 ? start + budgetMs : 0;
    const blockMap = new Map;
    const { messages: exactMessages, dedupCount, dedupMap } = processMessages(messages, minBlockChars, blockMap, deadline);
    const store = new Map;
    const { messages: finalMessages, fuzzyCount } = runFuzzyPass(exactMessages, stepConfig, minBlockChars, callerSupportsCcrRetrieve(body), store);
    if (dedupCount + fuzzyCount === 0)
      return { body, compressed: false, stats: null, blockMap, dedupMap };
    const newBody = { ...body, messages: finalMessages };
    const durationMs = Math.round(Date.now() - start);
    const techniques = ["session-dedup"];
    if (fuzzyCount > 0)
      techniques.push("fuzzy-dedup");
    const stats = createCompressionStats(body, newBody, "stacked", techniques);
    stats.durationMs = durationMs;
    for (const [k, v] of store)
      blockMap.set(k, v);
    return { body: newBody, compressed: true, stats, dedupCount, fuzzyCount, blockMap };
  }
  function restoreDedup(text, map) {
    return text.replace(/\[dedup:ref sha=([0-9a-f]{24})\]/g, (m, sha) => map && map[sha] !== undefined ? map[sha] : m);
  }
  var id2 = "session-dedup";
  var defaultOn2 = true;
  function apply2(body, ctx, cfg) {
    if (!body || typeof body !== "object")
      return false;
    const r = applySessionDedup(body, cfg);
    if (!r.compressed)
      return false;
    body.messages = r.body.messages;
    if (ctx && ctx.state) {
      const map = Object.fromEntries(r.dedupMap || []);
      for (const [k, v] of r.blockMap || [])
        if (!(k in map))
          map[k] = v;
      ctx.state.sessionDedup = {
        dedupCount: r.dedupCount,
        fuzzyCount: r.fuzzyCount,
        stats: r.stats,
        map
      };
    }
    return true;
  }

  // engines/rtk/index.js
  var exports_rtk = {};
  __export(exports_rtk, {
    apply: () => apply3,
    defaultOn: () => defaultOn3,
    id: () => id3
  });

  // engines/rtk/splitCommand.js
  function lastCommandSegment(command) {
    if (!command)
      return command;
    const segments = [];
    let current = 0;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    const push = (end) => {
      segments.push(command.slice(current, end));
    };
    for (let i = 0;i < command.length; i++) {
      const ch = command[i];
      if (inSingle) {
        if (ch === "'")
          inSingle = false;
        continue;
      }
      if (inBacktick) {
        if (ch === "`")
          inBacktick = false;
        continue;
      }
      if (inDouble) {
        if (ch === '"')
          inDouble = false;
        if (ch === "$" && command[i + 1] === "(") {
          depth++;
          i++;
        }
        continue;
      }
      if (depth > 0) {
        if (ch === "(")
          depth++;
        else if (ch === ")")
          depth--;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        continue;
      }
      if (ch === "$" && command[i + 1] === "(") {
        depth++;
        i++;
        continue;
      }
      if (ch === "(") {
        depth++;
        continue;
      }
      if (ch === "&" && command[i + 1] === "&") {
        push(i);
        i += 1;
        current = i + 1;
        continue;
      }
      if (ch === "|" && command[i + 1] === "|") {
        push(i);
        i += 1;
        current = i + 1;
        continue;
      }
      if (ch === ";") {
        push(i);
        current = i + 1;
        continue;
      }
    }
    push(command.length);
    if (segments.length === 1) {
      return command;
    }
    for (let i = segments.length - 1;i >= 0; i--) {
      const trimmed = segments[i].trim();
      if (trimmed)
        return trimmed;
    }
    return command;
  }

  // engines/rtk/commandDetector.js
  var COMMAND_PREFIXES = [
    "git",
    "make",
    "gradle",
    "gradlew",
    "dotnet",
    "terraform",
    "tofu",
    "opentofu",
    "systemctl",
    "npm",
    "pnpm",
    "yarn",
    "vitest",
    "jest",
    "pytest",
    "python",
    "go",
    "cargo",
    "tsc",
    "eslint",
    "webpack",
    "vite",
    "biome",
    "prettier",
    "turbo",
    "nx",
    "playwright",
    "ruff",
    "mypy",
    "pip",
    "uv",
    "poetry",
    "golangci-lint",
    "bundle",
    "rubocop",
    "kubectl",
    "composer",
    "gh",
    "docker",
    "aws",
    "gcloud",
    "ssh",
    "rsync",
    "curl",
    "wget",
    "ls",
    "find",
    "grep",
    "rg",
    "ag",
    "ps",
    "df",
    "du"
  ];
  var COMMAND_PREFIX_PATTERN = new RegExp(`^(?:${COMMAND_PREFIXES.join("|")})\\b`);
  var DETECTORS = [
    {
      type: "git-status",
      category: "git",
      commandPatterns: [/^git\s+status\b/i],
      contentPatterns: [/^On branch /m, /^Changes (?:not staged|to be committed)/m, /^Untracked files:/m]
    },
    {
      type: "git-branch",
      category: "git",
      commandPatterns: [/^git\s+branch\b/i, /^git\s+checkout\b/i, /^git\s+switch\b/i],
      contentPatterns: [/^\*\s+\S+/m, /Switched to (?:a new )?branch/i, /Already on ['"][^'"]+['"]/i]
    },
    {
      type: "git-diff",
      category: "git",
      commandPatterns: [/^git\s+diff\b/i, /^git\s+show\b/i],
      contentPatterns: [/^diff --git /m, /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m]
    },
    {
      type: "git-log",
      category: "git",
      commandPatterns: [/^git\s+log\b/i],
      contentPatterns: [/^commit [0-9a-f]{7,40}/m, /^Author: /m]
    },
    {
      type: "make",
      category: "build",
      commandPatterns: [/^make\b/i],
      contentPatterns: [/^make\[\d+\]: (?:Entering|Leaving) directory/m, /make: \*\*\* /]
    },
    {
      type: "gradle",
      category: "build",
      commandPatterns: [/^(?:gradle|gradlew|\.\/gradlew)\b/i],
      contentPatterns: [/^> Task :/m, /^BUILD (?:SUCCESSFUL|FAILED)\b/m]
    },
    {
      type: "dotnet",
      category: "build",
      commandPatterns: [/^dotnet\s+(?:build|test|run|restore|publish|pack|msbuild)\b/i, /^dotnet\b/i],
      contentPatterns: [/^Build (?:succeeded|FAILED)\b/m, /\b(?:error|warning) CS\d+\b/m]
    },
    {
      type: "terraform-plan",
      category: "infra",
      commandPatterns: [/^terraform\s+plan\b/i],
      contentPatterns: [/Terraform will perform the following actions:/, /Plan: \d+ to add/i]
    },
    {
      type: "tofu-plan",
      category: "infra",
      commandPatterns: [/^(?:tofu|opentofu)\s+plan\b/i],
      contentPatterns: [/OpenTofu will perform the following actions:/, /Plan: \d+ to add/i]
    },
    {
      type: "systemctl-status",
      category: "infra",
      commandPatterns: [/^systemctl\s+status\b/i],
      contentPatterns: [/^\s*Loaded:\s+/m, /^\s*Active:\s+/m, /^●\s+\S+\.service/m]
    },
    {
      type: "test-vitest",
      category: "test",
      commandPatterns: [/^vitest\b/i, /^npm\s+(?:run\s+)?test:vitest\b/i],
      contentPatterns: [/\bvitest\b/i, /^ ✓ /m, /^ ❯ /m, /Test Files\s+\d+\s+(?:passed|failed)/i]
    },
    {
      type: "test-jest",
      category: "test",
      commandPatterns: [/^jest\b/i, /^npm\s+(?:run\s+)?test\b/i],
      contentPatterns: [/Test Suites:\s+\d+/i, /Tests:\s+\d+/i, /^PASS\s+/m, /^FAIL\s+/m]
    },
    {
      type: "test-pytest",
      category: "test",
      commandPatterns: [/^pytest\b/i, /^python\s+-m\s+pytest\b/i],
      contentPatterns: [/=+\s+(?:\d+\s+)?(?:passed|failed|errors?)/i, /^E\s+/m, /^FAILED /m]
    },
    {
      type: "test-cargo",
      category: "test",
      commandPatterns: [/^cargo\s+test\b/i, /^cargo\s+nextest\b/i],
      contentPatterns: [/^running \d+ tests?/m, /^test\s+[\w:.-]+\s+\.\.\.\s+(?:ok|FAILED|ignored)/m, /test result:\s+(?:ok|FAILED)/i]
    },
    {
      type: "test-go",
      category: "test",
      commandPatterns: [/^go\s+test\b/i],
      contentPatterns: [/^(?:ok|FAIL)\s+[\w./-]+\s+[\d.]+s/m, /^--- FAIL: /m, /^panic: /m]
    },
    {
      type: "build-typescript",
      category: "build",
      commandPatterns: [/^tsc\b/i, /^npm\s+run\s+typecheck\b/i],
      contentPatterns: [/TS\d{4}:/, /error TS\d{4}/i]
    },
    {
      type: "build-eslint",
      category: "build",
      commandPatterns: [/^eslint\b/i, /^npm\s+run\s+lint\b/i],
      contentPatterns: [/\s+\d+:\d+\s+(?:error|warning)\s+/, /✖\s+\d+\s+problems?/]
    },
    {
      type: "build-webpack",
      category: "build",
      commandPatterns: [/^webpack\b/i, /^npx\s+webpack\b/i, /^npm\s+run\s+build:webpack\b/i],
      contentPatterns: [/webpack\s+\d/i, /compiled (?:successfully|with \d+ errors?)/i, /asset .+\.js/i]
    },
    {
      type: "build-vite",
      category: "build",
      commandPatterns: [/^vite\s+build\b/i, /^npm\s+run\s+build\b/i, /^pnpm\s+build\b/i],
      contentPatterns: [/vite v[\d.]+/i, /✓ built in/i, /transforming \(\d+\)/i]
    },
    {
      type: "biome",
      category: "build",
      commandPatterns: [/^biome\b/i, /^npx\s+biome\b/i],
      contentPatterns: [/lint\/[A-Za-z0-9/.-]+/, /Checked \d+ files? in/i]
    },
    {
      type: "prettier",
      category: "build",
      commandPatterns: [/^prettier\b/i, /^npx\s+prettier\b/i],
      contentPatterns: [/^Checking formatting\.\.\./m, /Code style issues found/i]
    },
    {
      type: "turbo",
      category: "build",
      commandPatterns: [/^turbo\b/i, /^npx\s+turbo\b/i],
      contentPatterns: [/^• Packages in scope:/m, /^Tasks:\s+\d+\s+successful/m]
    },
    {
      type: "nx",
      category: "build",
      commandPatterns: [/^nx\b/i, /^npx\s+nx\b/i],
      contentPatterns: [/^NX\s+/m, /^> nx run /m]
    },
    {
      type: "playwright",
      category: "test",
      commandPatterns: [/^playwright\s+test\b/i, /^npx\s+playwright\s+test\b/i],
      contentPatterns: [/Running \d+ tests? using \d+ workers?/i, /^\s+\d+ failed/m]
    },
    {
      type: "npm-install",
      category: "package",
      commandPatterns: [/^(?:npm|pnpm|yarn)\s+(?:install|add|update)\b/i],
      contentPatterns: [/added \d+ packages/i, /packages are looking for funding/i, /audited \d+ packages/i]
    },
    {
      type: "npm-audit",
      category: "package",
      commandPatterns: [/^(?:npm|pnpm|yarn)\s+audit\b/i],
      contentPatterns: [/found \d+ vulnerabilities/i, /\b(?:low|moderate|high|critical)\b/i]
    },
    {
      type: "ruff",
      category: "build",
      commandPatterns: [/^ruff\b/i, /^uv\s+run\s+ruff\b/i],
      contentPatterns: [/^[\w./-]+\.py:\d+:\d+:\s+[A-Z]\d+/m, /Found \d+ errors?\./i]
    },
    {
      type: "mypy",
      category: "build",
      commandPatterns: [/^mypy\b/i, /^python\s+-m\s+mypy\b/i],
      contentPatterns: [/^[\w./-]+\.py:\d+:\s+error:/m, /Found \d+ errors? in \d+ files?/i]
    },
    {
      type: "pip",
      category: "package",
      commandPatterns: [/^pip\s+(?:install|download|uninstall)\b/i, /^python\s+-m\s+pip\b/i],
      contentPatterns: [/^Collecting /m, /^Successfully installed /m]
    },
    {
      type: "uv-sync",
      category: "package",
      commandPatterns: [/^uv\s+sync\b/i, /^uv\s+pip\s+install\b/i],
      contentPatterns: [/^Resolved \d+ packages?/m, /^Installed \d+ packages?/m]
    },
    {
      type: "poetry-install",
      category: "package",
      commandPatterns: [/^poetry\s+install\b/i],
      contentPatterns: [/^Installing dependencies from lock file/m, /^Package operations:/m]
    },
    {
      type: "golangci-lint",
      category: "build",
      commandPatterns: [/^golangci-lint\b/i],
      contentPatterns: [/^[\w./-]+\.go:\d+:\d+:/m, /^\d+ issues?:/m]
    },
    {
      type: "bundle-install",
      category: "package",
      commandPatterns: [/^bundle\s+install\b/i],
      contentPatterns: [/^Fetching gem metadata from /m, /^Bundle complete!/m]
    },
    {
      type: "rubocop",
      category: "build",
      commandPatterns: [/^rubocop\b/i, /^bundle\s+exec\s+rubocop\b/i],
      contentPatterns: [/^Inspecting \d+ files/m, /^[\w./-]+\.rb:\d+:\d+:\s+[A-Z]:/m]
    },
    {
      type: "docker-ps",
      category: "docker",
      commandPatterns: [/^docker\s+ps\b/i],
      contentPatterns: [/^CONTAINER ID\s+IMAGE\s+COMMAND/m]
    },
    {
      type: "docker-logs",
      category: "docker",
      commandPatterns: [/^docker\s+logs\b/i, /^docker\s+compose\s+logs\b/i],
      contentPatterns: [/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/m, /\b(?:ERROR|WARN|INFO)\b/, /^Attaching to /m]
    },
    {
      type: "aws",
      category: "cloud",
      commandPatterns: [/^aws\b/i],
      contentPatterns: [/An error occurred \([A-Za-z0-9]+\) when calling/, /^(?:upload|download): /m]
    },
    {
      type: "gcloud",
      category: "cloud",
      commandPatterns: [/^gcloud\b/i],
      contentPatterns: [/^ERROR: \(gcloud\./m, /^Updated property \[/m]
    },
    {
      type: "ssh",
      category: "cloud",
      commandPatterns: [/^ssh\b/i],
      contentPatterns: [/Permission denied \(/, /Host key verification failed/, /Connection timed out/]
    },
    {
      type: "rsync",
      category: "cloud",
      commandPatterns: [/^rsync\b/i],
      contentPatterns: [/^sending incremental file list/m, /^rsync error:/m]
    },
    {
      type: "curl",
      category: "cloud",
      commandPatterns: [/^curl\b/i],
      contentPatterns: [/curl: \(\d+\)/, /^HTTP\/\d(?:\.\d)? \d{3}/m]
    },
    {
      type: "wget",
      category: "cloud",
      commandPatterns: [/^wget\b/i],
      contentPatterns: [/^--\d{4}-\d{2}-\d{2}/m, /^ERROR \d{3}:/m]
    },
    {
      type: "json-output",
      category: "generic",
      commandPatterns: [/^jq\b/i, /^cat\s+.*\.json\b/i],
      contentPatterns: [/^\s*[\[{][\s\S]*[\]}]\s*$/]
    },
    {
      type: "shell-ls",
      category: "shell",
      commandPatterns: [/^ls(?:\s+-[A-Za-z]+)?\b/i],
      contentPatterns: [/^total \d+/m, /^\S+\s+\S+\s+\d+\s+\w+\s+\d{1,2}\s+/m]
    },
    {
      type: "shell-find",
      category: "shell",
      commandPatterns: [/^find\b/i],
      contentPatterns: [/^(?:\.{1,2}|\/|[\w.-]+\/).+/m]
    },
    {
      type: "shell-grep",
      category: "shell",
      commandPatterns: [/^(?:grep|rg|ag)\b/i],
      contentPatterns: [/^[\w./-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|md|json|ya?ml|txt):\d*:/m, /^[\w./-]+\/[\w./-]+:\d*:/m]
    },
    {
      type: "shell-ps",
      category: "shell",
      commandPatterns: [/^ps\b/i],
      contentPatterns: [/^(?:USER\s+PID|\s*PID\s+)/m]
    },
    {
      type: "shell-df",
      category: "shell",
      commandPatterns: [/^df\b/i],
      contentPatterns: [/^Filesystem\s+.*Use%/m]
    },
    {
      type: "shell-du",
      category: "shell",
      commandPatterns: [/^du\b/i],
      contentPatterns: [/^\d+(?:\.\d+)?[KMGTP]?\s+\S+/m]
    },
    {
      type: "error-stacktrace",
      category: "generic",
      commandPatterns: [],
      contentPatterns: [/Traceback \(most recent call last\):/, /^\s+at\s+\S+\s+\(.+:\d+:\d+\)/m, /^panic: /m, /^thread '[^']+' panicked at/m]
    },
    {
      type: "generic-error",
      category: "generic",
      commandPatterns: [],
      contentPatterns: [/Error:/, /Exception:/, /Traceback \(most recent call last\):/]
    }
  ];
  function detectCommandFromText(text) {
    const firstLines = text.split(/\r?\n/).slice(0, 4);
    for (const line of firstLines) {
      const trimmed = line.trim().replace(/^\$\s+/, "");
      if (!trimmed)
        continue;
      if (COMMAND_PREFIX_PATTERN.test(trimmed)) {
        return lastCommandSegment(trimmed);
      }
    }
    return null;
  }
  function detectCommandType(text, command) {
    const detectedCommand = lastCommandSegment((command || "").trim() || detectCommandFromText(text) || "") || null;
    let best = null;
    for (const detector of DETECTORS) {
      const matchedPatterns = [];
      const commandMatched = Boolean(detectedCommand) && detector.commandPatterns.some((pattern) => {
        const matched = pattern.test(detectedCommand ?? "");
        if (matched)
          matchedPatterns.push(pattern.source);
        return matched;
      });
      const contentMatches = detector.contentPatterns.filter((pattern) => {
        const matched = pattern.test(text);
        if (matched)
          matchedPatterns.push(pattern.source);
        return matched;
      }).length;
      if (!commandMatched && contentMatches === 0)
        continue;
      const confidence = Math.min(1, (commandMatched ? 0.55 : 0) + contentMatches * 0.25);
      if (!best || confidence > best.confidence) {
        best = { type: detector.type, command: detectedCommand, confidence, category: detector.category, matchedPatterns };
      }
    }
    return best ?? {
      type: "unknown",
      command: detectedCommand,
      confidence: detectedCommand ? 0.35 : 0.1,
      category: "generic",
      matchedPatterns: []
    };
  }

  // engines/rtk/builtinFilters.js
  var BUILTIN_FILTERS = [
    {
      id: "git-status",
      name: "Git Status",
      description: "Keep branch, staged/unstaged headings, and changed file lines.",
      commandTypes: ["git-status"],
      commandPatterns: ["^git\\s+status\\b"],
      matchPatterns: ["^On branch ", "^Changes (?:not staged|to be committed)", "^Untracked files:"],
      category: "git",
      priority: 95,
      stripPatterns: ["^\\s*$", "^\\s*\\(use .*\\)$"],
      keepPatterns: [
        "^On branch ",
        "^Your branch ",
        "^Changes ",
        "^Untracked files:",
        "^\\s*(modified|new file|deleted|renamed|both modified):",
        "^\\s*[MADRCU?!]{1,2}\\s+"
      ],
      priorityPatterns: ["^Changes ", "^Untracked files:"],
      collapsePatterns: [],
      stripAnsi: false,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: false,
      maxLines: 80,
      preserveHead: 12,
      preserveTail: 20,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "git-log",
      name: "Git Log",
      description: "Keep commit identifiers and subjects from verbose logs.",
      commandTypes: ["git-log"],
      commandPatterns: ["^git\\s+log\\b"],
      matchPatterns: ["^commit [0-9a-f]{7,40}", "^Author: "],
      category: "git",
      priority: 70,
      stripPatterns: ["^Author: ", "^Date: ", "^\\s*$"],
      keepPatterns: ["^commit [0-9a-f]{7,40}", "^\\s{4}\\S"],
      priorityPatterns: ["^commit "],
      collapsePatterns: [],
      stripAnsi: false,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: false,
      maxLines: 120,
      preserveHead: 40,
      preserveTail: 20,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "git-diff",
      name: "Git Diff",
      description: "Drop low-signal diff metadata while preserving files, hunks, and changed lines.",
      commandTypes: ["git-diff"],
      commandPatterns: ["^git\\s+(?:diff|show)\\b"],
      matchPatterns: ["^diff --git ", "^@@\\s+-\\d+,\\d+\\s+\\+\\d+,\\d+\\s+@@"],
      category: "git",
      priority: 94,
      stripPatterns: ["^index [0-9a-f]+\\.\\.[0-9a-f]+.*$", "^--- a/", "^\\+\\+\\+ b/"],
      keepPatterns: [],
      priorityPatterns: ["^diff --git ", "^@@ ", "^[+-](?![+-]{2})"],
      collapsePatterns: ["^\\s*$"],
      stripAnsi: false,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: true,
      maxLines: 180,
      preserveHead: 40,
      preserveTail: 50,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "docker-logs",
      name: "Docker Logs",
      description: "Keep warnings/errors and recent Docker log context.",
      commandTypes: ["docker-logs"],
      commandPatterns: ["^docker\\s+(?:compose\\s+)?logs\\b"],
      matchPatterns: ["\\b(?:ERROR|WARN|INFO)\\b", "^Attaching to "],
      category: "docker",
      priority: 84,
      stripPatterns: ["^Attaching to ", "^\\s*$"],
      keepPatterns: ["ERROR", "WARN", "Exception", "Traceback", "failed", "listening", "started"],
      priorityPatterns: ["ERROR", "Exception", "failed", "started", "listening"],
      collapsePatterns: ["INFO"],
      stripAnsi: true,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: true,
      maxLines: 120,
      preserveHead: 20,
      preserveTail: 60,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "npm-install",
      name: "Package Install",
      description: "Keep install summaries, warnings and audit results.",
      commandTypes: ["npm-install"],
      commandPatterns: ["^(?:npm|pnpm|yarn)\\s+(?:install|add|update)\\b"],
      matchPatterns: ["added \\d+ packages", "packages are looking for funding", "audited \\d+ packages"],
      category: "package",
      priority: 65,
      stripPatterns: ["^\\s*$", "^\\s*\\|", "^Progress:"],
      keepPatterns: [
        "added \\d+ packages",
        "removed \\d+ packages",
        "changed \\d+ packages",
        "audited \\d+ packages",
        "vulnerabilities",
        "WARN",
        "ERR!"
      ],
      priorityPatterns: ["WARN", "ERR", "vulnerabilities"],
      collapsePatterns: [],
      stripAnsi: false,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: false,
      maxLines: 80,
      preserveHead: 20,
      preserveTail: 30,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "build-typescript",
      name: "TypeScript",
      description: "Keep TypeScript diagnostics and file locations.",
      commandTypes: ["build-typescript"],
      commandPatterns: ["^(?:tsc|npm\\s+run\\s+typecheck)\\b"],
      matchPatterns: ["TS\\d{4}:", "error TS\\d{4}"],
      category: "build",
      priority: 93,
      stripPatterns: ["^\\s*$"],
      keepPatterns: ["TS\\d{4}:", "error TS\\d{4}", "^Found \\d+ errors?"],
      priorityPatterns: ["TS\\d{4}", "Found \\d+"],
      collapsePatterns: [],
      stripAnsi: false,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: false,
      maxLines: 120,
      preserveHead: 20,
      preserveTail: 40,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "error-stacktrace",
      name: "Error Stacktrace",
      description: "Collapse stack traces while preserving error text and top frames.",
      commandTypes: ["error-stacktrace"],
      commandPatterns: [],
      matchPatterns: ["Traceback \\(most recent call last\\):", "^\\s+at\\s+", "^panic: "],
      category: "generic",
      priority: 70,
      stripPatterns: ["^\\s*$"],
      keepPatterns: ["Error:", "Exception:", "Traceback", "^\\s+at ", "^panic:", "^thread ", "^Caused by:"],
      priorityPatterns: ["Error:", "Exception:", "^panic:", "Traceback", "Caused by:"],
      collapsePatterns: ["^\\s+at "],
      stripAnsi: true,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: true,
      maxLines: 80,
      preserveHead: 25,
      preserveTail: 30,
      sourceFormat: "omniroute-json",
      source: "builtin"
    },
    {
      id: "generic-output",
      name: "Generic Output",
      description: "Fallback filter for unknown command output.",
      commandTypes: ["generic-output", "generic-error"],
      commandPatterns: [],
      matchPatterns: ["Error:", "Exception:", "Traceback \\(most recent call last\\):"],
      category: "generic",
      priority: 10,
      stripPatterns: ["^\\s*$"],
      keepPatterns: [],
      priorityPatterns: ["error", "failed", "exception", "traceback"],
      collapsePatterns: [],
      stripAnsi: false,
      replace: [],
      matchOutput: [],
      truncateLineAt: 0,
      onEmpty: "",
      filterStderr: false,
      deduplicate: false,
      maxLines: 120,
      preserveHead: 35,
      preserveTail: 45,
      sourceFormat: "omniroute-json",
      source: "builtin"
    }
  ];
  function matchRtkFilter(text, command) {
    const detection = detectCommandType(text, command);
    const detectedCommand = detection.command ?? command ?? "";
    const sorted = [...BUILTIN_FILTERS].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    const matched = sorted.find((f) => f.commandTypes.includes(detection.type)) ?? sorted.find((f) => detectedCommand && f.commandPatterns.some((p) => {
      try {
        return new RegExp(p, "i").test(detectedCommand);
      } catch {
        return false;
      }
    })) ?? sorted.find((f) => f.matchPatterns.some((p) => {
      try {
        return new RegExp(p, "im").test(text);
      } catch {
        return false;
      }
    }));
    if (matched)
      return matched;
    return sorted.find((f) => f.commandTypes.includes("generic-output")) ?? null;
  }

  // engines/rtk/smartTruncate.js
  function smartTruncate(text, options = {}) {
    const maxChars = Math.max(0, Math.floor(options.maxChars ?? 0));
    const maxLines = Math.max(0, Math.floor(options.maxLines ?? 0));
    const lines = text.split(/\r?\n/);
    const overLineLimit = maxLines > 0 && lines.length > maxLines;
    const overCharLimit = maxChars > 0 && text.length > maxChars;
    if (!overLineLimit && !overCharLimit) {
      return { text, truncated: false, droppedLines: 0 };
    }
    const preserveHead = Math.max(0, Math.floor(options.preserveHead ?? 20));
    const preserveTail = Math.max(0, Math.floor(options.preserveTail ?? 20));
    const priorityPatterns = options.priorityPatterns ?? [];
    const priorityLines = priorityPatterns.length ? lines.filter((line) => priorityPatterns.some((pattern) => pattern.test(line))) : [];
    const head = lines.slice(0, preserveHead);
    const tail = preserveTail > 0 ? lines.slice(-preserveTail) : [];
    const selected = [...head];
    for (const line of priorityLines) {
      if (!selected.includes(line))
        selected.push(line);
    }
    const tailStart = lines.length - tail.length;
    tail.forEach((line, offset) => {
      const originalIndex = tailStart + offset;
      if (originalIndex >= preserveHead && !selected.includes(line))
        selected.push(line);
    });
    const droppedLines = Math.max(0, lines.length - selected.length);
    let result = [
      ...selected.slice(0, head.length),
      `[rtk:truncated ${droppedLines} lines]`,
      ...selected.slice(head.length)
    ].join(`
`);
    if (maxChars > 0 && result.length > maxChars) {
      const marker = `
[rtk:truncated by chars]
`;
      const budget = Math.max(0, maxChars - marker.length);
      if (budget === 0) {
        result = marker.slice(0, maxChars);
        return { text: result, truncated: true, droppedLines };
      }
      const lines2 = result.split(/\r?\n/);
      const ranked = [];
      for (const pattern of priorityPatterns) {
        let hits = 0;
        for (const line of lines)
          if (pattern.test(line))
            hits += 1;
        if (hits > 0 && hits * 2 <= lines2.length)
          ranked.push({ pattern, hits });
      }
      ranked.sort((a, b) => a.hits - b.hits);
      const forcedCap = Math.floor(budget / 2);
      const seen = new Set;
      const forced = [];
      let forcedLength = 0;
      for (const entry of ranked) {
        for (const line of lines) {
          if (seen.has(line))
            continue;
          if (!entry.pattern.test(line))
            continue;
          const cost = line.length + 1;
          if (cost > forcedCap - forcedLength)
            continue;
          seen.add(line);
          forced.push(line);
          forcedLength += cost;
        }
      }
      const rest = Math.max(0, budget - forcedLength);
      const headChars = Math.ceil(rest * 0.55);
      const tailChars = Math.max(0, rest - headChars);
      const headText = rest > 0 ? result.slice(0, headChars) : "";
      const tailText = tailChars > 0 ? result.slice(-tailChars) : "";
      const forcedText = forced.filter((line) => !headText.includes(line) && !tailText.includes(line)).join(`
`);
      result = `${headText}${marker}${forcedText ? `${forcedText}
` : ""}${tailText}`;
      if (result.length > maxChars)
        result = result.slice(0, maxChars);
    }
    return { text: result, truncated: true, droppedLines };
  }

  // engines/rtk/deduplicator.js
  function deduplicateRepeatedLines(text, options = {}) {
    const threshold = Math.max(2, Math.floor(options.threshold ?? 3));
    const lines = text.split(/\r?\n/);
    const output = [];
    let collapsed = 0;
    for (let index = 0;index < lines.length; index++) {
      const line = lines[index];
      let runLength = 1;
      while (index + runLength < lines.length && lines[index + runLength] === line) {
        runLength++;
      }
      if (line.trim() && runLength >= threshold) {
        output.push(line);
        output.push(`[line repeated ${runLength - 1}x]`);
        output.push(`[rtk:dropped ${runLength - 1} repeated lines]`);
        collapsed += runLength - 1;
        index += runLength - 1;
        continue;
      }
      output.push(line);
    }
    return { text: output.join(`
`), collapsed };
  }

  // engines/rtk/severity.js
  var SEVERITY_WORDS = [
    "error",
    "failed",
    "failure",
    "exception",
    "traceback",
    "fail",
    "ts\\d{4}",
    "✖",
    "panic",
    "fatal",
    "critical",
    "severe",
    "oomkilled",
    "out of memory",
    "denied",
    "timeout",
    "timed out",
    "unreachable",
    "refused",
    "aborted",
    "rollback",
    "corrupt",
    "deadlock"
  ];
  var SEVERITY_ALTERNATION = SEVERITY_WORDS.join("|");
  function severityPattern() {
    return new RegExp(SEVERITY_ALTERNATION, "i");
  }

  // engines/rtk/lineFilter.js
  var SEVERITY_PATTERN = severityPattern();
  var regexCache = new Map;
  function cachedRegExp(pattern, flags) {
    const key = `${pattern}::${flags}`;
    const cached = regexCache.get(key);
    if (cached)
      return cached;
    try {
      const re = new RegExp(pattern, flags);
      regexCache.set(key, re);
      return re;
    } catch {
      return null;
    }
  }
  function compilePatterns(patterns) {
    return patterns.flatMap((pattern) => {
      const re = cachedRegExp(pattern, "i");
      return re ? [re] : [];
    });
  }
  function compileGlobalPattern(pattern) {
    return cachedRegExp(pattern, "g");
  }
  function compileBlobPattern(pattern) {
    return cachedRegExp(pattern, "im");
  }
  function stripAnsi(text) {
    return text.replace(/\[[0-?]*[ -/]*[@-~]/g, "");
  }
  function normalizeStderrPrefix(line) {
    return line.replace(/^\s*(?:stderr|err)\s*(?:\||:)\s*/i, "");
  }
  function truncateUnicodeSafe(line, maxChars) {
    if (maxChars <= 0)
      return line;
    const chars = Array.from(line);
    if (chars.length <= maxChars)
      return line;
    if (maxChars <= 3)
      return chars.slice(0, maxChars).join("");
    return `${chars.slice(0, maxChars - 3).join("")}...`;
  }
  function applyLineFilter(text, filter) {
    const stripPatterns = compilePatterns(filter.stripPatterns);
    const keepPatterns = compilePatterns(filter.keepPatterns);
    const collapsePatterns = compilePatterns(filter.collapsePatterns);
    const priorityPatterns = compilePatterns(filter.priorityPatterns);
    const appliedRules = [];
    let lines = text.split(/\r?\n/);
    const originalLineCount = lines.length;
    if (filter.stripAnsi) {
      const stripped = lines.map(stripAnsi);
      if (stripped.join(`
`) !== lines.join(`
`)) {
        appliedRules.push(`${filter.id}:strip-ansi`);
      }
      lines = stripped;
    }
    if (filter.filterStderr) {
      const normalized = lines.map(normalizeStderrPrefix);
      if (normalized.join(`
`) !== lines.join(`
`)) {
        appliedRules.push(`${filter.id}:filter-stderr`);
      }
      lines = normalized;
    }
    for (const rule of filter.replace) {
      const pattern = compileGlobalPattern(rule.pattern);
      if (!pattern)
        continue;
      const replaced = lines.map((line) => line.replace(pattern, rule.replacement));
      if (replaced.join(`
`) !== lines.join(`
`)) {
        appliedRules.push(`${filter.id}:replace`);
      }
      lines = replaced;
    }
    if (filter.matchOutput.length > 0) {
      const blob = lines.join(`
`);
      for (const rule of filter.matchOutput) {
        const pattern = compileBlobPattern(rule.pattern);
        if (!pattern?.test(blob))
          continue;
        const unless = rule.unless ? compileBlobPattern(rule.unless) : null;
        if (unless?.test(blob))
          continue;
        appliedRules.push(`${filter.id}:match-output`);
        return {
          text: rule.message,
          strippedLines: Math.max(0, originalLineCount - 1),
          keptByRule: false,
          appliedRules
        };
      }
    }
    if (stripPatterns.length > 0) {
      lines = lines.filter((line) => !stripPatterns.some((pattern) => pattern.test(line)));
      if (lines.length !== originalLineCount)
        appliedRules.push(`${filter.id}:strip`);
    }
    if (keepPatterns.length > 0) {
      const kept = lines.filter((line) => keepPatterns.some((pattern) => pattern.test(line)) || SEVERITY_PATTERN.test(line));
      if (kept.length > 0) {
        lines = kept;
        appliedRules.push(`${filter.id}:keep`);
      }
    }
    if (collapsePatterns.length > 0) {
      const seen = new Set;
      lines = lines.filter((line) => {
        if (!collapsePatterns.some((pattern) => pattern.test(line)))
          return true;
        const key = line.trim();
        if (seen.has(key))
          return false;
        seen.add(key);
        return true;
      });
      appliedRules.push(`${filter.id}:collapse`);
    }
    if (filter.truncateLineAt > 0) {
      const truncatedLines = lines.map((line) => truncateUnicodeSafe(line, filter.truncateLineAt));
      if (truncatedLines.join(`
`) !== lines.join(`
`)) {
        lines = truncatedLines;
        appliedRules.push(`${filter.id}:truncate-line`);
      }
    }
    if (filter.deduplicate) {
      const deduped = deduplicateRepeatedLines(lines.join(`
`));
      if (deduped.collapsed > 0) {
        lines = deduped.text.split(/\r?\n/);
        appliedRules.push(`${filter.id}:deduplicate`);
      }
    }
    const truncated = smartTruncate(lines.join(`
`), {
      maxLines: filter.maxLines,
      preserveHead: filter.preserveHead,
      preserveTail: filter.preserveTail,
      priorityPatterns
    });
    if (truncated.truncated)
      appliedRules.push(`${filter.id}:truncate`);
    const output = truncated.text.trim().length === 0 && filter.onEmpty ? filter.onEmpty : truncated.text;
    return {
      text: output,
      strippedLines: Math.max(0, originalLineCount - output.split(/\r?\n/).length),
      keptByRule: keepPatterns.length > 0,
      appliedRules
    };
  }

  // engines/rtk/grouper.js
  function normalizeLine(line) {
    let s = line;
    s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, "<N>");
    s = s.replace(/\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]/g, "[<N>]");
    s = s.replace(/\b[0-9a-fA-F]{6,40}\b/g, "<N>");
    s = s.replace(/\bv?\d+\.\d+\.\d+(?:\.\d+)*\b/g, "<N>");
    s = s.replace(/\b\d+\b/g, "<N>");
    s = s.replace(/\s+/g, " ");
    return s.trim();
  }
  function groupSimilarLines(text, options = {}) {
    const threshold = Math.max(2, Math.floor(options.threshold ?? 3));
    const lines = text.split(/\r?\n/);
    const output = [];
    let grouped = 0;
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      const normalised = normalizeLine(line);
      let runLength = 1;
      while (index + runLength < lines.length && normalizeLine(lines[index + runLength]) === normalised) {
        runLength++;
      }
      if (runLength >= threshold) {
        output.push(`${line} [rtk:grouped ×${runLength}]`);
        grouped += runLength - 1;
        index += runLength;
      } else {
        output.push(line);
        index++;
      }
    }
    return { text: output.join(`
`), grouped };
  }

  // engines/rtk/index.js
  var SHELL_TOOL_NAME_RE = /\b(bash|shell|terminal|run_command|execute_command|exec|command)\b/;
  function hasCacheControlMarker(part) {
    return !!part && typeof part === "object" && part.cache_control !== undefined && part.cache_control !== null;
  }
  function isAnthropicToolResultBlock(part) {
    return !!part && typeof part === "object" && part.type === "tool_result" && typeof part.tool_use_id === "string";
  }
  function isTextBlock(part) {
    return !!part && typeof part === "object" && (part.type === "text" || part.type === undefined) && typeof part.text === "string";
  }
  var LANGUAGE_ALIASES = {
    js: "javascript",
    jsx: "javascript",
    javascript: "javascript",
    ts: "typescript",
    tsx: "typescript",
    typescript: "typescript",
    py: "python",
    python: "python",
    rs: "rust",
    rust: "rust",
    go: "go",
    rb: "ruby",
    ruby: "ruby",
    java: "java"
  };
  function normalizeCodeLanguage(language) {
    if (!language)
      return "unknown";
    return LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? "unknown";
  }
  function detectCodeLanguage(text) {
    if (/\b(?:interface|type)\s+\w+\s*=|:\s*(?:string|number|boolean)\b/.test(text))
      return "typescript";
    if (/\b(?:const|let|function|import|export)\b|=>/.test(text))
      return "javascript";
    if (/\bdef\s+\w+\(|\bimport\s+\w+|print\(/.test(text))
      return "python";
    if (/\bfn\s+\w+\(|\blet\s+mut\b|println!\(/.test(text))
      return "rust";
    if (/\bfunc\s+\w+\(|package\s+\w+/.test(text))
      return "go";
    if (/\bclass\s+\w+|System\.out\.println/.test(text))
      return "java";
    if (/\bdef\s+\w+|puts\s+|end\s*$/.test(text))
      return "ruby";
    return "unknown";
  }
  function stripCode(text, language, options = {}) {
    const resolvedLanguage = language === "unknown" ? detectCodeLanguage(text) : language;
    const opts = {
      removeComments: options.removeComments === true,
      removeEmptyLines: options.removeEmptyLines !== false,
      collapseWhitespace: options.collapseWhitespace !== false,
      preserveDocstrings: options.preserveDocstrings === true
    };
    const originalLines = text.split(/\r?\n/).length;
    let result = text;
    if (opts.removeEmptyLines)
      result = result.replace(/^\s*$(?:\r?\n)?/gm, "");
    if (opts.collapseWhitespace) {
      result = result.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/g, "")).join(`
`);
    }
    result = result.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
    const strippedLines = Math.max(0, originalLines - (result ? result.split(/\r?\n/).length : 0));
    return { text: result, strippedLines, language: resolvedLanguage };
  }
  var DEFAULTS = {
    enabled: true,
    intensity: "standard",
    applyToToolResults: true,
    applyToAssistantMessages: false,
    applyToCodeBlocks: false,
    enabledFilters: [],
    disabledFilters: [],
    maxLinesPerResult: 120,
    maxCharsPerResult: 0,
    deduplicateThreshold: 3,
    customFiltersEnabled: false,
    trustProjectFilters: false,
    enableRenderers: false,
    groupingThreshold: 3,
    enableGrouping: false,
    stripCodeComments: false,
    preserveDocstrings: true
  };
  function mergeRtkConfig(cfg) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const merged = { ...DEFAULTS, ...c };
    return {
      enabled: merged.enabled !== false,
      intensity: ["minimal", "standard", "aggressive"].includes(merged.intensity) ? merged.intensity : DEFAULTS.intensity,
      applyToToolResults: merged.applyToToolResults !== false,
      applyToAssistantMessages: merged.applyToAssistantMessages === true,
      applyToCodeBlocks: merged.applyToCodeBlocks === true,
      enabledFilters: Array.isArray(merged.enabledFilters) ? merged.enabledFilters.filter((x) => typeof x === "string") : [],
      disabledFilters: Array.isArray(merged.disabledFilters) ? merged.disabledFilters.filter((x) => typeof x === "string") : [],
      maxLinesPerResult: typeof merged.maxLinesPerResult === "number" ? Math.max(0, Math.floor(merged.maxLinesPerResult)) : DEFAULTS.maxLinesPerResult,
      maxCharsPerResult: typeof merged.maxCharsPerResult === "number" ? Math.max(0, Math.floor(merged.maxCharsPerResult)) : DEFAULTS.maxCharsPerResult,
      deduplicateThreshold: typeof merged.deduplicateThreshold === "number" ? Math.max(2, Math.floor(merged.deduplicateThreshold)) : DEFAULTS.deduplicateThreshold,
      customFiltersEnabled: false,
      trustProjectFilters: false,
      enableRenderers: false,
      groupingThreshold: typeof merged.groupingThreshold === "number" ? Math.max(2, Math.floor(merged.groupingThreshold)) : DEFAULTS.groupingThreshold,
      enableGrouping: merged.enableGrouping === true,
      stripCodeComments: false,
      preserveDocstrings: merged.preserveDocstrings !== false
    };
  }
  function estTokens(text) {
    return Math.ceil(text.length / 4);
  }
  function shouldCompressMessage(message, config) {
    if (config.applyToToolResults && Array.isArray(message.content) && message.content.some(isAnthropicToolResultBlock))
      return true;
    if (message.role === "tool")
      return config.applyToToolResults || config.applyToCodeBlocks && hasCodeFence(message.content);
    if (message.role === "assistant")
      return config.applyToAssistantMessages || config.applyToCodeBlocks && hasCodeFence(message.content);
    return false;
  }
  function hasCodeFence(content) {
    if (!content)
      return false;
    if (typeof content === "string")
      return /```/.test(content);
    if (!Array.isArray(content))
      return false;
    return content.some((part) => isTextBlock(part) && typeof part.text === "string" && /```/.test(part.text));
  }
  function resolveToolMeta(toolId, lookup) {
    const meta = toolId ? lookup.get(toolId) : null;
    if (!meta)
      return { command: null, skipFilters: false };
    if (SHELL_TOOL_NAME_RE.test(meta.toolName.toLowerCase())) {
      return { command: meta.command, skipFilters: false };
    }
    return { command: null, skipFilters: true };
  }
  function codeOnlyConfig(config) {
    return config.applyToCodeBlocks && !config.applyToToolResults && !config.applyToAssistantMessages;
  }
  function effectiveMaxLines(base, intensity) {
    const factor = intensity === "aggressive" ? 0.5 : intensity === "minimal" ? 1.5 : 1;
    return Math.max(1, Math.round(base * factor));
  }
  function processRtkText(text, options = {}) {
    const config = mergeRtkConfig(options.config);
    const originalTokens = estTokens(text);
    const techniquesUsed = [];
    const rulesApplied = [];
    let result = text;
    const detection = detectCommandType(text, options.command);
    const hasGenericErrorMarkers = /Error:|Exception:|Traceback \(most recent call last\):/.test(text);
    const isDocumentLikeRead = detection.type === "unknown" && !detection.command && !hasGenericErrorMarkers;
    let matchedFilterPatterns = [];
    if (!options.skipFilters && !isDocumentLikeRead) {
      const filter = matchRtkFilter(text, detection.command);
      if (filter && !config.disabledFilters.includes(filter.id)) {
        if (config.enabledFilters.length === 0 || config.enabledFilters.includes(filter.id)) {
          const filtered = applyLineFilter(result, {
            ...filter,
            maxLines: effectiveMaxLines(filter.maxLines || config.maxLinesPerResult, config.intensity)
          });
          result = filtered.text;
          if (filtered.appliedRules.length > 0) {
            techniquesUsed.push("rtk-filter");
            rulesApplied.push(...filtered.appliedRules);
          }
          matchedFilterPatterns = filter.priorityPatterns;
        }
      }
    }
    if (config.applyToCodeBlocks) {
      let strippedCodeBlocks = 0;
      result = result.replace(/```([A-Za-z0-9_+.-]*)\r?\n([\s\S]*?)```/g, (match, languageHint, code) => {
        const stripped = stripCode(code, normalizeCodeLanguage(languageHint), {
          removeComments: false,
          preserveDocstrings: config.preserveDocstrings
        });
        if (stripped.strippedLines <= 0 && stripped.text === code.trim())
          return match;
        strippedCodeBlocks++;
        const fenceLanguage = languageHint?.trim() || stripped.language;
        return `\`\`\`${fenceLanguage}
${stripped.text}
\`\`\``;
      });
      if (strippedCodeBlocks > 0) {
        techniquesUsed.push("rtk-code-strip");
        rulesApplied.push("rtk:code-strip");
      }
    }
    const shouldSkipDedup = Boolean(options.skipFilters);
    const deduped = shouldSkipDedup ? { text: result, collapsed: 0 } : deduplicateRepeatedLines(result, { threshold: config.deduplicateThreshold });
    if (deduped.collapsed > 0) {
      result = deduped.text;
      techniquesUsed.push("rtk-dedup");
      rulesApplied.push("rtk:dedup");
    }
    if (config.enableGrouping) {
      const grouped = groupSimilarLines(result, { threshold: config.groupingThreshold });
      if (grouped.grouped > 0) {
        result = grouped.text;
        techniquesUsed.push("rtk-grouping");
        rulesApplied.push("rtk:grouping");
      }
    }
    const defaultPriorityPatterns = [severityPattern()];
    const filterPriorityPatterns = matchedFilterPatterns.flatMap((pattern) => {
      try {
        return [new RegExp(pattern, "i")];
      } catch {
        return [];
      }
    });
    const truncated = isDocumentLikeRead ? { text: result, truncated: false, droppedLines: 0 } : smartTruncate(result, {
      maxLines: effectiveMaxLines(config.maxLinesPerResult, config.intensity),
      maxChars: config.maxCharsPerResult,
      preserveHead: config.intensity === "aggressive" ? 16 : 24,
      preserveTail: config.intensity === "aggressive" ? 16 : 24,
      priorityPatterns: [...defaultPriorityPatterns, ...filterPriorityPatterns]
    });
    if (truncated.truncated) {
      result = truncated.text;
      techniquesUsed.push("rtk-truncate");
      rulesApplied.push("rtk:truncate");
    }
    const compressedTokens = estTokens(result);
    return {
      text: result,
      compressed: compressedTokens < originalTokens,
      originalTokens,
      compressedTokens,
      techniquesUsed: [...new Set(techniquesUsed)],
      rulesApplied: [...new Set(rulesApplied)]
    };
  }
  function processToolResultBlocks(content, config, toolCallLookup) {
    const techniquesUsed = [];
    const rulesApplied = [];
    if (!Array.isArray(content))
      return { content, compressed: false, techniquesUsed, rulesApplied };
    let compressed = false;
    const nextContent = content.map((part) => {
      if (!isAnthropicToolResultBlock(part))
        return part;
      if (hasCacheControlMarker(part))
        return part;
      const toolUseId = typeof part.tool_use_id === "string" ? part.tool_use_id : null;
      const { command, skipFilters } = resolveToolMeta(toolUseId, toolCallLookup);
      const inner = part.content;
      if (typeof inner === "string") {
        if (!inner)
          return part;
        const processed = processRtkText(inner, { config, command, skipFilters });
        techniquesUsed.push(...processed.techniquesUsed);
        rulesApplied.push(...processed.rulesApplied);
        if (!processed.compressed)
          return part;
        compressed = true;
        return { ...part, content: processed.text };
      }
      if (Array.isArray(inner)) {
        let blockChanged = false;
        const nextInner = inner.map((sub) => {
          if (!isTextBlock(sub) || !sub.text)
            return sub;
          if (hasCacheControlMarker(sub))
            return sub;
          const processed = processRtkText(sub.text, { config, command, skipFilters });
          techniquesUsed.push(...processed.techniquesUsed);
          rulesApplied.push(...processed.rulesApplied);
          if (!processed.compressed)
            return sub;
          blockChanged = true;
          compressed = true;
          return { ...sub, text: processed.text };
        });
        return blockChanged ? { ...part, content: nextInner } : part;
      }
      return part;
    });
    return { content: compressed ? nextContent : content, compressed, techniquesUsed, rulesApplied };
  }
  function processRtkContent(content, config, options = {}) {
    if (codeOnlyConfig(config)) {
      return processRtkCodeBlocksOnly(content, config);
    }
    const techniquesUsed = [];
    const rulesApplied = [];
    if (typeof content === "string") {
      if (!content)
        return { content, compressed: false, techniquesUsed, rulesApplied };
      const processed = processRtkText(content, { config, command: options.command, skipFilters: options.skipFilters });
      techniquesUsed.push(...processed.techniquesUsed);
      rulesApplied.push(...processed.rulesApplied);
      return {
        content: processed.compressed ? processed.text : content,
        compressed: processed.compressed,
        techniquesUsed,
        rulesApplied
      };
    }
    if (!Array.isArray(content))
      return { content, compressed: false, techniquesUsed, rulesApplied };
    let compressed = false;
    const nextContent = content.map((part) => {
      if (!isTextBlock(part) || !part.text)
        return part;
      const processed = processRtkText(part.text, { config, command: options.command, skipFilters: options.skipFilters });
      techniquesUsed.push(...processed.techniquesUsed);
      rulesApplied.push(...processed.rulesApplied);
      if (!processed.compressed)
        return part;
      compressed = true;
      return { ...part, text: processed.text };
    });
    return { content: compressed ? nextContent : content, compressed, techniquesUsed, rulesApplied };
  }
  function processRtkCodeBlocksOnly(content, config) {
    const techniquesUsed = [];
    const rulesApplied = [];
    const processText = (text) => {
      let compressed = false;
      const nextText = text.replace(/```([\s\S]*?)```/g, (match) => {
        const processed = processRtkText(match, { config });
        techniquesUsed.push(...processed.techniquesUsed);
        rulesApplied.push(...processed.rulesApplied);
        if (!processed.compressed)
          return match;
        compressed = true;
        return processed.text;
      });
      return { text: compressed ? nextText : text, compressed };
    };
    if (typeof content === "string") {
      const processed = processText(content);
      return { content: processed.text, compressed: processed.compressed, techniquesUsed, rulesApplied };
    }
    if (!Array.isArray(content))
      return { content, compressed: false, techniquesUsed, rulesApplied };
    let compressed = false;
    const nextContent = content.map((part) => {
      if (!isTextBlock(part) || !part.text)
        return part;
      const processed = processText(part.text);
      if (!processed.compressed)
        return part;
      compressed = true;
      return { ...part, text: processed.text };
    });
    return { content: compressed ? nextContent : content, compressed, techniquesUsed, rulesApplied };
  }
  var id3 = "rtk";
  var defaultOn3 = false;
  function apply3(body, ctx, cfg) {
    if (!body || typeof body !== "object")
      return false;
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0)
      return false;
    const config = mergeRtkConfig(cfg);
    if (!config.enabled)
      return false;
    const allTechniques = [];
    const allRules = [];
    const toolCallLookup = new Map;
    for (const msg of messages) {
      if (msg.role !== "assistant")
        continue;
      const toolCalls = msg.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          if (!tc || typeof tc !== "object")
            continue;
          const id = typeof tc.id === "string" ? tc.id : null;
          if (!id)
            continue;
          const fn = tc.function;
          if (!fn || typeof fn !== "object")
            continue;
          const toolName = typeof fn.name === "string" ? fn.name : "";
          let command = null;
          if (typeof fn.arguments === "string") {
            try {
              const args = JSON.parse(fn.arguments);
              command = typeof args.command === "string" ? args.command : typeof args.cmd === "string" ? args.cmd : null;
            } catch {}
          }
          toolCallLookup.set(id, { toolName, command });
        }
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (!part || typeof part !== "object" || part.type !== "tool_use")
            continue;
          const id = typeof part.id === "string" ? part.id : null;
          if (!id)
            continue;
          const toolName = typeof part.name === "string" ? part.name : "";
          const input = part.input;
          let command = null;
          if (input && typeof input === "object") {
            command = typeof input.command === "string" ? input.command : typeof input.cmd === "string" ? input.cmd : null;
          }
          toolCallLookup.set(id, { toolName, command });
        }
      }
    }
    let anyMessageChanged = false;
    const compressedMessages = messages.map((message) => {
      if (!shouldCompressMessage(message, config))
        return message;
      if (Array.isArray(message.content) && message.content.some(isAnthropicToolResultBlock)) {
        const processed = processToolResultBlocks(message.content, config, toolCallLookup);
        allTechniques.push(...processed.techniquesUsed);
        allRules.push(...processed.rulesApplied);
        if (!processed.compressed)
          return message;
        anyMessageChanged = true;
        return { ...message, content: processed.content };
      }
      let command = null;
      let skipFilters = false;
      if (message.role === "tool") {
        const callId = typeof message.tool_call_id === "string" ? message.tool_call_id : null;
        ({ command, skipFilters } = resolveToolMeta(callId, toolCallLookup));
      }
      const processed = processRtkContent(message.content, config, { command, skipFilters });
      allTechniques.push(...processed.techniquesUsed);
      allRules.push(...processed.rulesApplied);
      if (!processed.compressed)
        return message;
      anyMessageChanged = true;
      return { ...message, content: processed.content };
    });
    if (!anyMessageChanged)
      return false;
    body.messages = compressedMessages;
    if (ctx && ctx.state) {
      ctx.state.rtk = {
        techniquesUsed: [...new Set(allTechniques)],
        rulesApplied: [...new Set(allRules)]
      };
    }
    return true;
  }

  // engines/codex-responses.js
  var exports_codex_responses = {};
  __export(exports_codex_responses, {
    apply: () => apply4,
    defaultOn: () => defaultOn4,
    id: () => id4
  });
  var SUPPORTED_TYPES = new Set([
    "function_call_output",
    "custom_tool_call_output",
    "local_shell_call_output",
    "apply_patch_call_output"
  ]);
  var DEFAULT_PROTECTED_TOOL_NAMES = new Set([
    "read",
    "glob",
    "grep",
    "write",
    "edit",
    "websearch",
    "webfetch",
    "web_search",
    "web_fetch"
  ]);
  var DEFAULTS2 = {
    enabled: true,
    minBytes: 512,
    maxOutputBytes: 2 * 1024 * 1024,
    maxCandidateBytes: 512 * 1024,
    maxLines: 160,
    minSearchMatches: 8,
    minLogLines: 24,
    preserveToolNames: []
  };
  var DIFF_HUNK_RE = /^@@{1,2}\s+-\d+(?:,\d+)?(?:\s+-\d+(?:,\d+)?)*\s+\+\d+(?:,\d+)?(?:,\d+)?\s+@@{1,2}/m;
  var SEARCH_LINE_RE = /^\s*(?:[\w./-]+:\d+(?::\d+)?:|\d+(?::\d+)?[-:])\s*\S/m;
  var IMPORTANT_LOG_RE = /(?:^|\b)(?:error|warning|warn|failed|failure|fatal|panic|exception|traceback|assertion|exit\s+code)\b/i;
  var BUILD_RE = /\b(?:build|compile|test|lint|npm|yarn|pnpm|mix|make|cargo|gradle|maven|pytest|rspec|exunit)\b/i;
  var STACK_LINE_RE = /^(?:\s*(?:at\s|File\s|\S+[:(]\d+))/;
  function bounded(value, fallback, min, max) {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
  }
  function mergeConfig(cfg) {
    const c = cfg && typeof cfg === "object" ? cfg : {};
    const merged = { ...DEFAULTS2, ...c };
    return {
      enabled: merged.enabled !== false,
      minBytes: bounded(merged.minBytes, DEFAULTS2.minBytes, 0, 2000000),
      maxOutputBytes: bounded(merged.maxOutputBytes, DEFAULTS2.maxOutputBytes, 1, 1e7),
      maxCandidateBytes: bounded(merged.maxCandidateBytes, DEFAULTS2.maxCandidateBytes, 1, 2000000),
      maxLines: bounded(merged.maxLines, DEFAULTS2.maxLines, 1, 1e4),
      minSearchMatches: bounded(merged.minSearchMatches, DEFAULTS2.minSearchMatches, 2, 1e4),
      minLogLines: bounded(merged.minLogLines, DEFAULTS2.minLogLines, 2, 1e4),
      preserveToolNames: Array.isArray(merged.preserveToolNames) ? merged.preserveToolNames.filter((n) => typeof n === "string") : []
    };
  }
  function byteLength(s) {
    if (typeof TextEncoder !== "undefined")
      return new TextEncoder().encode(s).length;
    let n = 0;
    for (let i = 0;i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 128)
        n += 1;
      else if (c < 2048)
        n += 2;
      else if (c >= 55296 && c <= 56319) {
        n += 4;
        i++;
      } else
        n += 3;
    }
    return n;
  }
  function estTokens2(text) {
    return Math.ceil(text.length / 4);
  }
  function minifyJson(text) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) && (!parsed || typeof parsed !== "object"))
        return null;
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  }
  function collapseLines(text, config) {
    const lines = text.split(/\r?\n/);
    if (lines.length < config.minLogLines)
      return null;
    const important = lines.map((line, index) => ({ line, index })).filter(({ line }) => IMPORTANT_LOG_RE.test(line) || STACK_LINE_RE.test(line)).map(({ index }) => index);
    if (important.length === 0 && !BUILD_RE.test(text))
      return null;
    const keep = new Set;
    for (let index = 0;index < Math.min(8, lines.length); index++)
      keep.add(index);
    for (let index = Math.max(0, lines.length - 8);index < lines.length; index++)
      keep.add(index);
    for (const index of important) {
      for (let offset = -2;offset <= 2; offset++) {
        if (index + offset >= 0 && index + offset < lines.length)
          keep.add(index + offset);
      }
    }
    const indexes = [...keep].sort((a, b) => a - b).slice(0, config.maxLines);
    const output = [];
    let previous = -1;
    for (const index of indexes) {
      if (index - previous > 1)
        output.push(`[compressed log output: omitted ${index - previous - 1} lines]`);
      output.push(lines[index]);
      previous = index;
    }
    if (previous < lines.length - 1)
      output.push(`[compressed log output: omitted ${lines.length - previous - 1} lines]`);
    return output.join(`
`);
  }
  function compactDiff(text, config) {
    if (!DIFF_HUNK_RE.test(text))
      return null;
    const lines = text.split(/\r?\n/);
    const output = [];
    let changedSinceContext = 0;
    for (const line of lines) {
      const changed = line.startsWith("+") || line.startsWith("-") || line.startsWith("@@");
      if (changed) {
        output.push(line);
        changedSinceContext = 0;
      } else if (changedSinceContext < 2) {
        output.push(line);
        changedSinceContext++;
      }
    }
    return output.length < lines.length && output.length <= config.maxLines * 4 ? output.join(`
`) : null;
  }
  function compactSearch(text, config) {
    const lines = text.split(/\r?\n/);
    const matches = lines.filter((line) => SEARCH_LINE_RE.test(line));
    if (matches.length < config.minSearchMatches)
      return null;
    const grouped = new Map;
    for (const line of matches) {
      const path = line.trim().split(/:\d/)[0].split(/-\d/)[0];
      const group = grouped.get(path) ?? [];
      if (group.length < 3)
        group.push(line.trim());
      grouped.set(path, group);
    }
    const output = [...grouped.entries()].map(([path, entries]) => [path, ...entries].join(`
`)).join(`
`);
    return output.length < text.length ? output : null;
  }
  function candidateRewrite(text, config) {
    if (byteLength(text) < config.minBytes)
      return null;
    if (byteLength(text) > config.maxCandidateBytes)
      return null;
    const json = minifyJson(text);
    const diff = compactDiff(text, config);
    const search = compactSearch(text, config);
    const log = collapseLines(text, config);
    return [json, diff, search, log].filter((value) => typeof value === "string").sort((a, b) => byteLength(a) - byteLength(b))[0] ?? null;
  }
  function rewriteText(value, config) {
    if (typeof value !== "string")
      return null;
    if (byteLength(value) > config.maxOutputBytes)
      return null;
    const rewritten = candidateRewrite(value, config);
    if (!rewritten || byteLength(rewritten) >= byteLength(value))
      return null;
    if (estTokens2(rewritten) >= estTokens2(value))
      return null;
    return rewritten;
  }
  function hasLossyRewriteCandidate(text, config) {
    if (typeof text !== "string")
      return false;
    return compactDiff(text, config) !== null || compactSearch(text, config) !== null || collapseLines(text, config) !== null;
  }
  function collectFunctionCalls(items) {
    const functionCalls = new Map;
    const skippedCallIds = new Set;
    const protectedNames = new Set(DEFAULT_PROTECTED_TOOL_NAMES);
    return { functionCalls, skippedCallIds, protectedNames };
  }
  function markEligibility(items, config) {
    const { functionCalls, skippedCallIds, protectedNames } = collectFunctionCalls(items);
    for (const name of config.preserveToolNames)
      protectedNames.add(name.trim().toLowerCase());
    for (const raw of items) {
      if (!raw || typeof raw !== "object")
        continue;
      if (raw.type !== "function_call")
        continue;
      if (typeof raw.call_id !== "string" || raw.call_id.length === 0)
        continue;
      const name = typeof raw.name === "string" ? raw.name : "";
      functionCalls.set(raw.call_id, name);
      if (protectedNames.has(name.trim().toLowerCase()) || name === "headless_retrieval" || name.endsWith("__headless_retrieval")) {
        skippedCallIds.add(raw.call_id);
      }
    }
    const meta = new Map;
    for (let i = 0;i < items.length; i++) {
      const raw = items[i];
      if (!raw || typeof raw !== "object")
        continue;
      const type = raw.type;
      if (!SUPPORTED_TYPES.has(type))
        continue;
      if (type === "local_shell_call_output" || type === "apply_patch_call_output") {
        meta.set(raw, { type, eligible: true });
        continue;
      }
      if (type === "custom_tool_call_output") {
        meta.set(raw, { type, eligible: false });
        continue;
      }
      const callId = typeof raw.call_id === "string" ? raw.call_id : "";
      const eligible = callId.length > 0 && functionCalls.has(callId) && !skippedCallIds.has(callId);
      meta.set(raw, { type, eligible });
    }
    return meta;
  }
  var id4 = "codex-responses";
  var defaultOn4 = false;
  function apply4(body, ctx, cfg) {
    if (!body || typeof body !== "object")
      return false;
    if (ctx && ctx.protocol && ctx.protocol !== "responses")
      return false;
    const items = body.input;
    if (!Array.isArray(items) || items.length === 0)
      return false;
    const config = mergeConfig(cfg);
    if (!config.enabled)
      return false;
    const metaMap = markEligibility(items, config);
    let changed = false;
    let compressedCount = 0;
    for (const raw of items) {
      const meta = metaMap.get(raw);
      if (!meta || !meta.eligible)
        continue;
      if (meta.type === "local_shell_call_output" && hasLossyRewriteCandidate(raw.output, config)) {
        continue;
      }
      const content = raw.output;
      if (typeof content !== "string")
        continue;
      const next = rewriteText(content, config);
      if (next === null)
        continue;
      raw.output = next;
      changed = true;
      compressedCount++;
    }
    if (!changed)
      return false;
    if (ctx && ctx.state) {
      ctx.state.codexResponses = { compressedCount };
    }
    return true;
  }

  // engines/headroom.js
  var exports_headroom = {};
  __export(exports_headroom, {
    apply: () => apply5,
    crushText: () => crushText,
    defaultOn: () => defaultOn5,
    id: () => id5,
    restoreText: () => restoreText,
    tryCompactJson: () => tryCompactJson,
    wrapGcf: () => wrapGcf
  });

  // engines/gcf/scalar.js
  var JSON_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
  var NUMERIC_LIKE_RE = /^[+-]\.?\d|^\.\d|^0\d/;
  var INLINE_ARRAY_RE = /\[[^\]]*\]\s*:/;
  function needsQuote(s) {
    if (s === "")
      return true;
    if (s === "-" || s === "~" || s === "^" || s === "true" || s === "false")
      return true;
    if (JSON_NUMBER_RE.test(s))
      return true;
    if (NUMERIC_LIKE_RE.test(s))
      return true;
    if (s[0] === " " || s[s.length - 1] === " ")
      return true;
    if (s[0] === "#" || s[0] === "@" || s[0] === ".")
      return true;
    if (INLINE_ARRAY_RE.test(s))
      return true;
    for (let i = 0;i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 34 || c === 92 || c < 32 || c === 10 || c === 13 || c === 124 || c === 44)
        return true;
      if (c >= 128 && c <= 159)
        return true;
      if (c > 127 && (c === 160 || c === 8232 || c === 8233 || c === 65279 || c === 5760 || c >= 8192 && c <= 8202 || c === 8239 || c === 8287 || c === 12288))
        return true;
    }
    return false;
  }
  function quoteString(s) {
    let out = '"';
    for (let i = 0;i < s.length; i++) {
      const c = s.charCodeAt(i);
      switch (c) {
        case 34:
          out += "\\\"";
          break;
        case 92:
          out += "\\\\";
          break;
        case 8:
          out += "\\b";
          break;
        case 12:
          out += "\\f";
          break;
        case 10:
          out += "\\n";
          break;
        case 13:
          out += "\\r";
          break;
        case 9:
          out += "\\t";
          break;
        default:
          if (c < 32) {
            out += "\\u" + c.toString(16).padStart(4, "0");
          } else {
            out += s[i];
          }
      }
    }
    return out + '"';
  }
  function formatScalar(v, delimiter = 0) {
    if (v === null || v === undefined)
      return "-";
    if (typeof v === "boolean")
      return v ? "true" : "false";
    if (typeof v === "number")
      return formatNumber(v);
    const s = String(v);
    if (needsQuote(s) || delimiter && s.includes(String.fromCharCode(delimiter))) {
      return quoteString(s);
    }
    return s;
  }
  function formatNumber(f) {
    if (Object.is(f, -0))
      return "-0";
    if (f === 0)
      return "0";
    const abs = Math.abs(f);
    if (abs >= 0.000001 && abs < 9007199254740992) {
      return toPreciseDecimal(f);
    }
    let s = f.toExponential();
    s = s.replace(/[eE]\+?0*(\d)/, "e+$1").replace(/[eE]-0*(\d)/, "e-$1");
    return s;
  }
  function toPreciseDecimal(f) {
    return String(f);
  }
  var BARE_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  function isBareKey(s) {
    return BARE_KEY_RE.test(s);
  }
  function formatKey(s) {
    return isBareKey(s) ? s : quoteString(s);
  }
  function parseScalar(s, tabularContext) {
    if (s === "")
      return "";
    if (s[0] === '"')
      return parseQuotedString(s);
    if (s === "-")
      return null;
    if (s === "~") {
      if (!tabularContext)
        throw new Error("invalid_missing: ~ outside tabular row cell");
      return MISSING;
    }
    if (s === "^" || s.startsWith("^{") && s.endsWith("}")) {
      if (!tabularContext)
        throw new Error("invalid_attachment_marker: ^ outside tabular row cell");
      if (s === "^")
        return ATTACHMENT;
      return { __inlineSchema: s.slice(1) };
    }
    if (s === "true")
      return true;
    if (s === "false")
      return false;
    if (JSON_NUMBER_RE.test(s)) {
      const f = Number(s);
      if (!isNaN(f))
        return f;
    }
    return s;
  }
  var MISSING = Symbol("missing");
  var ATTACHMENT = Symbol("attachment");
  function parseQuotedString(s) {
    if (s.length < 2 || s[0] !== '"')
      throw new Error("unterminated_quote");
    let out = "";
    let i = 1;
    while (i < s.length) {
      if (s[i] === '"') {
        if (i + 1 !== s.length)
          throw new Error("trailing_characters: after closing quote");
        return out;
      }
      if (s[i] === "\\") {
        if (i + 1 >= s.length)
          throw new Error("unterminated_quote");
        i++;
        switch (s[i]) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += `
`;
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            if (i + 4 >= s.length)
              throw new Error("invalid_escape: incomplete unicode");
            const hex = s.slice(i + 1, i + 5);
            const code = parseInt(hex, 16);
            if (isNaN(code))
              throw new Error(`invalid_escape: invalid unicode \\u${hex}`);
            if (code >= 55296 && code <= 56319) {
              if (i + 10 >= s.length || s[i + 5] !== "\\" || s[i + 6] !== "u") {
                throw new Error("invalid_surrogate: isolated high surrogate");
              }
              const hex2 = s.slice(i + 7, i + 11);
              const low = parseInt(hex2, 16);
              if (isNaN(low) || low < 56320 || low > 57343) {
                throw new Error("invalid_surrogate: invalid low surrogate");
              }
              out += String.fromCodePoint(65536 + (code - 55296) * 1024 + (low - 56320));
              i += 11;
              continue;
            }
            if (code >= 56320 && code <= 57343) {
              throw new Error("invalid_surrogate: isolated low surrogate");
            }
            out += String.fromCharCode(code);
            i += 5;
            continue;
          }
          default:
            throw new Error(`invalid_escape: unknown \\${s[i]}`);
        }
        i++;
        continue;
      }
      if (s.charCodeAt(i) < 32) {
        throw new Error(`invalid_escape: unescaped control U+${s.charCodeAt(i).toString(16).padStart(4, "0")}`);
      }
      out += s[i];
      i++;
    }
    throw new Error("unterminated_quote");
  }
  function splitRespectingQuotes(s, delim) {
    const parts = [];
    let current = "";
    let inQuote = false;
    let escaped = false;
    for (let i = 0;i < s.length; i++) {
      if (escaped) {
        current += s[i];
        escaped = false;
        continue;
      }
      if (s[i] === "\\" && inQuote) {
        current += s[i];
        escaped = true;
        continue;
      }
      if (s[i] === '"') {
        inQuote = !inQuote;
        current += s[i];
        continue;
      }
      if (s[i] === delim && !inQuote) {
        parts.push(current);
        current = "";
        continue;
      }
      current += s[i];
    }
    parts.push(current);
    return parts;
  }
  function splitFieldDecl(s) {
    if (s.length < 2 || s[0] !== "{")
      throw new Error("invalid field declaration");
    const closeIdx = findClosingBrace(s);
    if (closeIdx < 0)
      throw new Error("invalid field declaration");
    const inner = s.slice(1, closeIdx);
    if (!inner)
      return [];
    const raw = splitRespectingQuotes(inner, ",");
    const fields = [];
    const seen = new Set;
    for (const f of raw) {
      const trimmed = f.trim();
      let name;
      if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
        name = parseQuotedString(trimmed);
      } else {
        if (!isBareKey(trimmed))
          throw new Error(`invalid field name: ${trimmed}`);
        name = trimmed;
      }
      if (seen.has(name))
        throw new Error(`duplicate_field_name: ${name}`);
      seen.add(name);
      fields.push(name);
    }
    return fields;
  }
  function findClosingBrace(s) {
    let inQuote = false;
    let escaped = false;
    for (let i = 0;i < s.length; i++) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (s[i] === "\\" && inQuote) {
        escaped = true;
        continue;
      }
      if (s[i] === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (s[i] === "}" && !inQuote)
        return i;
    }
    return -1;
  }

  // engines/gcf/encode.js
  function indent(depth) {
    return "  ".repeat(depth);
  }
  function encodeGeneric(data, opts) {
    let out = `GCF profile=generic
`;
    out += encodeRootValue(data, opts);
    return out;
  }
  function encodeRootValue(v, opts) {
    if (v === null || v === undefined)
      return `=-
`;
    if (Array.isArray(v))
      return encodeRootArray(v, opts);
    if (typeof v === "object")
      return encodeObject(v, 0, opts);
    return `=${formatScalar(v, 0)}
`;
  }
  function encodeObject(obj, depth, opts) {
    const prefix = indent(depth);
    let out = "";
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const fk = formatKey(key);
      if (Array.isArray(value)) {
        out += encodeNamedArray(fk, value, depth, opts);
      } else if (typeof value === "object" && value !== null) {
        out += `${prefix}## ${fk}
`;
        out += encodeObject(value, depth + 1, opts);
      } else {
        out += `${prefix}${fk}=${formatScalar(value, 0)}
`;
      }
    }
    return out;
  }
  function encodeRootArray(arr, opts) {
    if (arr.length === 0)
      return `## [0]
`;
    if (allPrimitives(arr)) {
      const vals = arr.map((v) => formatScalar(v, 44));
      return `## [${arr.length}]: ${vals.join(",")}
`;
    }
    const fields = tabularFields(arr);
    if (fields)
      return encodeTabular("## ", arr, fields, 0, opts);
    return encodeExpanded("## ", arr, 0, opts);
  }
  function encodeNamedArray(name, arr, depth, opts) {
    const prefix = indent(depth);
    if (arr.length === 0)
      return `${prefix}## ${name} [0]
`;
    if (allPrimitives(arr)) {
      const vals = arr.map((v) => formatScalar(v, 44));
      return `${prefix}${name}[${arr.length}]: ${vals.join(",")}
`;
    }
    const fields = tabularFields(arr);
    if (fields)
      return encodeTabular(`${prefix}## ${name} `, arr, fields, depth, opts);
    return encodeExpanded(`${prefix}## ${name} `, arr, depth, opts);
  }
  function tabularFields(arr) {
    if (arr.length === 0)
      return null;
    const fieldOrder = [];
    const seen = new Set;
    for (const item of arr) {
      if (typeof item !== "object" || item === null || Array.isArray(item))
        return null;
      for (const k of Object.keys(item)) {
        if (!seen.has(k)) {
          fieldOrder.push(k);
          seen.add(k);
        }
      }
    }
    return fieldOrder.length > 0 ? fieldOrder : null;
  }
  function inlineSchemaFields(arr, fieldName) {
    const first = arr[0];
    if (!first || !Object.prototype.hasOwnProperty.call(first, fieldName))
      return null;
    const firstVal = first[fieldName];
    if (firstVal === null || firstVal === undefined || typeof firstVal !== "object" || Array.isArray(firstVal))
      return null;
    let canonicalKeys = null;
    for (const item of arr) {
      const obj = item;
      if (!Object.prototype.hasOwnProperty.call(obj, fieldName) || obj[fieldName] === null || obj[fieldName] === undefined)
        continue;
      const v = obj[fieldName];
      if (typeof v !== "object" || Array.isArray(v))
        return null;
      const keys = Object.keys(v);
      for (const k of keys) {
        const val = v[k];
        if (val !== null && val !== undefined && typeof val === "object")
          return null;
      }
      if (!canonicalKeys) {
        canonicalKeys = keys;
      } else {
        if (keys.length !== canonicalKeys.length)
          return null;
        for (let i = 0;i < keys.length; i++) {
          if (keys[i] !== canonicalKeys[i])
            return null;
        }
      }
    }
    if (!canonicalKeys || canonicalKeys.length < 3)
      return null;
    return canonicalKeys;
  }
  function sharedArraySchema(arr, fieldName) {
    const first = arr[0];
    if (!first || !Object.prototype.hasOwnProperty.call(first, fieldName))
      return null;
    const firstVal = first[fieldName];
    if (!Array.isArray(firstVal))
      return null;
    let canonicalFields = null;
    for (const item of arr) {
      const obj = item;
      if (!Object.prototype.hasOwnProperty.call(obj, fieldName) || obj[fieldName] === null || obj[fieldName] === undefined)
        continue;
      const v = obj[fieldName];
      if (!Array.isArray(v))
        return null;
      const fields = tabularFields(v);
      if (!fields)
        return null;
      for (const arrItem of v) {
        if (typeof arrItem !== "object" || arrItem === null)
          return null;
        for (const val of Object.values(arrItem)) {
          if (val !== null && val !== undefined && typeof val === "object")
            return null;
        }
      }
      if (!canonicalFields) {
        canonicalFields = fields;
      } else {
        if (fields.length !== canonicalFields.length)
          return null;
        for (let i = 0;i < fields.length; i++) {
          if (fields[i] !== canonicalFields[i])
            return null;
        }
      }
    }
    return canonicalFields;
  }
  function isUnsafeKey(k) {
    return k === "__proto__" || k === "constructor" || k === "prototype";
  }
  function analyzeFlattenable(arr, fieldName, parentPath) {
    if (fieldName.includes(">"))
      return null;
    let canonicalShape = null;
    for (const item of arr) {
      const obj = item;
      if (!Object.prototype.hasOwnProperty.call(obj, fieldName) || obj[fieldName] === undefined)
        continue;
      if (obj[fieldName] === null) {
        if (parentPath !== "")
          return null;
        continue;
      }
      const v = obj[fieldName];
      if (typeof v !== "object" || Array.isArray(v))
        return null;
      const keys = Object.keys(v);
      if (!canonicalShape) {
        canonicalShape = Object.create(null);
        for (const k of keys) {
          if (k.includes(">") || isUnsafeKey(k))
            return null;
          const val = v[k];
          if (val !== null && val !== undefined && typeof val === "object" && !Array.isArray(val)) {
            canonicalShape[k] = "nested";
          } else if (Array.isArray(val)) {
            return null;
          } else {
            canonicalShape[k] = "scalar";
          }
        }
      } else {
        if (keys.length !== Object.keys(canonicalShape).length)
          return null;
        for (const k of keys) {
          if (!Object.prototype.hasOwnProperty.call(canonicalShape, k))
            return null;
          const val = v[k];
          const expected = canonicalShape[k];
          if (expected === "scalar") {
            if (val !== null && val !== undefined && typeof val === "object")
              return null;
          } else if (expected === "nested") {
            if (val !== null && val !== undefined) {
              if (typeof val !== "object" || Array.isArray(val))
                return null;
            }
          }
        }
      }
    }
    if (!canonicalShape)
      return null;
    const currentPath = parentPath ? parentPath + ">" + fieldName : fieldName;
    const parentKeys = parentPath ? [...parentPath.split(">"), fieldName] : [fieldName];
    const leaves = [];
    for (const k of Object.keys(canonicalShape)) {
      if (canonicalShape[k] === "scalar") {
        leaves.push({ path: currentPath + ">" + k, keys: [...parentKeys, k] });
      } else {
        const subArr = arr.map((item) => {
          const obj = item;
          if (!Object.prototype.hasOwnProperty.call(obj, fieldName) || obj[fieldName] === null || obj[fieldName] === undefined)
            return {};
          return obj[fieldName];
        });
        const subLeaves = analyzeFlattenable(subArr, k, currentPath);
        if (!subLeaves || subLeaves.length === 0)
          return null;
        leaves.push(...subLeaves);
      }
    }
    if (leaves.length > 0) {
      for (const item of arr) {
        const obj = item;
        if (!Object.prototype.hasOwnProperty.call(obj, fieldName) || obj[fieldName] === null || obj[fieldName] === undefined)
          continue;
        const allNull = leaves.every((leaf) => {
          const val = resolveKeyChain(item, leaf.keys);
          return val.exists && val.value === null;
        });
        if (allNull)
          return null;
      }
    }
    return leaves;
  }
  function resolveKeyChain(item, keys) {
    if (keys.length === 0)
      return { value: undefined, exists: false };
    const obj = item;
    if (typeof obj !== "object" || obj === null)
      return { value: undefined, exists: false };
    if (!Object.prototype.hasOwnProperty.call(obj, keys[0]))
      return { value: undefined, exists: false };
    let current = obj[keys[0]];
    if (current === null || current === undefined)
      return { value: current, exists: true };
    for (let i = 1;i < keys.length; i++) {
      if (typeof current !== "object" || current === null)
        return { value: undefined, exists: false };
      if (!Object.prototype.hasOwnProperty.call(current, keys[i]))
        return { value: undefined, exists: false };
      current = current[keys[i]];
    }
    return { value: current, exists: true };
  }
  function encodeTabular(headerPrefix, arr, fields, depth, opts) {
    const prefix = indent(depth);
    const flattenMap = new Map;
    if (!opts || !opts.noFlatten) {
      for (const f of fields) {
        const leaves = analyzeFlattenable(arr, f, "");
        if (leaves && leaves.length > 0) {
          flattenMap.set(f, leaves);
        }
      }
    }
    const gtFields = new Set;
    for (const f of fields) {
      if (!flattenMap.has(f) && f.includes(">")) {
        gtFields.add(f);
      }
    }
    const columns = [];
    for (const f of fields) {
      if (gtFields.has(f))
        continue;
      const leaves = flattenMap.get(f);
      if (leaves) {
        for (const leaf of leaves) {
          columns.push({
            headerName: formatKey(leaf.path),
            colType: "flat",
            field: f,
            keys: leaf.keys
          });
        }
      } else {
        columns.push({ headerName: formatKey(f), colType: "original", field: f, keys: [] });
      }
    }
    if (columns.length === 0) {
      return encodeExpanded(headerPrefix, arr, depth, opts);
    }
    const inlineSchemas = new Map;
    const sharedArrSchemas = new Map;
    for (const f of fields) {
      if (flattenMap.has(f))
        continue;
      const ifs = inlineSchemaFields(arr, f);
      if (ifs)
        inlineSchemas.set(f, ifs);
      const sas = sharedArraySchema(arr, f);
      if (sas)
        sharedArrSchemas.set(f, sas);
    }
    const headerFields = columns.map((c) => c.headerName);
    let out = `${headerPrefix}[${arr.length}]{${headerFields.join(",")}}
`;
    for (let i = 0;i < arr.length; i++) {
      const obj = arr[i];
      const cells = [];
      const attachments = [];
      let rowHasAttachment = false;
      for (const col of columns) {
        if (col.colType === "flat") {
          if (!Object.prototype.hasOwnProperty.call(obj, col.keys[0])) {
            cells.push("~");
          } else {
            const topVal = obj[col.keys[0]];
            if (topVal === null || topVal === undefined) {
              cells.push(topVal === null ? "-" : "~");
            } else {
              const resolved = resolveKeyChain(obj, col.keys);
              if (!resolved.exists) {
                cells.push("~");
              } else if (resolved.value === null || resolved.value === undefined) {
                cells.push("-");
              } else {
                cells.push(formatScalar(resolved.value, 124));
              }
            }
          }
          continue;
        }
        const f = col.field;
        if (!Object.prototype.hasOwnProperty.call(obj, f)) {
          cells.push("~");
          continue;
        }
        const v = obj[f];
        if (v === null || v === undefined) {
          cells.push("-");
          continue;
        }
        if (typeof v === "object") {
          const ifs = inlineSchemas.get(f);
          if (ifs && !Array.isArray(v)) {
            if (i === 0) {
              const fmtIF = ifs.map((k) => formatKey(k));
              cells.push(`^{${fmtIF.join(",")}}`);
            } else {
              cells.push("^");
            }
            attachments.push({ name: f, value: v, inline: true, inlineFields: ifs });
          } else {
            cells.push("^");
            attachments.push({ name: f, value: v, inline: false });
          }
          rowHasAttachment = true;
        } else {
          cells.push(formatScalar(v, 124));
        }
      }
      for (const f of fields) {
        if (!gtFields.has(f))
          continue;
        if (!Object.prototype.hasOwnProperty.call(obj, f))
          continue;
        rowHasAttachment = true;
        attachments.push({ name: f, value: obj[f], inline: false });
      }
      const row = cells.join("|");
      if (rowHasAttachment) {
        out += `${prefix}@${i} ${row}
`;
      } else {
        out += `${prefix}${row}
`;
      }
      for (const att of attachments) {
        const fk = formatKey(att.name);
        if (att.inline && att.inlineFields) {
          const vals = att.inlineFields.map((inf) => {
            const val = att.value[inf];
            if (val === undefined)
              return "~";
            return formatScalar(val, 124);
          });
          out += `${prefix}${vals.join("|")}
`;
        } else if (Array.isArray(att.value)) {
          const sas = sharedArrSchemas.get(att.name);
          if (sas && i > 0) {
            out += encodeAttachmentArrayShared(prefix, fk, att.value, depth + 2, sas, opts);
          } else {
            out += encodeAttachmentArray(prefix, fk, att.value, depth + 2, opts);
          }
        } else if (typeof att.value === "object" && att.value !== null) {
          out += `${prefix}.${fk} {}
`;
          out += encodeObject(att.value, depth + 2, opts);
        } else {
          if (att.value === null || att.value === undefined) {
            out += `${prefix}.${fk} =-
`;
          } else {
            out += `${prefix}.${fk} =${formatScalar(att.value, 0)}
`;
          }
        }
      }
    }
    return out;
  }
  function encodeAttachmentArray(attPrefix, fk, arr, depth, opts) {
    if (arr.length === 0)
      return `${attPrefix}.${fk} [0]
`;
    if (allPrimitives(arr)) {
      const vals = arr.map((v) => formatScalar(v, 44));
      return `${attPrefix}.${fk} [${arr.length}]: ${vals.join(",")}
`;
    }
    const fields = tabularFields(arr);
    if (fields)
      return encodeTabular(`${attPrefix}.${fk} `, arr, fields, depth, opts);
    return encodeExpanded(`${attPrefix}.${fk} `, arr, depth, opts);
  }
  function encodeAttachmentArrayShared(attPrefix, fk, arr, depth, sharedFields, opts) {
    if (arr.length === 0)
      return `${attPrefix}.${fk} [0]
`;
    if (allPrimitives(arr)) {
      const vals = arr.map((v) => formatScalar(v, 44));
      return `${attPrefix}.${fk} [${arr.length}]: ${vals.join(",")}
`;
    }
    const fields = tabularFields(arr);
    if (fields && fields.length === sharedFields.length && fields.every((f, i) => f === sharedFields[i])) {
      const prefix = indent(depth);
      let out = `${attPrefix}.${fk} [${arr.length}]
`;
      for (const item of arr) {
        const obj = item;
        const cells = sharedFields.map((f) => {
          if (!Object.prototype.hasOwnProperty.call(obj, f))
            return "~";
          if (obj[f] === null || obj[f] === undefined)
            return "-";
          return formatScalar(obj[f], 124);
        });
        out += `${prefix}${cells.join("|")}
`;
      }
      return out;
    }
    return encodeAttachmentArray(attPrefix, fk, arr, depth, opts);
  }
  function encodeExpanded(headerPrefix, arr, depth, opts) {
    const prefix = indent(depth);
    let out = `${headerPrefix}[${arr.length}]
`;
    for (let i = 0;i < arr.length; i++) {
      const item = arr[i];
      if (Array.isArray(item)) {
        out += encodeExpandedArrayItem(prefix, i, item, depth, opts);
      } else if (typeof item === "object" && item !== null) {
        out += `${prefix}@${i} {}
`;
        out += encodeObject(item, depth + 1, opts);
      } else {
        out += `${prefix}@${i} =${formatScalar(item, 0)}
`;
      }
    }
    return out;
  }
  function encodeExpandedArrayItem(prefix, idx, arr, depth, opts) {
    if (arr.length === 0)
      return `${prefix}@${idx} [0]
`;
    if (allPrimitives(arr)) {
      const vals = arr.map((v) => formatScalar(v, 44));
      return `${prefix}@${idx} [${arr.length}]: ${vals.join(",")}
`;
    }
    const fields = tabularFields(arr);
    if (fields)
      return encodeTabular(`${prefix}@${idx} `, arr, fields, depth + 1, opts);
    return encodeExpanded(`${prefix}@${idx} `, arr, depth + 1, opts);
  }
  function allPrimitives(arr) {
    return arr.every((v) => typeof v !== "object" || v === null);
  }

  // engines/gcf/decode.js
  function decodeGeneric(input) {
    input = input.trimEnd();
    if (!input)
      throw new Error("missing_header: empty input");
    const lines = input.split(`
`);
    const header = lines[0].replace(/\r$/, "");
    if (!header.startsWith("GCF "))
      throw new Error("missing_header: first line does not begin with GCF");
    const profile = parseHeaderProfile(header);
    if (profile === "graph") {
      throw new Error("graph_profile_unsupported: this vendored build supports the generic profile only");
    }
    if (profile !== "generic")
      throw new Error(`unknown_profile: ${profile}`);
    const contentLines = [];
    let summaryLine = "";
    let deferredSectionCount = 0;
    for (let i = 1;i < lines.length; i++) {
      const l = lines[i].replace(/\r$/, "");
      if (l === "")
        continue;
      for (let j = 0;j < l.length; j++) {
        if (l[j] === "\t")
          throw new Error("tab_indentation: tabs in leading whitespace");
        if (l[j] !== " ")
          break;
      }
      const trimmed = l.trimStart();
      if (trimmed.startsWith("# "))
        continue;
      if (trimmed.startsWith("##! ")) {
        summaryLine = trimmed;
        continue;
      }
      if (trimmed.startsWith("## ") && trimmed.includes("[?]"))
        deferredSectionCount++;
      contentLines.push(l);
    }
    if (summaryLine && deferredSectionCount > 0) {
      validateSummaryCounts(summaryLine, deferredSectionCount, contentLines);
    }
    if (contentLines.length === 0)
      return {};
    const first = contentLines[0].trimStart();
    if (first.startsWith("=")) {
      if (contentLines.length > 1)
        throw new Error("trailing_characters: extra lines after root scalar");
      return parseScalar(first.slice(1), false);
    }
    if (first.startsWith("## [")) {
      const [arr, consumed] = parseArrayFromHeader(contentLines, 0, 0, first.slice(3));
      if (consumed < contentLines.length) {
        throw new Error("count_mismatch: declared count is fewer than the rows present");
      }
      return arr;
    }
    const result = {};
    parseObjectBody(contentLines, 0, 0, result);
    return result;
  }
  function parseHeaderProfile(header) {
    const parts = header.split(/\s+/);
    if (parts.length < 2)
      throw new Error("missing_profile");
    const seen = new Set;
    let profile = "";
    for (let i = 1;i < parts.length; i++) {
      const eq = parts[i].indexOf("=");
      if (eq < 0)
        throw new Error(`malformed_header_field: ${parts[i]}`);
      const key = parts[i].slice(0, eq);
      if (seen.has(key))
        throw new Error(`duplicate_header_field: ${key}`);
      seen.add(key);
      if (key === "profile")
        profile = parts[i].slice(eq + 1);
    }
    if (!profile)
      throw new Error("missing_profile");
    return profile;
  }
  function parseObjectBody(lines, start, depth, out) {
    const ind = "  ".repeat(depth);
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      if (depth > 0 && !line.startsWith(ind))
        break;
      const content = depth > 0 ? line.slice(ind.length) : line;
      if (content.length > 0 && content[0] === " ") {
        throw new Error("invalid_indent: indentation increases by more than one level");
      }
      if (content.startsWith("## ")) {
        const hdr = content.slice(3);
        const bi = hdr.indexOf(" [");
        if (bi >= 0) {
          const name = parseKeyFromHeader(hdr.slice(0, bi));
          checkDup(out, name);
          const [arr, consumed] = parseArrayFromHeader(lines, i, depth, hdr.slice(bi));
          safeAssign(out, name, arr);
          i += consumed;
          continue;
        }
        const name = parseKeyFromHeader(hdr);
        checkDup(out, name);
        i++;
        const nested = {};
        const consumed = parseObjectBody(lines, i, depth + 1, nested);
        safeAssign(out, name, nested);
        i += consumed;
        continue;
      }
      const eqIdx = findKeyValueSplit(content);
      if (eqIdx > 0) {
        const name = parseKeyFromHeader(content.slice(0, eqIdx));
        checkDup(out, name);
        safeAssign(out, name, parseScalar(content.slice(eqIdx + 1), false));
        i++;
        continue;
      }
      if (!content.startsWith("@") && !content.startsWith("##")) {
        const bracketIdx = content.indexOf("[");
        if (bracketIdx > 0) {
          const rest = content.slice(bracketIdx);
          const closeIdx = rest.indexOf("]");
          if (closeIdx >= 0) {
            const after = rest.slice(closeIdx + 1);
            if (after.startsWith(": ") || after === ":") {
              const name = parseKeyFromHeader(content.slice(0, bracketIdx));
              checkDup(out, name);
              const [arr] = parseArrayFromHeader(lines, i, depth, rest);
              safeAssign(out, name, arr);
              i++;
              continue;
            }
          }
        }
      }
      i++;
    }
    return i - start;
  }
  function findKeyValueSplit(s) {
    if (!s.length)
      return -1;
    if (s[0] === '"') {
      for (let i = 1;i < s.length; i++) {
        if (s[i] === "\\") {
          i++;
          continue;
        }
        if (s[i] === '"')
          return i + 1 < s.length && s[i + 1] === "=" ? i + 1 : -1;
      }
      return -1;
    }
    const eqIdx = s.indexOf("=");
    if (eqIdx < 0)
      return -1;
    const bracketIdx = s.indexOf("[");
    if (bracketIdx >= 0 && bracketIdx < eqIdx)
      return -1;
    return eqIdx;
  }
  function parseKeyFromHeader(s) {
    s = s.trim();
    if (s.length >= 2 && s[0] === '"')
      return parseQuotedString(s);
    return s;
  }
  function checkDup(obj, key) {
    if (Object.prototype.hasOwnProperty.call(obj, key))
      throw new Error(`duplicate_key: ${key}`);
  }
  function parseArrayFromHeader(lines, headerLine, depth, bracketPart) {
    const bp = bracketPart.trimStart();
    if (!bp.startsWith("["))
      throw new Error("invalid_count");
    const closeIdx = bp.indexOf("]");
    if (closeIdx < 0)
      throw new Error("invalid_count");
    const countStr = bp.slice(1, closeIdx);
    const afterBracket = bp.slice(closeIdx + 1);
    let count = -1;
    if (countStr !== "?")
      count = parseCount(countStr);
    if (count === 0 && !afterBracket.startsWith("{") && !afterBracket.startsWith(":")) {
      return [[], 1];
    }
    if (afterBracket.startsWith(": ") || afterBracket === ":") {
      const valsStr = afterBracket.startsWith(": ") ? afterBracket.slice(2) : "";
      if (!valsStr) {
        if (count >= 0 && count !== 0)
          throw new Error(`count_mismatch: declared ${count}, got 0`);
        return [[], 1];
      }
      const vals = splitRespectingQuotes(valsStr, ",");
      if (count >= 0 && vals.length !== count)
        throw new Error(`count_mismatch: declared ${count}, got ${vals.length}`);
      return [vals.map((v) => parseScalar(v.trim(), false)), 1];
    }
    if (afterBracket.startsWith("{")) {
      const braceEnd = findClosingBrace2(afterBracket);
      if (braceEnd < 0)
        throw new Error("invalid field declaration");
      const fields = splitFieldDecl(afterBracket.slice(0, braceEnd + 1));
      const [rows, consumed] = parseTabularBody(lines, headerLine + 1, depth, fields, count);
      if (count >= 0 && rows.length !== count)
        throw new Error(`count_mismatch: declared ${count}, got ${rows.length}`);
      return [rows, consumed + 1];
    }
    const [items, consumed] = parseExpandedBody(lines, headerLine + 1, depth);
    if (count >= 0 && items.length !== count)
      throw new Error(`count_mismatch: declared ${count}, got ${items.length}`);
    return [items, consumed + 1];
  }
  function findClosingBrace2(s) {
    let inQuote = false, escaped = false;
    for (let i = 0;i < s.length; i++) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (s[i] === "\\" && inQuote) {
        escaped = true;
        continue;
      }
      if (s[i] === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (s[i] === "}" && !inQuote)
        return i;
    }
    return -1;
  }
  function isUnsafePathKey(k) {
    return k === "__proto__" || k === "constructor" || k === "prototype";
  }
  function safeAssign(obj, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(obj, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
      });
    } else {
      obj[key] = value;
    }
  }
  function unflattenPaths(pathColumns, flatValues, flatAbsent) {
    const groups = new Map;
    const groupOrder = [];
    for (const [fieldName, paths] of pathColumns) {
      if (paths.length === 0)
        continue;
      if (paths.some(isUnsafePathKey))
        continue;
      const top = paths[0];
      if (!groups.has(top)) {
        groups.set(top, []);
        groupOrder.push(top);
      }
      groups.get(top).push(fieldName);
    }
    const result = {};
    for (const top of groupOrder) {
      const fieldNames = groups.get(top);
      const allAbsent = fieldNames.every((f) => flatAbsent.has(f));
      const allNull = fieldNames.every((f) => {
        if (flatAbsent.has(f))
          return false;
        const val = flatValues.get(f);
        return val === null;
      });
      if (allAbsent)
        continue;
      if (allNull) {
        result[top] = null;
        continue;
      }
      for (const fieldName of fieldNames) {
        if (flatAbsent.has(fieldName))
          continue;
        const paths = pathColumns.get(fieldName);
        const val = flatValues.has(fieldName) ? flatValues.get(fieldName) : null;
        let current = result;
        for (let k = 0;k < paths.length - 1; k++) {
          const segment = paths[k];
          const existing = current[segment];
          if (!Object.prototype.hasOwnProperty.call(current, segment) || existing === null || typeof existing !== "object") {
            current[segment] = {};
          }
          current = current[segment];
        }
        current[paths[paths.length - 1]] = val;
      }
    }
    return result;
  }
  function parseTabularBody(lines, start, depth, fields, expectedCount) {
    const ind = "  ".repeat(depth);
    const rows = [];
    let i = start;
    const pathColumnMap = new Map;
    for (const f of fields) {
      if (f.includes(">")) {
        const parts = f.split(">");
        if (parts.every((p) => p.length > 0)) {
          pathColumnMap.set(f, parts);
        }
      }
    }
    const inlineSchemas = new Map;
    const sharedArraySchemas = new Map;
    while (i < lines.length) {
      const line = lines[i];
      const content = depth > 0 ? line.startsWith(ind) ? line.slice(ind.length) : null : line;
      if (content === null)
        break;
      if (content.startsWith("## ") || content.startsWith("##!"))
        break;
      if (content.length > 0 && content[0] === " ") {
        break;
      }
      let rowData = content;
      let rowHasID = false;
      if (rowData.startsWith("@")) {
        const sp = rowData.indexOf(" ");
        if (sp > 0) {
          const idStr = rowData.slice(1, sp);
          if (/^\d+$/.test(idStr)) {
            rowData = rowData.slice(sp + 1);
            rowHasID = true;
          }
        }
      }
      const vals = splitRespectingQuotes(rowData, "|");
      if (vals.length !== fields.length)
        throw new Error(`row_width_mismatch: expected ${fields.length}, got ${vals.length}`);
      const cellValues = new Map;
      const traditionalAttFields = [];
      const inlineAttFields = [];
      const inlineAttOrder = [];
      const missingFields = new Set;
      const flatValues = new Map;
      const flatAbsent = new Set;
      for (let j = 0;j < fields.length; j++) {
        const cellVal = vals[j];
        if (pathColumnMap.has(fields[j])) {
          const parsed = parseScalar(cellVal, true);
          if (parsed === MISSING) {
            flatAbsent.add(fields[j]);
          } else {
            flatValues.set(fields[j], parsed);
          }
          continue;
        }
        if (cellVal.startsWith("^{") && cellVal.endsWith("}")) {
          const schemaStr = cellVal.slice(1);
          const ifs = splitFieldDecl(schemaStr);
          inlineSchemas.set(fields[j], ifs);
          inlineAttFields.push(fields[j]);
          inlineAttOrder.push(fields[j]);
          continue;
        }
        const parsed = parseScalar(cellVal, true);
        if (parsed === MISSING) {
          missingFields.add(fields[j]);
          continue;
        }
        if (parsed === ATTACHMENT) {
          if (inlineSchemas.has(fields[j])) {
            inlineAttFields.push(fields[j]);
            inlineAttOrder.push(fields[j]);
          } else {
            traditionalAttFields.push(fields[j]);
          }
          continue;
        }
        if (parsed && typeof parsed === "object" && parsed.__inlineSchema) {
          const ifs = splitFieldDecl(parsed.__inlineSchema);
          inlineSchemas.set(fields[j], ifs);
          inlineAttFields.push(fields[j]);
          inlineAttOrder.push(fields[j]);
          continue;
        }
        cellValues.set(fields[j], parsed);
      }
      i++;
      const allAttFields = [...traditionalAttFields, ...inlineAttFields];
      const attachmentValues = new Map;
      if (rowHasID) {
        let inlineIdx = 0;
        while (i < lines.length) {
          const aLine = lines[i];
          let aContent = null;
          if (depth === 0 || aLine.startsWith(ind)) {
            aContent = depth > 0 ? aLine.slice(ind.length) : aLine;
          } else {
            break;
          }
          if (aContent === null)
            break;
          let attContent = aContent;
          if (!attContent.startsWith(".") && attContent.startsWith("  .")) {
            attContent = attContent.slice(2);
          }
          if (attContent.startsWith(".")) {
            const rest = attContent.slice(1);
            const [attName, afterName] = parseAttachmentName(rest);
            const ifs = inlineSchemas.get(attName);
            if (ifs && !afterName.trimStart().startsWith("{}") && !afterName.trimStart().startsWith("[")) {
              const data = afterName.trimStart();
              const inlineVals = splitRespectingQuotes(data, "|");
              if (inlineVals.length !== ifs.length)
                throw new Error(`inline_width_mismatch: ${attName} expected ${ifs.length}, got ${inlineVals.length}`);
              const obj = {};
              for (let k = 0;k < ifs.length; k++) {
                const p = parseScalar(inlineVals[k], true);
                if (p !== MISSING)
                  obj[ifs[k]] = p;
              }
              if (attachmentValues.has(attName))
                throw new Error(`duplicate_attachment: ${attName}`);
              attachmentValues.set(attName, obj);
              i++;
              continue;
            }
            const [name, val, consumed, parsedFields] = parseAttachment(lines, i, rest, depth + 2, sharedArraySchemas);
            if (attachmentValues.has(name))
              throw new Error(`duplicate_attachment: ${name}`);
            if (rows.length === 0 && parsedFields) {
              sharedArraySchemas.set(name, parsedFields);
            }
            attachmentValues.set(name, val);
            i += consumed;
            continue;
          }
          let foundInline = false;
          let nextInlineField = "";
          while (inlineIdx < inlineAttOrder.length) {
            const candidate = inlineAttOrder[inlineIdx];
            if (!attachmentValues.has(candidate)) {
              nextInlineField = candidate;
              foundInline = true;
              break;
            }
            inlineIdx++;
          }
          if (!foundInline)
            break;
          const ifs = inlineSchemas.get(nextInlineField);
          const inlineVals = splitRespectingQuotes(aContent, "|");
          if (inlineVals.length !== ifs.length)
            throw new Error(`inline_width_mismatch: ${nextInlineField} expected ${ifs.length}, got ${inlineVals.length}`);
          const obj = {};
          for (let k = 0;k < ifs.length; k++) {
            const p = parseScalar(inlineVals[k], true);
            if (p !== MISSING)
              obj[ifs[k]] = p;
          }
          attachmentValues.set(nextInlineField, obj);
          inlineIdx++;
          i++;
        }
        for (const f of allAttFields) {
          if (!attachmentValues.has(f))
            throw new Error(`missing_attachment: ${f}`);
        }
        if (i < lines.length) {
          let peekContent = null;
          if (depth === 0 || lines[i].startsWith(ind)) {
            peekContent = depth > 0 ? lines[i].slice(ind.length) : lines[i];
          }
          if (peekContent !== null) {
            let peekAtt = peekContent;
            if (!peekAtt.startsWith(".") && peekAtt.startsWith("  .")) {
              peekAtt = peekAtt.slice(2);
            }
            if (peekAtt.startsWith(".")) {
              const peekRest = peekAtt.slice(1);
              const [peekName] = parseAttachmentName(peekRest);
              if (attachmentValues.has(peekName)) {
                throw new Error(`duplicate_attachment: ${peekName}`);
              }
            }
          }
        }
      }
      const row = {};
      for (const f of fields) {
        if (missingFields.has(f))
          continue;
        if (cellValues.has(f)) {
          safeAssign(row, f, cellValues.get(f));
          continue;
        }
        if (attachmentValues.has(f)) {
          safeAssign(row, f, attachmentValues.get(f));
          continue;
        }
      }
      for (const [k, v] of attachmentValues) {
        if (!Object.prototype.hasOwnProperty.call(row, k))
          safeAssign(row, k, v);
      }
      if (pathColumnMap.size > 0) {
        const nested = unflattenPaths(pathColumnMap, flatValues, flatAbsent);
        for (const [k, v] of Object.entries(nested)) {
          safeAssign(row, k, v);
        }
      }
      rows.push(row);
      if (expectedCount >= 0 && rows.length >= expectedCount)
        break;
    }
    return [rows, i - start];
  }
  function parseAttachmentName(rest) {
    if (rest[0] === '"') {
      for (let j = 1;j < rest.length; j++) {
        if (rest[j] === "\\") {
          j++;
          continue;
        }
        if (rest[j] === '"') {
          const name = parseQuotedString(rest.slice(0, j + 1));
          return [name, rest.slice(j + 1)];
        }
      }
      return ["", rest];
    }
    const sp = rest.indexOf(" ");
    if (sp >= 0)
      return [rest.slice(0, sp), rest.slice(sp)];
    return [rest, ""];
  }
  function parseAttachment(lines, lineIdx, rest, depth, sharedSchemas) {
    const [name, afterNameRaw] = parseAttachmentName(rest);
    const afterName = afterNameRaw.trimStart();
    if (afterName.startsWith("{}")) {
      const nested = {};
      const consumed = parseObjectBody(lines, lineIdx + 1, depth, nested);
      return [name, nested, consumed + 1, null];
    }
    if (afterName.startsWith("[")) {
      const closeBracket = afterName.indexOf("]");
      if (closeBracket < 0)
        throw new Error("invalid_count: missing ]");
      const afterClose = afterName.slice(closeBracket + 1);
      if (afterClose.startsWith("{")) {
        const endBrace = findClosingBrace2(afterClose);
        let parsedFields = null;
        if (endBrace >= 0) {
          try {
            parsedFields = splitFieldDecl(afterClose.slice(0, endBrace + 1));
          } catch {}
        }
        const [arr, consumed] = parseArrayFromHeader(lines, lineIdx, depth, afterName);
        return [name, arr, consumed, parsedFields];
      }
      const afterCloseForInline = afterName.slice(closeBracket + 1);
      if (afterCloseForInline.startsWith(": ") || afterCloseForInline === ":") {
        const [arr, consumed] = parseArrayFromHeader(lines, lineIdx, depth, afterName);
        return [name, arr, consumed, null];
      }
      if (sharedSchemas.has(name)) {
        const sf = sharedSchemas.get(name);
        const countStr = afterName.slice(1, closeBracket);
        let count = -1;
        if (countStr !== "?") {
          try {
            count = parseCount(countStr);
          } catch {
            count = -1;
          }
        }
        if (count === 0)
          return [name, [], 1, null];
        const nextIdx = lineIdx + 1;
        const ind = "  ".repeat(depth);
        let useShared = true;
        if (nextIdx < lines.length) {
          let nextContent = lines[nextIdx];
          if (depth > 0 && nextContent.startsWith(ind))
            nextContent = nextContent.slice(ind.length);
          if (nextContent.trimStart().startsWith("@"))
            useShared = false;
        }
        if (useShared) {
          const [rows, consumed] = parseTabularBody(lines, lineIdx + 1, depth, sf, count);
          if (count >= 0 && rows.length !== count)
            throw new Error(`count_mismatch: declared ${count}, got ${rows.length}`);
          return [name, rows, consumed + 1, null];
        }
      }
      const [arr, consumed] = parseArrayFromHeader(lines, lineIdx, depth, afterName);
      return [name, arr, consumed, null];
    }
    if (afterName.startsWith("=")) {
      const valStr = afterName.slice(1);
      const parsed = parseScalar(valStr, true);
      if (parsed === MISSING)
        return [name, null, 1, null];
      return [name, parsed, 1, null];
    }
    throw new Error(`invalid attachment form: ${afterName}`);
  }
  function parseExpandedBody(lines, start, depth) {
    const ind = "  ".repeat(depth);
    const items = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      const content = depth > 0 ? line.startsWith(ind) ? line.slice(ind.length) : null : line;
      if (content === null)
        break;
      if (content.startsWith("## ") || content.startsWith("##!"))
        break;
      if (!content.startsWith("@"))
        break;
      const sp = content.indexOf(" ");
      if (sp < 0)
        break;
      const idStr = content.slice(1, sp);
      const id = parseInt(idStr, 10);
      if (!isNaN(id) && id !== items.length) {
        throw new Error(`invalid_item_id: expected @${items.length}, got @${idStr}`);
      }
      const marker = content.slice(sp + 1);
      if (marker.startsWith("=")) {
        items.push(parseScalar(marker.slice(1), false));
        i++;
        continue;
      }
      if (marker.startsWith("{}")) {
        const nested = {};
        i++;
        const consumed = parseObjectBody(lines, i, depth + 1, nested);
        items.push(nested);
        i += consumed;
        continue;
      }
      if (marker.startsWith("[")) {
        const [arr, consumed] = parseArrayFromHeader(lines, i, depth + 1, marker);
        items.push(arr);
        i += consumed;
        continue;
      }
      break;
    }
    return [items, i - start];
  }
  function parseCount(s) {
    if (s === "0")
      return 0;
    if (!s.length || s[0] === "0")
      throw new Error(`invalid_count: ${s}`);
    const n = parseInt(s, 10);
    if (isNaN(n) || String(n) !== s)
      throw new Error(`invalid_count: ${s}`);
    return n;
  }
  function validateSummaryCounts(summaryLine, deferredCount, contentLines) {
    const parts = summaryLine.split(/\s+/);
    let countsStr = "";
    for (const p of parts) {
      if (p.startsWith("counts=")) {
        countsStr = p.slice(7);
        break;
      }
    }
    if (!countsStr)
      return;
    const countVals = countsStr.split(",");
    if (countVals.length !== deferredCount) {
      throw new Error(`count_mismatch: summary has ${countVals.length} count entries but ${deferredCount} deferred sections`);
    }
    const actualCounts = [];
    let inDeferred = false;
    let currentCount = 0;
    for (const l of contentLines) {
      const trimmed = l.trimStart();
      if (trimmed.startsWith("## ") && trimmed.includes("[?]")) {
        if (inDeferred)
          actualCounts.push(currentCount);
        inDeferred = true;
        currentCount = 0;
        continue;
      }
      if (trimmed.startsWith("## ")) {
        if (inDeferred) {
          actualCounts.push(currentCount);
          inDeferred = false;
        }
        continue;
      }
      if (inDeferred && !trimmed.startsWith(" ") && !trimmed.startsWith(".")) {
        currentCount++;
      }
    }
    if (inDeferred)
      actualCounts.push(currentCount);
    for (let i = 0;i < countVals.length; i++) {
      const declared = parseInt(countVals[i], 10);
      if (isNaN(declared))
        throw new Error(`count_mismatch: invalid count value "${countVals[i]}"`);
      if (i < actualCounts.length && declared !== actualCounts[i]) {
        throw new Error(`count_mismatch: section ${i} declared ${declared} in summary, actual ${actualCounts[i]}`);
      }
    }
  }

  // engines/headroom.js
  var DEFAULT_MIN_ROWS = 8;
  var GCF_FENCE_OPEN = "```gcf-generic";
  var GCF_FENCE_CLOSE = "```";
  var JSON_FENCE_RE = /```json\n([\s\S]*?)\n```/g;
  function wrapGcf(blockContent) {
    return `${GCF_FENCE_OPEN}
${blockContent}
${GCF_FENCE_CLOSE}`;
  }
  function allObjects(arr) {
    for (const item of arr) {
      if (item === null || typeof item !== "object" || Array.isArray(item))
        return false;
    }
    return true;
  }
  function tryCompactJson(jsonStr, minRows = DEFAULT_MIN_ROWS) {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return null;
    }
    if (!Array.isArray(parsed) || parsed.length < minRows)
      return null;
    if (!allObjects(parsed))
      return null;
    const compact = wrapGcf(encodeGeneric(parsed));
    if (compact.length >= jsonStr.length)
      return null;
    return compact;
  }
  function crushText(text, minRows = DEFAULT_MIN_ROWS) {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("[")) {
      const compacted = tryCompactJson(text.trim(), minRows);
      if (compacted !== null)
        return compacted;
    }
    let result = text;
    let offset = 0;
    const regex = new RegExp(JSON_FENCE_RE.source, "g");
    let match;
    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const innerJson = match[1];
      const compacted = tryCompactJson(innerJson.trim(), minRows);
      if (compacted !== null) {
        const start = match.index + offset;
        const end = start + fullMatch.length;
        result = result.slice(0, start) + compacted + result.slice(end);
        offset += compacted.length - fullMatch.length;
      }
    }
    return result;
  }
  function restoreText(text) {
    if (!text.includes(GCF_FENCE_OPEN))
      return text;
    let result = text;
    let searchFrom = 0;
    while (true) {
      const fenceStart = result.indexOf(GCF_FENCE_OPEN, searchFrom);
      if (fenceStart === -1)
        break;
      const contentStart = fenceStart + GCF_FENCE_OPEN.length + 1;
      const fenceEnd = result.indexOf(`
` + GCF_FENCE_CLOSE, contentStart);
      if (fenceEnd === -1)
        break;
      const blockContent = result.slice(contentStart, fenceEnd);
      const decoded = decodeGeneric(blockContent);
      const jsonStr = JSON.stringify(decoded);
      const fullFence = result.slice(fenceStart, fenceEnd + GCF_FENCE_CLOSE.length + 1);
      result = result.slice(0, fenceStart) + jsonStr + result.slice(fenceStart + fullFence.length);
      searchFrom = fenceStart + jsonStr.length;
    }
    return result;
  }
  var id5 = "headroom";
  var defaultOn5 = true;
  function apply5(body, ctx, cfg = {}) {
    if (!body || typeof body !== "object")
      return false;
    if (cfg.enabled === false)
      return false;
    const minRows = typeof cfg.minRows === "number" ? cfg.minRows : DEFAULT_MIN_ROWS;
    const view = conversationView(body, ctx && ctx.protocol);
    if (!view)
      return false;
    const start = Date.now();
    let changed = false;
    let crushedSegments = 0;
    for (const seg of view.segments) {
      if (seg.role === "system")
        continue;
      const crushed = crushText(seg.text, minRows);
      if (crushed !== seg.text) {
        seg.set(crushed);
        changed = true;
        crushedSegments++;
      }
    }
    if (changed && ctx && ctx.state) {
      ctx.state.headroom = { crushedSegments, durationMs: Date.now() - start };
    }
    return changed;
  }

  // engines/relevance/index.js
  var exports_relevance = {};
  __export(exports_relevance, {
    RELEVANCE_SCHEMA: () => RELEVANCE_SCHEMA,
    SENTENCE_PRESERVE_RE: () => SENTENCE_PRESERVE_RE,
    apply: () => apply6,
    applyRelevanceToText: () => applyRelevanceToText,
    available: () => available,
    cacheImpact: () => cacheImpact,
    configSchema: () => configSchema,
    defaultOn: () => defaultOn6,
    description: () => description,
    id: () => id6,
    isSingleMode: () => isSingleMode,
    label: () => label,
    levels: () => levels,
    lossy: () => lossy,
    resolveRelevanceConfig: () => resolveRelevanceConfig,
    stackPriority: () => stackPriority,
    validateRelevanceConfig: () => validateRelevanceConfig,
    why: () => why
  });

  // engines/relevance/config.js
  var RELEVANCE_SCHEMA = [
    {
      key: "enabled",
      type: "boolean",
      label: "Enabled",
      defaultValue: false
    },
    {
      key: "overlapThreshold",
      type: "number",
      label: "Overlap threshold",
      description: "Sentences with Jaccard overlap below this are candidates for removal.",
      defaultValue: 0.1,
      min: 0,
      max: 1
    },
    {
      key: "budgetPercent",
      type: "number",
      label: "Budget percent",
      description: "Target fraction of original character count to retain (0–1).",
      defaultValue: 0.5,
      min: 0.1,
      max: 1
    },
    {
      key: "boilerplateWeight",
      type: "number",
      label: "Boilerplate weight",
      description: "Weight applied to boilerplate penalty when scoring sentences.",
      defaultValue: 0.5,
      min: 0,
      max: 1
    }
  ];
  var configSchema = RELEVANCE_SCHEMA;
  function validateRelevanceConfig(config) {
    const errors = [];
    if (config.enabled !== undefined && typeof config.enabled !== "boolean") {
      errors.push("enabled must be a boolean");
    }
    for (const key of ["overlapThreshold", "budgetPercent", "boilerplateWeight"]) {
      if (config[key] !== undefined) {
        const v = config[key];
        if (typeof v !== "number" || v < 0 || v > 1) {
          errors.push(`${key} must be a number between 0 and 1`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }
  function resolveRelevanceConfig(stepConfig) {
    const sc = stepConfig && typeof stepConfig === "object" ? stepConfig : {};
    return {
      enabled: typeof sc.enabled === "boolean" ? sc.enabled : false,
      overlapThreshold: typeof sc.overlapThreshold === "number" ? sc.overlapThreshold : 0.1,
      budgetPercent: typeof sc.budgetPercent === "number" ? sc.budgetPercent : 0.5,
      boilerplateWeight: typeof sc.boilerplateWeight === "number" ? sc.boilerplateWeight : 0.5
    };
  }

  // engines/relevance/scorer.js
  var BOILERPLATE_TOKENS = new Set([
    "please",
    "note",
    "important",
    "indeed",
    "certainly",
    "basically",
    "essentially",
    "obviously",
    "clearly",
    "simply",
    "just",
    "really",
    "actually",
    "honestly",
    "conclusion",
    "summary",
    "hope",
    "understand",
    "thing",
    "things",
    "something"
  ]);
  function tokenize(text) {
    const lower = text.toLowerCase();
    const tokens = [];
    let start = -1;
    for (let i = 0;i <= lower.length; i++) {
      const ch = i < lower.length ? lower.charCodeAt(i) : -1;
      const isAlnum = ch !== -1 && (ch >= 97 && ch <= 122 || ch >= 48 && ch <= 57);
      if (isAlnum) {
        if (start === -1)
          start = i;
      } else {
        if (start !== -1) {
          tokens.push(lower.slice(start, i));
          start = -1;
        }
      }
    }
    return tokens;
  }
  function jaccard2(setA, setB) {
    if (setA.size === 0 || setB.size === 0)
      return 0;
    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t))
        intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
  function boilerplateScore(tokens) {
    if (tokens.length === 0)
      return 0;
    let count = 0;
    for (const t of tokens) {
      if (BOILERPLATE_TOKENS.has(t))
        count++;
    }
    return count / tokens.length;
  }
  function scoreSentences(sentences, query, cfg) {
    if (sentences.length === 0)
      return [];
    if (!query || query.trim().length === 0)
      return sentences.map(() => 0);
    const queryTokens = new Set(tokenize(query));
    return sentences.map((sentence) => {
      const sentTokens = tokenize(sentence);
      if (sentTokens.length === 0)
        return 0;
      const sentSet = new Set(sentTokens);
      const overlap = jaccard2(sentSet, queryTokens);
      const boilerplate = boilerplateScore(sentTokens) * cfg.boilerplateWeight;
      return Math.max(0, overlap - boilerplate);
    });
  }

  // engines/relevance/index.js
  function splitSentences(text) {
    const out = [];
    let start = 0;
    for (let i = 1;i < text.length; i++) {
      const prev = text[i - 1];
      if ((prev === "." || prev === "!" || prev === "?") && isSpace(text[i])) {
        out.push(text.slice(start, i));
        start = i;
      }
    }
    out.push(text.slice(start));
    return out.filter((s) => s.trim().length > 0);
  }
  function isSpace(ch) {
    return ch === " " || ch === "\t" || ch === `
` || ch === "\r" || ch === "\f" || ch === "\v";
  }
  var SENTENCE_PRESERVE_RE = /\d|https?:\/\/|(?:Error|Exception|TypeError|RangeError|SyntaxError|ReferenceError|Traceback):|```|^\s*at\s|\/[\w.-]+\/|\w+=\S/i;
  function applyRelevanceToText(text, query, cfg) {
    if (typeof text !== "string" || text.length === 0)
      return { result: text, changed: false };
    if (typeof query !== "string" || query.trim().length === 0)
      return { result: text, changed: false };
    const sentences = splitSentences(text);
    if (sentences.length <= 1)
      return { result: text, changed: false };
    const scores = scoreSentences(sentences, query, cfg);
    const totalChars = text.length;
    const budget = Math.floor(totalChars * cfg.budgetPercent);
    const keepSet = new Set;
    for (let i = 0;i < sentences.length; i++) {
      if (SENTENCE_PRESERVE_RE.test(sentences[i]))
        keepSet.add(i);
    }
    const sorted = sentences.map((s, i) => ({ i, s, score: scores[i] })).filter((x) => !keepSet.has(x.i)).sort((a, b) => b.score - a.score);
    let kept = 0;
    for (const item of sorted) {
      if (item.score >= cfg.overlapThreshold) {
        keepSet.add(item.i);
        kept += item.s.length + 1;
        if (kept >= budget)
          break;
      }
    }
    if (keepSet.size === 0 && sorted.length > 0)
      keepSet.add(sorted[0].i);
    if (keepSet.size === sentences.length)
      return { result: text, changed: false };
    const ordered = [];
    for (let i = 0;i < sentences.length; i++) {
      if (keepSet.has(i))
        ordered.push(sentences[i]);
    }
    const result = ordered.join("");
    return { result, changed: result !== text };
  }
  var id6 = "relevance";
  var label = "Relevance";
  var why = "按最后一条用户消息给句子打分，丢掉低分句。";
  var description = "Extractive sentence scoring against the last user query.";
  var lossy = true;
  var cacheImpact = "moderate";
  var defaultOn6 = false;
  var stackPriority = 18;
  var isSingleMode = false;
  var levels = undefined;
  var available = true;
  function apply6(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const conf = resolveRelevanceConfig(cfg);
      const view = conversationView(body, ctx && ctx.protocol);
      if (!view || !Array.isArray(view.segments) || view.segments.length === 0)
        return false;
      const segs = view.segments;
      let query = "";
      for (let i = segs.length - 1;i >= 0; i--) {
        if (segs[i].role === "user") {
          query = typeof segs[i].text === "string" ? segs[i].text.trim() : "";
          break;
        }
      }
      if (!query)
        return false;
      let changed = false;
      for (const seg of segs) {
        if (seg.role !== "user")
          continue;
        const r = applyRelevanceToText(seg.text, query, conf);
        if (!r.changed)
          continue;
        seg.set(r.result);
        changed = true;
      }
      return changed;
    } catch {
      return false;
    }
  }

  // engines/ultra.js
  var exports_ultra = {};
  __export(exports_ultra, {
    DEFAULT_ULTRA_CONFIG: () => DEFAULT_ULTRA_CONFIG,
    ULTRA_SCHEMA: () => ULTRA_SCHEMA,
    apply: () => apply7,
    available: () => available2,
    cacheImpact: () => cacheImpact2,
    configSchema: () => configSchema2,
    defaultOn: () => defaultOn7,
    description: () => description2,
    extractPreservedBlocks: () => extractPreservedBlocks,
    id: () => id7,
    isSingleMode: () => isSingleMode2,
    label: () => label2,
    levels: () => levels2,
    lossy: () => lossy2,
    pruneByScore: () => pruneByScore,
    pruneProseOnly: () => pruneProseOnly,
    resolveUltraConfig: () => resolveUltraConfig,
    scoreToken: () => scoreToken,
    stackPriority: () => stackPriority2,
    validateUltraConfig: () => validateUltraConfig,
    why: () => why2
  });
  var COMPRESSED_PREFIX = "[COMPRESSED:";
  var STOPWORDS = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "will",
    "would",
    "could",
    "may",
    "might",
    "shall",
    "dare",
    "ought",
    "used",
    "i",
    "we",
    "you",
    "he",
    "she",
    "it",
    "they",
    "me",
    "us",
    "him",
    "her",
    "them",
    "my",
    "our",
    "your",
    "his",
    "its",
    "their",
    "this",
    "that",
    "these",
    "those",
    "and",
    "but",
    "or",
    "for",
    "yet",
    "so",
    "as",
    "at",
    "by",
    "in",
    "of",
    "on",
    "to",
    "up",
    "via",
    "with",
    "from",
    "into",
    "onto",
    "upon",
    "about",
    "just",
    "very",
    "really",
    "quite",
    "rather",
    "also",
    "too",
    "even",
    "still",
    "already",
    "often",
    "usually",
    "sometimes",
    "here",
    "there"
  ]);
  var FORCE_PRESERVE_RE = /\d|https?:\/\/|[._\/\\]|Error:|Exception:|```/i;
  var POLARITY_WORDS = new Set([
    "never",
    "always",
    "no",
    "not",
    "nor",
    "must",
    "shall",
    "shall not",
    "do",
    "does",
    "did",
    "don't",
    "doesn't",
    "didn't",
    "can",
    "cannot",
    "can't",
    "should",
    "shouldn't",
    "need",
    "needs",
    "mustn't",
    "won't",
    "wouldn't",
    "could",
    "couldn't"
  ]);
  function scoreToken(token) {
    if (FORCE_PRESERVE_RE.test(token))
      return 1;
    const lower = token.toLowerCase();
    if (POLARITY_WORDS.has(lower))
      return 1;
    if (STOPWORDS.has(lower))
      return 0.1;
    if (token.length <= 2)
      return 0.2;
    if (/^[A-Z]/.test(token))
      return 0.8;
    if (token.length >= 6)
      return 0.7;
    return 0.5;
  }
  function pruneByScore(text, keepRate, minScore) {
    const rate = typeof keepRate === "number" ? keepRate : 0.5;
    const floor = typeof minScore === "number" ? minScore : 0.3;
    if (!text || rate >= 1)
      return text;
    const tokens = text.split(/(\s+)/);
    const wordTokens = tokens.filter((t) => !/^\s+$/.test(t));
    const targetKeep = Math.ceil(wordTokens.length * rate);
    const scored = wordTokens.map((t, i) => ({ t, i, score: scoreToken(t) }));
    const sorted = scored.slice().sort((a, b) => a.score - b.score);
    const toPrune = new Set;
    let pruned = 0;
    for (const item of sorted) {
      if (pruned >= wordTokens.length - targetKeep)
        break;
      if (item.score < floor) {
        toPrune.add(item.i);
        pruned++;
      }
    }
    let wordIdx = 0;
    return tokens.map((t) => {
      if (/^\s+$/.test(t))
        return t;
      const keep = !toPrune.has(wordIdx);
      wordIdx++;
      return keep ? t : "";
    }).join("").replace(/[ \t]{2,}/g, " ").trim();
  }
  var SENTINEL_PREFIX = "\x00OMNI_CAVEMAN";
  function randomSentinelSeed() {
    const cryptoLike = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (cryptoLike && typeof cryptoLike.getRandomValues === "function") {
      const bytes = new Uint8Array(8);
      cryptoLike.getRandomValues(bytes);
      let hex = "r";
      for (let i = 0;i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      return hex;
    }
    return `r${Math.random().toString(36).slice(2)}`;
  }
  function ensureGlobal(pattern) {
    const flags = pattern.flags.indexOf("g") >= 0 ? pattern.flags : `${pattern.flags}g`;
    return new RegExp(pattern.source, flags);
  }
  function compileUserPatterns(patterns) {
    if (!patterns || patterns.length === 0)
      return [];
    const compiled = [];
    for (const pattern of patterns) {
      try {
        compiled.push({
          pattern: typeof pattern === "string" ? new RegExp(pattern, "g") : ensureGlobal(pattern),
          kind: "custom"
        });
      } catch {}
    }
    return compiled;
  }
  function replacePattern(text, pattern, kind, addBlock) {
    pattern.lastIndex = 0;
    return text.replace(pattern, (match) => {
      if (!match)
        return match;
      if (match.indexOf(SENTINEL_PREFIX) >= 0)
        return match;
      return addBlock(match, kind);
    });
  }
  function extractFrontmatter(text, addBlock) {
    if (text.slice(0, 4) !== `---
`)
      return text;
    const close = text.indexOf(`
---`, 4);
    if (close === -1)
      return text;
    let end = close + 4;
    while (end < text.length && text[end] !== `
`)
      end++;
    if (end < text.length)
      end++;
    return addBlock(text.slice(0, end), "frontmatter") + text.slice(end);
  }
  function isSpaceChar(ch) {
    return ch === " " || ch === "\t" || ch === `
` || ch === "\r" || ch === "\f" || ch === "\v";
  }
  function isDigitChar(ch) {
    return ch >= "0" && ch <= "9";
  }
  function extractFencedCodeBlocks(text, addBlock) {
    const matched = text.match(/[^\n]*(?:\n|$)/g);
    const lines = matched || [text];
    let out = "";
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line === "" && i === lines.length - 1)
        break;
      const open = /^([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(line);
      if (!open) {
        out += line;
        i++;
        continue;
      }
      const marker = open[2];
      const fenceChar = marker[0];
      const fenceLen = marker.length;
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        const close = /^([ \t]{0,3})(`{3,}|~{3,})\s*(?:\n|$)/.exec(lines[j]);
        if (close && close[2][0] === fenceChar && close[2].length >= fenceLen) {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        out += line;
        i++;
        continue;
      }
      out += addBlock(lines.slice(i, j + 1).join(""), "fenced_code");
      i = j + 1;
    }
    return out;
  }
  function replaceMathInline(text, addBlock) {
    const parts = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch !== "$") {
        parts.push(ch);
        i++;
        continue;
      }
      if (i > 0 && text[i - 1] === "$") {
        parts.push(ch);
        i++;
        continue;
      }
      const n1 = i + 1 < text.length ? text[i + 1] : "";
      if (!n1 || isSpaceChar(n1) || n1 === "$" || isDigitChar(n1)) {
        parts.push(ch);
        i++;
        continue;
      }
      let j = i + 1;
      let elems = 0;
      let end = -1;
      while (j < text.length) {
        const c = text[j];
        if (c === "$") {
          const prev = text[j - 1];
          const next = j + 1 < text.length ? text[j + 1] : "";
          if (!isSpaceChar(prev) && next !== "$") {
            end = j;
          }
          break;
        }
        if (c === "\\") {
          const nx = j + 1 < text.length ? text[j + 1] : "";
          if (!nx || nx === `
` || nx === "\r")
            break;
          j += 2;
          elems++;
        } else if (c === `
` || c === "\r") {
          break;
        } else {
          j++;
          elems++;
        }
        if (elems > 160)
          break;
      }
      if (end === -1) {
        parts.push(ch);
        i++;
        continue;
      }
      parts.push(addBlock(text.slice(i, end + 1), "math_inline"));
      i = end + 1;
    }
    return parts.join("");
  }
  var BUILTIN_PATTERNS = [
    { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
    { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
    { pattern: /\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, kind: "latex_block" },
    { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
    { pattern: /^\|.*\|$/gm, kind: "markdown_table" },
    { pattern: /^\|?[\s:]*-{3,}[\s:]*(\|[\s:]*-{3,}[\s:]*)*\|?$/gm, kind: "markdown_table" },
    { pattern: /^\s*#(?:set|show|let|import|include)\b.+$/gm, kind: "typst_directive" },
    { pattern: /`[^`\n]+`/g, kind: "inline_code" },
    { pattern: /\[[^\]\n]*\]\([^)\s]+\)/g, kind: "markdown_link" },
    { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/g, kind: "url" },
    { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
    { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*/g, kind: "env_var" },
    { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
    { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?/g, kind: "dotted_identifier" },
    { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
    { pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g, kind: "file_path" },
    { pattern: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g, kind: "error_message" }
  ];
  function extractPreservedBlocks(text, options) {
    const opts = options || {};
    const blocks = [];
    const seed = randomSentinelSeed();
    let counter = 0;
    const addBlock = (content, kind) => {
      const placeholder = `${SENTINEL_PREFIX}_${seed}_${counter++}\x00`;
      blocks.push({ placeholder, content, kind });
      return placeholder;
    };
    let current = extractFrontmatter(text, addBlock);
    const regionPatterns = [
      ...compileUserPatterns(opts.preservePatterns),
      { pattern: /<system-reminder>[\s\S]*?<\/system-reminder>/g, kind: "system_instruction" },
      { pattern: /<instructions?>[\s\S]*?<\/instructions?>/g, kind: "system_instruction" },
      { pattern: /<project[- ]instructions?>[\s\S]*?<\/project[- ]instructions?>/g, kind: "system_instruction" }
    ];
    for (const rp of regionPatterns) {
      current = replacePattern(current, rp.pattern, rp.kind, addBlock);
    }
    current = extractFencedCodeBlocks(current, addBlock);
    current = replaceMathInline(current, addBlock);
    for (const bp of BUILTIN_PATTERNS) {
      current = replacePattern(current, bp.pattern, bp.kind, addBlock);
    }
    return { text: current, blocks };
  }
  function pruneProseOnly(text, rate, minScore) {
    const extracted = extractPreservedBlocks(text);
    const withPlaceholders = extracted.text;
    const blocks = extracted.blocks;
    if (blocks.length === 0)
      return pruneByScore(text, rate, minScore);
    const placeholderToContent = new Map;
    for (const b of blocks)
      placeholderToContent.set(b.placeholder, b.content);
    const escaped = blocks.map((b) => b.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const splitRe = new RegExp(`(${escaped.join("|")})`, "g");
    return withPlaceholders.split(splitRe).map((part) => {
      if (!part)
        return "";
      const preserved = placeholderToContent.get(part);
      if (preserved !== undefined)
        return preserved;
      return pruneByScore(part, rate, minScore);
    }).join("");
  }
  var DEFAULT_ULTRA_CONFIG = {
    enabled: false,
    compressionRate: 0.5,
    minScoreThreshold: 0.3,
    slmFallbackToAggressive: true,
    maxTokensPerMessage: 0
  };
  var ULTRA_SCHEMA = [
    {
      key: "enabled",
      type: "boolean",
      label: "Enabled",
      defaultValue: DEFAULT_ULTRA_CONFIG.enabled
    },
    {
      key: "compressionRate",
      type: "number",
      label: "剪枝比例",
      description: "Fraction of word tokens to keep (0–1). Lower = more aggressive.",
      defaultValue: DEFAULT_ULTRA_CONFIG.compressionRate,
      min: 0,
      max: 1
    },
    {
      key: "minScoreThreshold",
      type: "number",
      label: "分数门槛",
      description: "低于此分的 token 才可剪；分数越高剪得越少。",
      defaultValue: DEFAULT_ULTRA_CONFIG.minScoreThreshold,
      min: 0,
      max: 1
    },
    {
      key: "maxTokensPerMessage",
      type: "number",
      label: "单条上限",
      description: "单条消息最多处理的 token 数，0 表示不限。",
      defaultValue: DEFAULT_ULTRA_CONFIG.maxTokensPerMessage,
      min: 0,
      max: 32768
    }
  ];
  var configSchema2 = ULTRA_SCHEMA;
  function validateUltraConfig(config) {
    const errors = [];
    const cfg = config && typeof config === "object" ? config : {};
    for (const key of ["enabled", "slmFallbackToAggressive"]) {
      if (cfg[key] !== undefined && typeof cfg[key] !== "boolean") {
        errors.push(`${key} must be a boolean`);
      }
    }
    for (const key of ["compressionRate", "minScoreThreshold"]) {
      if (cfg[key] !== undefined) {
        const v = cfg[key];
        if (typeof v !== "number" || v < 0 || v > 1) {
          errors.push(`${key} must be a number between 0 and 1`);
        }
      }
    }
    if (cfg.maxTokensPerMessage !== undefined) {
      const v = cfg.maxTokensPerMessage;
      if (typeof v !== "number" || v < 0 || v > 32768) {
        errors.push("maxTokensPerMessage must be a number between 0 and 32768");
      }
    }
    return { valid: errors.length === 0, errors };
  }
  function resolveUltraConfig(config) {
    const cfg = config && typeof config === "object" ? config : {};
    return {
      enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : DEFAULT_ULTRA_CONFIG.enabled,
      compressionRate: typeof cfg.compressionRate === "number" ? cfg.compressionRate : DEFAULT_ULTRA_CONFIG.compressionRate,
      minScoreThreshold: typeof cfg.minScoreThreshold === "number" ? cfg.minScoreThreshold : DEFAULT_ULTRA_CONFIG.minScoreThreshold,
      slmFallbackToAggressive: typeof cfg.slmFallbackToAggressive === "boolean" ? cfg.slmFallbackToAggressive : DEFAULT_ULTRA_CONFIG.slmFallbackToAggressive,
      maxTokensPerMessage: typeof cfg.maxTokensPerMessage === "number" ? cfg.maxTokensPerMessage : DEFAULT_ULTRA_CONFIG.maxTokensPerMessage,
      preserveSystemPrompt: cfg.preserveSystemPrompt !== false
    };
  }
  var id7 = "ultra";
  var label2 = "Ultra";
  var why2 = "启发式 token 级剪枝，最激进的纯本地压缩（约 75%）。";
  var description2 = "Heuristic token pruning (+ optional SLM).";
  var lossy2 = true;
  var cacheImpact2 = "high";
  var defaultOn7 = false;
  var stackPriority2 = 40;
  var isSingleMode2 = false;
  var levels2 = undefined;
  var available2 = true;
  function apply7(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const conf = resolveUltraConfig(cfg);
      const view = conversationView(body, ctx && ctx.protocol);
      if (!view || !Array.isArray(view.segments) || view.segments.length === 0)
        return false;
      let changed = false;
      for (const seg of view.segments) {
        if (typeof seg.text !== "string" || seg.text.length === 0)
          continue;
        if (conf.preserveSystemPrompt && seg.role === "system")
          continue;
        if (seg.text.indexOf(COMPRESSED_PREFIX) === 0)
          continue;
        if (conf.maxTokensPerMessage > 0) {
          const tokens = Math.ceil(seg.text.length / 4);
          if (tokens <= conf.maxTokensPerMessage)
            continue;
        }
        const next = pruneProseOnly(seg.text, conf.compressionRate, conf.minScoreThreshold);
        if (typeof next !== "string" || next === seg.text)
          continue;
        seg.set(next);
        changed = true;
      }
      return changed;
    } catch {
      return false;
    }
  }

  // engines/caveman.js
  var exports_caveman = {};
  __export(exports_caveman, {
    ALL_RULE_GROUPS: () => ALL_RULE_GROUPS,
    DEFAULT_CAVEMAN_CONFIG: () => DEFAULT_CAVEMAN_CONFIG,
    apply: () => apply8,
    available: () => available3,
    cacheImpact: () => cacheImpact3,
    cleanupArtifacts: () => cleanupArtifacts,
    compressText: () => compressText,
    configSchema: () => configSchema3,
    defaultOn: () => defaultOn8,
    estimateCompressionTokens: () => estimateCompressionTokens,
    extractPreservedBlocks: () => extractPreservedBlocks2,
    findFencedCodeBlocks: () => findFencedCodeBlocks,
    hasProtectedStructure: () => hasProtectedStructure,
    id: () => id8,
    isCodeDominantText: () => isCodeDominantText,
    isSingleMode: () => isSingleMode3,
    label: () => label3,
    levels: () => levels3,
    lossy: () => lossy3,
    resolveConfig: () => resolveConfig,
    restorePreservedBlocks: () => restorePreservedBlocks,
    shouldPreserve: () => shouldPreserve,
    stackPriority: () => stackPriority3,
    validateCompression: () => validateCompression,
    why: () => why3
  });

  // engines/rules-data.js
  var RULE_PACKS = {
    de: {
      context: { language: "de", category: "context", rules: [{ name: "de_context_setup", pattern: "\\b(?:hier ist der code|unten ist der code|dies ist der code)\\b\\s*[:.]?\\s*", replacement: "Code:", context: "user", category: "context", minIntensity: "lite" }, { name: "de_intent", pattern: "\\b(?:mein ziel ist|was ich brauche ist|ich versuche|die idee ist)\\b\\s*", replacement: "Ziel:", context: "user", category: "context", minIntensity: "lite" }, { name: "de_question_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:kannst du erklaeren warum|kannst du erklären warum|kannst du zeigen wie)(?![\\p{L}\\p{N}_])\\s*", replacement: "Erklaere ", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "de_background", pattern: "(?<![\\p{L}\\p{N}_])(?:wie du weisst|wie du weißt|wie bereits erwaehnt|wie bereits erwähnt)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite", flags: "giu" }] },
      dedup: { language: "de", category: "dedup", rules: [{ name: "de_repeated_context", pattern: "(?<![\\p{L}\\p{N}_])(?:wie bereits besprochen|wie zuvor erwähnt|wie bereits erwähnt|wie ich bereits sagte)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Siehe oben. ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "de_repeated_question", pattern: "\\b(?:dieselbe Frage wie zuvor|das habe ich bereits gefragt|das ist dieselbe Frage)\\b[,.]?\\s*", replacement: "[gleiche Frage] ", context: "user", category: "dedup", minIntensity: "lite" }, { name: "de_reestablished_context", pattern: "(?<![\\p{L}\\p{N}_])(?:zurück zum obigen Code|bezugnehmend auf|zurückkommend auf)(?![\\p{L}\\p{N}_])\\s*", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "de_summary_replacement", pattern: "(?<![\\p{L}\\p{N}_])(?:um zusammenzufassen was wir besprochen haben|zusammenfassend unser Gespräch|um es zusammenzufassen)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Zusammenfassung: ", context: "assistant", category: "dedup", minIntensity: "lite", flags: "giu" }] },
      filler: { language: "de", category: "filler", rules: [{ name: "de_polite_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:bitte|kannst du|koenntest du|könntest du|ich moechte|ich möchte|ich brauche)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "de_pleasantries", pattern: "\\b(?:hallo|guten morgen|guten tag|danke|vielen dank)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "de_hedging", pattern: "(?<![\\p{L}\\p{N}_])(?:ich denke dass|ich glaube dass|es scheint dass|vielleicht|wahrscheinlich|moeglicherweise|möglicherweise)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "de_filler_adverbs", pattern: "(?<![\\p{L}\\p{N}_])(?:grundsaetzlich|grundsätzlich|eigentlich|buchstaeblich|buchstäblich|einfach)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "de_self_reference", pattern: "^(?:ich versuche|ich will|ich moechte|ich möchte|ich brauche)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "de_verbose_request", pattern: "(?<![\\p{L}\\p{N}_])(?:kannst du erklaeren|kannst du erklären|koenntest du erklaeren|könntest du erklären)(?![\\p{L}\\p{N}_])\\s*", replacement: "Erklaere ", context: "user", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "de_qualifiers", pattern: "\\b(?:ein bisschen|etwas|irgendwie|mehr oder weniger)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "de_softeners", pattern: "(?<![\\p{L}\\p{N}_])(?:wenn moeglich|wenn möglich|wenn du zeit hast|ohne eile)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }] },
      structural: { language: "de", category: "structural", rules: [{ name: "de_purpose", pattern: "\\b(?:um zu|mit dem ziel|damit ich)\\b\\s*", replacement: "um ", context: "all", category: "structural", minIntensity: "lite" }, { name: "de_connectors", pattern: "(?<![\\p{L}\\p{N}_])(?:ausserdem|außerdem|zusaetzlich|zusätzlich|darueber hinaus|darüber hinaus)(?![\\p{L}\\p{N}_])\\s*", replacement: "auch ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "de_emphasis", pattern: "(?<![\\p{L}\\p{N}_])(?:sehr|wirklich|extrem|ziemlich)\\s+(?=[a-zäöüß])", replacement: "", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }] },
      ultra: { language: "de", category: "ultra", rules: [{ name: "de_articles", pattern: "(?<![\\p{L}\\p{N}_])(?:[Dd]er|[Dd]ie|[Dd]as|[Dd]en|[Dd]em|[Dd]es|[Ee]in|[Ee]ine|[Ee]inen|[Ee]inem|[Ee]iner|[Ee]ines)\\s+(?=[a-zäöüß])", flags: "gu", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "de_leader_phrases", pattern: "^(?:ich werde|ich kann|ich würde|lass mich|wir werden|wir können|lass uns)\\s+(?=[a-zäöüß])", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "de_ultra_database_abbreviation", pattern: "\\bDatenbank\\b", replacement: "DB", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_config_abbreviation", pattern: "\\bKonfiguration\\b", replacement: "Konfig", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_function_abbreviation", pattern: "\\bFunktion\\b", replacement: "Fn", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_request_abbreviation", pattern: "\\b(?:Anfrage|Anforderung)\\b", replacement: "Req", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_response_abbreviation", pattern: "\\bAntwort\\b", replacement: "Res", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_implementation_abbreviation", pattern: "\\bImplementierung\\b", replacement: "Impl", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_authentication_abbreviation", pattern: "\\bAuthentifizierung\\b", replacement: "Auth", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_authorization_abbreviation", pattern: "\\bAutorisierung\\b", replacement: "Authz", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_application_abbreviation", pattern: "\\b(?:Anwendung|Applikation)\\b", replacement: "App", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "de_ultra_dependency_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:Abhängigkeit|Abhängigkeiten)(?![\\p{L}\\p{N}_])", replacement: "Dep", replacementMap: { "Abhängigkeit": "Dep", "Abhängigkeiten": "Deps" }, context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }] }
    },
    en: {
      context: { language: "en", category: "context", rules: [{ name: "compound_collapse", pattern: "\\band any potential\\b", replacement: "", context: "all", category: "context", minIntensity: "full" }, { name: "explanatory_prefix", pattern: "\\b(?:The function appears to be handling|The code seems to|The class is|This module is)\\b", replacement: "Function:", replacementMap: { "the function appears to be handling": "Function:", "the code seems to": "Code:", "the class is": "Class:", "this module is": "Module:" }, context: "all", category: "context", minIntensity: "lite" }, { name: "question_to_directive", pattern: "\\b(?:Can you explain why|Could you show me how|Would you tell me|Can you tell me)\\b\\s*", replacement: "Explain why ", replacementMap: { "can you explain why": "Explain why ", "could you show me how": "Show how ", "would you tell me": "Tell me ", "can you tell me": "Tell me " }, context: "user", category: "context", minIntensity: "lite" }, { name: "context_setup", pattern: "\\b(?:I have the following code|Here is my code|Below is the code)\\b\\s*[:.]?\\s*", replacement: "Code:", context: "user", category: "context", minIntensity: "lite" }, { name: "intent_clarification", pattern: "\\b(?:What I'm trying to do is|My objective is to|What I need is|I'm aiming to)\\b\\s*", replacement: "Goal:", context: "user", category: "context", minIntensity: "lite" }, { name: "background_removal", pattern: "\\b(?:As you may know,?\\s*|As we discussed earlier,?\\s*)", replacement: "", context: "all", category: "context", minIntensity: "lite" }, { name: "meta_commentary", pattern: "^(?:Note that|Keep in mind that|Remember that)\\b\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite" }, { name: "purpose_statement", pattern: "\\b(?:for the purpose of|with the goal of|in an effort to|for every)\\b", replacement: "for", replacementMap: { "for the purpose of": "for", "with the goal of": "to", "in an effort to": "to", "for every": "per" }, context: "all", category: "context", minIntensity: "lite" }] },
      dedup: { language: "en", category: "dedup", rules: [{ name: "repeated_context", pattern: "\\b(?:As we discussed earlier|As mentioned before|As previously stated|As I said before)\\b[,.]?\\s*", replacement: "See above. ", context: "all", category: "dedup", minIntensity: "lite" }, { name: "repeated_question", pattern: "\\b(?:Same question as before|I asked this earlier|This is the same question)\\b[,.]?\\s*", replacement: "[same question] ", context: "user", category: "dedup", minIntensity: "lite" }, { name: "reestablished_context", pattern: "\\b(?:Going back to the code above|Referring back to|Returning to)\\b\\s*", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite" }, { name: "summary_replacement", pattern: "\\b(?:To summarize what we've discussed|In summary of our conversation|To recap)\\b[,.]?\\s*", replacement: "Summary: ", context: "assistant", category: "dedup", minIntensity: "lite" }] },
      filler: { language: "en", category: "filler", rules: [{ name: "pleasantries", pattern: "(?<!make\\s)(?<!be\\s)\\b(?:i'?d be happy to|i would be happy to|i'?d be glad to|i would be glad to|glad to help|happy to|thank you|thanks|no problem|you'?re welcome|absolutely|certainly|of course|sure)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "polite_framing", pattern: "\\b(?:please|kindly|could you please|would you please|can you please|I would like you to|I want you to|I need you to)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "hedging", pattern: "\\b(?:it seems like|it appears that|I think that|I believe that|probably|possibly|maybe it)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "verbose_instructions", pattern: "\\b(?:provide a detailed explanation of|give me a comprehensive explanation of|write an in-depth explanation of|create a thorough explanation of|provide a detailed|give me a comprehensive|write an in-depth|create a thorough|explain in detail)\\b", replacement: "explain ", replacementMap: { "provide a detailed explanation of": "explain ", "give me a comprehensive explanation of": "explain ", "write an in-depth explanation of": "explain ", "create a thorough explanation of": "explain ", "provide a detailed": "provide ", "give me a comprehensive": "give ", "write an in-depth": "write ", "create a thorough": "create ", "explain in detail": "explain " }, context: "all", category: "filler", minIntensity: "lite" }, { name: "filler_adverbs", pattern: "(?<![a-z])\\b(?:basically|essentially|actually|literally|simply|currently)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "filler_phrases", pattern: "^(?:I want to|I need to|I'd like to|I'm looking for)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "redundant_openers", pattern: "^(?:Hi there|Hello|Good morning|Hey)\\s*[,.!?\\s]?\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "verbose_requests", pattern: "\\b(?:I was wondering if you could|Would it be possible to)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "self_reference", pattern: "^(?:I am trying to|I am working on|I have been)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "excessive_gratitude", pattern: "\\b(?:Thank you so much|Thanks in advance|I really appreciate)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "qualifier_removal", pattern: "\\b(?:a bit|a little|somewhat|kind of|sort of)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "softeners", pattern: "\\b(?:if possible|when you get a chance|at your convenience|just wondering)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "uncertainty_fillers", pattern: "\\b(?:I guess|I suppose|more or less|in a way)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "assistant_fillers", pattern: "^(?:Here'?s|Below is|This is)\\s+(?:a|an|the)?\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }] },
      structural: { language: "en", category: "structural", rules: [{ name: "redundant_phrasing", pattern: "\\b(?:make sure to|be sure to)\\b\\s*", replacement: "ensure ", context: "all", category: "structural", minIntensity: "full" }, { name: "redundant_because", pattern: "\\b(?:due to the fact that|the reason is because)\\b\\s*", replacement: "because ", context: "all", category: "structural", minIntensity: "full" }, { name: "redundant_directive", pattern: "\\b(?:it is important to|you should|remember to)\\b\\s*", replacement: "", context: "all", category: "structural", minIntensity: "full" }, { name: "list_conjunction", pattern: ",\\s*and also\\s+|,\\s*as well as\\s+", replacement: ", ", context: "all", category: "structural", minIntensity: "full" }, { name: "purpose_phrases", pattern: "\\b(?:in order to|so as to)\\b\\s*", replacement: "to ", context: "all", category: "structural", minIntensity: "lite" }, { name: "redundant_quantifiers", pattern: "\\b(?:each and every single|each and every)\\b", replacement: "each", context: "all", category: "structural", minIntensity: "full" }, { name: "all_quantifier", pattern: "\\bany and all\\b", replacement: "all", context: "all", category: "structural", minIntensity: "full" }, { name: "verbose_connectors", pattern: "\\b(?:furthermore|additionally|moreover|in addition)\\b\\s*", replacement: "also ", context: "all", category: "structural", minIntensity: "lite" }, { name: "transition_removal", pattern: "^(?:On the other hand,?\\s*|In contrast,?\\s*|However,?\\s*)", replacement: "", context: "all", category: "structural", minIntensity: "lite" }, { name: "emphasis_removal", pattern: "\\b(?:very|really|extremely|highly|quite)\\s+(?=[a-z])", replacement: "", context: "all", category: "structural", minIntensity: "lite" }, { name: "passive_voice", pattern: "\\b(?:is being used|is being called|is being generated|was created|was generated|was implemented)\\b", replacement: "uses", replacementMap: { "is being used": "uses", "is being called": "calls", "is being generated": "generated", "was created": "created", "was generated": "generated", "was implemented": "implemented" }, context: "all", category: "structural", minIntensity: "full" }] },
      ultra: { language: "en", category: "ultra", rules: [{ name: "articles", pattern: "\\b(?:[Aa]n|[Aa]|[Tt]he)\\s+(?=[a-z])", flags: "g", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "leader_phrases", pattern: "^(?:i'?ll|i will|i can|i'?d|let me|you can|we will|we can|let'?s)\\s+(?=[a-z])", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "ultra_abbreviations", pattern: "\\bdatabase\\b", replacement: "DB", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_config_abbreviation", pattern: "\\bconfiguration\\b", replacement: "config", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_function_abbreviation", pattern: "\\bfunction\\b", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_request_abbreviation", pattern: "\\brequest\\b", replacement: "req", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_response_abbreviation", pattern: "\\bresponse\\b", replacement: "res", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_implementation_abbreviation", pattern: "\\bimplementation\\b", replacement: "impl", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_authentication_abbreviation", pattern: "\\bauthentication\\b", replacement: "auth", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_authorization_abbreviation", pattern: "\\bauthorization\\b", replacement: "authz", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_application_abbreviation", pattern: "\\bapplication\\b", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_dependency_abbreviation", pattern: "\\b(?:dependency|dependencies)\\b", replacement: "dep", replacementMap: { dependency: "dep", dependencies: "deps" }, context: "all", category: "ultra", minIntensity: "ultra" }] }
    },
    es: {
      context: { language: "es", category: "context", rules: [{ name: "es_context_setup", pattern: "(?<![\\p{L}\\p{N}_])(?:aqui esta el codigo|aquí está el código|debajo esta el codigo|este es el codigo|este es el código)(?![\\p{L}\\p{N}_])\\s*[:.]?\\s*", replacement: "Código:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "es_intent", pattern: "\\b(?:mi objetivo es|lo que necesito es|lo que intento hacer es|la idea es)\\b\\s*", replacement: "Objetivo:", context: "user", category: "context", minIntensity: "lite" }, { name: "es_question_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:puedes explicar por que|puedes explicar por qué|puedes mostrar como|puedes mostrar cómo)(?![\\p{L}\\p{N}_])\\s*", replacement: "Explica ", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "es_background", pattern: "\\b(?:como sabes|como mencionamos antes|como dije antes)\\b[,.]?\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite" }, { name: "es_compound_collapse", pattern: "\\by cualquier potencial\\b", replacement: "", context: "all", category: "context", minIntensity: "full" }, { name: "es_explanatory_prefix", pattern: "(?<![\\p{L}\\p{N}_])(?:la funcion parece manejar|la función parece manejar|el codigo parece|el código parece|la clase es|este modulo es|este módulo es)(?![\\p{L}\\p{N}_])", replacement: "Función:", replacementMap: { "la funcion parece manejar": "Función:", "la función parece manejar": "Función:", "el codigo parece": "Código:", "el código parece": "Código:", "la clase es": "Clase:", "este modulo es": "Módulo:", "este módulo es": "Módulo:" }, context: "all", category: "context", minIntensity: "lite", flags: "giu" }, { name: "es_meta_commentary", pattern: "^(?:Ten en cuenta que|Recuerda que|Nota que)\\b\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite" }, { name: "es_purpose_statement", pattern: "(?<![\\p{L}\\p{N}_])(?:con el proposito de|con el propósito de|con la meta de|con el objetivo de|en un esfuerzo por|por cada)(?![\\p{L}\\p{N}_])", replacement: "para", replacementMap: { "con el proposito de": "para", "con el propósito de": "para", "con la meta de": "para", "con el objetivo de": "para", "en un esfuerzo por": "para", "por cada": "por" }, context: "all", category: "context", minIntensity: "lite", flags: "giu" }] },
      dedup: { language: "es", category: "dedup", rules: [{ name: "es_repeated_context", pattern: "(?<![\\p{L}\\p{N}_])(?:como mencionamos antes|como se menciono antes|como se mencionó antes|como dije antes|como comentamos anteriormente)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Ver arriba. ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "es_repeated_question", pattern: "(?<![\\p{L}\\p{N}_])(?:misma pregunta que antes|pregunte esto antes|pregunté esto antes|esta es la misma pregunta|es la misma pregunta)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "[misma pregunta] ", context: "user", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "es_reestablished_context", pattern: "(?<![\\p{L}\\p{N}_])(?:volviendo al codigo anterior|volviendo al código anterior|refiriendome a|refiriéndome a|retomando)(?![\\p{L}\\p{N}_])\\s*", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "es_summary_replacement", pattern: "(?<![\\p{L}\\p{N}_])(?:para resumir lo que hemos hablado|en resumen de nuestra conversacion|en resumen de nuestra conversación|recapitulando)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Resumen: ", context: "assistant", category: "dedup", minIntensity: "lite", flags: "giu" }] },
      filler: { language: "es", category: "filler", rules: [{ name: "es_polite_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:por favor|podrias|podrías|puedes|me gustaria que|me gustaría que|necesito que)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_pleasantries", pattern: "(?<![\\p{L}\\p{N}_])(?:hola|buenos dias|buenos días|buenas tardes|gracias|muchas gracias)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_hedging", pattern: "\\b(?:creo que|me parece que|parece que|tal vez|probablemente|posiblemente)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "es_filler_adverbs", pattern: "(?<![\\p{L}\\p{N}_])(?:basicamente|básicamente|esencialmente|en realidad|literalmente|simplemente)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_self_reference", pattern: "^(?:estoy intentando|quiero|necesito|me gustaria|me gustaría)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_verbose_request", pattern: "(?<![\\p{L}\\p{N}_])(?:podrias explicarme|podrías explicarme|puedes explicar|podrias detallar|podrías detallar)(?![\\p{L}\\p{N}_])\\s*", replacement: "Explica ", context: "user", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_qualifiers", pattern: "(?<![\\p{L}\\p{N}_])(?:un poco|algo asi|algo así|mas o menos|más o menos|de alguna manera)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_softeners", pattern: "(?<![\\p{L}\\p{N}_])(?:si es posible|cuando puedas|sin prisa|solo queria|sólo quería)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_verbose_instructions", pattern: "(?<![\\p{L}\\p{N}_])(?:proporciona una explicacion detallada de|proporciona una explicación detallada de|dame una explicacion completa de|dame una explicación completa de|escribe una explicacion en profundidad de|escribe una explicación en profundidad de|crea una explicacion exhaustiva de|crea una explicación exhaustiva de|explica en detalle)(?![\\p{L}\\p{N}_])", replacement: "explica ", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_redundant_openers", pattern: "^(?:hola|buenos dias|buenos días|buenas tardes|buenas|hey)\\s*[,.!?\\s]?\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "es_excessive_gratitude", pattern: "(?<![\\p{L}\\p{N}_])(?:muchisimas gracias|muchísimas gracias|gracias de antemano|te lo agradezco mucho|lo agradezco mucho)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_uncertainty_fillers", pattern: "(?<![\\p{L}\\p{N}_])(?:supongo que|imagino que|me da la impresion de que|me da la impresión de que|quizas|quizás)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "es_assistant_fillers", pattern: "^(?:aqui tienes|aquí tienes|debajo esta|debajo está|esto es)\\s+(?:un|una|el|la)?\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }] },
      structural: { language: "es", category: "structural", rules: [{ name: "es_purpose", pattern: "\\b(?:con el fin de|con el objetivo de|para poder)\\b\\s*", replacement: "para ", context: "all", category: "structural", minIntensity: "lite" }, { name: "es_connectors", pattern: "(?<![\\p{L}\\p{N}_])(?:ademas|además|adicionalmente|por otra parte)(?![\\p{L}\\p{N}_])\\s*", replacement: "también ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "es_emphasis", pattern: "(?<![\\p{L}\\p{N}_])(?:muy|realmente|extremadamente|bastante)\\s+(?=[a-záéíóúñ])", replacement: "", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "es_redundant_phrasing", pattern: "(?<![\\p{L}\\p{N}_])(?:asegurate de|asegúrate de|asegurate que|asegúrate que|ten cuidado de)(?![\\p{L}\\p{N}_])\\s*", replacement: "asegura ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "es_redundant_because", pattern: "(?<![\\p{L}\\p{N}_])(?:debido a que|por la razon de que|por la razón de que|la razon es porque|la razón es porque)(?![\\p{L}\\p{N}_])\\s*", replacement: "porque ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "es_redundant_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:es importante que|deberias|deberías|recuerda que)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "es_list_conjunction", pattern: ",\\s*y tambien\\s+|,\\s*y también\\s+|,\\s*asi como\\s+|,\\s*así como\\s+", replacement: ", ", context: "all", category: "structural", minIntensity: "full" }, { name: "es_redundant_quantifiers", pattern: "\\b(?:cada uno de los|cada una de las|todos y cada uno|todas y cada una)\\b", replacement: "cada", context: "all", category: "structural", minIntensity: "full" }, { name: "es_all_quantifier", pattern: "\\b(?:cualquiera y todos|todas y cada una de las|todos y cada uno de los)\\b", replacement: "todos", context: "all", category: "structural", minIntensity: "full" }, { name: "es_transition_removal", pattern: "^(?:Por otro lado,?\\s*|En contraste,?\\s*|Sin embargo,?\\s*)", replacement: "", context: "all", category: "structural", minIntensity: "lite" }, { name: "es_passive_voice", pattern: "(?<![\\p{L}\\p{N}_])(?:esta siendo usado|está siendo usado|esta siendo llamada|está siendo llamada|esta siendo generado|está siendo generado|fue creado|fue generado|fue implementado)(?![\\p{L}\\p{N}_])", replacement: "usa", replacementMap: { "esta siendo usado": "usa", "está siendo usado": "usa", "esta siendo llamada": "llama", "está siendo llamada": "llama", "esta siendo generado": "generado", "está siendo generado": "generado", "fue creado": "creado", "fue generado": "generado", "fue implementado": "implementado" }, context: "all", category: "structural", minIntensity: "full", flags: "giu" }] },
      ultra: { language: "es", category: "ultra", rules: [{ name: "es_articles", pattern: "(?<![\\p{L}\\p{N}_])(?:[Ee]l|[Ll]a|[Ll]os|[Ll]as|[Uu]n|[Uu]na|[Uu]nos|[Uu]nas)\\s+(?=[a-záéíóúñ])", flags: "gu", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "es_leader_phrases", pattern: "^(?:voy a|puedo|podemos|vamos a|dejame|déjame|se puede)\\s+(?=[a-záéíóúñ])", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "es_ultra_database_abbreviation", pattern: "\\bbase de datos\\b", replacement: "BD", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "es_ultra_config_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])configuracion(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])configuración(?![\\p{L}\\p{N}_])", replacement: "config", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_function_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])funcion(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])función(?![\\p{L}\\p{N}_])", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_request_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:peticion|petición|solicitud)(?![\\p{L}\\p{N}_])", replacement: "req", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_response_abbreviation", pattern: "\\brespuesta\\b", replacement: "res", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "es_ultra_implementation_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])implementacion(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])implementación(?![\\p{L}\\p{N}_])", replacement: "impl", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_authentication_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])autenticacion(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])autenticación(?![\\p{L}\\p{N}_])", replacement: "auth", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_authorization_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])autorizacion(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])autorización(?![\\p{L}\\p{N}_])", replacement: "authz", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_application_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])aplicacion(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])aplicación(?![\\p{L}\\p{N}_])", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "es_ultra_dependency_abbreviation", pattern: "\\b(?:dependencia|dependencias)\\b", replacement: "dep", replacementMap: { dependencia: "dep", dependencias: "deps" }, context: "all", category: "ultra", minIntensity: "ultra" }] }
    },
    fr: {
      context: { language: "fr", category: "context", rules: [{ name: "fr_context_setup", pattern: "\\b(?:voici le code|ci dessous le code|ci-dessous le code|ceci est le code)\\b\\s*[:.]?\\s*", replacement: "Code:", context: "user", category: "context", minIntensity: "lite" }, { name: "fr_intent", pattern: "(?<![\\p{L}\\p{N}_])(?:mon objectif est|ce dont j'ai besoin est|j'essaie de|l'idee est|l'idée est)(?![\\p{L}\\p{N}_])\\s*", replacement: "Objectif:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "fr_question_directive", pattern: "\\b(?:peux tu expliquer pourquoi|peux tu montrer comment|pourrais tu montrer comment)\\b\\s*", replacement: "Explique ", context: "user", category: "context", minIntensity: "lite" }, { name: "fr_background", pattern: "(?<![\\p{L}\\p{N}_])(?:comme tu le sais|comme mentionne avant|comme mentionné avant)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite", flags: "giu" }] },
      dedup: { language: "fr", category: "dedup", rules: [{ name: "fr_repeated_context", pattern: "(?<![\\p{L}\\p{N}_])(?:comme discuté précédemment|comme mentionné précédemment|comme indiqué précédemment|comme je l'ai dit avant)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Voir ci-dessus. ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "fr_repeated_question", pattern: "(?<![\\p{L}\\p{N}_])(?:même question qu'avant|j'ai déjà posé cette question|c'est la même question)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "[même question] ", context: "user", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "fr_reestablished_context", pattern: "(?<![\\p{L}\\p{N}_])(?:revenons au code ci-dessus|en référence à|revenant à)(?![\\p{L}\\p{N}_])\\s*", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "fr_summary_replacement", pattern: "(?<![\\p{L}\\p{N}_])(?:pour résumer ce que nous avons discuté|en résumé de notre conversation|pour récapituler)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Résumé: ", context: "assistant", category: "dedup", minIntensity: "lite", flags: "giu" }] },
      filler: { language: "fr", category: "filler", rules: [{ name: "fr_polite_framing", pattern: "\\b(?:s'il vous plait|s'il te plait|peux tu|pourrais tu|je voudrais que|j'ai besoin que)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "fr_pleasantries", pattern: "\\b(?:bonjour|salut|bonsoir|merci|merci beaucoup)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "fr_hedging", pattern: "(?<![\\p{L}\\p{N}_])(?:je pense que|je crois que|il semble que|peut etre|peut-être|probablement|possiblement)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "fr_filler_adverbs", pattern: "(?<![\\p{L}\\p{N}_])(?:fondamentalement|essentiellement|en fait|litteralement|littéralement|simplement)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "fr_self_reference", pattern: "^(?:j'essaie de|je veux|je voudrais|j'ai besoin de)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "fr_verbose_request", pattern: "(?<![\\p{L}\\p{N}_])(?:peux tu expliquer|pourrais tu expliquer|peux tu detailler|peux tu détailler)(?![\\p{L}\\p{N}_])\\s*", replacement: "Explique ", context: "user", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "fr_qualifiers", pattern: "(?<![\\p{L}\\p{N}_])(?:un peu|en quelque sorte|plus ou moins|d'une certaine maniere|d'une certaine manière)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "fr_softeners", pattern: "\\b(?:si possible|quand tu peux|sans urgence|je voulais juste)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }] },
      structural: { language: "fr", category: "structural", rules: [{ name: "fr_purpose", pattern: "\\b(?:afin de|dans le but de|pour pouvoir)\\b\\s*", replacement: "pour ", context: "all", category: "structural", minIntensity: "lite" }, { name: "fr_connectors", pattern: "\\b(?:de plus|en outre|additionnellement|par ailleurs)\\b\\s*", replacement: "aussi ", context: "all", category: "structural", minIntensity: "lite" }, { name: "fr_emphasis", pattern: "(?<![\\p{L}\\p{N}_])(?:tres|très|vraiment|extremement|extrêmement|assez)\\s+(?=[a-zàâçéèêëîïôûùüÿñæœ])", replacement: "", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }] },
      ultra: { language: "fr", category: "ultra", rules: [{ name: "fr_articles", pattern: "(?<![\\p{L}\\p{N}_])(?:[Ll]e|[Ll]a|[Ll]es|[Uu]n|[Uu]ne|[Dd]es|[Dd]u)\\s+(?=[a-zàâçéèêëîïôûùüÿœ])", flags: "gu", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "fr_leader_phrases", pattern: "^(?:je vais|je peux|nous allons|nous pouvons|laisse-moi|on peut)\\s+(?=[a-zàâçéèêëîïôûùüÿœ])", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "fr_ultra_database_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])base de données(?![\\p{L}\\p{N}_])", replacement: "BD", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "fr_ultra_config_abbreviation", pattern: "\\bconfiguration\\b", replacement: "config", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "fr_ultra_function_abbreviation", pattern: "\\bfonction\\b", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "fr_ultra_request_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:requête|demande)(?![\\p{L}\\p{N}_])", replacement: "req", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "fr_ultra_response_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])réponse(?![\\p{L}\\p{N}_])", replacement: "rép", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "fr_ultra_implementation_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])implémentation(?![\\p{L}\\p{N}_])", replacement: "impl", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "fr_ultra_authentication_abbreviation", pattern: "\\bauthentification\\b", replacement: "auth", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "fr_ultra_authorization_abbreviation", pattern: "\\bautorisation\\b", replacement: "authz", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "fr_ultra_application_abbreviation", pattern: "\\bapplication\\b", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "fr_ultra_dependency_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:dépendance|dépendances)(?![\\p{L}\\p{N}_])", replacement: "dép", replacementMap: { "dépendance": "dép", "dépendances": "déps" }, context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }] }
    },
    hu: {
      context: { language: "hu", category: "context", rules: [{ name: "explanatory_prefix", pattern: "(?<![\\p{L}\\p{N}_])(?:a függvény úgy tűnik, hogy|a kód úgy tűnik, hogy|az osztály az, amely|ez a modul az, amely)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "Function:", replacementMap: { "a függvény úgy tűnik, hogy": "Function:", "a kód úgy tűnik, hogy": "Code:", "az osztály az, amely": "Class:", "ez a modul az, amely": "Module:" }, context: "all", category: "context", minIntensity: "lite", description: "Collapse explanatory Hungarian prefixes into compact labels." }, { name: "question_to_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:el tudnád magyarázni,? miért|meg tudnád mutatni,? hogyan|meg tudnád mondani,? miért|meg tudnád mondani,? hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", replacementMap: { "el tudnád magyarázni, miért": "Magyarázd el, miért ", "meg tudnád mutatni, hogyan": "Mutasd meg, hogyan ", "meg tudnád mondani, miért": "Mondd meg, miért ", "meg tudnád mondani, hogy": "" }, context: "user", category: "context", minIntensity: "lite", description: "Turn indirect Hungarian questions into direct requests." }, { name: "context_setup", pattern: "^(?:itt van a kódom|itt a kódom|az alábbi kód|a következő kód|itt található a kód)\\s*[:.]?\\s*", flags: "giu", replacement: "Code: ", context: "user", category: "context", minIntensity: "lite", description: "Replace code-introduction prose with a compact context label." }, { name: "intent_clarification", pattern: "(?<![\\p{L}\\p{N}_])(?:amit el szeretnék érni,? az|az a célom,? hogy|amire szükségem van,? az|azt próbálom megoldani,? hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "Goal:", context: "user", category: "context", minIntensity: "lite", description: "Collapse explicit goal framing into a compact label." }, { name: "background_removal", pattern: "(?<![\\p{L}\\p{N}_])(?:ahogy tudod,?\\s*|ahogy korábban megbeszéltük,?\\s*|mint korábban említettem,?\\s*)", flags: "giu", replacement: "", context: "all", category: "context", minIntensity: "lite", description: "Remove repeated background framing." }, { name: "meta_commentary", pattern: "(?<![\\p{L}\\p{N}_])(?:ne feledd, hogy|tartsd szem előtt, hogy|fontos megjegyezni, hogy|megjegyzés:)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "context", minIntensity: "lite", description: "Remove meta-commentary that does not add task-specific context." }, { name: "example_setup", pattern: "(?<![\\p{L}\\p{N}_])(?:itt egy példa|az alábbi egy példa|példaként itt van)(?![\\p{L}\\p{N}_])\\s*[:.]?\\s*", flags: "giu", replacement: "Példa: ", context: "all", category: "context", minIntensity: "lite", description: "Collapse example-introduction wording." }, { name: "problem_statement", pattern: "(?<![\\p{L}\\p{N}_])(?:az a problémám, hogy|a problémám az, hogy|a probléma az, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "Probléma: ", context: "user", category: "context", minIntensity: "lite", description: "Turn verbose problem framing into a compact label." }, { name: "expected_result", pattern: "(?<![\\p{L}\\p{N}_])(?:azt szeretném, hogy|azt szeretném elérni, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "Elvárt: ", context: "user", category: "context", minIntensity: "full", description: "Collapse desired-result framing into a compact label." }] },
      dedup: { language: "hu", category: "dedup", rules: [{ name: "repeated_context", pattern: "(?<![\\p{L}\\p{N}_])(?:ahogy korábban megbeszéltük|ahogy fentebb megbeszéltük|mint korábban említettem|ahogy már említettem)(?![\\p{L}\\p{N}_])[,.]?\\s*", flags: "giu", replacement: "Lásd fent. ", context: "all", category: "dedup", minIntensity: "lite", description: "Replace repeated conversational context with a compact reference." }, { name: "repeated_question", pattern: "(?<![\\p{L}\\p{N}_])(?:ugyanaz a kérdés, mint korábban|ezt már korábban is megkérdeztem|ez ugyanaz a kérdés)(?![\\p{L}\\p{N}_])[,.]?\\s*", flags: "giu", replacement: "[ugyanaz a kérdés] ", context: "user", category: "dedup", minIntensity: "lite", description: "Collapse repeated-question framing." }, { name: "reestablished_context", pattern: "(?<![\\p{L}\\p{N}_])(?:visszatérve a fenti kódhoz|visszatérve a korábbi kódhoz|a fentiekhez visszatérve|visszatérve erre)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite", description: "Compactly reference previously established context." }, { name: "summary_replacement", pattern: "(?<![\\p{L}\\p{N}_])(?:összefoglalva, amit megbeszéltünk|a beszélgetésünk összefoglalásaként|röviden összefoglalva|összefoglalva)(?![\\p{L}\\p{N}_])[,.:]?\\s*", flags: "giu", replacement: "Összegzés: ", context: "assistant", category: "dedup", minIntensity: "lite", description: "Replace verbose recap lead-ins with a compact summary label." }, { name: "repetition_acknowledgement", pattern: "(?<![\\p{L}\\p{N}_])(?:ahogy az előbb is mondtam|ahogy már korábban is írtam|ezt már fentebb leírtam)(?![\\p{L}\\p{N}_])[,.]?\\s*", flags: "giu", replacement: "Lásd fent. ", context: "all", category: "dedup", minIntensity: "lite", description: "Remove explicit repetition acknowledgements." }] },
      filler: { language: "hu", category: "filler", rules: [{ name: "pleasantries", pattern: "(?<![\\p{L}\\p{N}_])(?:köszönöm(?: szépen)?|köszi|szívesen|nincs mit|örömmel|természetesen|persze|abszolút)(?![\\p{L}\\p{N}_])[,.!?\\s]*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove standalone Hungarian pleasantries and courtesy fillers." }, { name: "polite_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:kérlek\\s*,?|légy szíves\\s*,?|volnál szíves\\s*,?|megtennéd\\s*,? hogy|szeretném\\s*,? ha|arra kérlek\\s*,? hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "user", category: "filler", minIntensity: "lite", description: "Remove polite request framing while preserving the requested action." }, { name: "hedging", pattern: "(?<![\\p{L}\\p{N}_])(?:úgy gondolom,? hogy|azt hiszem,? hogy|véleményem szerint|valószínűleg|talán|lehet,? hogy|úgy tűnik,? hogy|úgy látszik,? hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove common Hungarian hedging when it does not carry technical intent." }, { name: "verbose_instructions", pattern: "(?<![\\p{L}\\p{N}_])(?:részletesen magyarázd el|magyarázd el részletesen|adj részletes magyarázatot|készíts átfogó magyarázatot|írj részletes magyarázatot)(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "magyarázd el", replacementMap: { "részletesen magyarázd el": "magyarázd el", "magyarázd el részletesen": "magyarázd el", "adj részletes magyarázatot": "magyarázd el", "készíts átfogó magyarázatot": "magyarázd el", "írj részletes magyarázatot": "magyarázd el" }, context: "all", category: "filler", minIntensity: "lite", description: "Collapse verbose requests for detailed explanations into a direct instruction." }, { name: "filler_adverbs", pattern: "(?<![\\p{L}\\p{N}_])(?:alapvetően|lényegében|tulajdonképpen|igazából|valójában|szó szerint|egyszerűen)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove common discourse-filler adverbs." }, { name: "filler_phrases", pattern: "^(?:azt szeretném,? hogy|azt szeretném megtudni,? hogy|azt szeretném kérni,? hogy|szeretnék kérni|az lenne a kérdésem,? hogy)\\s*", flags: "giu", replacement: "", context: "user", category: "filler", minIntensity: "lite", description: "Remove first-person framing at the start of user requests." }, { name: "redundant_openers", pattern: "^(?:szia|sziasztok|szervusz|jó reggelt|jó napot|helló|üdv)\\s*[,.!?]?\\s*", flags: "giu", replacement: "", context: "user", category: "filler", minIntensity: "lite", description: "Remove greeting openers from user prompts." }, { name: "verbose_requests", pattern: "(?<![\\p{L}\\p{N}_])(?:azt szeretném megkérdezni,? hogy|az iránt érdeklődnék,? hogy|arra lennék kíváncsi,? hogy|meg tudnád mondani,? hogy|meg tudnád mutatni,? hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "user", category: "filler", minIntensity: "lite", description: "Shorten indirect Hungarian request formulations." }, { name: "self_reference", pattern: "^(?:azon dolgozom,? hogy|éppen dolgozom azon,? hogy|próbálom megoldani,? hogy|megpróbálom|azzal próbálkozom,? hogy)\\s*", flags: "giu", replacement: "", context: "user", category: "filler", minIntensity: "lite", description: "Remove redundant first-person process framing from user prompts." }, { name: "excessive_gratitude", pattern: "(?<![\\p{L}\\p{N}_])(?:nagyon köszönöm|előre is köszönöm|köszönöm szépen|hálás lennék)(?![\\p{L}\\p{N}_])[,.!?\\s]*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove repetitive gratitude that does not affect task intent." }, { name: "qualifier_removal", pattern: "(?<![\\p{L}\\p{N}_])(?:egy kicsit|egy picit|némileg|valamennyire|egyfajta|olyanfajta)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove low-information qualifiers." }, { name: "softeners", pattern: "(?<![\\p{L}\\p{N}_])(?:ha lehet|ha lehetséges|ha van rá lehetőség|amikor ráérsz|ha időd engedi|amennyiben lehetséges)(?![\\p{L}\\p{N}_])[,.!?\\s]*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove optionality-softening phrases that do not change the requested task." }, { name: "uncertainty_fillers", pattern: "(?<![\\p{L}\\p{N}_])(?:nagyjából|többé-kevésbé|valamilyen szinten|bizonyos értelemben|mondhatni|nagy vonalakban)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove vague scope fillers when they add little signal." }, { name: "assistant_fillers", pattern: "(?<![\\p{L}\\p{N}_])(?:itt van|alább találod|az alábbiakban|nézzük meg|lássuk)(?![\\p{L}\\p{N}_])[:,.!?\\s]*", flags: "giu", replacement: "", context: "assistant", category: "filler", minIntensity: "lite", description: "Remove low-information assistant lead-ins." }, { name: "current_state_filler", pattern: "(?<![\\p{L}\\p{N}_])(?:jelen pillanatban|ebben a pillanatban|most éppen)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Remove temporal filler when the current state is obvious from context." }, { name: "meta_politeness", pattern: "(?<![\\p{L}\\p{N}_])(?:köszönettel|köszönetképpen|szíves segítségeddel)(?![\\p{L}\\p{N}_])[,.!?\\s]*", flags: "giu", replacement: "", context: "all", category: "filler", minIntensity: "full", description: "Remove uncommon but redundant courtesy closings." }] },
      structural: { language: "hu", category: "structural", rules: [{ name: "redundant_phrasing", pattern: "(?<![\\p{L}\\p{N}_])(?:győződj meg róla, hogy|biztosítsd azt, hogy|ügyelj arra, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "structural", minIntensity: "full", description: "Remove redundant certainty framing around direct instructions." }, { name: "redundant_because", pattern: "(?<![\\p{L}\\p{N}_])(?:azért van, mert|ennek az oka az, hogy|annak az oka, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "mert ", context: "all", category: "structural", minIntensity: "full", description: "Shorten verbose Hungarian causal phrases." }, { name: "redundant_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:fontos, hogy|ne felejtsd el, hogy|érdemes megjegyezni, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "", context: "all", category: "structural", minIntensity: "full", description: "Remove directive framing when the following instruction carries the meaning." }, { name: "list_conjunction", pattern: "(?<![\\p{L}\\p{N}_]),?\\s*(?:és továbbá|valamint még|és ezenkívül)\\s+", flags: "giu", replacement: ", ", context: "all", category: "structural", minIntensity: "full", description: "Collapse redundant list conjunctions." }, { name: "redundant_quantifiers", pattern: "(?<![\\p{L}\\p{N}_])(?:mindegyik és minden|minden egyes)(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "minden", context: "all", category: "structural", minIntensity: "full", description: "Collapse redundant Hungarian quantifier phrases." }, { name: "all_quantifier", pattern: "(?<![\\p{L}\\p{N}_])(?:mind az összes|az összes és minden)(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "összes", context: "all", category: "structural", minIntensity: "full", description: "Collapse duplicated totality markers." }, { name: "verbose_connectors", pattern: "^(?:továbbá,?\\s*|ezenkívül,?\\s*|ráadásul,?\\s*)", flags: "giu", replacement: "", context: "all", category: "structural", minIntensity: "lite", description: "Remove low-information transition words at the start of a paragraph." }, { name: "emphasis_removal", pattern: "(?<![\\p{L}\\p{N}_])(?:nagyon|rendkívül|igazán|különösen|teljesen)\\s+(?=[\\p{L}])", flags: "giu", replacement: "", context: "all", category: "structural", minIntensity: "lite", description: "Remove common intensifiers when the modified word remains meaningful." }, { name: "task_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:a feladata az, hogy|az a feladata, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "Feladat: ", context: "all", category: "structural", minIntensity: "full", description: "Convert verbose task-framing prose into a compact label." }, { name: "existence_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:arra van lehetőség, hogy|lehetőség van arra, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "lehet ", context: "all", category: "structural", minIntensity: "full", description: "Shorten common possibility framing." }, { name: "conditional_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:abban az esetben, ha)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "ha ", context: "all", category: "structural", minIntensity: "lite", description: "Shorten verbose conditional framing." }, { name: "manner_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:olyan módon, hogy)(?![\\p{L}\\p{N}_])\\s*", flags: "giu", replacement: "úgy, hogy ", context: "all", category: "structural", minIntensity: "full", description: "Shorten verbose manner framing while preserving the conjunction." }] },
      ultra: { language: "hu", category: "ultra", rules: [{ name: "ultra_database_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*adatbázis(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "DB", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate adatbázis to the common technical DB form." }, { name: "ultra_config_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*konfiguráció(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "config", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate konfiguráció to config." }, { name: "ultra_function_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*függvény(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate függvény to fn." }, { name: "ultra_request_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*kérés(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "req", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate technical request references to req." }, { name: "ultra_response_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*válasz(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "res", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate technical response references to res." }, { name: "ultra_implementation_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*megvalósítás(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "impl", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate megvalósítás to impl." }, { name: "ultra_authentication_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*hitelesítés(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "auth", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate hitelesítés to auth." }, { name: "ultra_authorization_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])jogosultság-ellenőrzés(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "authz", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate explicit authorization-check terminology to authz." }, { name: "ultra_application_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*alkalmazás(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate technical application references to app." }, { name: "ultra_dependency_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*(?:függőség|függőségek)(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "dep", replacementMap: { "függőség": "dep", "függőségek": "deps" }, context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate dependency/dependencies to dep/deps." }, { name: "ultra_development_environment_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])fejlesztői környezet(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "dev env", context: "all", category: "ultra", minIntensity: "ultra", description: "Shorten the common technical phrase fejlesztői környezet." }, { name: "ultra_parameter_abbreviation", pattern: "(?<![\\p{L}\\p{N}_])(?:a|az)?\\s*paraméter(?![\\p{L}\\p{N}_])", flags: "giu", replacement: "param", context: "all", category: "ultra", minIntensity: "ultra", description: "Abbreviate paraméter to param." }] }
    },
    id: {
      context: { language: "id", category: "context", rules: [{ name: "id_explanatory_prefix", pattern: "\\b(?:fungsi\\s+ini\\s+nampaknya\\s+menangani|kode\\s+ini\\s+tampaknya|kelas\\s+ini|modul\\s+ini\\s+adalah)\\b", replacement: "Fungsi:", replacementMap: { "fungsi ini nampaknya menangani": "Fungsi:", "kode ini tampaknya": "Kode:", "kelas ini": "Kelas:", "modul ini adalah": "Modul:" }, context: "all", category: "context", minIntensity: "lite" }, { name: "id_question_to_directive", pattern: "\\b(?:bisa\\s+jelaskan\\s+kenapa|bisa\\s+tunjukkan\\s+bagaimana|bisa\\s+beritahu\\s+saya|tolong\\s+beritahu\\s+ke|tolong\\s+jelasin\\s+kenapa|tolong\\s+infoin|kasih\\s+tau\\s+gimana|tunjukkan\\s+cara\\s+bagaimana|tunjukkan\\s+cara)\\b", replacement: "Jelaskan kenapa ", replacementMap: { "bisa jelaskan kenapa": "Jelaskan kenapa ", "bisa tunjukkan bagaimana": "Tunjukkan bagaimana ", "bisa beritahu saya": "Beritahu saya ", "tolong beritahu ke": "Beritahu ", "tolong jelasin kenapa": "Jelaskan kenapa ", "tolong infoin": "Info ", "kasih tau gimana": "Tunjukkan bagaimana ", "tunjukkan cara bagaimana": "Tunjukkan cara ", "tunjukkan cara": "Tunjukkan cara " }, context: "user", category: "context", minIntensity: "lite" }, { name: "id_context_setup", pattern: "\\b(?:saya\\s+punya\\s+kode\\s+berikut|berikut\\s+adalah\\s+kode\\s+saya|berikut\\s+kodenya|ini\\s+kodenya|kode\\s+di\\s+bawah\\s+ini|ini\\s+filenya|berikut\\s+isi\\s+filenya|berikut\\s+isi\\s+berkasnya|berikut\\s+kodenya)\\b\\s*[:.]?\\s*", replacement: "Kode:", context: "user", category: "context", minIntensity: "lite", replacementMap: { "saya punya kode berikut": "Kode:", "berikut adalah kode saya": "Kode:", "berikut kodenya": "Kode:", "ini kodenya": "Kode:", "kode di bawah ini": "Kode:", "ini filenya": "File:", "berikut isi filenya": "File:", "berikut isi berkasnya": "File:" } }, { name: "id_intent_clarification", pattern: "\\b(?:apa\\s+yang\\s+sedang\\s+saya\\s+coba\\s+lakukan\\s+adalah|tujuan\\s+saya\\s+adalah\\s+untuk|yang\\s+saya\\s+butuhkan\\s+adalah|saya\\s+menargetkan\\s+untuk|gw\\s+mau|gua\\s+mau|saya\\s+pengen|aku\\s+ingin)\\b\\s*", replacement: "Tujuan:", context: "user", category: "context", minIntensity: "lite" }, { name: "id_background_removal", pattern: "\\b(?:seperti\\s+yang\\s+anda\\s+ketahui|seperti\\s+yang\\s+kita\\s+diskusikan\\s+sebelumnya)\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite" }, { name: "id_meta_commentary", pattern: "^(?:catat\\s+bahwa|perlu\\s+diingat\\s+bahwa|ingat\\s+bahwa)\\b\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite" }, { name: "id_purpose_statement", pattern: "\\b(?:dengan\\s+tujuan\\s+untuk|dalam\\s+upaya\\s+untuk|untuk\\s+setiap)\\b", replacement: "untuk", replacementMap: { "dengan tujuan untuk": "untuk", "dalam upaya untuk": "untuk", "untuk setiap": "per" }, context: "all", category: "context", minIntensity: "lite" }, { name: "id_conversational_connectors", pattern: "\\b(?:pertama-tama|kedua|selanjutnya|lalu|kemudian|di\\s+samping\\s+itu|oleh\\s+karena\\s+itu|maka\\s+dari\\s+itu|dengan\\s+kata\\s+lain|sebagai\\s+catatan)\\b", replacementMap: { "pertama-tama": "1.", kedua: "2.", selanjutnya: "lalu", lalu: ">", kemudian: ">", "di samping itu": "juga", "oleh karena itu": "jadi", "maka dari itu": "jadi", "dengan kata lain": "artinya", "sebagai catatan": "catatan:" }, context: "all", category: "context", minIntensity: "lite" }] },
      dedup: { language: "id", category: "dedup", rules: [{ name: "id_repeated_context", pattern: "\\b(?:seperti\\s+yang\\s+kita\\s+diskusikan\\s+tadi|seperti\\s+yang\\s+disebutkan\\s+taraf\\s+awal|seperti\\s+dijelaskan\\s+sebelumnya|seperti\\s+saya\\s+katakan\\s+tadi|sebelumnya\\s+sudah\\s+saya\\s+jelaskan|seperti\\s+yang\\s+saya\\s+sebutkan\\s+tadi|seperti\\s+yang\\s+sudah\\s+dibahas|seperti\\s+yang\\s+dibilang\\s+sebelumnya)\\b[,.]?\\s*", replacement: "Sama seperti di atas. ", context: "all", category: "dedup", minIntensity: "lite" }, { name: "id_repeated_question", pattern: "\\b(?:pertanyaan\\s+yang\\s+sama\\s+seperti\\s+sebelumnya|saya\\s+tanya\\s+ini\\s+tadi|ini\\s+pertanyaan\\s+yang\\s+sama)\\b[,.]?\\s*", replacement: "[pertanyaan sama] ", context: "user", category: "dedup", minIntensity: "lite" }, { name: "id_reestablished_context", pattern: "\\b(?:kembali\\s+ke\\s+kode\\s+di\\s+atas|merujuk\\s+kembali\\s+ke|kembali\\s+ke|kembali\\s+ke\\s+pembahasan|kembali\\s+ke\\s+topik|balik\\s+lagi\\s+ke|kembali\\s+membahas)\\b\\s*", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite" }, { name: "id_summary_replacement", pattern: "\\b(?:untuk\\s+meringkas\\s+apa\\s+yang\\s+kita\\s+bahas|ringkasan\\s+dari\\s+diskusi\\s+kita|singkatnya|singkat\\s+cerita|kesimpulannya|intisarinya)\\b[,.]?\\s*", replacement: "Summary: ", context: "assistant", category: "dedup", minIntensity: "lite" }] },
      filler: { language: "id", category: "filler", rules: [{ name: "id_pleasantries", pattern: "\\b(?:terima\\s+kasih\\s+banyak|terima\\s+kasih|makasih\\s+banyak|makasih|suwun|hatur\\s+nuhun|nuhun|mohon\\s+bantuannya|tolong\\s+bantuannya|sama-sama|terima\\s+kasih\\s+kembali|kembali|sama\\s+sama|sangat\\s+membantu|senang\\s+membantu|salam\\s+hangat|semoga\\s+membantu|semoga\\s+bermanfaat|terima\\s+kasih\\s+banyak\\s+ya|makasih\\s+ya)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_polite_framing", pattern: "\\b(?:mohon\\s+info|mohon|tolong|tolong\\s+dong|tlg|tolong\\s+buatkan|saya\\s+ingin\\s+meminta|saya\\s+ingin|ingin\\s+meminta|bisa\\s+tolong|tolong\\s+jelaskan|tolong\\s+tunjukkan|minta\\s+tolong|tolongin|mohon\\s+bantu|mohon\\s+bantuan)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_hedging", pattern: "\\b(?:sepertinya|tampaknya|mungkin|rasanya|kiranya|kurang\\s+lebih|bisa\\s+jadi|seolah-olah|seolah|kelihatannya)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_verbose_instructions", pattern: "\\b(?:berikan\\s+penjelasan\\s+rinci\\s+tentang|berikan\\s+penjelasan\\s+detail\\s+tentang|jelaskan\\s+secara\\s+rinci|jelaskan\\s+secara\\s+detail|tuliskan\\s+secara\\s+lengkap|secara\\s+mendetail|secara\\s+mendalam|secara\\s+rinci|secara\\s+detail)\\b\\s*", replacement: "jelaskan ", replacementMap: { "berikan penjelasan rinci tentang": "jelaskan ", "berikan penjelasan detail tentang": "jelaskan ", "jelaskan secara rinci": "jelaskan ", "jelaskan secara detail": "jelaskan ", "tuliskan secara lengkap": "tulis ", "secara mendetail": "", "secara mendalam": "", "secara rinci": "", "secara detail": "" }, context: "all", category: "filler", minIntensity: "lite" }, { name: "id_filler_adverbs", pattern: "\\b(?:pada\\s+dasarnya|sebenarnya|secara\\s+harfiah|gampangnya|mudahnya|sederhananya|saat\\s+ini|sekarang|cuma|hanya)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_filler_phrases", pattern: "^(?:saya\\s+ingin|saya\\s+butuh|saya\\s+mau|saya\\s+sedang\\s+mencari|tujuan\\s+saya|rencana\\s+saya)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "id_redundant_openers", pattern: "^(?:halo\\s+gan|halo\\s+min|halo|hai|hi|hey|heyy|selamat\\s+pagi|selamat\\s+siang|selamat\\s+sore|selamat\\s+malam|permisi|assalamualaikum|assalamu\\'alaikum|assalamualaikum\\s+wr\\s+wb|salam\\s+sejahtera|permisi\\s+(?:kak|gan|sis|bro|mas|bang|min)|permisi\\s+semuanya|halo\\s+(?:bro|kak|sis|guys|kawan))\\b\\s*[,.!?\\s]?\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "id_verbose_requests", pattern: "\\b(?:saya\\s+penasaran\\s+apakah|apakah\\s+memungkinkan\\s+untuk|apakah\\s+bisa|apakah\\s+mungkin)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "id_self_reference", pattern: "^(?:saya|gw|gua|gue|aku|kita|ane)\\s+(?:sedang|lagi|masih)(?:\\s+(?:mencoba\\s+untuk|mengerjakan))?\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "id_qualifier_removal", pattern: "\\b(?:sedikit|agak|terkadang|kadang-kadang|kadang|semacam)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_softeners", pattern: "\\b(?:jika\\s+memungkinkan|kalau\\s+bisa|kalau\\s+sempat|bila\\s+berkenan|sekadar\\s+bertanya)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_uncertainty_fillers", pattern: "\\b(?:saya\\s+rasa|saya\\s+kira|kurang\\s+lebih|kira-kira|kira\\s+kira)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_assistant_fillers", pattern: "^(?:berikut\\s+adalah|berikut|ini\\s+adalah|bawah\\s+ini\\s+adalah)\\s+", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }, { name: "id_discourse_fillers", pattern: "\\b(?:kebetulan|sekadar|sekedar|sejujurnya|secara\\s+pribadi|rupanya|pada\\s+intinya|intinya|singkat\\s+kata|omong-omong|ngomong-ngomong|btw|fyi|asalkan|asal)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "id_particles_removal", pattern: "\\b(?:dong|deh|sih|kok|loh|lah|tah|kah|pun|tuh|si|kek|ya)\\b", flags: "gi", replacement: "", context: "all", category: "filler", minIntensity: "lite" }] },
      structural: { language: "id", category: "structural", rules: [{ name: "id_redundant_phrasing", pattern: "\\b(?:pastikan\\s+untuk|harus\\s+dipastikan|perlu\\s+untuk|dianjurkan\\s+untuk|disarankan\\s+untuk|wajib\\s+untuk)\\b\\s*", context: "all", category: "structural", minIntensity: "full", replacementMap: { "pastikan untuk": "pastikan ", "harus dipastikan": "pastikan ", "perlu untuk": "perlu ", "dianjurkan untuk": "dianjurkan ", "disarankan untuk": "disarankan ", "wajib untuk": "wajib " } }, { name: "id_redundant_because", pattern: "\\b(?:dikarenakan\\s+adanya\\s+fakta\\s+bahwa|alasan\\s+utamanya\\s+adalah\\s+karena|oleh\\s+karena\\s+fakta\\s+bahwa|disebabkan\\s+oleh\\s+karena|karena\\s+alasan\\s+bahwa)\\b\\s*", replacement: "karena ", context: "all", category: "structural", minIntensity: "full" }, { name: "id_redundant_directive", pattern: "\\b(?:penting\\s+untuk|anda\\s+seharusnya|ingat\\s+untuk)\\b\\s*", replacement: "", context: "all", category: "structural", minIntensity: "full" }, { name: "id_list_conjunction", pattern: ",\\s*dan\\s+juga\\s+|,\\s*serta\\s+|,\\s*maupun\\s+juga\\s*", replacement: ", ", context: "all", category: "structural", minIntensity: "full" }, { name: "id_purpose_phrases", pattern: "\\b(?:agar\\s+bisa\\s+untuk|supaya\\s+bisa\\s+untuk|bertujuan\\s+untuk)\\b\\s*", replacement: "untuk ", context: "all", category: "structural", minIntensity: "lite" }, { name: "id_redundant_quantifiers", pattern: "\\b(?:masing-masing\\s+dan\\s+setiap|tiap-tiap\\s+dan\\s+setiap)\\b", replacement: "setiap", context: "all", category: "structural", minIntensity: "full" }, { name: "id_all_quantifier", pattern: "\\bapapun\\s+dan\\s+semua\\b", replacement: "semua", context: "all", category: "structural", minIntensity: "full" }, { name: "id_verbose_connectors", pattern: "\\b(?:selain\\s+itu|lebih\\s+lanjut\\s+lagi|tambahan\\s+lagi|dan\\s+juga)\\b\\s*", replacement: "juga ", context: "all", category: "structural", minIntensity: "lite" }, { name: "id_transition_removal", pattern: "^(?:Di\\s+sisi\\s+lain,?\\s*|Sebaliknya,?\\s*|Namun,?\\s*|Akan\\s+tetapi,?\\s*)", replacement: "", context: "all", category: "structural", minIntensity: "lite" }, { name: "id_emphasis_removal", pattern: "\\b(?:sangat|sekali|amat|luar\\s+biasa|sungguh)\\s+(?=[a-z])", replacement: "", context: "all", category: "structural", minIntensity: "lite" }, { name: "id_passive_voice", pattern: "\\b(?:sedang\\s+digunakan|sedang\\s+dipanggil|sedang\\s+dibuat|telah\\s+dibuat|telah\\s+diterapkan|sedang\\s+dijalankan|sedang\\s+diuji|telah\\s+diimplementasikan)\\b", replacement: "pakai", replacementMap: { "sedang digunakan": "pakai", "sedang dipanggil": "panggil", "sedang dibuat": "buat", "telah dibuat": "buat", "telah diterapkan": "terapkan", "sedang dijalankan": "jalan", "sedang diuji": "uji", "telah diimplementasikan": "terapkan" }, context: "all", category: "structural", minIntensity: "full" }] },
      ultra: { language: "id", category: "ultra", rules: [{ name: "id_articles_removal", pattern: "\\b(?:itu|tersebut|ini)\\s+(?=[a-z])", flags: "g", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "id_leader_phrases", pattern: "^(?:saya\\s+akan|saya\\s+bisa|biarkan\\s+saya|kamu\\s+bisa|kita\\s+bisa|mari|mari\\s+kita)\\s+(?=[a-z])", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "id_ultra_abbreviations", pattern: "\\b(?:basis\\s+data|database)\\b", replacement: "DB", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_config_abbreviation", pattern: "\\b(?:konfigurasi|pengaturan)\\b", replacement: "config", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_function_abbreviation", pattern: "\\b(?:fungsi|metode)\\b", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_request_abbreviation", pattern: "\\b(?:permintaan|request)\\b", replacement: "req", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_response_abbreviation", pattern: "\\b(?:tanggapan|respons|jawaban|response)\\b", replacement: "res", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_implementation_abbreviation", pattern: "\\b(?:implementasi|penerapan)\\b", replacement: "impl", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_authentication_abbreviation", pattern: "\\b(?:auten|autentikasi|otentikasi|authentication)\\b", replacement: "auth", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_authorization_abbreviation", pattern: "\\b(?:otorisasi|authorization)\\b", replacement: "authz", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_application_abbreviation", pattern: "\\b(?:aplikasi|program|application)\\b", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "id_ultra_dependency_abbreviation", pattern: "\\b(?:ketergantungan|depedensi|dependensi|dependencies)\\b", replacement: "dep", replacementMap: { ketergantungan: "dep", depedensi: "dep", dependensi: "dep", dependencies: "deps" }, context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_id_common_shortenings", pattern: "\\b(?:yang|untuk|dengan|adalah|tidak|sebagai|dari|dan|bisa|atau|dalam|oleh|pada|sudah|belum|akan|juga|karena|setelah|sebelum|terhadap|tentang|secara|seperti|bahwa|hanya|cuma|saja|bagaimana|mengapa|kenapa|apakah|sebagaimana|agar|supaya|bahwasanya)\\b", flags: "gi", replacementMap: { yang: "yg", untuk: "utk", dengan: "dg", adalah: "=", tidak: "gk", sebagai: "sbg", dari: "dr", dan: "&", bisa: "bs", atau: "/", dalam: "dlm", oleh: "olh", pada: "pd", sudah: "sdh", belum: "blm", akan: "akn", juga: "jg", karena: "krn", setelah: "stlh", sebelum: "sblm", terhadap: "thd", tentang: "ttg", secara: "scr", seperti: "spt", bahwa: "bwh", hanya: "hnya", cuma: "cma", saja: "aja", bagaimana: "gmn", mengapa: "knp", kenapa: "knp", apakah: "apa", sebagaimana: "sbgmn", agar: "agr", supaya: "spya", bahwasanya: "bwhsnya" }, context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_id_technical_shortenings", pattern: "\\b(?:informasi|parameter|argumen|variabel|nilai|alamat|nomor|jumlah|indeks|sumber|tujuan|berkas|kesalahan|pesan|pengguna|sistem|klien|server|jaringan|koneksi|pernyataan|transaksi|objek|kamus|daftar|panjang|karakter|tanggapan|autentikasi|konfigurasi)\\b", flags: "gi", replacementMap: { informasi: "info", parameter: "param", argumen: "arg", variabel: "var", nilai: "val", alamat: "addr", nomor: "no", jumlah: "qty", indeks: "idx", sumber: "src", tujuan: "dest", berkas: "file", kesalahan: "err", pesan: "msg", pengguna: "usr", sistem: "sys", klien: "cli", server: "srv", jaringan: "net", koneksi: "conn", pernyataan: "stmt", transaksi: "tx", objek: "obj", kamus: "dict", daftar: "list", panjang: "len", karakter: "char", tanggapan: "res", autentikasi: "auth", konfigurasi: "config" }, context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_id_slang_abbreviations", pattern: "\\b(?:gimana|kenapa|sekarang|sebentar|cepat|langsung|tapi|terus|banget|terlalu|banyak|sedikit|masalah|tambah|kurang|mungkin|melihat|buat|buatkan|pakai|dulu|nanti|kasih|tanya|minta|tolong|kirim|simpan|kerja|selesai|eror|website|aplikasi|database|kembali|iya|oke|tidak|jangan|pengen|gua|gue|lu|ente|kamu|aku|saya)\\b", flags: "gi", replacementMap: { gimana: "gmn", kenapa: "knp", sekarang: "skrg", sebentar: "bntr", cepat: "cpt", langsung: "lsg", tapi: "tp", terus: "trus", banget: "bgt", terlalu: "trl", banyak: "bnyk", sedikit: "sdkt", masalah: "mslh", tambah: "tmbh", kurang: "krg", mungkin: "mgkn", melihat: "lht", buat: "bwt", buatkan: "bwt", pakai: "pake", dulu: "dlu", nanti: "nti", kasih: "ksh", tanya: "tny", minta: "mnt", tolong: "tlg", kirim: "krm", simpan: "smpn", kerja: "krj", selesai: "sls", eror: "err", website: "web", aplikasi: "app", database: "DB", kembali: "ret", iya: "y", oke: "ok", tidak: "gk", jangan: "jgn", pengen: "mau", gua: "gw", gue: "gw", lu: "lo", ente: "lo", kamu: "lo", aku: "gw", saya: "gw" }, context: "all", category: "ultra", minIntensity: "ultra" }] }
    },
    it: {
      context: { language: "it", category: "context", rules: [{ name: "it_context_setup", pattern: "(?<![\\p{L}\\p{N}_])(?:ecco (?:qui )?il codice|questo è il codice|qui sotto (?:c'è |trovi )?il codice|di seguito il codice|ti allego il codice)(?![\\p{L}\\p{N}_])\\s*[:.]?\\s*", replacement: "Codice:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "it_intent", pattern: "(?<![\\p{L}\\p{N}_])(?:il mio obiettivo è|quello che (?:mi serve|voglio|devo fare) è|quello che sto cercando di fare è|l'idea è (?:quella di |))(?![\\p{L}\\p{N}_])\\s*", replacement: "Obiettivo:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "it_error_report", pattern: "(?<![\\p{L}\\p{N}_])(?:mi (?:dà|da) (?:questo |il seguente |)errore|ricevo (?:questo |il seguente |)errore|ottengo (?:questo |il seguente |)errore|l'errore che (?:mi dà|ricevo) è)(?![\\p{L}\\p{N}_])\\s*[:.]?\\s*", replacement: "Errore:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "it_expected_behavior", pattern: "(?<![\\p{L}\\p{N}_])(?:quello che mi aspetto è|dovrebbe (?:invece |)(?:fare|succedere|restituire)|il comportamento atteso è)(?![\\p{L}\\p{N}_])\\s*[:.]?\\s*", replacement: "Atteso:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "it_already_tried", pattern: "(?<![\\p{L}\\p{N}_])(?:ho (?:già |)provato a|ho tentato di|ho cercato di)(?![\\p{L}\\p{N}_])\\s*", replacement: "Provato:", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "it_question_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:mi (?:sapresti |sai |puoi |)dire (?:se|come|cosa|quando|perché)|(?:sai|sapresti) (?:dirmi )?(?:se|come|cosa|quando|perché))(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "user", category: "context", minIntensity: "lite", flags: "giu" }, { name: "it_environment_preamble", pattern: "\\b(?:sto (?:lavorando|usando|utilizzando)|nel mio (?:progetto|sistema|ambiente))\\b\\s*", replacement: "", context: "user", category: "context", minIntensity: "full" }, { name: "it_scope_note", pattern: "\\b(?:tieni (?:presente|conto) che|considera che|nota che|da notare che)\\b\\s*", replacement: "NB:", context: "all", category: "context", minIntensity: "lite" }] },
      dedup: { language: "it", category: "dedup", rules: [{ name: "it_repeated_context", pattern: "(?<![\\p{L}\\p{N}_])(?:come (?:ti )?(?:ho )?(?:già |)(?:detto|accennato|scritto|spiegato) (?:prima|sopra|in precedenza)|come dicevo|come sopra|come menzionato)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Vedi sopra. ", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "it_repeated_question", pattern: "(?<![\\p{L}\\p{N}_])(?:stessa domanda di prima|te l'ho già chiesto|è la stessa domanda|come chiedevo prima)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "[stessa domanda] ", context: "user", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "it_restating", pattern: "(?<![\\p{L}\\p{N}_])(?:in altre parole|detto altrimenti|ovvero|vale a dire|cioè per essere chiari)(?![\\p{L}\\p{N}_])[,:]?\\s*", replacement: "cioè ", context: "all", category: "dedup", minIntensity: "full", flags: "giu" }, { name: "it_recap_preamble", pattern: "\\b(?:ricapitolando|per ricapitolare|facciamo il punto|riepilogo)\\b[,:]?\\s*", replacement: "", context: "assistant", category: "dedup", minIntensity: "full" }] },
      filler: { language: "it", category: "filler", rules: [{ name: "it_polite_framing", pattern: "\\b(?:per favore|per cortesia|ti (?:pre|)gherei di|potresti|puoi|riusciresti a|ti dispiacerebbe|se puoi|se ti va|quando puoi|gentilmente)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "it_pleasantries", pattern: "\\b(?:ciao|buongiorno|buonasera|buon pomeriggio|salve|grazie mille|grazie tante|ti ringrazio|grazie)\\b[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "it_hedging", pattern: "\\b(?:credo che|penso che|mi sembra che|mi pare che|direi che|secondo me|a mio (?:parere|avviso)|forse|magari|probabilmente|presumibilmente|verosimilmente)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "it_filler_adverbs", pattern: "(?<![\\p{L}\\p{N}_])(?:sostanzialmente|essenzialmente|fondamentalmente|praticamente|in realtà|in effetti|letteralmente|semplicemente|diciamo|insomma|comunque|appunto|ovviamente|chiaramente)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "it_self_reference", pattern: "^(?:sto cercando di|vorrei|volevo|avrei bisogno di|ho bisogno di|mi servirebbe|mi serve|vorrei sapere se|volevo sapere se|voglio)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "it_verbose_request", pattern: "\\b(?:potresti spiegarmi|puoi spiegarmi|mi spieghi|mi puoi spiegare|potresti dettagliare|puoi dettagliare|mi sapresti dire|sapresti dirmi|mi dici)\\b\\s*", replacement: "spiega ", context: "user", category: "filler", minIntensity: "lite" }, { name: "it_assistant_servility", pattern: "\\b(?:certamente|assolutamente|volentieri|con piacere|sarei felice di aiutarti|sono felice di aiutarti|ottima domanda|bella domanda|buona domanda)\\b[,.!]?\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }, { name: "it_assistant_preamble", pattern: "^(?:ecco|ecco qui|ecco a te|allora|dunque|bene)\\b[,:]?\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }, { name: "it_closing_offer", pattern: "\\b(?:fammi sapere se (?:hai bisogno|ti serve|vuoi)[^.!?]*|se hai (?:altre |ulteriori )?(?:domande|dubbi)[^.!?]*|spero (?:che )?(?:questo )?(?:ti )?(?:sia (?:stato )?d'aiuto|aiuti)[^.!?]*)[.!?]\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }, { name: "it_apology", pattern: "\\b(?:mi scuso per|scusa per|chiedo scusa per|mi dispiace per)\\b[^.!?]*[.!?]\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "full" }, { name: "it_softeners", pattern: "(?<![\\p{L}\\p{N}_])(?:un attimo|un momento|se non ti dispiace|se non è troppo disturbo|se possibile)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }] },
      structural: { language: "it", category: "structural", rules: [{ name: "it_purpose", pattern: "(?<![\\p{L}\\p{N}_])(?:al fine di|allo scopo di|con l'obiettivo di|in modo da poter|in modo da|così da|in maniera tale da)(?![\\p{L}\\p{N}_])\\s*", replacement: "per ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "it_causal", pattern: "\\b(?:a causa del fatto che|per il fatto che|dal momento che|visto che|dato che|in quanto)\\b\\s*", replacement: "perché ", context: "all", category: "structural", minIntensity: "lite" }, { name: "it_connectors", pattern: "(?<![\\p{L}\\p{N}_])(?:inoltre|in aggiunta|per di più|d'altra parte|d'altro canto|oltre a ciò)(?![\\p{L}\\p{N}_])[,]?\\s*", replacement: "anche ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "it_emphasis", pattern: "(?<![\\p{L}\\p{N}_])(?:molto|davvero|veramente|estremamente|parecchio|piuttosto|abbastanza|super)\\s+(?=[a-zàèéìòùA-Z])", replacement: "", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "it_redundant_phrasing", pattern: "\\bnel caso in cui\\b", replacement: "se", context: "all", category: "structural", minIntensity: "lite" }, { name: "it_time_redundancy", pattern: "\\b(?:nel momento in cui|nell'istante in cui|nel periodo in cui)\\b", replacement: "quando", context: "all", category: "structural", minIntensity: "lite" }, { name: "it_place_redundancy", pattern: "\\b(?:all'interno di|nell'ambito di|nel contesto di)\\b", replacement: "in", context: "all", category: "structural", minIntensity: "lite" }, { name: "it_recommendation", pattern: "\\b(?:ti (?:consiglierei|consiglio|suggerirei|suggerisco) di|sarebbe (?:meglio|opportuno|consigliabile)|converrebbe)\\b\\s*", replacement: "usa ", context: "assistant", category: "structural", minIntensity: "full" }, { name: "it_possibility", pattern: "(?<![\\p{L}\\p{N}_])(?:è possibile che|potrebbe essere che|può darsi che)(?![\\p{L}\\p{N}_])\\s*", replacement: "forse ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "it_necessity", pattern: "(?<![\\p{L}\\p{N}_])(?:è necessario che|occorre che|bisogna che|è indispensabile che)(?![\\p{L}\\p{N}_])\\s*", replacement: "serve che ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "it_conclusion", pattern: "\\b(?:in conclusione|per concludere|riassumendo|in sintesi|tirando le somme)\\b[,:]?\\s*", replacement: "", context: "assistant", category: "structural", minIntensity: "full" }, { name: "it_double_negation", pattern: "(?<![\\p{L}\\p{N}_])non è (?:possibile|fattibile) (?:non |)(?![\\p{L}\\p{N}_])", replacement: "non si può ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }] },
      ultra: { language: "it", category: "ultra", rules: [{ name: "it_articles", pattern: "(?<![\\p{L}\\p{N}_])(?:[Ii]l|[Ll]o|[Ll]a|[Ii]|[Gg]li|[Ll]e|[Uu]n|[Uu]no|[Uu]na)\\s+(?=[a-zàèéìòù])", flags: "gu", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "it_leader_phrases", pattern: "^(?:posso|possiamo|vado a|andiamo a|proviamo a|fammi|lasciami|si può)\\s+(?=[a-zàèéìòù])", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "it_ultra_database", pattern: "\\bbase(?:e|) dati\\b|\\bbase di dati\\b", replacement: "DB", context: "all", category: "terse", minIntensity: "full" }, { name: "it_ultra_config", pattern: "\\bconfigurazion(?:e|i)\\b", replacement: "config", context: "all", category: "terse", minIntensity: "full" }, { name: "it_ultra_function", pattern: "\\bfunzion(?:e|i)\\b", replacement: "fn", context: "all", category: "terse", minIntensity: "ultra" }, { name: "it_ultra_variable", pattern: "\\bvariabil(?:e|i)\\b", replacement: "var", context: "all", category: "terse", minIntensity: "ultra" }, { name: "it_ultra_application", pattern: "\\bapplicazion(?:e|i)\\b", replacement: "app", context: "all", category: "terse", minIntensity: "full" }, { name: "it_ultra_implementation", pattern: "\\bimplementazion(?:e|i)\\b", replacement: "impl", context: "all", category: "terse", minIntensity: "ultra" }, { name: "it_ultra_directory", pattern: "\\b(?:cartell(?:a|e)|director(?:y|ies))\\b", replacement: "dir", context: "all", category: "terse", minIntensity: "full" }, { name: "it_ultra_error", pattern: "\\bmessaggio di errore\\b", replacement: "errore", context: "all", category: "terse", minIntensity: "full" }, { name: "it_copula_drop", pattern: "(?<![\\p{L}\\p{N}_])(?:che )?(?:è|sono) (?:un|una|il|la|lo|gli|le)\\s+(?=[a-zàèéìòù])", replacement: "", context: "all", category: "terse", minIntensity: "ultra", flags: "giu" }, { name: "it_ultra_environment", pattern: "\\bambiente di (?:sviluppo|produzione)\\b", replacementMap: { "ambiente di sviluppo": "dev", "ambiente di produzione": "prod" }, context: "all", category: "terse", minIntensity: "ultra" }] }
    },
    ja: {
      context: { language: "ja", category: "context", rules: [{ name: "ja_context_setup", pattern: "(?:以下のコード|こちらのコード|このコード)", replacement: "コード:", context: "user", category: "context", minIntensity: "lite" }, { name: "ja_intent", pattern: "(?:目的は|ゴールは|必要なのは)", replacement: "目的:", context: "user", category: "context", minIntensity: "lite" }, { name: "ja_question_directive", pattern: "(?:なぜ.*説明|どうやって.*示し)", replacement: "説明:", context: "user", category: "context", minIntensity: "lite" }, { name: "ja_background", pattern: "(?:ご存じの通り|前述の通り|先ほど述べたように)", replacement: "", context: "all", category: "context", minIntensity: "lite" }] },
      dedup: { language: "ja", category: "dedup", rules: [{ name: "ja_repeated_context", pattern: "(?:前述のとおり|前に述べたように|以前述べたように|先ほど言ったように)", replacement: "（上記参照）", context: "all", category: "dedup", minIntensity: "lite" }, { name: "ja_repeated_question", pattern: "(?:前と同じ質問ですが|これは前と同じ質問です|先ほどと同じ質問ですが)", replacement: "［同じ質問］", context: "user", category: "dedup", minIntensity: "lite" }, { name: "ja_reestablished_context", pattern: "(?:上記のコードに戻ると|先ほどの話に戻ると)", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite" }, { name: "ja_summary_replacement", pattern: "(?:これまでの議論を要約すると|会話を要約すると|まとめると)", replacement: "要約：", context: "assistant", category: "dedup", minIntensity: "lite" }] },
      filler: { language: "ja", category: "filler", rules: [{ name: "ja_polite_framing", pattern: "(?:お願いします|してください|できますか|いただけますか)", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "ja_pleasantries", pattern: "(?:こんにちは|こんばんは|おはようございます|ありがとうございます)", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "ja_hedging", pattern: "(?:と思います|かもしれません|たぶん|おそらく)", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "ja_filler_adverbs", pattern: "(?:基本的に|本質的に|実際には|単純に)", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "ja_self_reference", pattern: "(?:私は|自分は|やりたいことは)", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "ja_verbose_request", pattern: "(?:説明していただけますか|詳しく説明してください|教えてください)", replacement: "説明:", context: "user", category: "filler", minIntensity: "lite" }, { name: "ja_qualifiers", pattern: "(?:少し|ちょっと|なんとなく|ある程度)", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "ja_softeners", pattern: "(?:可能であれば|時間があれば|急ぎではありません)", replacement: "", context: "all", category: "filler", minIntensity: "lite" }] },
      structural: { language: "ja", category: "structural", rules: [{ name: "ja_purpose", pattern: "(?:するために|目的として)", replacement: "ため ", context: "all", category: "structural", minIntensity: "lite" }, { name: "ja_connectors", pattern: "(?:さらに|加えて|その上)", replacement: "また ", context: "all", category: "structural", minIntensity: "lite" }, { name: "ja_emphasis", pattern: "(?:非常に|とても|かなり)", replacement: "", context: "all", category: "structural", minIntensity: "lite" }] },
      ultra: { language: "ja", category: "ultra", rules: [{ name: "ja_ultra_database_abbreviation", pattern: "データベース", replacement: "DB", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_config_abbreviation", pattern: "(?:コンフィギュレーション|設定)", replacement: "config", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_function_abbreviation", pattern: "関数", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_request_abbreviation", pattern: "リクエスト", replacement: "req", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_response_abbreviation", pattern: "レスポンス", replacement: "res", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_implementation_abbreviation", pattern: "実装", replacement: "impl", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_authentication_abbreviation", pattern: "認証", replacement: "auth", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_authorization_abbreviation", pattern: "認可", replacement: "authz", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_application_abbreviation", pattern: "アプリケーション", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ja_ultra_dependency_abbreviation", pattern: "依存関係", replacement: "dep", context: "all", category: "ultra", minIntensity: "ultra" }] }
    },
    "pt-BR": {
      context: { language: "pt-BR", category: "context", rules: [{ name: "pt_context_setup", pattern: "(?<![\\p{L}\\p{N}_])(?:segue o codigo|segue o código|abaixo esta o codigo|abaixo está o código|este e o codigo|este é o código|aqui está o código)(?![\\p{L}\\p{N}_])\\s*[:.]?\\s*", replacement: "Código:", context: "user", category: "context", minIntensity: "lite", description: "Code introduction framing → direct label", flags: "giu" }, { name: "pt_intent", pattern: "(?<![\\p{L}\\p{N}_])(?:o que eu quero fazer e|o que eu quero fazer é|meu objetivo e|meu objetivo é|a ideia e|a ideia é|o que preciso é)(?![\\p{L}\\p{N}_])\\s*", replacement: "Objetivo: ", context: "user", category: "context", minIntensity: "lite", description: "Intent declaration → label", flags: "giu" }, { name: "pt_question_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:voce pode explicar por que|você pode explicar por que|pode mostrar como|poderia mostrar como|me explica como|me explica por que)(?![\\p{L}\\p{N}_])\\s*", replacement: "Explique ", context: "user", category: "context", minIntensity: "lite", description: "Question framing → direct imperative", flags: "giu" }, { name: "pt_background", pattern: "(?<![\\p{L}\\p{N}_])(?:como voce sabe|como você sabe|como falamos antes|como mencionei antes|como já disse|conforme mencionado)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "", context: "all", category: "context", minIntensity: "lite", description: "Background references — context is already in conversation", flags: "giu" }, { name: "pt_error_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:o erro que voce está vendo|o erro que você está vendo|esse erro acontece porque|esse erro ocorre porque|o motivo desse erro é)(?![\\p{L}\\p{N}_])\\s*", replacement: "Erro: ", context: "assistant", category: "context", minIntensity: "lite", description: "Error explanation padding → diagnostic label", flags: "giu" }, { name: "pt_solution_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:para resolver isso|para corrigir isso|a solução é|a correção é|o que voce precisa fazer é|o que você precisa fazer é)(?![\\p{L}\\p{N}_])[,:]?\\s*", replacement: "Resolver: ", context: "assistant", category: "context", minIntensity: "full", description: "Solution introduction → action label", flags: "giu" }, { name: "pt_step_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:primeiro voce precisa|primeiro você precisa|o primeiro passo é|em seguida voce deve|em seguida você deve)(?![\\p{L}\\p{N}_])\\s*", replacement: "1. ", context: "assistant", category: "context", minIntensity: "full", description: "Step-by-step padding → numbered list", flags: "giu" }] },
      dedup: { language: "pt-BR", category: "dedup", rules: [{ name: "pt_repeated_context", pattern: "(?<![\\p{L}\\p{N}_])(?:como falamos antes|como mencionamos|como vimos anteriormente|conforme discutido|como já expliquei)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Ver acima. ", context: "all", category: "dedup", minIntensity: "lite", description: "References to earlier discussion", flags: "giu" }, { name: "pt_repeated_question", pattern: "(?<![\\p{L}\\p{N}_])(?:mesma pergunta de antes|já perguntei isso|é a mesma dúvida|repito a pergunta)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "[mesma pergunta] ", context: "user", category: "dedup", minIntensity: "lite", description: "Repeated question markers", flags: "giu" }, { name: "pt_reestablished_context", pattern: "(?<![\\p{L}\\p{N}_])(?:voltando ao código acima|voltando ao que falamos|retomando o assunto|voltando ao ponto)(?![\\p{L}\\p{N}_])[,.]?\\s*", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite", description: "Context re-establishment", flags: "giu" }, { name: "pt_summary", pattern: "\\b(?:resumindo o que discutimos|pra resumir|em resumo|resumidamente|recapitulando)\\b[,.]?\\s*", replacement: "Resumo: ", context: "assistant", category: "dedup", minIntensity: "lite", description: "Summary framing" }, { name: "pt_reiteration", pattern: "\\b(?:como eu disse|como mencionei|reitero que|repito que|novamente)\\b[,.]?\\s*", replacement: "", context: "all", category: "dedup", minIntensity: "lite", description: "Self-reiteration markers — content already in context" }] },
      filler: { language: "pt-BR", category: "filler", rules: [{ name: "pt_polite_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:por favor|por gentileza|poderia|voce pode|você pode|eu gostaria que|preciso que)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Formal request framing — unnecessary in direct communication", flags: "giu" }, { name: "pt_pleasantries", pattern: "(?<![\\p{L}\\p{N}_])(?:ola|olá|oi|bom dia|boa tarde|boa noite|obrigado|obrigada|valeu|tchau|até mais)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Greetings and farewells — zero information content", flags: "giu" }, { name: "pt_amenities", pattern: "(?<![\\p{L}\\p{N}_])(?:claro|com certeza|fico feliz em ajudar|seria um prazer|sem problemas|fique à vontade|fique a vontade|não se preocupe|nao se preocupe)(?![\\p{L}\\p{N}_])[!,.\\s]*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite", description: "Assistant amenities that add no technical value", flags: "giu" }, { name: "pt_hedging", pattern: "\\b(?:eu acho que|eu acredito que|parece que|talvez|provavelmente|possivelmente|aparentemente)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Uncertainty hedging — if uncertain, state the fact directly" }, { name: "pt_hesitations", pattern: "(?<![\\p{L}\\p{N}_])(?:talvez valha a pena|seria interessante considerar|pode ser que|não sei se|a depender do caso)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Extended hesitation phrases common in PT-BR technical writing", flags: "giu" }, { name: "pt_filler_adverbs", pattern: "\\b(?:basicamente|essencialmente|na verdade|literalmente|simplesmente|atualmente|obviamente|claramente|naturalmente|certamente|definitivamente)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Filler adverbs — 'muletas' that pad without adding meaning" }, { name: "pt_emphasis_fillers", pattern: "(?<![\\p{L}\\p{N}_])(?:vale ressaltar|vale mencionar|vale notar|vale lembrar|é importante notar que|é importante mencionar que|convém destacar que)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Emphasis markers — if it's worth noting, just note it", flags: "giu" }, { name: "pt_self_reference", pattern: "^(?:eu estou tentando|estou tentando|eu quero|eu preciso|gostaria de|estou precisando)\\b\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite", description: "User self-reference at start of sentence" }, { name: "pt_verbose_request", pattern: "(?<![\\p{L}\\p{N}_])(?:voce poderia me explicar|você poderia me explicar|poderia detalhar|gostaria que voce explicasse|gostaria que você explicasse|me explica)(?![\\p{L}\\p{N}_])\\s*", replacement: "Explique ", context: "user", category: "filler", minIntensity: "lite", description: "Verbose request phrasing → direct imperative", flags: "giu" }, { name: "pt_qualifiers", pattern: "\\b(?:um pouco|meio que|tipo assim|de certa forma|mais ou menos|de alguma forma|de alguma maneira)\\b\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Vague qualifiers that weaken statements" }, { name: "pt_softeners", pattern: "(?<![\\p{L}\\p{N}_])(?:se possivel|se possível|quando puder|sem pressa|so queria|só queria|se não for incomodo|se não for incômodo)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", description: "Request softeners — unnecessary in AI interaction", flags: "giu" }, { name: "pt_redundancies", pattern: "(?<![\\p{L}\\p{N}_])(?:subir pra cima|descer pra baixo|voltar atrás|a razão é porque|o motivo é porque|entrar pra dentro|sair pra fora)(?![\\p{L}\\p{N}_])", replacement: "", replacementMap: { "subir pra cima": "subir", "descer pra baixo": "descer", "voltar atrás": "voltar", "a razão é porque": "porque", "o motivo é porque": "porque", "entrar pra dentro": "entrar", "sair pra fora": "sair" }, flags: "giu", context: "all", category: "filler", minIntensity: "lite", description: "Pleonasms — redundant phrases native to PT-BR speech" }, { name: "pt_linking_verbs", pattern: "(?<![\\p{L}\\p{N}_])(?:está sendo|foi feito|tem que ser|precisa ser|deve ser feito|foi realizado)(?![\\p{L}\\p{N}_])\\s*", replacement: "", replacementMap: { "está sendo": "é", "foi feito": "", "tem que ser": "deve", "precisa ser": "deve", "deve ser feito": "fazer", "foi realizado": "" }, flags: "giu", context: "all", category: "filler", minIntensity: "full", description: "Verbose linking verb constructions → compact form" }, { name: "pt_explanation_padding", pattern: "(?<![\\p{L}\\p{N}_])(?:o que acontece é que|o que está acontecendo é que|o problema é que|a questão é que|o ponto é que)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "full", description: "Explanation padding before the actual content", flags: "giu" }] },
      structural: { language: "pt-BR", category: "structural", rules: [{ name: "pt_purpose", pattern: "\\b(?:a fim de|com o objetivo de|para poder|com a finalidade de|com o intuito de)\\b\\s*", replacement: "para ", context: "all", category: "structural", minIntensity: "lite", description: "Verbose purpose connectors → 'para'" }, { name: "pt_connectors", pattern: "(?<![\\p{L}\\p{N}_])(?:alem disso|além disso|adicionalmente|outrossim|não obstante|por outro lado)(?![\\p{L}\\p{N}_])[,]?\\s*", replacement: "também ", context: "all", category: "structural", minIntensity: "lite", description: "Verbose additive connectors", flags: "giu" }, { name: "pt_emphasis", pattern: "(?<![\\p{L}\\p{N}_])(?:muito|realmente|extremamente|bastante|totalmente|completamente|absolutamente)\\s+(?=[a-záéíóúâêôãõç])", replacement: "", context: "all", category: "structural", minIntensity: "lite", description: "Intensity adverbs before adjectives — rarely add precision", flags: "giu" }, { name: "pt_passive_voice", pattern: "(?<![\\p{L}\\p{N}_])(?:é necessário que|é preciso que|é importante que|é fundamental que|é essencial que)(?![\\p{L}\\p{N}_])\\s*", replacement: "Deve ", context: "all", category: "structural", minIntensity: "full", description: "Impersonal passive constructions → direct imperative", flags: "giu" }, { name: "pt_causality_verbose", pattern: "(?<![\\p{L}\\p{N}_])(?:isso acontece porque|isso ocorre porque|isso se deve ao fato de que|a causa disso é que)(?![\\p{L}\\p{N}_])\\s*", replacement: "Causa: ", context: "assistant", category: "structural", minIntensity: "full", description: "Verbose causality explanation → diagnostic label", flags: "giu" }, { name: "pt_consequence", pattern: "(?<![\\p{L}\\p{N}_])(?:como consequência|como resultado|por conta disso|em decorrência disso|por causa disso)(?![\\p{L}\\p{N}_])[,]?\\s*", replacement: "→ ", context: "all", category: "structural", minIntensity: "full", description: "Consequence connectors → arrow notation (troglodita style)", flags: "giu" }, { name: "pt_comparison_verbose", pattern: "(?<![\\p{L}\\p{N}_])(?:em comparação com|quando comparado com|se compararmos com|diferente de)(?![\\p{L}\\p{N}_])\\s*", replacement: "vs ", context: "all", category: "structural", minIntensity: "full", description: "Verbose comparisons → compact 'vs'", flags: "giu" }, { name: "pt_conclusion", pattern: "\\b(?:sendo assim|portanto|dessa forma|desse modo|consequentemente|em suma|resumindo)\\b[,]?\\s*", replacement: "∴ ", context: "all", category: "structural", minIntensity: "full", description: "Conclusion connectors → therefore symbol" }] },
      ultra: { language: "pt-BR", category: "ultra", rules: [{ name: "pt_terse_leader_phrases", pattern: "^(?:eu vou|vou|eu posso|posso|deixa eu|deixe-me|vamos|a gente pode)\\s+(?=[a-záéíóúâêôãõç])", replacement: "", flags: "gm", context: "all", category: "terse", minIntensity: "full", description: "Leader phrases at sentence start — PT-BR equivalent of 'I'll/Let me'" }, { name: "pt_ultra_banco_de_dados", pattern: "\\bbanco de dados\\b", replacement: "BD", flags: "gi", context: "all", category: "ultra", minIntensity: "ultra", description: "banco de dados → BD" }, { name: "pt_ultra_configuracao", pattern: "(?<![\\p{L}\\p{N}_])(?:configuração|configurações)(?![\\p{L}\\p{N}_])", replacement: "config", replacementMap: { "configuração": "config", "configurações": "configs" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "configuração → config" }, { name: "pt_ultra_funcao", pattern: "(?<![\\p{L}\\p{N}_])(?:função|funções)(?![\\p{L}\\p{N}_])", replacement: "fn", replacementMap: { "função": "fn", "funções": "fns" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "função → fn" }, { name: "pt_ultra_requisicao", pattern: "(?<![\\p{L}\\p{N}_])(?:requisição|requisições)(?![\\p{L}\\p{N}_])", replacement: "req", replacementMap: { "requisição": "req", "requisições": "reqs" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "requisição → req" }, { name: "pt_ultra_resposta", pattern: "\\bresposta\\b", replacement: "res", flags: "gi", context: "all", category: "ultra", minIntensity: "ultra", description: "resposta → res" }, { name: "pt_ultra_implementacao", pattern: "(?<![\\p{L}\\p{N}_])(?:implementação|implementações)(?![\\p{L}\\p{N}_])", replacement: "impl", flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "implementação → impl" }, { name: "pt_ultra_autenticacao", pattern: "(?<![\\p{L}\\p{N}_])(?:autenticação|autenticações)(?![\\p{L}\\p{N}_])", replacement: "auth", flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "autenticação → auth" }, { name: "pt_ultra_autorizacao", pattern: "(?<![\\p{L}\\p{N}_])(?:autorização|autorizações)(?![\\p{L}\\p{N}_])", replacement: "authz", flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "autorização → authz" }, { name: "pt_ultra_aplicacao", pattern: "(?<![\\p{L}\\p{N}_])(?:aplicação|aplicações)(?![\\p{L}\\p{N}_])", replacement: "app", replacementMap: { "aplicação": "app", "aplicações": "apps" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "aplicação → app" }, { name: "pt_ultra_dependencia", pattern: "(?<![\\p{L}\\p{N}_])(?:dependência|dependências)(?![\\p{L}\\p{N}_])", replacement: "dep", replacementMap: { "dependência": "dep", "dependências": "deps" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "dependência → dep" }, { name: "pt_ultra_repositorio", pattern: "(?<![\\p{L}\\p{N}_])(?:repositório|repositórios)(?![\\p{L}\\p{N}_])", replacement: "repo", replacementMap: { "repositório": "repo", "repositórios": "repos" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "repositório → repo" }, { name: "pt_ultra_variavel", pattern: "(?<![\\p{L}\\p{N}_])(?:variável|variáveis)(?![\\p{L}\\p{N}_])", replacement: "var", replacementMap: { "variável": "var", "variáveis": "vars" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "variável → var" }, { name: "pt_ultra_componente", pattern: "\\b(?:componente|componentes)\\b", replacement: "comp", replacementMap: { componente: "comp", componentes: "comps" }, flags: "gi", context: "all", category: "ultra", minIntensity: "ultra", description: "componente → comp" }, { name: "pt_ultra_diretorio", pattern: "(?<![\\p{L}\\p{N}_])(?:diretório|diretórios)(?![\\p{L}\\p{N}_])", replacement: "dir", replacementMap: { "diretório": "dir", "diretórios": "dirs" }, flags: "giu", context: "all", category: "ultra", minIntensity: "ultra", description: "diretório → dir" }] }
    },
    ru: {
      context: { language: "ru", category: "context", rules: [{ name: "subject_omission", pattern: "^(?:Я |Мы |Вы )(?:можем|должны|будем|хотим|нужно)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "context", minIntensity: "full", flags: "giu" }, { name: "known_fact_hedging", pattern: "(?<=\\.)\\s*(?:Возможно|Наверное|Может быть),\\s+", replacement: "", context: "assistant", category: "context", minIntensity: "full" }, { name: "redundant_clarification", pattern: "(?<![\\p{L}\\p{N}_])(?:как я уже говорил|как уже упоминалось|как было сказано)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "context", minIntensity: "full", flags: "giu" }, { name: "obvious_continuation", pattern: "(?<![\\p{L}\\p{N}_])(?:далее|затем|после этого|в итоге)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "context", minIntensity: "ultra", flags: "giu" }] },
      dedup: { language: "ru", category: "dedup", rules: [{ name: "thought_repetition", pattern: "([^.!?]+[.!?])\\s+\\1", replacement: "$1", context: "all", category: "dedup", minIntensity: "full" }, { name: "word_duplication", pattern: "(?<![\\p{L}\\p{N}_])([\\p{L}\\p{N}_]+)\\s+\\1(?![\\p{L}\\p{N}_])", replacement: "$1", context: "all", category: "dedup", minIntensity: "lite", flags: "giu" }, { name: "synonymous_repetition", pattern: "(?<![\\p{L}\\p{N}_])(проблема|ошибка)(?![\\p{L}\\p{N}_])[^.!?]*(?<![\\p{L}\\p{N}_])(проблема|ошибка)(?![\\p{L}\\p{N}_])", replacement: "$1", context: "all", category: "dedup", minIntensity: "full", flags: "giu" }] },
      filler: { language: "ru", category: "filler", rules: [{ name: "pleasantries", pattern: "(?<![\\p{L}\\p{N}_])(?:конечно|с радостью|рад помочь|могу помочь|обязательно|безусловно|разумеется)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "polite_framing", pattern: "(?<![\\p{L}\\p{N}_])(?:пожалуйста|если хотите|если можно|будьте добры|будьте любезны|прошу вас)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "verbal_wrapping", pattern: "(?<![\\p{L}\\p{N}_])(?:давайте разберём|давайте посмотрим|попробуем разобраться|постараюсь помочь)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "hedging", pattern: "(?<![\\p{L}\\p{N}_])(?:возможно|наверное|может быть|скорее всего|вероятно|видимо|похоже)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "filler_adverbs", pattern: "(?<![\\p{L}\\p{N}_])(?:в целом|на самом деле|в принципе|как правило|по сути|фактически|буквально)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "empty_qualifiers", pattern: "(?<![\\p{L}\\p{N}_])(?:удобный|хороший|эффективный|мощный|отличный|прекрасный)(?!\\s+(?:вариант|способ|решение|метод|инструмент))(?![\\p{L}\\p{N}_])", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "redundant_openers", pattern: "^(?:Привет|Здравствуйте|Добрый день|Доброе утро|Добрый вечер)\\s*[,.!?\\s]?\\s*", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "excessive_gratitude", pattern: "(?<![\\p{L}\\p{N}_])(?:Большое спасибо|Огромное спасибо|Спасибо заранее|Заранее благодарю|Очень признателен)(?![\\p{L}\\p{N}_])[,.!?\\s]*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "softeners", pattern: "(?<![\\p{L}\\p{N}_])(?:немного|немножко|чуть-чуть|слегка|несколько|как-то)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "filler", minIntensity: "lite", flags: "giu" }, { name: "assistant_fillers", pattern: "^(?:Вот|Ниже|Это|Здесь)\\s+(?:есть|находится)?\\s*", replacement: "", context: "assistant", category: "filler", minIntensity: "lite" }] },
      structural: { language: "ru", category: "structural", rules: [{ name: "problem_phrasing", pattern: "(?<![\\p{L}\\p{N}_])(?:проблема заключается в том, что|дело в том, что|суть в том, что)(?![\\p{L}\\p{N}_])\\s*", replacement: "проблема: ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "causality_verbose", pattern: "(?<![\\p{L}\\p{N}_])(?:это приводит к тому, что|это означает, что|из этого следует, что)(?![\\p{L}\\p{N}_])\\s*", replacement: "→ ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "purpose_phrases", pattern: "(?<![\\p{L}\\p{N}_])(?:для того чтобы|с целью того чтобы)(?![\\p{L}\\p{N}_])\\s*", replacement: "чтобы ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "causality_phrases", pattern: "(?<![\\p{L}\\p{N}_])(?:в связи с тем, что|по причине того, что|ввиду того, что)(?![\\p{L}\\p{N}_])\\s*", replacement: "из-за ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "concession_phrases", pattern: "(?<![\\p{L}\\p{N}_])(?:несмотря на то, что|хотя и)(?![\\p{L}\\p{N}_])\\s*", replacement: "хотя ", context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "note_phrases", pattern: "(?<![\\p{L}\\p{N}_])(?:стоит отметить, что|следует иметь в виду, что|важно понимать, что|необходимо учитывать, что)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "redundant_directive", pattern: "(?<![\\p{L}\\p{N}_])(?:важно помнить|не забывайте|помните о том)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "approximation", pattern: "(?<![\\p{L}\\p{N}_])(?:примерно|приблизительно)(?![\\p{L}\\p{N}_])\\s*", replacement: "≈ ", context: "all", category: "structural", minIntensity: "full", flags: "giu" }, { name: "forbidden_abbreviations_dots", pattern: "(?<![\\p{L}\\p{N}_])(?:т\\.к\\.|т\\.е\\.|и т\\.д\\.|и т\\.п\\.|см\\.|напр\\.|и др\\.|в т\\.ч\\.)(?![\\p{L}\\p{N}_])", replacement: "", replacementMap: { "т.к.": "так как", "т.е.": "то есть", "и т.д.": "", "и т.п.": "", "см.": "см", "напр.": "например", "и др.": "", "в т.ч.": "" }, context: "all", category: "structural", minIntensity: "lite", flags: "giu" }, { name: "forbidden_abbreviations_dash", pattern: "(?<![\\p{L}\\p{N}_])(?:кол-во|к-рый|св-во)(?![\\p{L}\\p{N}_])", replacement: "", replacementMap: { "кол-во": "количество", "к-рый": "который", "св-во": "свойство" }, context: "all", category: "structural", minIntensity: "lite", flags: "giu" }] },
      ultra: { language: "ru", category: "ultra", rules: [{ name: "ultra_compression_conjunctions", pattern: "(?<![\\p{L}\\p{N}_])(?:однако|тем не менее|в то время как)(?![\\p{L}\\p{N}_])\\s*", replacement: "—", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "ultra_compression_articles", pattern: "(?<![\\p{L}\\p{N}_])(?:является|представляет собой)(?![\\p{L}\\p{N}_])\\s*", replacement: "—", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "ultra_compression_verbs", pattern: "(?<![\\p{L}\\p{N}_])(?:необходимо|требуется|нужно)(?![\\p{L}\\p{N}_])\\s*", replacement: "", context: "all", category: "ultra", minIntensity: "ultra", flags: "giu" }, { name: "ultra_punctuation", pattern: "[,:;]\\s+", replacement: " ", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "ultra_lowercase", pattern: "(?<=\\.)\\s+([А-ЯЁ])", replacement: " $1", context: "all", category: "ultra", minIntensity: "ultra" }] }
    },
    zh: {
      dedup: { language: "zh", category: "dedup", rules: [{ name: "zh_repeated_context", pattern: "(?:如前所述|如之前所说|如先前提到|正如我之前所说)", replacement: "见上。", context: "all", category: "dedup", minIntensity: "lite" }, { name: "zh_repeated_question", pattern: "(?:和之前一样的问题|我之前问过这个问题|这是同一个问题)", replacement: "［同问］", context: "user", category: "dedup", minIntensity: "lite" }, { name: "zh_reestablished_context", pattern: "(?:回到上面的代码|关于之前提到的内容|回到之前的话题)", replacement: "Re: ", context: "all", category: "dedup", minIntensity: "lite" }, { name: "zh_summary_replacement", pattern: "(?:总结一下我们讨论的内容|总结我们的对话|概括来说)", replacement: "总结：", context: "assistant", category: "dedup", minIntensity: "lite" }] },
      filler: { language: "zh", category: "filler", rules: [{ name: "zh_filler_please", pattern: "请(?:你|您)?(?:帮我|帮忙)?", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "zh_filler_thanks", pattern: "(?:谢谢|多谢|感谢)(?:你|您|大家)?[。，！]?", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "zh_filler_trouble", pattern: "(?:麻烦你|麻烦您|劳驾)[，]?", replacement: "", context: "user", category: "filler", minIntensity: "lite" }, { name: "zh_filler_greeting", pattern: "(?:你好|您好|大家好)[，,]?", replacement: "", context: "all", category: "filler", minIntensity: "lite" }, { name: "zh_filler_hedge_think", pattern: "(?:我觉得|我认为|我想说)", replacement: "", context: "all", category: "filler", minIntensity: "full" }, { name: "zh_filler_hedge_actually", pattern: "(?:其实|说实话|基本上)[，,]?", replacement: "", context: "all", category: "filler", minIntensity: "full" }] },
      ultra: { language: "zh", category: "ultra", rules: [{ name: "zh_ultra_modal_particles", pattern: "(?:吗|呢|吧|啊|呀|嘛)(?=[。，！？、\\s]|$)", flags: "g", replacement: "", context: "all", category: "terse", minIntensity: "full" }, { name: "zh_ultra_database_abbreviation", pattern: "数据库", replacement: "DB", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "zh_ultra_application_abbreviation", pattern: "应用程序", replacement: "app", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "zh_ultra_dependency_abbreviation", pattern: "依赖关系", replacement: "dep", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "zh_ultra_config_file_abbreviation", pattern: "配置文件", replacement: "cfg", context: "all", category: "ultra", minIntensity: "ultra" }, { name: "zh_ultra_function_abbreviation", pattern: "函数", replacement: "fn", context: "all", category: "ultra", minIntensity: "ultra" }] }
    }
  };

  // engines/caveman-rules.js
  var RULE_KEYWORDS = {
    redundant_phrasing: ["make sure", "be sure"],
    redundant_because: ["due to the fact", "the reason is because"],
    redundant_directive: ["it is important", "you should", "remember to"],
    pleasantries: [
      "sure",
      "certainly",
      "of course",
      "happy to",
      "thanks",
      "thank you",
      "glad to help",
      "glad to",
      "no problem",
      "you're welcome",
      "youre welcome",
      "absolutely"
    ],
    polite_framing: [
      "please",
      "kindly",
      "could you please",
      "would you please",
      "can you please",
      "i would like you",
      "i want you",
      "i need you"
    ],
    hedging: [
      "it seems like",
      "it appears that",
      "i think that",
      "i believe that",
      "probably",
      "possibly",
      "maybe it"
    ],
    verbose_instructions: [
      "provide a detailed",
      "give me a comprehensive",
      "write an in-depth",
      "create a thorough",
      "explain in detail"
    ],
    filler_adverbs: ["basically", "essentially", "actually", "literally", "simply", "currently"],
    filler_phrases: ["i want to", "i need to", "i'd like to", "i'm looking for"],
    redundant_openers: ["hi there", "hello", "good morning", "hey"],
    verbose_requests: ["i was wondering", "would it be possible"],
    leader_phrases: [
      "i'll",
      "i will",
      "i can",
      "i'd",
      "let me",
      "you can",
      "we will",
      "we can",
      "let's"
    ],
    self_reference: ["i am trying to", "i am working on", "i have been"],
    excessive_gratitude: ["thank you so much", "thanks in advance", "i really appreciate"],
    qualifier_removal: ["a bit", "a little", "somewhat", "kind of", "sort of"],
    softeners: ["if possible", "when you get a chance", "at your convenience", "just wondering"],
    uncertainty_fillers: ["i guess", "i suppose", "more or less", "in a way"],
    assistant_fillers: ["here's", "below is", "this is"],
    compound_collapse: ["and any potential"],
    explanatory_prefix: [
      "the function appears to be handling",
      "the code seems to",
      "the class is",
      "this module is"
    ],
    question_to_directive: [
      "can you explain why",
      "could you show me how",
      "would you tell me",
      "can you tell me"
    ],
    context_setup: ["i have the following code", "here is my code", "below is the code"],
    intent_clarification: [
      "what i'm trying to do",
      "my objective is to",
      "what i need is",
      "i'm aiming to"
    ],
    background_removal: ["as you may know", "as we discussed earlier"],
    meta_commentary: ["note that", "keep in mind", "remember that"],
    purpose_statement: ["for the purpose of", "with the goal of", "in an effort to", "for every"],
    list_conjunction: ["and also", "as well as"],
    purpose_phrases: ["in order to", "so as to"],
    redundant_quantifiers: ["each and every", "any and all"],
    all_quantifier: ["any and all"],
    verbose_connectors: ["furthermore", "additionally", "moreover", "in addition"],
    transition_removal: ["on the other hand", "in contrast", "however"],
    emphasis_removal: ["very", "really", "extremely", "highly", "quite"],
    passive_voice: [
      "is being used",
      "is being called",
      "is being generated",
      "was created",
      "was generated",
      "was implemented"
    ],
    repeated_context: [
      "as we discussed earlier",
      "as mentioned before",
      "as previously stated",
      "as i said before"
    ],
    repeated_question: [
      "same question as before",
      "i asked this earlier",
      "this is the same question"
    ],
    reestablished_context: ["going back to the code above", "referring back to", "returning to"],
    summary_replacement: ["to summarize", "in summary of our conversation", "to recap"],
    ultra_abbreviations: ["database"],
    ultra_config_abbreviation: ["configuration"],
    ultra_function_abbreviation: ["function"],
    ultra_request_abbreviation: ["request"],
    ultra_response_abbreviation: ["response"],
    ultra_implementation_abbreviation: ["implementation"],
    ultra_authentication_abbreviation: ["authentication"],
    ultra_authorization_abbreviation: ["authorization"],
    ultra_application_abbreviation: ["application"],
    ultra_dependency_abbreviation: ["dependency", "dependencies"],
    ultra_common_abbreviations: [
      "implementation",
      "authentication",
      "authorization",
      "application",
      "dependency",
      "dependencies"
    ]
  };
  var VALID_CONTEXTS = new Set(["all", "user", "system", "assistant"]);
  var VALID_CATEGORIES = new Set(["filler", "context", "structural", "dedup", "terse", "ultra"]);
  var VALID_INTENSITIES = new Set(["lite", "full", "ultra"]);
  var INTENSITY_RANK = { lite: 0, full: 1, ultra: 2 };
  var compileSkipped = 0;
  function resetRuleCompileWarnings() {
    compileSkipped = 0;
  }
  function ruleCompileWarningCount() {
    return compileSkipped;
  }
  function normalizeReplacementKey(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }
  function compileReplacement(rule) {
    if (!rule.replacementMap)
      return rule.replacement ?? "";
    const normalizedMap = new Map(Object.entries(rule.replacementMap).map(([key, value]) => [normalizeReplacementKey(key), value]));
    const fallback = rule.replacement;
    return (match) => {
      const normalized = normalizeReplacementKey(match);
      if (normalizedMap.has(normalized))
        return normalizedMap.get(normalized) ?? "";
      return fallback ?? match;
    };
  }
  function getRuleFlags(rule) {
    return rule.flags ?? "gi";
  }
  function listRulePackCategories(language) {
    const pack = RULE_PACKS[language];
    if (!pack)
      return [];
    return Object.keys(pack).sort();
  }
  var packCache = new Map;
  function compileRule(rule, source) {
    try {
      return {
        name: rule.name,
        pattern: new RegExp(rule.pattern, getRuleFlags(rule)),
        replacement: compileReplacement(rule),
        context: VALID_CONTEXTS.has(rule.context) ? rule.context : "all",
        category: VALID_CATEGORIES.has(rule.category) ? rule.category : "filler",
        minIntensity: VALID_INTENSITIES.has(rule.minIntensity) ? rule.minIntensity : "lite",
        description: rule.description,
        source
      };
    } catch {
      compileSkipped++;
      return null;
    }
  }
  function loadAllRulesForLanguage(language) {
    if (!language)
      return [];
    const cached = packCache.get(language);
    if (cached)
      return cached;
    const compiled = [];
    for (const category of listRulePackCategories(language)) {
      const pack = RULE_PACKS[language][category];
      const rules = pack && Array.isArray(pack.rules) ? pack.rules : [];
      for (const rule of rules) {
        if (!rule || typeof rule.name !== "string" || typeof rule.pattern !== "string")
          continue;
        const out = compileRule(rule, language + "/" + category);
        if (out)
          compiled.push(out);
      }
    }
    packCache.set(language, compiled);
    return compiled;
  }
  var CAVEMAN_RULES = [
    {
      name: "redundant_phrasing",
      pattern: /\b(?:make sure to|be sure to|due to the fact that|the reason is because|it is important to|you should|remember to)\b\s*/gi,
      replacement: (match) => {
        const map = {
          "make sure to": "ensure ",
          "be sure to": "ensure ",
          "due to the fact that": "because ",
          "the reason is because": "because ",
          "it is important to": "",
          "you should": "",
          "remember to": ""
        };
        return map[match.trim().toLowerCase()] ?? "";
      },
      context: "all",
      category: "structural",
      minIntensity: "full",
      description: "Replace verbose stock phrases with shorter equivalents."
    },
    {
      name: "pleasantries",
      pattern: /(?<!make\s)(?<!be\s)\b(?:i'?d be happy to|i would be happy to|i'?d be glad to|i would be glad to|glad to help|happy to|thank you|thanks|no problem|you'?re welcome|absolutely|certainly|of course|sure)\b[,.!?\s]*/gi,
      replacement: "",
      context: "all",
      category: "filler",
      minIntensity: "lite",
      description: "Drop conversational acknowledgements that do not change request meaning."
    },
    {
      name: "polite_framing",
      pattern: /\b(?:please|kindly|could you please|would you please|can you please|I would like you to|I want you to|I need you to)\b\s*/gi,
      replacement: "",
      context: "all",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "hedging",
      pattern: /\b(?:it seems like|it appears that|I think that|I believe that|probably|possibly|maybe it)\b\s*/gi,
      replacement: "",
      context: "all",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "verbose_instructions",
      pattern: /\b(?:provide a detailed explanation of|give me a comprehensive explanation of|write an in-depth explanation of|create a thorough explanation of|provide a detailed|give me a comprehensive|write an in-depth|create a thorough|explain in detail)\b/gi,
      replacement: (match) => {
        const map = {
          "provide a detailed explanation of": "explain ",
          "give me a comprehensive explanation of": "explain ",
          "write an in-depth explanation of": "explain ",
          "create a thorough explanation of": "explain ",
          "provide a detailed": "provide ",
          "give me a comprehensive": "give ",
          "write an in-depth": "write ",
          "create a thorough": "create ",
          "explain in detail": "explain "
        };
        const lower = match.toLowerCase();
        return map[lower] ?? match;
      },
      context: "all",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "filler_adverbs",
      pattern: /(?<![a-z])\b(?:basically|essentially|actually|literally|simply|currently)\b\s*/gi,
      replacement: "",
      context: "all",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "articles",
      pattern: /\b(?:[Aa]n|[Aa]|[Tt]he)\s+(?=[a-z])/g,
      replacement: "",
      context: "all",
      category: "terse",
      minIntensity: "full",
      description: "Remove English articles from prose while protected technical tokens stay intact."
    },
    {
      name: "filler_phrases",
      pattern: /^(?:I want to|I need to|I'd like to|I'm looking for)\b\s*/gim,
      replacement: "",
      context: "user",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "redundant_openers",
      pattern: /^(?:Hi there|Hello|Good morning|Hey)\s*[,.!?\s]?\s*/gim,
      replacement: "",
      context: "user",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "verbose_requests",
      pattern: /\b(?:I was wondering if you could|Would it be possible to)\b\s*/gi,
      replacement: "",
      context: "user",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "leader_phrases",
      pattern: /^(?:i'?ll|i will|i can|i'?d|let me|you can|we will|we can|let'?s)\s+(?=[a-z])/gim,
      replacement: "",
      context: "all",
      category: "terse",
      minIntensity: "full",
      description: "Remove leading helper phrases before the actual instruction or answer."
    },
    {
      name: "self_reference",
      pattern: /^(?:I am trying to|I am working on|I have been)\b\s*/gim,
      replacement: "",
      context: "user",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "excessive_gratitude",
      pattern: /\b(?:Thank you so much|Thanks in advance|I really appreciate)\b[,.!?\s]*/gi,
      replacement: "",
      context: "all",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "qualifier_removal",
      pattern: /\b(?:a bit|a little|somewhat|kind of|sort of)\b\s*/gi,
      replacement: "",
      context: "all",
      category: "filler",
      minIntensity: "lite"
    },
    {
      name: "compound_collapse",
      pattern: /\band any potential\b/gi,
      replacement: "",
      context: "all",
      category: "context",
      minIntensity: "full"
    },
    {
      name: "explanatory_prefix",
      pattern: /\b(?:The function appears to be handling|The code seems to|The class is|This module is)\b/gi,
      replacement: (match) => {
        const map = {
          "the function appears to be handling": "Function:",
          "the code seems to": "Code:",
          "the class is": "Class:",
          "this module is": "Module:"
        };
        return map[match.toLowerCase()] ?? match;
      },
      context: "all",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "question_to_directive",
      pattern: /\b(?:Can you explain why|Could you show me how|Would you tell me|Can you tell me)\b\s*/gi,
      replacement: (match) => {
        const trimmed = match.trimEnd().toLowerCase();
        const map = {
          "can you explain why": "Explain why ",
          "could you show me how": "Show how ",
          "would you tell me": "Tell me ",
          "can you tell me": "Tell me "
        };
        return map[trimmed] ?? match;
      },
      context: "user",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "context_setup",
      pattern: /\b(?:I have the following code|Here is my code|Below is the code)\b\s*[:.]?\s*/gi,
      replacement: "Code:",
      context: "user",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "intent_clarification",
      pattern: /\b(?:What I'm trying to do is|My objective is to|What I need is|I'm aiming to)\b\s*/gi,
      replacement: "Goal:",
      context: "user",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "background_removal",
      pattern: /\b(?:As you may know,?\s*|As we discussed earlier,?\s*)/gi,
      replacement: "",
      context: "all",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "meta_commentary",
      pattern: /^(?:Note that|Keep in mind that|Remember that)\b\s*/gim,
      replacement: "",
      context: "all",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "purpose_statement",
      pattern: /\b(?:for the purpose of|with the goal of|in an effort to|for every)\b/gi,
      replacement: (match) => {
        const map = {
          "for the purpose of": "for",
          "with the goal of": "to",
          "in an effort to": "to",
          "for every": "per"
        };
        return map[match.toLowerCase()] ?? match;
      },
      context: "all",
      category: "context",
      minIntensity: "lite"
    },
    {
      name: "list_conjunction",
      pattern: /,\s*and also\s+|,\s*as well as\s+/gi,
      replacement: ", ",
      context: "all",
      category: "structural",
      minIntensity: "full"
    },
    {
      name: "purpose_phrases",
      pattern: /\b(?:in order to|so as to)\b\s*/gi,
      replacement: "to ",
      context: "all",
      category: "structural",
      minIntensity: "lite"
    },
    {
      name: "redundant_quantifiers",
      pattern: /\b(?:each and every single|each and every|any and all)\b/gi,
      replacement: (match) => {
        const map = {
          "each and every single": "each",
          "each and every": "each",
          "any and all": "all"
        };
        return map[match.toLowerCase()] ?? match;
      },
      context: "all",
      category: "structural",
      minIntensity: "full"
    },
    {
      name: "verbose_connectors",
      pattern: /\b(?:furthermore|additionally|moreover|in addition)\b\s*/gi,
      replacement: "also ",
      context: "all",
      category: "structural",
      minIntensity: "lite"
    },
    {
      name: "transition_removal",
      pattern: /^(?:On the other hand,?\s*|In contrast,?\s*|However,?\s*)/gim,
      replacement: "",
      context: "all",
      category: "structural",
      minIntensity: "lite"
    },
    {
      name: "emphasis_removal",
      pattern: /\b(?:very|really|extremely|highly|quite)\s+(?=[a-z])/gi,
      replacement: "",
      context: "all",
      category: "structural",
      minIntensity: "lite"
    },
    {
      name: "passive_voice",
      pattern: /\b(?:is being used|is being called|is being generated|was created|was generated|was implemented)\b/gi,
      replacement: (match) => {
        const map = {
          "is being used": "uses",
          "is being called": "calls",
          "is being generated": "generated",
          "was created": "created",
          "was generated": "generated",
          "was implemented": "implemented"
        };
        return map[match.toLowerCase()] ?? match;
      },
      context: "all",
      category: "structural",
      minIntensity: "full"
    },
    {
      name: "repeated_context",
      pattern: /\b(?:As we discussed earlier|As mentioned before|As previously stated|As I said before)\b[,.]?\s*/gi,
      replacement: "See above. ",
      context: "all",
      category: "dedup",
      minIntensity: "lite"
    },
    {
      name: "repeated_question",
      pattern: /\b(?:Same question as before|I asked this earlier|This is the same question)\b[,.]?\s*/gi,
      replacement: "[same question] ",
      context: "user",
      category: "dedup",
      minIntensity: "lite"
    },
    {
      name: "reestablished_context",
      pattern: /\b(?:Going back to the code above|Referring back to|Returning to)\b\s*/gi,
      replacement: "Re: ",
      context: "all",
      category: "dedup",
      minIntensity: "lite"
    },
    {
      name: "summary_replacement",
      pattern: /\b(?:To summarize what we've discussed|In summary of our conversation|To recap)\b[,.]?\s*/gi,
      replacement: "Summary: ",
      context: "assistant",
      category: "dedup",
      minIntensity: "lite"
    },
    {
      name: "ultra_abbreviations",
      pattern: /\b(?:database|configuration|function|request|response|implementation|authentication|authorization|application|dependency|dependencies)\b/gi,
      replacement: (match) => {
        const map = {
          database: "DB",
          configuration: "config",
          function: "fn",
          request: "req",
          response: "res",
          implementation: "impl",
          authentication: "auth",
          authorization: "authz",
          application: "app",
          dependency: "dep",
          dependencies: "deps"
        };
        return map[match.toLowerCase()] ?? match;
      },
      context: "all",
      category: "ultra",
      minIntensity: "ultra"
    }
  ];
  function getRulesForContext(context, intensity = "full", language = "en", options) {
    const rank = INTENSITY_RANK[intensity] ?? INTENSITY_RANK.full;
    const groups = options && Array.isArray(options.groups) ? options.groups : null;
    const groupAllowed = (rule) => groups === null || groups.indexOf(rule.category ?? "terse") !== -1;
    const fileRules = language ? loadAllRulesForLanguage(language) : [];
    const rules = fileRules.length > 0 ? fileRules : CAVEMAN_RULES;
    const selected = rules.filter((rule) => {
      const minRank = INTENSITY_RANK[rule.minIntensity ?? "lite"];
      return (rule.context === "all" || rule.context === context) && minRank <= rank && groupAllowed(rule);
    });
    if (selected.length > 0)
      return selected;
    return CAVEMAN_RULES.filter((rule) => {
      const minRank = INTENSITY_RANK[rule.minIntensity ?? "lite"];
      return (rule.context === "all" || rule.context === context) && minRank <= rank && groupAllowed(rule);
    });
  }
  var ARTICLE_HINT_RE = /\b(?:a|an|the)\b/;
  function shouldAttemptRule(rule, lowerText) {
    if (rule.name === "articles") {
      ARTICLE_HINT_RE.lastIndex = 0;
      return ARTICLE_HINT_RE.test(lowerText);
    }
    const keywords = RULE_KEYWORDS[rule.name];
    if (!keywords)
      return true;
    if (!CAVEMAN_RULES.includes(rule)) {
      rule.pattern.lastIndex = 0;
      const matches = rule.pattern.test(lowerText);
      rule.pattern.lastIndex = 0;
      return matches;
    }
    return keywords.some((keyword) => lowerText.includes(keyword));
  }
  function applyRulesToText(text, rules) {
    let result = text;
    let lowerResult = text.toLowerCase();
    let lowerResultSource = text;
    const appliedRules = [];
    for (const rule of rules) {
      if (lowerResultSource !== result) {
        lowerResult = result.toLowerCase();
        lowerResultSource = result;
      }
      if (!shouldAttemptRule(rule, lowerResult))
        continue;
      const before = result;
      const { pattern, replacement } = rule;
      if (typeof replacement === "function") {
        const fn = replacement;
        result = result.replace(pattern, (...args) => {
          const match = args[0];
          return fn(match, ...args.slice(1, -2));
        });
      } else {
        result = result.replace(pattern, replacement);
      }
      if (result !== before) {
        appliedRules.push(rule.name);
      }
    }
    return { text: result, appliedRules };
  }
  var LANGUAGE_HINTS = {};
  try {
    LANGUAGE_HINTS = {
      it: [
        /(?<![\p{L}\p{N}])(?:perche|perché|pero|però|cioe|cioè|quindi|potresti|vorrei|adesso|errore|grazie|devo|voglio|questo|quello|anche|sono|molto)(?![\p{L}\p{N}])/iu
      ],
      "pt-BR": [
        /(?<![\p{L}\p{N}])(?:voce|você|preciso|arquivo|codigo|código|erro|falha|obrigado)(?![\p{L}\p{N}])/iu
      ],
      es: [
        /(?<![\p{L}\p{N}])(?:necesito|archivo|codigo|código|fallo|gracias|puedes)(?![\p{L}\p{N}])/iu
      ],
      de: [/(?<![\p{L}\p{N}])(?:ich|datei|fehler|bitte|kannst|konfiguration|danke)(?![\p{L}\p{N}])/iu],
      fr: [/(?<![\p{L}\p{N}])(?:fichier|erreur|merci|peux|besoin)(?![\p{L}\p{N}])/iu],
      ru: [
        /(?<![\p{L}\p{N}])(?:\u044d\u0442\u043e|\u0447\u0442\u043e|\u043a\u0430\u043a|\u0435\u0441\u043b\u0438|\u0447\u0442\u043e\u0431\u044b|\u043a\u043e\u0442\u043e\u0440\u044b\u0439|\u043c\u043e\u0436\u0435\u0442|\u043d\u0443\u0436\u043d\u043e|\u0435\u0441\u0442\u044c|\u0431\u044b\u043b\u043e|\u0431\u0443\u0434\u0435\u0442|\u043c\u043e\u0436\u043d\u043e|\u0434\u043e\u043b\u0436\u0435\u043d|\u0444\u0430\u0439\u043b|\u043e\u0448\u0438\u0431\u043a\u0430|\u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0430|\u0434\u0430\u043d\u043d\u044b\u0435)(?![\p{L}\p{N}])/iu,
        /[\u0430-\u044f\u0451]/iu
      ],
      ja: [/[\u3040-\u30ff]/u],
      hu: [
        /(?<![\p{L}\p{N}])(?:kérlek|tudnád|szeretném|magyarázd|mutasd|miért|hogyan|függvény|beállítás|adatbázis|következő|problémám|megoldani|hiba|fájl|így)(?![\p{L}\p{N}])/iu
      ],
      id: [
        /(?<![\p{L}\p{N}])(?:saya|kamu|anda|dengan|untuk|yang|tidak|bisa|terima\s+kasih|dari)(?![\p{L}\p{N}])/iu
      ]
    };
  } catch {
    LANGUAGE_HINTS = {};
  }
  function detectCompressionLanguage(text) {
    if (typeof text !== "string" || text.length === 0)
      return "en";
    try {
      if (/[\u4e00-\u9fff]/.test(text) && !/[\u3040-\u30ff]/.test(text))
        return "zh";
    } catch {
      return "en";
    }
    let best = "en";
    let bestScore = 0;
    for (const language of Object.keys(LANGUAGE_HINTS)) {
      const patterns = LANGUAGE_HINTS[language];
      if (!Array.isArray(patterns))
        continue;
      let score = 0;
      for (const pattern of patterns) {
        try {
          const global = pattern.flags.includes("g") ? pattern : new RegExp(pattern.source, pattern.flags + "g");
          const matches = text.match(global);
          if (matches)
            score += matches.length;
        } catch {}
      }
      if (score > bestScore) {
        bestScore = score;
        best = language;
      }
    }
    return best;
  }

  // engines/caveman.js
  var id8 = "caveman";
  var label3 = "Caveman";
  var why3 = "按语言规则表删掉啰嗦措辞、客套话、冗余从句，保留代码与事实（约 30% 压缩）。";
  var lossy3 = true;
  var cacheImpact3 = "moderate";
  var defaultOn8 = false;
  var stackPriority3 = 20;
  var isSingleMode3 = false;
  var levels3 = undefined;
  var available3 = true;
  var DEFAULT_PRESERVE_PATTERNS = [
    "```[\\s\\S]*?```",
    "`[^`\\n]+`",
    "\\b(https?://\\S+)",
    "(?:^|\\s)(\\.{0,2}/[\\w./\\-]+)",
    "^\\s*(Error|TypeError|RangeError|SyntaxError|ReferenceError):",
    "^\\s+at\\s"
  ];
  var ALL_RULE_GROUPS = ["context", "dedup", "filler", "structural", "ultra"];
  var DEFAULT_CAVEMAN_CONFIG = {
    compressRoles: ["user"],
    skipRules: [],
    minMessageLength: 50,
    preservePatterns: DEFAULT_PRESERVE_PATTERNS,
    intensity: "full",
    language: "auto",
    autoDetectLanguage: true,
    groups: ALL_RULE_GROUPS
  };
  var LANGUAGE_OPTIONS = [
    { value: "auto", label: "自动检测" },
    { value: "en", label: "English" },
    { value: "zh", label: "简体中文" },
    { value: "de", label: "Deutsch" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "hu", label: "Magyar" },
    { value: "id", label: "Bahasa Indonesia" },
    { value: "it", label: "Italiano" },
    { value: "ja", label: "日本語" },
    { value: "pt-BR", label: "Português (BR)" },
    { value: "ru", label: "Русский" }
  ];
  var configSchema3 = [
    {
      key: "lang",
      type: "select",
      label: "语言",
      description: "auto 按内容自动判断（汉字无假名判中文，其余按关键词打分）；失败回落到英文规则包。",
      defaultValue: "auto",
      options: LANGUAGE_OPTIONS
    },
    {
      key: "groups",
      type: "multiselect",
      label: "规则组",
      description: "只跑选中的规则组。zh 包只有 dedup / filler / ultra 三组。",
      defaultValue: ALL_RULE_GROUPS.slice(),
      options: [
        { value: "context", label: "上下文（context）" },
        { value: "dedup", label: "去重（dedup）" },
        { value: "filler", label: "填充词（filler）" },
        { value: "structural", label: "结构（structural）" },
        { value: "ultra", label: "激进（ultra）" }
      ]
    },
    {
      key: "intensity",
      type: "select",
      label: "强度",
      description: "lite 只删客套话，full 加结构性改写，ultra 最激进。",
      defaultValue: "full",
      options: [
        { value: "lite", label: "轻（lite）" },
        { value: "full", label: "标准（full）" },
        { value: "ultra", label: "激进（ultra）" }
      ]
    },
    {
      key: "compressRoles",
      type: "multiselect",
      label: "作用角色",
      description: "默认只压 user 消息，system 提示词与 assistant 历史保持原样。",
      defaultValue: ["user"],
      options: [
        { value: "user", label: "user" },
        { value: "assistant", label: "assistant" },
        { value: "system", label: "system" }
      ]
    },
    {
      key: "preserveCode",
      type: "boolean",
      label: "保护代码与路径",
      description: "代码围栏、行内代码、URL、文件路径、错误行永不被改写。关掉有破坏代码的风险。",
      defaultValue: true
    },
    {
      key: "minMessageLength",
      type: "number",
      label: "最小压缩长度",
      description: "短于这个字符数的文本段直接跳过（规则作用在短句上容易误伤）。",
      defaultValue: 50,
      min: 0,
      max: 4000
    }
  ];
  function estimateCompressionTokens(text) {
    if (typeof text !== "string" || text.length === 0)
      return 0;
    return Math.ceil(text.length / 4);
  }
  var SENTINEL_PREFIX2 = "\x00OMNI_CAVEMAN";
  function randomSentinelSeed2() {
    try {
      const cryptoLike = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
      if (cryptoLike && typeof cryptoLike.getRandomValues === "function") {
        const bytes = new Uint8Array(8);
        cryptoLike.getRandomValues(bytes);
        let hex = "";
        for (let i = 0;i < bytes.length; i++)
          hex += bytes[i].toString(16).padStart(2, "0");
        return "r" + hex;
      }
    } catch {}
    return "r" + Math.random().toString(36).slice(2);
  }
  function ensureGlobal2(pattern) {
    if (!(pattern instanceof RegExp))
      return pattern;
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    return new RegExp(pattern.source, flags);
  }
  function compileUserPatterns2(patterns) {
    if (!patterns || patterns.length === 0)
      return [];
    const compiled = [];
    for (const pattern of patterns) {
      try {
        compiled.push({
          pattern: typeof pattern === "string" ? new RegExp(pattern, "g") : ensureGlobal2(pattern),
          kind: "custom"
        });
      } catch {}
    }
    return compiled;
  }
  function replacePattern2(text, pattern, kind, addBlock) {
    pattern.lastIndex = 0;
    return text.replace(pattern, (match) => {
      if (!match)
        return match;
      if (match.indexOf(SENTINEL_PREFIX2) !== -1)
        return match;
      return addBlock(match, kind);
    });
  }
  function extractFrontmatter2(text, addBlock) {
    if (!text.startsWith(`---
`))
      return text;
    const close = text.indexOf(`
---`, 4);
    if (close === -1)
      return text;
    const closeEnd = text.indexOf(`
`, close + 4);
    const end = closeEnd === -1 ? text.length : closeEnd + 1;
    return addBlock(text.slice(0, end), "frontmatter") + text.slice(end);
  }
  function extractFencedCodeBlocks2(text, addBlock) {
    const lines = text.match(/[^\n]*(?:\n|$)/g) || [text];
    let output = "";
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line === "" && i === lines.length - 1)
        break;
      const opening = line.match(/^([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/);
      if (!opening) {
        output += line;
        i++;
        continue;
      }
      const fence = opening[2];
      const fenceChar = fence[0];
      const minLen = fence.length;
      let block = line;
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        const candidate = lines[j];
        block += candidate;
        const closeMatch = candidate.match(/^([ \t]{0,3})(`{3,}|~{3,})\s*(?:\n|$)/);
        if (closeMatch && closeMatch[2][0] === fenceChar && closeMatch[2].length >= minLen) {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        output += line;
        i++;
        continue;
      }
      output += addBlock(block);
      i = j + 1;
    }
    return output;
  }
  function findFencedCodeBlocks(text) {
    const blocks = [];
    extractFencedCodeBlocks2(text, (content) => {
      blocks.push(content);
      return content;
    });
    return blocks;
  }
  function extractPreservedBlocks2(text, options) {
    const opts = options || {};
    const blocks = [];
    const seed = randomSentinelSeed2();
    let counter = 0;
    const addBlock = (content, kind) => {
      const placeholder = SENTINEL_PREFIX2 + "_" + seed + "_" + counter + "\x00";
      blocks.push({ placeholder, content, kind });
      counter++;
      return placeholder;
    };
    let result = text;
    result = extractFrontmatter2(result, addBlock);
    const regionPatterns = compileUserPatterns2(opts.preservePatterns).concat([
      { pattern: /<system-reminder>[\s\S]*?<\/system-reminder>/g, kind: "system_instruction" },
      { pattern: /<instructions?>[\s\S]*?<\/instructions?>/g, kind: "system_instruction" },
      {
        pattern: /<project[- ]instructions?>[\s\S]*?<\/project[- ]instructions?>/g,
        kind: "system_instruction"
      }
    ]);
    for (const entry of regionPatterns) {
      result = replacePattern2(result, ensureGlobal2(entry.pattern), entry.kind, addBlock);
    }
    result = extractFencedCodeBlocks2(result, (content) => addBlock(content, "fenced_code"));
    const builtIns = [
      { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
      { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
      {
        pattern: /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g,
        kind: "math_inline"
      },
      { pattern: /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, kind: "latex_block" },
      { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
      { pattern: /^\s*\|.*\|\s*$/gm, kind: "markdown_table" },
      { pattern: /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, kind: "markdown_table" },
      { pattern: /^\s*#(?:set|show|let|import|include)\b.+$/gm, kind: "typst_directive" },
      { pattern: /`[^`\n]+`/g, kind: "inline_code" },
      { pattern: /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, kind: "markdown_link" },
      { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/gi, kind: "url" },
      { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
      { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b/g, kind: "env_var" },
      { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
      { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
      { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?/g, kind: "dotted_identifier" },
      { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
      {
        pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g,
        kind: "file_path"
      },
      {
        pattern: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g,
        kind: "error_message"
      }
    ];
    for (const entry of builtIns) {
      result = replacePattern2(result, ensureGlobal2(entry.pattern), entry.kind, addBlock);
    }
    return { text: result, blocks };
  }
  function restorePreservedBlocks(text, blocks) {
    let result = text;
    for (const block of blocks) {
      result = result.split(block.placeholder).join(block.content);
    }
    return result;
  }
  function shouldPreserve(text, preservePatterns) {
    return preservePatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });
  }
  function previewOf(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function requireExactPresence(labelText, originalItems, compressed, errors) {
    for (const item of originalItems) {
      if (compressed.indexOf(item) === -1) {
        errors.push(labelText + " changed or missing: " + previewOf(item));
      }
    }
  }
  function collectMatches(text, pattern, limit) {
    const out = [];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0])
        out.push(match[0]);
      if (match[0] === "")
        pattern.lastIndex++;
      if (out.length >= limit)
        break;
    }
    pattern.lastIndex = 0;
    return out;
  }
  function collectInlineCode(text) {
    return collectMatches(text, /`[^`\n]+`/g, 200);
  }
  function collectUrls(text) {
    return collectMatches(text, /\bhttps?:\/\/[^\s)\]"'>]+/gi, 200);
  }
  function collectMarkdownLinks(text) {
    return collectMatches(text, /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, 200);
  }
  function collectFrontmatter(text) {
    if (!text.startsWith(`---
`))
      return [];
    const close = text.indexOf(`
---`, 4);
    if (close === -1)
      return [];
    const closeEnd = text.indexOf(`
`, close + 4);
    const end = closeEnd === -1 ? text.length : closeEnd + 1;
    return [text.slice(0, end)];
  }
  function collectHeadings(text) {
    return collectMatches(text, /^#{1,6}\s+.+$/gm, 200);
  }
  function collectTableRows(text) {
    return collectMatches(text, /^\s*\|.*\|\s*$/gm, 200);
  }
  function collectMathBlocks(text) {
    return collectMatches(text, /\$\$[\s\S]*?\$\$/g, 50).concat(collectMatches(text, /\\\[[\s\S]*?\\\]/g, 50));
  }
  function collectInlineMath(text) {
    return collectMatches(text, /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g, 50);
  }
  function collectLatexBlocks(text) {
    return collectMatches(text, /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, 50);
  }
  function collectVersions(text) {
    return collectMatches(text, /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, 100);
  }
  function collectConstCase(text) {
    return collectMatches(text, /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, 200);
  }
  function validateCompression(original, compressed) {
    const errors = [];
    const warnings = [];
    if (typeof original !== "string" || typeof compressed !== "string") {
      return { valid: false, errors: ["validation received non-string input"], warnings };
    }
    if (original.length > 0 && compressed.trim().length === 0) {
      errors.push("compressed text is empty");
    }
    requireExactPresence("fenced code block", findFencedCodeBlocks(original), compressed, errors);
    requireExactPresence("inline code", collectInlineCode(original), compressed, errors);
    requireExactPresence("URL", collectUrls(original), compressed, errors);
    requireExactPresence("markdown link", collectMarkdownLinks(original), compressed, errors);
    requireExactPresence("frontmatter", collectFrontmatter(original), compressed, errors);
    requireExactPresence("heading", collectHeadings(original), compressed, errors);
    requireExactPresence("table row", collectTableRows(original), compressed, errors);
    requireExactPresence("math block", collectMathBlocks(original), compressed, errors);
    requireExactPresence("inline math", collectInlineMath(original), compressed, errors);
    requireExactPresence("LaTeX block", collectLatexBlocks(original), compressed, errors);
    requireExactPresence("version", collectVersions(original), compressed, errors);
    requireExactPresence("CONST_CASE", collectConstCase(original), compressed, errors);
    const originalFenceCount = findFencedCodeBlocks(original).length;
    const compressedFenceCount = findFencedCodeBlocks(compressed).length;
    if (compressedFenceCount < originalFenceCount) {
      errors.push("fenced code block count dropped: " + originalFenceCount + " -> " + compressedFenceCount);
    }
    if (compressed.length > original.length) {
      warnings.push("compressed text is longer than original");
    }
    return { valid: errors.length === 0, errors, warnings };
  }
  function isCodeLikeLine(rawLine) {
    const line = rawLine.replace(/^\s+/, "");
    return line.startsWith("import ") || line.startsWith("export ") || line.startsWith("function ") || line.startsWith("class ") || line.startsWith("const ") || line.startsWith("let ") || line.startsWith("var ") || line.startsWith("return ") || line.startsWith("if(") || line.startsWith("if (") || line.startsWith("for(") || line.startsWith("for (") || line.startsWith("while(") || line.startsWith("while (");
  }
  function isCodeDominantText(text) {
    const lines = text.split(`
`).filter((line) => line.trim().length > 0);
    if (lines.length < 3)
      return false;
    let codeLikeCount = 0;
    for (const line of lines)
      if (isCodeLikeLine(line))
        codeLikeCount++;
    return codeLikeCount / lines.length >= 0.3;
  }
  function recapitalizeSentences(text) {
    return text.replace(/(^|[.!?][ \t]|\n[ \t]*)([a-z])/g, (match, prefix, char) => {
      return prefix + char.toUpperCase();
    });
  }
  function cleanupArtifacts(text) {
    if (!text)
      return "";
    return text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:!?])/g, "$1").replace(/([.!?]){2,}/g, (match) => match[match.length - 1]).replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, `

`).replace(/^\n+/, "").replace(/\n+$/, "").replace(/([。！？；])[，,、]/g, "$1");
  }
  var PROTECTED_STRUCTURE_RE = /```|~~~|`|https?:\/\/|\[[^\]\n]{1,1000}\]\([^)[ \t\n]{1,2000}(?:[ \t]+"[^"]{0,1000}")?\)|^#{1,6}\s+|^[ \t]*\|(?:[^|\n]{0,1000}\|){1,100}[ \t]*$|\$\$|\\\[|\\begin\{|^\s*#(?:set|show|let|import|include)\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b|\$[A-Z_][A-Z0-9_]*\b|\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b|\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?|\b[A-Za-z_$][\w$]*[ \t]*\([^()\n]{0,1000}\)|(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)|\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]{0,1000}/im;
  var PROTECTED_STRUCTURE_PREFILTER_RE = /[`~\[\]\|$#\\/:_()0-9]/;
  function hasProtectedStructure(text) {
    if (!PROTECTED_STRUCTURE_PREFILTER_RE.test(text))
      return false;
    PROTECTED_STRUCTURE_RE.lastIndex = 0;
    return PROTECTED_STRUCTURE_RE.test(text);
  }
  function compileUserPreservePatterns(patterns) {
    const compiled = [];
    const warnings = [];
    if (!patterns || patterns.length === 0)
      return { patterns: compiled, warnings };
    for (const pattern of patterns) {
      try {
        compiled.push(new RegExp(pattern, "g"));
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        warnings.push("Invalid preservePatterns regex ignored: " + pattern + " (" + message + ")");
      }
    }
    return { patterns: compiled, warnings };
  }
  function normalizeRole(role) {
    if (role === "system" || role === "developer")
      return "system";
    if (role === "user")
      return "user";
    if (role === "assistant" || role === "model")
      return "assistant";
    return "other";
  }
  function resolveConfig(cfg) {
    const raw = cfg || {};
    const config = {
      compressRoles: DEFAULT_CAVEMAN_CONFIG.compressRoles.slice(),
      skipRules: [],
      minMessageLength: DEFAULT_CAVEMAN_CONFIG.minMessageLength,
      preservePatterns: DEFAULT_CAVEMAN_CONFIG.preservePatterns.slice(),
      intensity: DEFAULT_CAVEMAN_CONFIG.intensity,
      language: DEFAULT_CAVEMAN_CONFIG.language,
      autoDetectLanguage: DEFAULT_CAVEMAN_CONFIG.autoDetectLanguage,
      groups: DEFAULT_CAVEMAN_CONFIG.groups.slice()
    };
    if (Array.isArray(raw.compressRoles)) {
      const roles = [];
      for (const role of raw.compressRoles) {
        const normalized = normalizeRole(role);
        if (normalized !== "other" && roles.indexOf(normalized) === -1)
          roles.push(normalized);
      }
      if (roles.length > 0)
        config.compressRoles = roles;
    }
    if (Array.isArray(raw.skipRules))
      config.skipRules = raw.skipRules.slice();
    if (typeof raw.minMessageLength === "number" && raw.minMessageLength >= 0) {
      config.minMessageLength = raw.minMessageLength;
    }
    if (raw.preserveCode === false) {
      config.preservePatterns = [];
    } else if (Array.isArray(raw.preservePatterns) && raw.preservePatterns.length > 0) {
      config.preservePatterns = raw.preservePatterns.slice();
    }
    if (raw.intensity === "lite" || raw.intensity === "full" || raw.intensity === "ultra") {
      config.intensity = raw.intensity;
    }
    const requestedLanguage = typeof raw.lang === "string" ? raw.lang : raw.language;
    if (typeof requestedLanguage === "string" && requestedLanguage.length > 0 && requestedLanguage !== "auto") {
      config.language = requestedLanguage;
      config.autoDetectLanguage = false;
    }
    if (Array.isArray(raw.groups))
      config.groups = raw.groups.slice();
    return config;
  }
  function pickLanguage(text, config) {
    const detected = config.autoDetectLanguage ? detectCompressionLanguage(text) : config.language || "en";
    if (config.autoDetectLanguage)
      return detected;
    const allowed = config.language ? [config.language] : [];
    if (allowed.indexOf(detected) !== -1)
      return detected;
    return "en";
  }
  function compressText(textPart, role, config) {
    const result = {
      text: textPart,
      appliedRules: [],
      warnings: [],
      fallback: false,
      preservedBlocks: 0,
      language: config.language || "en"
    };
    if (typeof textPart !== "string" || textPart.length === 0)
      return result;
    if (textPart.length < config.minMessageLength)
      return result;
    const customPreservation = compileUserPreservePatterns(config.preservePatterns);
    if (customPreservation.warnings.length > 0)
      result.warnings = result.warnings.concat(customPreservation.warnings);
    const shouldExtract = customPreservation.patterns.length > 0 || hasProtectedStructure(textPart);
    const extracted = shouldExtract ? extractPreservedBlocks2(textPart, { preservePatterns: customPreservation.patterns }) : { text: textPart, blocks: [] };
    result.preservedBlocks = extracted.blocks.length;
    const language = pickLanguage(textPart, config);
    result.language = language;
    const rules = getRulesForContext(role === "other" ? "all" : role, config.intensity, language, {
      groups: config.groups
    }).filter((rule) => config.skipRules.indexOf(rule.name) === -1);
    if (rules.length === 0)
      return result;
    const applied = applyRulesToText(extracted.text, rules);
    let next = applied.text;
    if (!isCodeDominantText(extracted.text)) {
      next = cleanupArtifacts(next);
      if (next.length > 0 && !isCodeDominantText(next))
        next = recapitalizeSentences(next);
    }
    const restored = restorePreservedBlocks(next, extracted.blocks);
    if (shouldExtract) {
      const validation = validateCompression(textPart, restored);
      if (!validation.valid) {
        result.text = textPart;
        result.appliedRules = [];
        result.fallback = true;
        result.warnings = result.warnings.concat(validation.errors);
        return result;
      }
      if (validation.warnings.length > 0)
        result.warnings = result.warnings.concat(validation.warnings);
    }
    result.text = restored;
    result.appliedRules = applied.appliedRules;
    return result;
  }
  function apply8(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const protocol = ctx && ctx.protocol ? ctx.protocol : "chat";
      const config = resolveConfig(cfg);
      if (config.compressRoles.length === 0)
        return false;
      const view = conversationView(body, protocol);
      if (!view || !view.segments || view.segments.length === 0)
        return false;
      resetRuleCompileWarnings();
      let changed = false;
      for (const segment of view.segments) {
        if (!segment || typeof segment.text !== "string" || segment.text.length === 0)
          continue;
        if (segment.toolOutput)
          continue;
        const role = normalizeRole(segment.role);
        if (config.compressRoles.indexOf(role) === -1)
          continue;
        const out = compressText(segment.text, role, config);
        if (typeof out.text === "string" && out.text !== segment.text) {
          segment.set(out.text);
          changed = true;
        }
      }
      ruleCompileWarningCount();
      return changed;
    } catch {
      return false;
    }
  }

  // engines/aggressive.js
  var exports_aggressive = {};
  __export(exports_aggressive, {
    apply: () => apply9,
    available: () => available4,
    cacheImpact: () => cacheImpact4,
    compressToolResult: () => compressToolResult,
    configSchema: () => configSchema4,
    defaultOn: () => defaultOn9,
    id: () => id9,
    isCodeLikeLine: () => isCodeLikeLine2,
    isSingleMode: () => isSingleMode4,
    label: () => label4,
    levels: () => levels4,
    lossy: () => lossy4,
    stackPriority: () => stackPriority4,
    summarizeText: () => summarizeText,
    why: () => why4
  });
  var id9 = "aggressive";
  var label4 = "Aggressive";
  var why4 = "把较早的对话轮次摘要化并逐步老化，只保留最近的细节（约 50%）。";
  var lossy4 = true;
  var cacheImpact4 = "high";
  var defaultOn9 = false;
  var stackPriority4 = 30;
  var isSingleMode4 = false;
  var levels4 = undefined;
  var available4 = true;
  var configSchema4 = [
    {
      key: "keepTurns",
      type: "number",
      label: "保留最近轮次",
      description: "最近这么多轮对话原样保留",
      defaultValue: 4,
      min: 1,
      max: 30
    },
    {
      key: "summaryChars",
      type: "number",
      label: "摘要长度",
      description: "每段被摘要化内容的字符上限",
      defaultValue: 400,
      min: 80,
      max: 4000
    }
  ];
  var COMPRESSED_MARKER_RE = /^\[COMPRESSED:/;
  var INTENT_TRIGGERS = /^(?:request|fix|implement|add|remove|update|refactor|create|delete|change|build)\s*:/i;
  var FILE_EXTENSIONS = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "py",
    "md",
    "json",
    "sql",
    "css",
    "html",
    "yaml",
    "yml",
    "sh",
    "rb",
    "go",
    "rs",
    "java",
    "c",
    "cpp",
    "h",
    "hpp"
  ]);
  var ANSI_RE_G = /\x1b\[[0-9;]*[a-zA-Z]/g;
  var ANSI_TEST_RE = /\x1b\[[0-9;]*[a-zA-Z]/;
  var SHELL_PROMPT_RE = /\$\s/;
  var JSON_PREFIX_RE = /^\s*[{[]/;
  var DEFAULT_KEEP_TURNS = 4;
  var DEFAULT_SUMMARY_CHARS = 400;
  var SUMMARY_MAX_LEN_FLOOR = 80;
  var SUMMARY_MAX_LEN_CEIL = 4000;
  var OVERSIZED_FACTOR = 4;
  function estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
  function clampInt(value, fallback, min, max) {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
    if (n < min)
      return min;
    if (n > max)
      return max;
    return n;
  }
  function stripTokenPunctuation(token) {
    let start = 0;
    let end = token.length;
    const leading = new Set(["'", '"', "`", "(", "[", "{"]);
    const trailing = new Set(["'", '"', "`", ")", "]", "}", ",", ";", ":"]);
    while (start < end && leading.has(token[start]))
      start++;
    while (end > start && trailing.has(token[end - 1]))
      end--;
    return token.slice(start, end);
  }
  function getKnownFilePathToken(token) {
    const clean = stripTokenPunctuation(token);
    const lastDot = clean.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === clean.length - 1)
      return null;
    const extension = clean.slice(lastDot + 1).toLowerCase();
    if (!FILE_EXTENSIONS.has(extension))
      return null;
    if (!clean.includes("/") && !clean.includes("."))
      return null;
    return clean;
  }
  function extractFilePathTokens(text) {
    const paths = [];
    for (const token of text.split(/\s+/)) {
      const filePath = getKnownFilePathToken(token);
      if (filePath)
        paths.push(filePath);
    }
    return paths;
  }
  function extractErrorSnippets(text) {
    const snippets = [];
    for (const segment of text.split(/[.\n]/)) {
      const trimmed = segment.trim();
      if (!trimmed)
        continue;
      const lower = trimmed.toLowerCase();
      if (trimmed.includes("TypeError:") || trimmed.includes("ReferenceError:") || trimmed.includes("SyntaxError:") || trimmed.includes("RangeError:") || trimmed.includes("URIError:") || trimmed.includes("EvalError:") || trimmed.includes("Error:") || trimmed.includes("Exception:") || lower.includes("error ts")) {
        snippets.push(trimmed);
      }
    }
    return snippets;
  }
  function extractIntents(entries) {
    const intents = [];
    for (const entry of entries) {
      if (entry.role !== "user")
        continue;
      const text = entry.text;
      if (!text)
        continue;
      const firstLine = text.split(`
`)[0] ? text.split(`
`)[0].trim() : "";
      if (firstLine && INTENT_TRIGGERS.test(firstLine)) {
        intents.push(firstLine.slice(0, 120));
      } else if (intents.length === 0 && firstLine) {
        intents.push(firstLine.slice(0, 120));
      }
    }
    return intents;
  }
  function extractFilePaths(entries) {
    const paths = new Set;
    for (const entry of entries) {
      if (!entry.text)
        continue;
      for (const match of extractFilePathTokens(entry.text))
        paths.add(match);
    }
    return [...paths].slice(0, 20);
  }
  function extractErrors(entries) {
    const errors = [];
    for (const entry of entries) {
      if (!entry.text)
        continue;
      for (const match of extractErrorSnippets(entry.text))
        errors.push(match.slice(0, 150));
    }
    return errors.slice(0, 10);
  }
  function extractLastDecision(entries) {
    for (let i = entries.length - 1;i >= 0; i--) {
      if (entries[i].role === "assistant" && entries[i].text)
        return entries[i].text;
    }
    return "";
  }
  function trimCodeFences(text) {
    let output = "";
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf("```", cursor);
      if (start === -1) {
        output += text.slice(cursor);
        break;
      }
      const openingLineEnd = text.indexOf(`
`, start + 3);
      if (openingLineEnd === -1) {
        output += text.slice(cursor);
        break;
      }
      const closeStart = text.indexOf("\n```", openingLineEnd + 1);
      if (closeStart === -1) {
        output += text.slice(cursor);
        break;
      }
      const closeEnd = closeStart + 4;
      const opening = text.slice(start, openingLineEnd);
      const code = text.slice(openingLineEnd + 1, closeStart);
      const lines = code.split(`
`);
      output += text.slice(cursor, start);
      if (lines.length <= 4) {
        output += text.slice(start, closeEnd);
      } else {
        const head = lines.slice(0, 3).join(`
`);
        const tail = lines[lines.length - 1];
        output += opening + `
` + head + `
…
` + tail + "\n```";
      }
      cursor = closeEnd;
    }
    return output;
  }
  function summarizeText(entries, opts) {
    const maxLen = opts && Number.isFinite(opts.maxLen) ? opts.maxLen : 2000;
    const preserveCode = !opts || opts.preserveCode !== false;
    const filtered = entries.filter((e) => e && typeof e.text === "string" && e.text.trim().length > 0 && !COMPRESSED_MARKER_RE.test(e.text));
    if (filtered.length === 0)
      return "";
    const intents = extractIntents(filtered);
    const files = extractFilePaths(filtered);
    const errors = extractErrors(filtered);
    const decision = extractLastDecision(filtered);
    const parts = ["[COMPRESSED:summary]"];
    if (intents.length > 0)
      parts.push("Intents: " + intents.join("; ") + ".");
    if (files.length > 0)
      parts.push("Files touched: " + files.join(", ") + ".");
    if (errors.length > 0)
      parts.push("Errors: " + errors.join("; ") + ".");
    if (decision) {
      const processed = preserveCode ? trimCodeFences(decision) : decision;
      parts.push("Last decision: " + processed.slice(0, maxLen));
    }
    return parts.join(`
`);
  }
  function isCodeLikeLine2(rawLine) {
    const line = rawLine.trimStart();
    return line.startsWith("import ") || line.startsWith("export ") || line.startsWith("function ") || line.startsWith("class ") || line.startsWith("const ") || line.startsWith("let ") || line.startsWith("var ") || line.startsWith("return ") || line.startsWith("if(") || line.startsWith("if (") || line.startsWith("for(") || line.startsWith("for (") || line.startsWith("while(") || line.startsWith("while (");
  }
  function parseGrepLinePath(line) {
    const firstColon = line.indexOf(":");
    if (firstColon <= 0)
      return null;
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1)
      return null;
    const lineNumber = line.slice(firstColon + 1, secondColon);
    if (!lineNumber)
      return null;
    for (const char of lineNumber) {
      if (char < "0" || char > "9")
        return null;
    }
    const filePath = line.slice(0, firstColon);
    if (!filePath || /\s/.test(filePath))
      return null;
    return filePath;
  }
  function hasErrorLikeOutput(content) {
    const lower = content.toLowerCase();
    return lower.includes("error:") || lower.includes("error ") || lower.includes("[error]") || lower.includes("exception ") || lower.includes("[exception]") || lower.includes("traceback");
  }
  function compressFileContent(content) {
    const lines = content.split(`
`);
    if (lines.length < 3)
      return null;
    if (!lines.some(isCodeLikeLine2))
      return null;
    const keep = 20;
    const tail = 5;
    if (lines.length <= keep + tail)
      return content;
    const head = lines.slice(0, keep).join(`
`);
    const tailLines = lines.slice(-tail).join(`
`);
    const elided = lines.length - keep - tail;
    return head + `
… [` + elided + ` lines elided] …
` + tailLines;
  }
  function compressGrepSearch(content) {
    const lines = content.split(`
`);
    const grepLines = lines.filter((line) => parseGrepLinePath(line) !== null);
    if (grepLines.length === 0)
      return null;
    const paths = new Set;
    for (const line of grepLines) {
      const filePath = parseGrepLinePath(line);
      if (filePath)
        paths.add(filePath);
    }
    const top30 = grepLines.slice(0, 30);
    const remaining = grepLines.length - top30.length;
    let result = top30.join(`
`);
    if (remaining > 0)
      result += `
… [` + remaining + " more matches]";
    result += `
Files: ` + [...paths].join(", ");
    return result;
  }
  function compressShellOutput(content) {
    const hasAnsi = ANSI_TEST_RE.test(content);
    const hasPrompt = SHELL_PROMPT_RE.test(content);
    if (!hasAnsi && !hasPrompt)
      return null;
    const cleaned = content.replace(ANSI_RE_G, "");
    const lines = cleaned.split(`
`);
    const last50 = lines.slice(-50);
    const deduped = [];
    for (const line of last50) {
      if (deduped.length === 0 || line !== deduped[deduped.length - 1])
        deduped.push(line);
    }
    return deduped.join(`
`);
  }
  function compressJson(content) {
    if (content.length <= 2000)
      return null;
    if (!JSON_PREFIX_RE.test(content))
      return null;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
    if (Array.isArray(parsed)) {
      if (parsed.length <= 7)
        return content;
      return JSON.stringify({ type: "array", total: parsed.length, first5: parsed.slice(0, 5), last2: parsed.slice(-2) }, null, 2);
    }
    if (typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed);
      const summary = {};
      for (const key of keys.slice(0, 20)) {
        const val = parsed[key];
        if (typeof val === "object" && val !== null) {
          summary[key] = "{…" + Object.keys(val).length + " keys}";
        } else {
          summary[key] = val;
        }
      }
      if (keys.length > 20)
        summary["_remaining_" + (keys.length - 20) + "_keys"] = true;
      return JSON.stringify(summary, null, 2);
    }
    return null;
  }
  function compressErrorMessage(content) {
    if (!hasErrorLikeOutput(content))
      return null;
    const lines = content.split(`
`);
    const errorLine = lines[0] || "";
    const stackLines = lines.slice(1);
    const head = stackLines.slice(0, 10);
    const tail = stackLines.length > 10 ? stackLines.slice(-3) : [];
    const middle = stackLines.length > 13 ? ["… [" + (stackLines.length - 13) + " frames elided] …"] : [];
    return [errorLine, ...head, ...middle, ...tail].join(`
`);
  }
  var TOOL_STRATEGIES = {
    fileContent: true,
    grepSearch: true,
    shellOutput: true,
    json: true,
    errorMessage: true
  };
  function compressToolResult(content) {
    const strategies = [
      ["fileContent", compressFileContent],
      ["grepSearch", compressGrepSearch],
      ["shellOutput", compressShellOutput],
      ["json", compressJson],
      ["errorMessage", compressErrorMessage]
    ];
    for (const [name, fn] of strategies) {
      if (!TOOL_STRATEGIES[name])
        continue;
      const result = fn(content);
      if (result === null)
        continue;
      return {
        compressed: result,
        strategy: name,
        saved: estimateTokens(content) - estimateTokens(result)
      };
    }
    return { compressed: content, strategy: "none", saved: 0 };
  }
  function isPureJson(text) {
    const t = text.trim();
    if (!t)
      return false;
    const first = t[0];
    if (first !== "{" && first !== "[")
      return false;
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  }
  function isFencedBlock(text) {
    const t = text.trim();
    return t.length >= 6 && t.startsWith("```") && t.endsWith("```");
  }
  function firstLineOf(text) {
    const line = text.split(`
`)[0];
    return line ? line.trim() : "";
  }
  function agingTier(distance, keepTurns) {
    if (distance <= keepTurns)
      return "verbatim";
    if (distance <= keepTurns + 2)
      return "light";
    if (distance <= keepTurns + 4)
      return "moderate";
    return "fullSummary";
  }
  function tagAged(tier, compressed) {
    return "[COMPRESSED:aging:" + tier + "] " + compressed;
  }
  function liteCondense(role, text) {
    const r = applyLiteCompression({ messages: [{ role, content: text }] }, { compressToolResults: true });
    if (!r || !r.compressed)
      return null;
    const next = r.body && r.body.messages && r.body.messages[0] && r.body.messages[0].content;
    if (typeof next !== "string" || next.length === 0)
      return null;
    return next;
  }
  function ageText(role, text, tier, summaryChars) {
    if (tier === "light") {
      const condensed = liteCondense(role, text);
      if (condensed === null || condensed.length >= text.length)
        return null;
      return tagAged("light", condensed);
    }
    if (tier === "moderate") {
      const summary = summarizeText([{ role, text }], { maxLen: summaryChars, preserveCode: true });
      if (!summary)
        return null;
      const next = tagAged("moderate", summary);
      return next.length < text.length ? next : null;
    }
    if (role === "user") {
      const firstLine = firstLineOf(text);
      if (!firstLine || firstLine.length >= text.length)
        return null;
      return tagAged("fullSummary", firstLine.slice(0, 120));
    }
    const summary = summarizeText([{ role, text }], { maxLen: summaryChars, preserveCode: true });
    if (!summary)
      return null;
    const next = tagAged("fullSummary", summary);
    return next.length < text.length ? next : null;
  }
  function apply9(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const keepTurns = clampInt(cfg ? cfg.keepTurns : undefined, DEFAULT_KEEP_TURNS, 1, 30);
      const summaryChars = clampInt(cfg ? cfg.summaryChars : undefined, DEFAULT_SUMMARY_CHARS, SUMMARY_MAX_LEN_FLOOR, SUMMARY_MAX_LEN_CEIL);
      const view = conversationView(body, ctx && ctx.protocol);
      if (!view)
        return false;
      const segments = view.segments;
      if (!Array.isArray(segments) || segments.length === 0)
        return false;
      let lastUserIdx = -1;
      for (let i = segments.length - 1;i >= 0; i--) {
        if (segments[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      const total = segments.length;
      const touched = new Set;
      let changed = false;
      for (let i = 0;i < total; i++) {
        const seg = segments[i];
        if (seg.role === "system")
          continue;
        if (!seg.toolOutput)
          continue;
        try {
          const text = seg.text;
          if (!text || COMPRESSED_MARKER_RE.test(text))
            continue;
          if (isPureJson(text) || isFencedBlock(text))
            continue;
          const result = compressToolResult(text);
          if (result.strategy === "none" || result.saved <= 0)
            continue;
          if (result.compressed.length >= text.length)
            continue;
          seg.set(result.compressed);
          touched.add(i);
          changed = true;
        } catch {}
      }
      for (let i = 0;i < total; i++) {
        if (touched.has(i))
          continue;
        const seg = segments[i];
        try {
          if (seg.role === "system")
            continue;
          if (i === lastUserIdx)
            continue;
          const text = seg.text;
          if (!text || COMPRESSED_MARKER_RE.test(text))
            continue;
          if (isPureJson(text) || isFencedBlock(text))
            continue;
          const distance = total - 1 - i;
          const tier = agingTier(distance, keepTurns);
          if (tier === "verbatim")
            continue;
          const next = ageText(seg.role, text, tier, summaryChars);
          if (!next || next.length >= text.length)
            continue;
          seg.set(next);
          touched.add(i);
          changed = true;
        } catch {}
      }
      const oversizedFloor = summaryChars * OVERSIZED_FACTOR;
      for (let i = 0;i < total; i++) {
        if (touched.has(i))
          continue;
        const seg = segments[i];
        try {
          if (seg.role === "system")
            continue;
          if (i === lastUserIdx)
            continue;
          const text = seg.text;
          if (!text || text.length <= oversizedFloor)
            continue;
          if (COMPRESSED_MARKER_RE.test(text))
            continue;
          if (isPureJson(text) || isFencedBlock(text))
            continue;
          const summary = summarizeText([{ role: seg.role, text }], {
            maxLen: summaryChars,
            preserveCode: true
          });
          if (!summary || summary.length >= text.length)
            continue;
          seg.set(summary);
          changed = true;
        } catch {}
      }
      return changed;
    } catch {
      return false;
    }
  }

  // engines/ionizer.js
  var exports_ionizer = {};
  __export(exports_ionizer, {
    DEFAULT_TARGET_ROWS: () => DEFAULT_TARGET_ROWS,
    DEFAULT_THRESHOLD: () => DEFAULT_THRESHOLD,
    FIRST_K: () => FIRST_K,
    LAST_K: () => LAST_K,
    MAX_IONIZER_ROWS: () => MAX_IONIZER_ROWS,
    apply: () => apply10,
    available: () => available5,
    cacheImpact: () => cacheImpact5,
    configSchema: () => configSchema5,
    defaultOn: () => defaultOn10,
    fnv1a: () => fnv1a2,
    id: () => id10,
    ionize: () => ionize,
    ionizeSegmentText: () => ionizeSegmentText,
    isErrorRow: () => isErrorRow,
    isSingleMode: () => isSingleMode5,
    label: () => label5,
    levels: () => levels5,
    lossy: () => lossy5,
    mulberry32: () => mulberry32,
    sampling: () => sampling,
    schemaUnion: () => schemaUnion,
    seededSample: () => seededSample,
    stackPriority: () => stackPriority5,
    why: () => why5
  });
  var id10 = "ionizer";
  var label5 = "Ionizer";
  var why5 = "按采样策略丢掉低信息量的片段，保留骨架与关键事实（故意有损）。";
  var lossy5 = true;
  var cacheImpact5 = "high";
  var defaultOn10 = false;
  var stackPriority5 = 13;
  var isSingleMode5 = false;
  var levels5 = undefined;
  var available5 = true;
  var sampling = true;
  var configSchema5 = [
    {
      key: "sampleRate",
      type: "number",
      label: "采样率",
      description: "保留多少比例的片段",
      defaultValue: 0.4,
      min: 0.1,
      max: 0.9
    }
  ];
  var MAX_IONIZER_ROWS = 1e5;
  var DEFAULT_THRESHOLD = 200;
  var DEFAULT_TARGET_ROWS = 50;
  var FIRST_K = 3;
  var LAST_K = 3;
  var MIN_SAMPLE_RATE = 0.1;
  var MAX_SAMPLE_RATE = 0.9;
  var DEFAULT_SAMPLE_RATE = 0.4;
  var ERROR_KEY_RE = /error|fail|exception|stderr|denied/i;
  function fnv1a2(s) {
    let h = 2166136261;
    for (let i = 0;i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function schemaUnion(rows) {
    const seen = new Set;
    const keys = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
    return keys;
  }
  function isErrorRow(row) {
    for (const key of Object.keys(row)) {
      if (ERROR_KEY_RE.test(key)) {
        const value = row[key];
        if (value !== null && value !== undefined && value !== false && value !== 0 && value !== "") {
          return true;
        }
      }
    }
    for (const key of ["status", "statusCode", "code"]) {
      const value = row[key];
      if (typeof value === "number" && value >= 400 && value <= 599)
        return true;
    }
    return false;
  }
  function seededSample(pool, k, seed) {
    if (k >= pool.length)
      return pool.slice();
    const idx = [];
    for (let i = 0;i < pool.length; i++)
      idx.push(i);
    const rand = mulberry32(seed);
    for (let i = 0;i < k; i++) {
      const j = i + Math.floor(rand() * (idx.length - i));
      const tmp = idx[i];
      idx[i] = idx[j];
      idx[j] = tmp;
    }
    return idx.slice(0, k).sort((a, b) => a - b).map((i) => pool[i]);
  }
  function ionize(rows, opts) {
    const n = rows.length;
    const targetRows = opts.targetRows;
    if (n <= targetRows) {
      return { kept: rows.slice(), keptCount: n, totalCount: n };
    }
    const keep = new Set;
    const seenKeys = new Set;
    for (let i = 0;i < n; i++) {
      let novel = false;
      for (const key of Object.keys(rows[i])) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          novel = true;
        }
      }
      if (novel)
        keep.add(i);
    }
    for (let i = 0;i < n; i++)
      if (isErrorRow(rows[i]))
        keep.add(i);
    for (let i = 0;i < Math.min(opts.firstK, n); i++)
      keep.add(i);
    for (let i = Math.max(0, n - opts.lastK);i < n; i++)
      keep.add(i);
    if (keep.size < targetRows) {
      const middle = [];
      for (let i = 0;i < n; i++)
        if (!keep.has(i))
          middle.push(i);
      const need = targetRows - keep.size;
      for (const idx of seededSample(middle, need, opts.seed))
        keep.add(idx);
    }
    const keptIdx = [...keep].sort((a, b) => a - b);
    return { kept: keptIdx.map((i) => rows[i]), keptCount: keptIdx.length, totalCount: n };
  }
  function isPlainObjectArray(value) {
    if (!Array.isArray(value))
      return false;
    for (const el of value) {
      if (el === null || typeof el !== "object" || Array.isArray(el))
        return false;
    }
    return true;
  }
  function clampSampleRate(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
      return DEFAULT_SAMPLE_RATE;
    if (value < MIN_SAMPLE_RATE)
      return MIN_SAMPLE_RATE;
    if (value > MAX_SAMPLE_RATE)
      return MAX_SAMPLE_RATE;
    return value;
  }
  function ionizeSegmentText(text, sampleRate) {
    const trimmed = text.trimStart();
    if (trimmed.length === 0 || trimmed.charCodeAt(0) !== 91)
      return null;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!Array.isArray(parsed))
      return null;
    if (parsed.length <= DEFAULT_THRESHOLD)
      return null;
    if (parsed.length > MAX_IONIZER_ROWS)
      return null;
    if (!isPlainObjectArray(parsed))
      return null;
    const total = parsed.length;
    const targetRows = Math.min(total, Math.max(1, Math.round(total * clampSampleRate(sampleRate))));
    const res = ionize(parsed, {
      targetRows,
      firstK: FIRST_K,
      lastK: LAST_K,
      seed: fnv1a2(text)
    });
    if (res.keptCount >= res.totalCount)
      return null;
    const marker = "[ionizer: kept " + res.keptCount + "/" + res.totalCount + " rows; lossy sample — original rows dropped (no CCR backend) chars=" + text.length + "]";
    const newContent = JSON.stringify(res.kept) + `
` + marker;
    if (newContent.length >= text.length)
      return null;
    return newContent;
  }
  function apply10(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const sampleRate = clampSampleRate(cfg ? cfg.sampleRate : undefined);
      const view = conversationView(body, ctx && ctx.protocol);
      if (!view)
        return false;
      const segments = view.segments;
      if (!Array.isArray(segments) || segments.length === 0)
        return false;
      let changed = false;
      for (const seg of segments) {
        try {
          if (seg.role === "system")
            continue;
          const text = seg.text;
          if (typeof text !== "string" || text.length === 0)
            continue;
          const next = ionizeSegmentText(text, sampleRate);
          if (next === null)
            continue;
          seg.set(next);
          changed = true;
        } catch {}
      }
      return changed;
    } catch {
      return false;
    }
  }

  // engines/llm.js
  var exports_llm = {};
  __export(exports_llm, {
    apply: () => apply11,
    applyAsync: () => applyAsync,
    available: () => available6,
    cacheImpact: () => cacheImpact6,
    configSchema: () => configSchema6,
    defaultOn: () => defaultOn11,
    extractPreservedBlocks: () => extractPreservedBlocks3,
    findFencedCodeBlocks: () => findFencedCodeBlocks2,
    getLlmCompressorBackend: () => getLlmCompressorBackend,
    hasLlmCompressorBackend: () => hasLlmCompressorBackend,
    id: () => id11,
    isSingleMode: () => isSingleMode6,
    label: () => label6,
    levels: () => levels6,
    lossy: () => lossy6,
    restorePreservedBlocks: () => restorePreservedBlocks2,
    setLlmCompressorBackend: () => setLlmCompressorBackend,
    stackPriority: () => stackPriority6,
    why: () => why6
  });
  var id11 = "llm";
  var label6 = "LLM Compressor";
  var why6 = "用一个 LLM 压缩散文（需要外部模型后端，本插件内无法提供，因此默认不可用）。";
  var lossy6 = true;
  var cacheImpact6 = "high";
  var defaultOn11 = false;
  var stackPriority6 = 38;
  var isSingleMode6 = false;
  var levels6 = undefined;
  var available6 = false;
  var configSchema6 = [
    {
      key: "maxChars",
      type: "number",
      label: "单段上限",
      description: "交给后端压缩的文本长度上限",
      defaultValue: 4000,
      min: 500,
      max: 20000
    }
  ];
  var noopBackend = async (text) => text;
  var _backend = null;
  function setLlmCompressorBackend(b) {
    _backend = typeof b === "function" ? b : null;
  }
  function getLlmCompressorBackend() {
    return _backend;
  }
  function hasLlmCompressorBackend() {
    return _backend !== null;
  }
  function resolveBackend() {
    return _backend === null ? noopBackend : _backend;
  }
  var DEFAULT_MIN_TOKENS = 2000;
  var DEFAULT_COMPRESSION_RATE = 0.5;
  var DEFAULT_MAX_CHARS = 4000;
  var MAX_CHARS_FLOOR = 500;
  var MAX_CHARS_CEIL = 20000;
  function estimateTokens2(text) {
    return Math.ceil(text.length / 4);
  }
  function clampInt2(value, fallback, min, max) {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
    if (n < min)
      return min;
    if (n > max)
      return max;
    return n;
  }
  var SENTINEL_PREFIX3 = "\x00MAGPIE_LLM";
  var sentinelCounter = 0;
  function nextSentinelSeed() {
    sentinelCounter = sentinelCounter + 1 >>> 0;
    return "d" + sentinelCounter;
  }
  function ensureGlobal3(pattern) {
    const flags = pattern.flags.indexOf("g") === -1 ? pattern.flags + "g" : pattern.flags;
    return new RegExp(pattern.source, flags);
  }
  function replacePattern3(text, pattern, kind, addBlock) {
    pattern.lastIndex = 0;
    return text.replace(pattern, (match) => {
      if (!match)
        return match;
      if (match.indexOf(SENTINEL_PREFIX3) !== -1)
        return match;
      return addBlock(match, kind);
    });
  }
  function extractFrontmatter3(text, addBlock) {
    if (text.indexOf(`---
`) !== 0)
      return text;
    const close = text.indexOf(`
---`, 4);
    if (close === -1)
      return text;
    const closeEnd = text.indexOf(`
`, close + 4);
    const end = closeEnd === -1 ? text.length : closeEnd + 1;
    return addBlock(text.slice(0, end), "frontmatter") + text.slice(end);
  }
  function extractFencedCodeBlocks3(text, addBlock) {
    const lines = text.match(/[^\n]*(?:\n|$)/g) || [text];
    let output = "";
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line === "" && i === lines.length - 1)
        break;
      const opening = line.match(/^([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/);
      if (!opening) {
        output += line;
        i++;
        continue;
      }
      const fence = opening[2];
      const fenceChar = fence[0];
      const minLen = fence.length;
      let block = line;
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        const candidate = lines[j];
        block += candidate;
        const closeMatch = candidate.match(/^([ \t]{0,3})(`{3,}|~{3,})\s*(?:\n|$)/);
        if (closeMatch && closeMatch[2][0] === fenceChar && closeMatch[2].length >= minLen) {
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) {
        output += line;
        i++;
        continue;
      }
      output += addBlock(block, "fenced_code");
      i = j + 1;
    }
    return output;
  }
  var REGION_PATTERNS = [
    { pattern: /<system-reminder>[\s\S]*?<\/system-reminder>/g, kind: "system_instruction" },
    { pattern: /<instructions?>[\s\S]*?<\/instructions?>/g, kind: "system_instruction" },
    {
      pattern: /<project[- ]instructions?>[\s\S]*?<\/project[- ]instructions?>/g,
      kind: "system_instruction"
    }
  ];
  var BUILTIN_PATTERNS2 = [
    { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
    { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
    {
      pattern: /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g,
      kind: "math_inline"
    },
    { pattern: /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, kind: "latex_block" },
    { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
    { pattern: /^\s*\|.*\|\s*$/gm, kind: "markdown_table" },
    { pattern: /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, kind: "markdown_table" },
    { pattern: /^\s*#(?:set|show|let|import|include)\b.+$/gm, kind: "typst_directive" },
    { pattern: /`[^`\n]+`/g, kind: "inline_code" },
    { pattern: /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, kind: "markdown_link" },
    { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/gi, kind: "url" },
    { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
    { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
    { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?/g, kind: "dotted_identifier" },
    { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
    {
      pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g,
      kind: "file_path"
    },
    {
      pattern: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g,
      kind: "error_message"
    }
  ];
  function extractPreservedBlocks3(text) {
    const blocks = [];
    const seed = nextSentinelSeed();
    let counter = 0;
    const addBlock = (content, kind) => {
      const placeholder = SENTINEL_PREFIX3 + "_" + seed + "_" + counter + "\x00";
      blocks.push({ placeholder, content, kind });
      counter++;
      return placeholder;
    };
    let result = text;
    result = extractFrontmatter3(result, addBlock);
    for (const entry of REGION_PATTERNS) {
      result = replacePattern3(result, ensureGlobal3(entry.pattern), entry.kind, addBlock);
    }
    result = extractFencedCodeBlocks3(result, addBlock);
    for (const entry of BUILTIN_PATTERNS2) {
      result = replacePattern3(result, ensureGlobal3(entry.pattern), entry.kind, addBlock);
    }
    return { text: result, blocks };
  }
  function restorePreservedBlocks2(text, blocks) {
    let result = text;
    for (const block of blocks) {
      result = result.split(block.placeholder).join(block.content);
    }
    return result;
  }
  function findFencedCodeBlocks2(text) {
    const found = [];
    extractFencedCodeBlocks3(text, (content) => {
      found.push(content);
      return content;
    });
    return found;
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function splitProseAndPreserved(text) {
    const { text: withPlaceholders, blocks } = extractPreservedBlocks3(text);
    if (blocks.length === 0)
      return [{ kind: "prose", text }];
    const placeholderToOriginal = new Map;
    for (const block of blocks)
      placeholderToOriginal.set(block.placeholder, block.content);
    const escaped = blocks.map((b) => escapeRegExp(b.placeholder));
    const splitRe = new RegExp("(" + escaped.join("|") + ")", "g");
    const segments = [];
    for (const part of withPlaceholders.split(splitRe)) {
      if (!part)
        continue;
      const original = placeholderToOriginal.get(part);
      if (original !== undefined) {
        segments.push({ kind: "preserved", text: original });
      } else {
        segments.push({ kind: "prose", text: part });
      }
    }
    return segments;
  }
  function splitByMaxChars(text, maxChars) {
    if (maxChars <= 0 || text.length <= maxChars)
      return [text];
    const chunks = [];
    let rest = text;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(`
`, maxChars);
      if (cut <= 0)
        cut = maxChars;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest.length > 0)
      chunks.push(rest);
    return chunks;
  }
  async function compressProseText(text, backend, opts) {
    if (!text.trim())
      return { text, didCompress: false };
    try {
      const compressed = await backend(text, opts);
      if (typeof compressed === "string" && compressed.length < text.length) {
        return { text: compressed, didCompress: true };
      }
      return { text, didCompress: false };
    } catch {
      return { text, didCompress: false };
    }
  }
  async function compressMessageText(text, backend, opts, maxChars) {
    const segments = splitProseAndPreserved(text);
    let anyCompressed = false;
    const parts = [];
    for (const seg of segments) {
      if (seg.kind === "preserved") {
        parts.push(seg.text);
        continue;
      }
      let proseOut = "";
      for (const chunk of splitByMaxChars(seg.text, maxChars)) {
        const r = await compressProseText(chunk, backend, opts);
        proseOut += r.text;
        if (r.didCompress)
          anyCompressed = true;
      }
      parts.push(proseOut);
    }
    return { text: parts.join(""), didCompress: anyCompressed };
  }
  function apply11(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      if (_backend === null)
        return false;
      return false;
    } catch {
      return false;
    }
  }
  async function applyAsync(body, ctx, cfg) {
    const untouched = { body, compressed: false, stats: null };
    try {
      if (!body || typeof body !== "object")
        return untouched;
      if (_backend === null)
        return untouched;
      const view = conversationView(body, ctx && ctx.protocol);
      if (!view)
        return untouched;
      const segments = view.segments;
      if (!Array.isArray(segments) || segments.length === 0)
        return untouched;
      const maxChars = clampInt2(cfg ? cfg.maxChars : undefined, DEFAULT_MAX_CHARS, MAX_CHARS_FLOOR, MAX_CHARS_CEIL);
      let nonSystemText = "";
      for (const seg of segments) {
        if (seg.role === "system")
          continue;
        if (typeof seg.text === "string")
          nonSystemText += seg.text + `
`;
      }
      if (DEFAULT_MIN_TOKENS > 0 && estimateTokens2(nonSystemText) < DEFAULT_MIN_TOKENS) {
        return untouched;
      }
      const backend = resolveBackend();
      const backendOpts = { model: undefined, compressionRate: DEFAULT_COMPRESSION_RATE };
      let compressedCount = 0;
      for (const seg of segments) {
        try {
          if (seg.role === "system")
            continue;
          const text = seg.text;
          if (typeof text !== "string" || text.length === 0)
            continue;
          const r = await compressMessageText(text, backend, backendOpts, maxChars);
          if (!r.didCompress)
            continue;
          if (r.text.length >= text.length)
            continue;
          seg.set(r.text);
          compressedCount++;
        } catch {}
      }
      if (compressedCount === 0)
        return untouched;
      return { body, compressed: true, stats: null };
    } catch {
      return untouched;
    }
  }

  // engines/ccr/index.js
  var exports_ccr = {};
  __export(exports_ccr, {
    CCR_PROTOCOL_INSTRUCTION: () => CCR_PROTOCOL_INSTRUCTION,
    CCR_PROTOCOL_MARKER_SENTINEL: () => CCR_PROTOCOL_MARKER_SENTINEL,
    CCR_SCHEMA: () => CCR_SCHEMA,
    ENGINE_ID: () => ENGINE_ID,
    MAX_GREP_MATCHES: () => MAX_GREP_MATCHES,
    MAX_PATTERN_LEN: () => MAX_PATTERN_LEN,
    MAX_RANGE_LINES: () => MAX_RANGE_LINES,
    apply: () => apply12,
    applyCcr: () => applyCcr,
    available: () => available7,
    buildCcrMarker: () => buildCcrMarker2,
    buildCcrReference: () => buildCcrReference,
    buildCcrReplacementText: () => buildCcrReplacementText,
    cacheImpact: () => cacheImpact7,
    callerSupportsCcrRetrieve: () => callerSupportsCcrRetrieve2,
    configSchema: () => configSchema7,
    defaultOn: () => defaultOn12,
    description: () => description3,
    effectiveMinChars: () => effectiveMinChars,
    handleCcrRetrieve: () => handleCcrRetrieve,
    hashContent: () => hashContent,
    id: () => id12,
    injectCcrProtocolInstruction: () => injectCcrProtocolInstruction,
    isSafePattern: () => isSafePattern,
    isSingleMode: () => isSingleMode7,
    label: () => label7,
    levels: () => levels7,
    lossy: () => lossy7,
    makeStore: () => makeStore,
    matchesCcrRetrieveToolName: () => matchesCcrRetrieveToolName2,
    queryBlock: () => queryBlock,
    recordRetrieval: () => recordRetrieval,
    restoreCcr: () => restoreCcr,
    retrieveBlock: () => retrieveBlock,
    shouldSkipCompression: () => shouldSkipCompression,
    stackPriority: () => stackPriority7,
    tryStoreBlock: () => tryStoreBlock,
    utf8ByteLength: () => utf8ByteLength,
    why: () => why7
  });
  var id12 = "ccr";
  var label7 = "CCR";
  var why7 = "把大的重复/连续块换成内容寻址引用，原文仍可取回（无损）。";
  var description3 = "Lossless — replaces large repeated/contiguous blocks with content-addressed references instead of deleting them; the original content stays retrievable.";
  var lossy7 = false;
  var cacheImpact7 = "low";
  var defaultOn12 = true;
  var stackPriority7 = 4;
  var isSingleMode7 = false;
  var levels7 = undefined;
  var available7 = true;
  var ENGINE_ID = "ccr";
  var DEFAULT_MIN_CHARS = 600;
  var DEFAULT_MIN_BLOCK_BYTES = 2048;
  var DEFAULT_MIN_REPEAT = 1;
  var RETRIEVAL_THRESHOLD = 3;
  var RETRIEVAL_RAMP_FACTOR_DEFAULT = 2;
  var MARKER_PREAMBLE_CHARS = 200;
  var MAX_CCR_ENTRIES = 5000;
  var MAX_CCR_BLOCK_BYTES = 2 * 1024 * 1024;
  var MAX_CCR_PRINCIPAL_BYTES = 16 * 1024 * 1024;
  var MAX_CCR_GLOBAL_BYTES = 64 * 1024 * 1024;
  var DEFAULT_CCR_TTL_SECONDS = 24 * 60 * 60;
  var MAX_CCR_TTL_SECONDS = 7 * 24 * 60 * 60;
  var MAX_CCR_MCP_FULL_BYTES = 256 * 1024;
  var ANON = "__anon__";
  var configSchema7 = [
    {
      key: "enabled",
      type: "boolean",
      label: "Enabled",
      defaultValue: true
    },
    {
      key: "minChars",
      type: "number",
      label: "Minimum block characters",
      description: "Minimum character count for a block to be a CCR candidate.",
      defaultValue: DEFAULT_MIN_CHARS,
      min: 100,
      max: 1e6
    },
    {
      key: "retrievalRampFactor",
      type: "number",
      label: "Retrieval ramp factor (H8)",
      description: "How steeply frequently-retrieved blocks resist compression. Each prior retrieval raises " + "the effective minimum block size linearly; 1 disables the ramp (binary skip at the " + "threshold only).",
      defaultValue: RETRIEVAL_RAMP_FACTOR_DEFAULT,
      min: 1,
      max: 100
    },
    {
      key: "minBlockBytes",
      type: "number",
      label: "最小块字节",
      description: "小于这个 UTF-8 字节数的块不换成引用；0 表示只用 minChars 的字符阈值。",
      defaultValue: DEFAULT_MIN_BLOCK_BYTES,
      min: 0,
      max: 65536
    },
    {
      key: "minRepeat",
      type: "number",
      label: "最少重复次数",
      description: "同一块在本次 body 里至少出现几次才折叠；1 = 上游语义（不要求重复）。",
      defaultValue: DEFAULT_MIN_REPEAT,
      min: 1,
      max: 10
    },
    {
      key: "requireRetrieveTool",
      type: "boolean",
      label: "要求调用方能取回",
      description: "上游门控：只有 tools[] 里声明了 omniroute_ccr_retrieve 的调用方才压缩。" + "关掉它 = marker 无法兑现，引擎实际有损。",
      defaultValue: true
    }
  ];
  var CCR_SCHEMA = configSchema7;
  function utf8ByteLength(text) {
    let bytes = 0;
    for (let i = 0;i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128)
        bytes += 1;
      else if (c < 2048)
        bytes += 2;
      else if (c >= 55296 && c <= 56319) {
        bytes += 4;
        i++;
      } else
        bytes += 3;
    }
    return bytes;
  }
  function hashContent(text) {
    return sha256hex(text).slice(0, 24);
  }
  function buildStoreKey(hash, principalId) {
    return `${principalId || ANON} ${hash}`;
  }
  function normalizeTtlSeconds(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
      return DEFAULT_CCR_TTL_SECONDS;
    return Math.max(60, Math.min(MAX_CCR_TTL_SECONDS, Math.floor(value)));
  }
  function makeStore() {
    return {
      entries: new Map,
      retrievalCounts: new Map,
      principalBytes: new Map,
      totalBytes: 0,
      lifecycle: { expiredEvictions: 0, capacityEvictions: 0, rejectedStores: 0 }
    };
  }
  function removeEntry(store, key, reason) {
    const entry = store.entries.get(key);
    if (!entry)
      return false;
    store.entries.delete(key);
    store.totalBytes = Math.max(0, store.totalBytes - entry.bytes);
    const left = Math.max(0, (store.principalBytes.get(entry.principalId) || 0) - entry.bytes);
    if (left === 0)
      store.principalBytes.delete(entry.principalId);
    else
      store.principalBytes.set(entry.principalId, left);
    if (reason === "expired")
      store.lifecycle.expiredEvictions++;
    if (reason === "capacity")
      store.lifecycle.capacityEvictions++;
    return true;
  }
  function purgeExpired(store, now) {
    for (const [key, entry] of store.entries) {
      if (entry.expiresAt <= now)
        removeEntry(store, key, "expired");
    }
  }
  function evictOldestMatching(store, predicate) {
    for (const [key, entry] of store.entries) {
      if (predicate(entry))
        return removeEntry(store, key, "capacity");
    }
    return false;
  }
  function principalBytesOf(store, principalId) {
    return store.principalBytes.get(principalId) || 0;
  }
  function enforcePrincipalBudget(store, owner, bytes) {
    while (principalBytesOf(store, owner) + bytes > MAX_CCR_PRINCIPAL_BYTES && evictOldestMatching(store, (entry) => entry.principalId === owner)) {}
    return principalBytesOf(store, owner) + bytes <= MAX_CCR_PRINCIPAL_BYTES;
  }
  function enforceGlobalBudget(store, owner, bytes) {
    const overBudget = () => store.entries.size >= MAX_CCR_ENTRIES || store.totalBytes + bytes > MAX_CCR_GLOBAL_BYTES;
    while (overBudget()) {
      if (evictOldestMatching(store, (entry) => entry.principalId === owner))
        continue;
      if (evictOldestMatching(store, () => true))
        continue;
      break;
    }
    return store.totalBytes + bytes <= MAX_CCR_GLOBAL_BYTES;
  }
  function rejectStore(store, hash, reason) {
    store.lifecycle.rejectedStores++;
    return { stored: false, hash, reason };
  }
  function tryStoreBlock(store, text, principalId, options = {}) {
    const hash = hashContent(text);
    const owner = principalId || ANON;
    const key = buildStoreKey(hash, principalId);
    const now = typeof options.now === "number" ? options.now : Date.now();
    purgeExpired(store, now);
    const existing = store.entries.get(key);
    if (existing) {
      existing.lastAccessedAt = now;
      existing.expiresAt = now + normalizeTtlSeconds(options.ttlSeconds) * 1000;
      store.entries.delete(key);
      store.entries.set(key, existing);
      return { stored: true, hash, metadata: publicMetadata(store, existing) };
    }
    const bytes = utf8ByteLength(text);
    if (bytes > MAX_CCR_BLOCK_BYTES)
      return rejectStore(store, hash, "block_too_large");
    if (!enforcePrincipalBudget(store, owner, bytes)) {
      return rejectStore(store, hash, "principal_budget_exceeded");
    }
    if (!enforceGlobalBudget(store, owner, bytes)) {
      return rejectStore(store, hash, "global_budget_exceeded");
    }
    const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds);
    const entry = {
      hash,
      principalId: owner,
      content: text,
      bytes,
      chars: text.length,
      lines: text.length === 0 ? 0 : text.split(`
`).length,
      contentType: typeof options.contentType === "string" && options.contentType.trim() ? options.contentType.trim().slice(0, 128) : "text/plain",
      source: options.source || "compression",
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + ttlSeconds * 1000
    };
    store.entries.set(key, entry);
    store.totalBytes += bytes;
    store.principalBytes.set(owner, principalBytesOf(store, owner) + bytes);
    return { stored: true, hash, metadata: publicMetadata(store, entry) };
  }
  function publicMetadata(store, entry) {
    return {
      hash: entry.hash,
      bytes: entry.bytes,
      chars: entry.chars,
      lines: entry.lines,
      contentType: entry.contentType,
      source: entry.source,
      createdAt: entry.createdAt,
      lastAccessedAt: entry.lastAccessedAt,
      expiresAt: entry.expiresAt,
      retrievalCount: store.retrievalCounts.get(buildStoreKey(entry.hash, entry.principalId)) || 0
    };
  }
  function retrieveBlock(store, hash, principalId, now = Date.now()) {
    const key = buildStoreKey(hash, principalId);
    const entry = store.entries.get(key);
    if (!entry)
      return null;
    if (entry.expiresAt <= now) {
      removeEntry(store, key, "expired");
      return null;
    }
    entry.lastAccessedAt = now;
    store.entries.delete(key);
    store.entries.set(key, entry);
    return entry.content;
  }
  function setRetrievalCount(store, key, count) {
    if (!store.retrievalCounts.has(key) && store.retrievalCounts.size >= MAX_CCR_ENTRIES) {
      const oldest = store.retrievalCounts.keys().next().value;
      if (oldest !== undefined)
        store.retrievalCounts.delete(oldest);
    }
    store.retrievalCounts.delete(key);
    store.retrievalCounts.set(key, count);
  }
  function recordRetrieval(store, hash, principalId) {
    const key = buildStoreKey(hash, principalId);
    setRetrievalCount(store, key, (store.retrievalCounts.get(key) || 0) + 1);
  }
  function shouldSkipCompression(store, hash, principalId) {
    return (store.retrievalCounts.get(buildStoreKey(hash, principalId)) || 0) >= RETRIEVAL_THRESHOLD;
  }
  function effectiveMinChars(store, baseMinChars, hash, principalId, rampFactor) {
    const count = store.retrievalCounts.get(buildStoreKey(hash, principalId)) || 0;
    if (count >= RETRIEVAL_THRESHOLD)
      return Number.POSITIVE_INFINITY;
    if (count <= 0 || rampFactor <= 1)
      return baseMinChars;
    return Math.round(baseMinChars * (1 + (rampFactor - 1) * count));
  }
  function buildCcrMarker2(hash, charCount) {
    return `[CCR retrieve hash=${hash} chars=${charCount}]`;
  }
  function buildCcrReference(hash, charCount) {
    return { hash, uri: `ccr://${hash}`, marker: buildCcrMarker2(hash, charCount) };
  }
  function buildCcrReplacementText(text, marker) {
    const preamble = text.slice(0, MARKER_PREAMBLE_CHARS).trimEnd();
    return `${preamble}… ${marker}`;
  }
  function restoreCcr(text, map) {
    if (!map)
      return text;
    return text.replace(/\[CCR retrieve hash=([0-9a-f]{24}) chars=\d+\]/g, (whole, hash) => typeof map[hash] === "string" ? map[hash] : whole);
  }
  var MAX_RANGE_LINES = 1e4;
  var MAX_GREP_MATCHES = 1000;
  var MAX_PATTERN_LEN = 512;
  function isSafePattern(pattern) {
    if (typeof pattern !== "string" || pattern.length === 0)
      return false;
    if (pattern.length > MAX_PATTERN_LEN)
      return false;
    if (/\([^()]*[*+][^()]*\)\s*[*+{]/.test(pattern))
      return false;
    if (/\[[^\]]*\][*+?]\s*[*+{]/.test(pattern))
      return false;
    if (/([*+?]|\{\d+,?\d*\})\s*[*+]/.test(pattern))
      return false;
    if (/\\[1-9]/.test(pattern))
      return false;
    const quantifiers = (pattern.match(/[*+?{]/g) || []).length;
    if (quantifiers > 64)
      return false;
    return true;
  }
  var qErr = (m) => ({ error: m });
  var qOk = (c) => ({ content: c });
  function clampCount(n) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 1)
      return null;
    return Math.min(Math.floor(n), MAX_RANGE_LINES);
  }
  function grepLines(lines, pattern, unique) {
    if (!pattern)
      return qErr("grep requires a 'pattern'");
    if (pattern.length > MAX_PATTERN_LEN)
      return qErr(`pattern exceeds ${MAX_PATTERN_LEN} chars`);
    if (!isSafePattern(pattern)) {
      return qErr("pattern rejected: potentially catastrophic backtracking");
    }
    let re;
    try {
      re = new RegExp(pattern);
    } catch {
      return qErr("invalid regex pattern");
    }
    const matched = [];
    let truncated = false;
    for (const line of lines) {
      if (re.test(line)) {
        matched.push(line);
        if (matched.length >= MAX_GREP_MATCHES) {
          truncated = true;
          break;
        }
      }
    }
    const out = unique ? [...new Set(matched)] : matched;
    const body = out.join(`
`);
    return qOk(truncated ? `${body}
…[truncated at ${MAX_GREP_MATCHES} matches]` : body);
  }
  function queryBlock(text, q) {
    if (typeof text !== "string")
      return qErr("block is not a string");
    q = q || {};
    const mode = q.mode || "full";
    if (mode === "full")
      return qOk(text);
    const lines = text.split(`
`);
    switch (mode) {
      case "head": {
        const c = clampCount(q.n);
        if (c === null)
          return qErr("head requires a positive 'n'");
        return qOk(lines.slice(0, c).join(`
`));
      }
      case "tail": {
        const c = clampCount(q.n);
        if (c === null)
          return qErr("tail requires a positive 'n'");
        return qOk(lines.slice(Math.max(0, lines.length - c)).join(`
`));
      }
      case "lines": {
        if (typeof q.start !== "number" || typeof q.end !== "number" || q.start < 1 || q.end < 1) {
          return qErr("lines requires positive 'start' and 'end' (1-indexed)");
        }
        if (q.start > q.end)
          return qErr("lines: 'start' must be <= 'end'");
        return qOk(lines.slice(q.start - 1, Math.min(q.end, lines.length)).join(`
`));
      }
      case "grep":
        return grepLines(lines, q.pattern, q.unique);
      case "stats":
        return qOk(JSON.stringify({ lines: lines.length, chars: text.length, bytes: utf8ByteLength(text) }));
      default:
        return qErr(`unknown mode: ${String(mode)}`);
    }
  }
  function handleCcrRetrieve(store, args, callerId) {
    args = args || {};
    if (!args.hash || typeof args.hash !== "string") {
      return { error: "hash parameter is required and must be a string" };
    }
    const block = retrieveBlock(store, args.hash, callerId);
    if (block === null) {
      return {
        error: `CCR block not found for hash=${args.hash}. The block may have expired or the hash is invalid.`
      };
    }
    recordRetrieval(store, args.hash, callerId);
    if (!args.mode || args.mode === "full")
      return { content: block };
    return queryBlock(block, args);
  }
  var CCR_RETRIEVE_TOOL_NAME2 = "omniroute_ccr_retrieve";
  var CCR_RETRIEVE_TOOL_NAME_SEPARATORS2 = ["__", ".", "/", ":"];
  function matchesCcrRetrieveToolName2(name) {
    if (typeof name !== "string")
      return false;
    if (name === CCR_RETRIEVE_TOOL_NAME2)
      return true;
    return CCR_RETRIEVE_TOOL_NAME_SEPARATORS2.some((sep) => name.endsWith(`${sep}${CCR_RETRIEVE_TOOL_NAME2}`));
  }
  var CCR_PROTOCOL_MARKER_SENTINEL = "[CCR protocol]";
  var CCR_PROTOCOL_INSTRUCTION = `${CCR_PROTOCOL_MARKER_SENTINEL} This conversation uses content-compression-retrieve (CCR). When you see a marker like \`[CCR retrieve hash=<24hex> chars=N]\` in a message, it means the full original text (N characters) was stored and replaced with this marker to save space — call the \`${CCR_RETRIEVE_TOOL_NAME2}\` tool with that hash to get the original text back verbatim. Copy the hash EXACTLY as written — all 24 hexadecimal characters, never truncated, abbreviated, or reformatted — a single wrong character will make the retrieval fail. If you instead see a marker like \`[dedup:ref sha=...]\`, it means that content already appeared earlier in this conversation — look back in the message history for it; do NOT call ${CCR_RETRIEVE_TOOL_NAME2} for a dedup reference.`;
  function callerSupportsCcrRetrieve2(body) {
    const tools = body && body["tools"];
    if (!Array.isArray(tools))
      return false;
    return tools.some((tool) => {
      const flatName = tool && typeof tool.name === "string" ? tool.name : undefined;
      const nestedName = tool && tool.function && typeof tool.function.name === "string" ? tool.function.name : undefined;
      return matchesCcrRetrieveToolName2(flatName) || matchesCcrRetrieveToolName2(nestedName);
    });
  }
  function messageContainsSentinel(message) {
    const content = message && message.content;
    if (typeof content === "string")
      return content.includes(CCR_PROTOCOL_MARKER_SENTINEL);
    if (Array.isArray(content)) {
      return content.some((part) => part && typeof part === "object" && typeof part.text === "string" && part.text.includes(CCR_PROTOCOL_MARKER_SENTINEL));
    }
    return false;
  }
  function injectCcrProtocolInstruction(body) {
    if (!body || !Array.isArray(body.messages))
      return false;
    if (!callerSupportsCcrRetrieve2(body))
      return false;
    if (body.messages.some(messageContainsSentinel))
      return false;
    body.messages.unshift({ role: "system", content: CCR_PROTOCOL_INSTRUCTION });
    return true;
  }
  function countOccurrences(haystack, needle, cap) {
    if (!needle)
      return 0;
    let count = 0;
    let offset = 0;
    while (count < cap) {
      const idx = haystack.indexOf(needle, offset);
      if (idx === -1)
        break;
      count++;
      offset = idx + needle.length;
    }
    return count;
  }
  function maybeCcrReplace(text, opts, store) {
    if (typeof text !== "string")
      return null;
    if (text.length < opts.minChars)
      return null;
    if (opts.minBlockBytes > 0 && utf8ByteLength(text) < opts.minBlockBytes)
      return null;
    if (opts.minRepeat > 1 && countOccurrences(opts.corpus, text, opts.minRepeat) < opts.minRepeat) {
      return null;
    }
    const hash = hashContent(text);
    if (text.length < effectiveMinChars(store, opts.minChars, hash, opts.principalId, opts.rampFactor)) {
      return null;
    }
    const marker = buildCcrMarker2(hash, text.length);
    const replacement = buildCcrReplacementText(text, marker);
    if (replacement.length >= text.length)
      return null;
    const stored = tryStoreBlock(store, text, opts.principalId, { source: "compression" });
    if (!stored.stored)
      return null;
    return { text: replacement, hash };
  }
  function makeStats(originalChars, newChars, durationMs, replacedCount) {
    const originalTokens = Math.ceil(originalChars / 4);
    const compressedTokens = Math.ceil(newChars / 4);
    return {
      originalTokens,
      compressedTokens,
      savingsPercent: originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 1e4) / 100 : 0,
      techniquesUsed: ["ccr"],
      mode: "stacked",
      timestamp: Date.now(),
      durationMs,
      replacedCount
    };
  }
  function applyCcr(body, cfg, opts) {
    cfg = cfg || {};
    opts = opts || {};
    const empty = { body, compressed: false, stats: null, replacedCount: 0, map: null, store: null };
    if (cfg["enabled"] === false)
      return empty;
    if (!body || typeof body !== "object")
      return empty;
    if (cfg["requireRetrieveTool"] !== false) {
      let callerCanRetrieve = false;
      try {
        callerCanRetrieve = callerSupportsCcrRetrieve2(body);
      } catch {
        callerCanRetrieve = false;
      }
      if (!callerCanRetrieve)
        return empty;
    }
    const view = conversationView(body, opts.protocol);
    if (!view || view.segments.length === 0)
      return empty;
    const minChars = typeof cfg["minChars"] === "number" ? cfg["minChars"] : DEFAULT_MIN_CHARS;
    const rampFactor = typeof cfg["retrievalRampFactor"] === "number" ? cfg["retrievalRampFactor"] : RETRIEVAL_RAMP_FACTOR_DEFAULT;
    const minBlockBytes = typeof cfg["minBlockBytes"] === "number" ? Math.max(0, cfg["minBlockBytes"]) : DEFAULT_MIN_BLOCK_BYTES;
    const minRepeat = typeof cfg["minRepeat"] === "number" ? Math.max(1, cfg["minRepeat"]) : DEFAULT_MIN_REPEAT;
    const principalId = opts.principalId || undefined;
    const start = Date.now();
    const store = makeStore();
    const segments = view.segments;
    const originals = segments.map((s) => s.text);
    const corpus = minRepeat > 1 ? originals.join(`
`) : "";
    const replaceOpts = { minChars, minBlockBytes, minRepeat, corpus, principalId, rampFactor };
    const map = {};
    let replacedCount = 0;
    let originalChars = 0;
    let newChars = 0;
    for (let i = 0;i < segments.length; i++) {
      const seg = segments[i];
      originalChars += originals[i].length;
      if (seg.role === "system" || seg.toolOutput) {
        newChars += originals[i].length;
        continue;
      }
      const hit = maybeCcrReplace(originals[i], replaceOpts, store);
      if (hit) {
        seg.set(hit.text);
        map[hit.hash] = originals[i];
        replacedCount++;
        newChars += hit.text.length;
      } else {
        newChars += originals[i].length;
      }
    }
    if (replacedCount === 0)
      return empty;
    if (cfg["requireRetrieveTool"] !== false) {
      try {
        injectCcrProtocolInstruction(body);
      } catch {}
    }
    const stats = makeStats(originalChars, newChars, Math.round(Date.now() - start), replacedCount);
    return { body, compressed: true, stats, replacedCount, map, store };
  }
  function apply12(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const ctxObj = ctx || {};
      const r = applyCcr(body, cfg, {
        protocol: ctxObj.protocol,
        principalId: cfg && cfg.principalId || ctxObj.session || undefined
      });
      if (!r.compressed)
        return false;
      if (ctxObj.state) {
        ctxObj.state.ccr = {
          replacedCount: r.replacedCount,
          stats: r.stats,
          map: r.map,
          store: r.store
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  // engines/read-lifecycle.js
  var exports_read_lifecycle = {};
  __export(exports_read_lifecycle, {
    ENGINE_ID: () => ENGINE_ID2,
    apply: () => apply13,
    applyReadLifecycle: () => applyReadLifecycle,
    available: () => available8,
    cacheImpact: () => cacheImpact8,
    classifyTool: () => classifyTool,
    collapseResponseOutputs: () => collapseResponseOutputs,
    collapseSupersededReads: () => collapseSupersededReads,
    configSchema: () => configSchema8,
    defaultOn: () => defaultOn13,
    description: () => description4,
    extractInvocations: () => extractInvocations,
    extractPath: () => extractPath,
    extractResponseInvocations: () => extractResponseInvocations,
    findSupersededReadCallIds: () => findSupersededReadCallIds,
    id: () => id13,
    isSingleMode: () => isSingleMode8,
    label: () => label8,
    levels: () => levels8,
    lossy: () => lossy8,
    parseMaybeJson: () => parseMaybeJson,
    replaceResultText: () => replaceResultText,
    stackPriority: () => stackPriority8,
    stubFor: () => stubFor,
    why: () => why8
  });
  var id13 = "read-lifecycle";
  var label8 = "Read Lifecycle";
  var why8 = "同一个文件被反复 Read 时，把被后续 Read/Write 覆盖掉的旧结果折叠成短 stub，只留最新一次。";
  var description4 = "Collapses stale/superseded file-Read tool results: when the same path is re-read or modified later in the conversation, earlier Reads are replaced with a short stub, keeping the current Read intact. Lossy + opt-in (default off). Supports Anthropic and OpenAI tool shapes.";
  var lossy8 = true;
  var cacheImpact8 = "moderate";
  var defaultOn13 = false;
  var stackPriority8 = 22;
  var isSingleMode8 = false;
  var levels8 = undefined;
  var available8 = true;
  var ENGINE_ID2 = "read-lifecycle";
  var READ_NAMES = ["read", "read_file", "readfile", "view", "view_file", "cat"];
  var WRITE_NAMES = [
    "write",
    "write_file",
    "writefile",
    "edit",
    "edit_file",
    "multiedit",
    "str_replace",
    "str_replace_editor",
    "str_replace_based_edit_tool",
    "apply_patch",
    "create_file",
    "update_file"
  ];
  var FALLBACK_PATH = "file";
  var DEFAULT_STUB_CHARS = 120;
  var configSchema8 = [
    { key: "enabled", type: "boolean", label: "Enabled", defaultValue: true },
    {
      key: "keepStub",
      type: "boolean",
      label: "保留 stub 行",
      description: "关掉后旧 Read 结果被整段清空（最省，但模型看不到任何痕迹）。",
      defaultValue: true
    },
    {
      key: "stubChars",
      type: "number",
      label: "stub 摘要字符数",
      description: "stubKeepSummary 开启时，摘要里保留原文多少字符；0 = 只给字符/行数。",
      defaultValue: DEFAULT_STUB_CHARS,
      min: 0,
      max: 2000
    },
    {
      key: "stubKeepSummary",
      type: "boolean",
      label: "stub 保留原文摘要",
      description: "在 stub 行后追加「原 N 字符 / M 行 + 开头片段」，让模型知道被折叠的是什么。",
      defaultValue: false
    },
    {
      key: "readToolNames",
      type: "multiselect",
      label: "Read 工具名",
      description: "空 = 用内置集合；非空 = 替换内置集合。",
      defaultValue: [],
      options: READ_NAMES.map((name) => ({ value: name, label: name }))
    },
    {
      key: "writeToolNames",
      type: "multiselect",
      label: "Write 工具名",
      description: "空 = 用内置集合；非空 = 替换内置集合。",
      defaultValue: [],
      options: WRITE_NAMES.map((name) => ({ value: name, label: name }))
    }
  ];
  function isRecord(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }
  function toNameSet(list, fallback) {
    if (!Array.isArray(list) || list.length === 0)
      return new Set(fallback);
    const set = new Set;
    for (const name of list) {
      if (typeof name === "string" && name.trim())
        set.add(name.trim().toLowerCase());
    }
    return set.size > 0 ? set : new Set(fallback);
  }
  function makeNames(cfg) {
    return {
      read: toNameSet(cfg && cfg.readToolNames, READ_NAMES),
      write: toNameSet(cfg && cfg.writeToolNames, WRITE_NAMES)
    };
  }
  function classifyTool(name, names) {
    if (typeof name !== "string")
      return null;
    const lc = name.trim().toLowerCase();
    const set = names || { read: new Set(READ_NAMES), write: new Set(WRITE_NAMES) };
    if (set.read.has(lc))
      return "read";
    if (set.write.has(lc))
      return "write";
    return null;
  }
  function extractPath(input) {
    if (!isRecord(input))
      return null;
    for (const key of ["file_path", "path", "filePath", "filename", "file", "target_file"]) {
      const v = input[key];
      if (typeof v === "string" && v.trim())
        return v.trim();
    }
    return null;
  }
  function parseMaybeJson(value) {
    if (isRecord(value))
      return value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }
  function extractInvocations(messages, names) {
    const invocations = [];
    const readPathByCallId = new Map;
    let order = 0;
    if (!Array.isArray(messages))
      return { invocations, readPathByCallId };
    for (const msg of messages) {
      if (!isRecord(msg))
        continue;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (!isRecord(block) || block.type !== "tool_use")
            continue;
          const kind = classifyTool(block.name, names);
          const callId = typeof block.id === "string" ? block.id : null;
          const path = extractPath(block.input);
          if (kind && callId && path) {
            invocations.push({ callId, kind, path, order: order++ });
            if (kind === "read")
              readPathByCallId.set(callId, path);
          }
        }
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (!isRecord(call))
            continue;
          const fn = isRecord(call.function) ? call.function : null;
          const kind = classifyTool(fn && fn.name, names);
          const callId = typeof call.id === "string" ? call.id : null;
          const path = extractPath(parseMaybeJson(fn && fn.arguments));
          if (kind && callId && path) {
            invocations.push({ callId, kind, path, order: order++ });
            if (kind === "read")
              readPathByCallId.set(callId, path);
          }
        }
      }
    }
    return { invocations, readPathByCallId };
  }
  function extractResponseInvocations(items, names) {
    const invocations = [];
    const readPathByCallId = new Map;
    let order = 0;
    if (!Array.isArray(items))
      return { invocations, readPathByCallId };
    for (const item of items) {
      if (!isRecord(item) || item.type !== "function_call")
        continue;
      const kind = classifyTool(item.name, names);
      const callId = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : null;
      const path = extractPath(parseMaybeJson(item.arguments));
      if (kind && callId && path) {
        invocations.push({ callId, kind, path, order: order++ });
        if (kind === "read")
          readPathByCallId.set(callId, path);
      }
    }
    return { invocations, readPathByCallId };
  }
  function findSupersededReadCallIds(invocations) {
    const superseded = new Set;
    if (!Array.isArray(invocations))
      return superseded;
    for (const inv of invocations) {
      if (inv.kind !== "read")
        continue;
      const hasLater = invocations.some((o) => o.path === inv.path && o.order > inv.order);
      if (hasLater)
        superseded.add(inv.callId);
    }
    return superseded;
  }
  function stubFor(path) {
    return `[read superseded — "${path}" was re-read or modified later in the conversation; the current content appears below]`;
  }
  function contentToText(content) {
    if (typeof content === "string")
      return content;
    if (Array.isArray(content)) {
      return content.filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string").map((part) => part.text).join(`
`);
    }
    return "";
  }
  function summarize(original, maxChars) {
    const text = contentToText(original);
    if (!text)
      return "";
    const lines = text.split(`
`).length;
    const head = ` (was ${text.length} chars / ${lines} lines`;
    if (!(maxChars > 0))
      return `${head})`;
    const snippet = text.slice(0, maxChars).replace(/\s+/g, " ").trim();
    return `${head}; starts: "${snippet}${text.length > maxChars ? "…" : ""}")`;
  }
  function buildStub(path, original, opts) {
    const o = opts || {};
    if (o.keepStub === false)
      return "";
    const base = stubFor(path || FALLBACK_PATH);
    return o.stubKeepSummary === true ? base + summarize(original, o.stubChars) : base;
  }
  function alreadyStubbed(content, stub) {
    if (stub === "")
      return content === "" || content === undefined || content === null;
    if (typeof content === "string")
      return content === stub;
    if (Array.isArray(content)) {
      const texts = content.filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string").map((part) => part.text);
      return texts.length > 0 && texts.every((t) => t === stub);
    }
    return false;
  }
  function replaceResultText(content, stub) {
    if (typeof content === "string")
      return stub;
    if (Array.isArray(content)) {
      return content.map((part) => isRecord(part) && part.type === "text" && typeof part.text === "string" ? { ...part, text: stub } : part);
    }
    return stub;
  }
  function collapseSupersededReads(messages, superseded, readPathByCallId, opts) {
    if (!(superseded instanceof Set) || superseded.size === 0) {
      return { messages, collapsedCount: 0 };
    }
    if (!Array.isArray(messages))
      return { messages, collapsedCount: 0 };
    let collapsedCount = 0;
    const out = messages.map((msg) => {
      if (!isRecord(msg))
        return msg;
      if (msg.role === "tool" && typeof msg.tool_call_id === "string" && superseded.has(msg.tool_call_id)) {
        const path = readPathByCallId && readPathByCallId.get(msg.tool_call_id) || FALLBACK_PATH;
        const stub = buildStub(path, msg.content, opts);
        if (alreadyStubbed(msg.content, stub))
          return msg;
        collapsedCount++;
        return { ...msg, content: stub };
      }
      if (Array.isArray(msg.content)) {
        let changed = false;
        const newContent = msg.content.map((block) => {
          if (!isRecord(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string" || !superseded.has(block.tool_use_id)) {
            return block;
          }
          const path = readPathByCallId && readPathByCallId.get(block.tool_use_id) || FALLBACK_PATH;
          const stub = buildStub(path, block.content, opts);
          if (alreadyStubbed(block.content, stub))
            return block;
          changed = true;
          collapsedCount++;
          return { ...block, content: replaceResultText(block.content, stub) };
        });
        if (changed)
          return { ...msg, content: newContent };
      }
      return msg;
    });
    return { messages: out, collapsedCount };
  }
  function collapseResponseOutputs(items, superseded, readPathByCallId, opts) {
    if (!(superseded instanceof Set) || superseded.size === 0) {
      return { items, collapsedCount: 0 };
    }
    if (!Array.isArray(items))
      return { items, collapsedCount: 0 };
    let collapsedCount = 0;
    const out = items.map((item) => {
      if (!isRecord(item) || item.type !== "function_call_output")
        return item;
      const callId = typeof item.call_id === "string" ? item.call_id : null;
      if (!callId || !superseded.has(callId))
        return item;
      const path = readPathByCallId && readPathByCallId.get(callId) || FALLBACK_PATH;
      const stub = buildStub(path, item.output, opts);
      if (alreadyStubbed(item.output, stub))
        return item;
      collapsedCount++;
      return { ...item, output: replaceResultText(item.output, stub) };
    });
    return { items: out, collapsedCount };
  }
  function makeStats2(originalChars, newChars, durationMs, collapsedCount) {
    const originalTokens = Math.ceil(originalChars / 4);
    const compressedTokens = Math.ceil(newChars / 4);
    return {
      originalTokens,
      compressedTokens,
      savingsPercent: originalTokens > 0 ? Math.round((originalTokens - compressedTokens) / originalTokens * 1e4) / 100 : 0,
      techniquesUsed: [ENGINE_ID2],
      mode: "stacked",
      timestamp: Date.now(),
      durationMs,
      collapsedCount
    };
  }
  function charCountOf(content) {
    if (typeof content === "string")
      return content.length;
    if (Array.isArray(content))
      return contentToText(content).length;
    return 0;
  }
  function applyReadLifecycle(body, cfg, opts) {
    cfg = cfg || {};
    opts = opts || {};
    const empty = { body, compressed: false, stats: null, collapsedCount: 0 };
    if (cfg.enabled === false)
      return empty;
    if (!body || typeof body !== "object")
      return empty;
    const view = conversationView(body, opts.protocol);
    if (!view)
      return empty;
    const protocol = view.protocol;
    const root = isRecord(view.body) ? view.body : body;
    const start = Date.now();
    const names = makeNames(cfg);
    const stubOpts = {
      keepStub: cfg.keepStub !== false,
      stubChars: typeof cfg.stubChars === "number" ? cfg.stubChars : DEFAULT_STUB_CHARS,
      stubKeepSummary: cfg.stubKeepSummary === true
    };
    let originalChars = 0;
    let newChars = 0;
    let collapsedCount = 0;
    if (protocol === "responses") {
      const items = root.input;
      if (!Array.isArray(items) || items.length === 0)
        return empty;
      const { invocations, readPathByCallId } = extractResponseInvocations(items, names);
      const superseded = findSupersededReadCallIds(invocations);
      const r = collapseResponseOutputs(items, superseded, readPathByCallId, stubOpts);
      if (r.collapsedCount === 0)
        return empty;
      collapsedCount = r.collapsedCount;
      for (const item of items)
        if (isRecord(item))
          originalChars += charCountOf(item.output);
      for (const item of r.items)
        if (isRecord(item))
          newChars += charCountOf(item.output);
      root.input = r.items;
      if (root !== body)
        body.input = r.items;
    } else if (protocol === "chat" || protocol === "anthropic") {
      const messages = root.messages;
      if (!Array.isArray(messages) || messages.length === 0)
        return empty;
      const { invocations, readPathByCallId } = extractInvocations(messages, names);
      const superseded = findSupersededReadCallIds(invocations);
      const r = collapseSupersededReads(messages, superseded, readPathByCallId, stubOpts);
      if (r.collapsedCount === 0)
        return empty;
      collapsedCount = r.collapsedCount;
      for (const msg of messages)
        if (isRecord(msg))
          originalChars += charCountOf(msg.content);
      for (const msg of r.messages)
        if (isRecord(msg))
          newChars += charCountOf(msg.content);
      root.messages = r.messages;
      if (root !== body)
        body.messages = r.messages;
    } else {
      return empty;
    }
    const stats = makeStats2(originalChars, newChars, Math.round(Date.now() - start), collapsedCount);
    return { body, compressed: true, stats, collapsedCount };
  }
  function apply13(body, ctx, cfg) {
    try {
      if (!body || typeof body !== "object")
        return false;
      const ctxObj = ctx || {};
      const r = applyReadLifecycle(body, cfg, { protocol: ctxObj.protocol });
      if (!r.compressed)
        return false;
      if (ctxObj.state) {
        ctxObj.state.readLifecycle = { collapsedCount: r.collapsedCount, stats: r.stats };
      }
      return true;
    } catch {
      return false;
    }
  }

  // catalog.js
  var ENGINES = [
    {
      id: "session-dedup",
      fields: [
        { key: "minBlockChars", type: "number", label: "最小块字符", description: "小于这个长度的文本块不参与去重", defaultValue: 80, min: 20, max: 4000 },
        { key: "minJaccard", type: "number", label: "相似度阈值", description: "越高越保守，1 表示只合并完全相同的块", defaultValue: 0.85, min: 0.5, max: 1 },
        { key: "shingleSize", type: "number", label: "分片大小", description: "相似度计算的分片长度", defaultValue: 3, min: 2, max: 8 }
      ],
      label: "Session Dedup",
      description: "Lossless — elides only text already sent earlier in the same session; nothing is summarized or dropped. Negligible latency overhead.",
      why: "同一会话里已经发过的文本，后面再出现就换成引用；不总结也不丢内容。",
      stackPriority: 3,
      lossy: false,
      cacheImpact: "low",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "ccr",
      fields: [
        { key: "minBlockBytes", type: "number", label: "最小块字节", description: "小于这个大小的块不换成引用", defaultValue: 2048, min: 256, max: 65536 },
        { key: "minRepeat", type: "number", label: "最少重复次数", description: "同一块至少出现几次才折叠", defaultValue: 2, min: 2, max: 10 }
      ],
      label: "CCR",
      description: "Lossless — replaces large repeated/contiguous blocks with content-addressed references instead of deleting them; the original content stays retrievable.",
      why: "把大的重复或连续块换成内容寻址引用，原文仍可取回。",
      stackPriority: 4,
      lossy: false,
      cacheImpact: "low",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "lite",
      fields: [
        { key: "compressToolResults", type: "boolean", label: "压缩工具输出", description: "对 tool_result 做空白与格式清理", defaultValue: true },
        { key: "preserveSystemPrompt", type: "boolean", label: "保护系统提示词", description: "完全不碰 system 消息", defaultValue: false },
        { key: "maxToolLength", type: "number", label: "工具输出上限", description: "超过这个字符数的工具输出会被截断", defaultValue: 2000, min: 200, max: 20000 }
      ],
      label: "Lite Cleanup",
      description: "Safest mode (~15% savings, <1ms latency): whitespace/dedup/formatting cleanup only, zero semantic change. Always safe to leave on.",
      why: "只清空白、重复行和格式，零语义改动，永远可以开着（约 15%）。",
      stackPriority: 5,
      lossy: false,
      cacheImpact: "none",
      isSingleMode: true,
      levels: null,
      sampling: false,
      inputScope: "mixed",
      available: true,
      requires: null
    },
    {
      id: "rtk",
      fields: [
        { key: "level", type: "select", label: "强度", description: "minimal 只去噪音，aggressive 连摘要一起压", defaultValue: "standard", options: [{ value: "minimal", label: "minimal" }, { value: "standard", label: "standard" }, { value: "aggressive", label: "aggressive" }] }
      ],
      label: "RTK Tool Output",
      description: "Strips ANSI noise, progress bars, and repeated lines from command/tool output while preserving failures, warnings, and summaries (60-90% upstream savings)",
      why: "剥掉命令输出里的 ANSI 噪音、进度条、重复行，保留报错、警告和摘要（60–90%）。",
      stackPriority: 10,
      lossy: true,
      cacheImpact: "moderate",
      isSingleMode: true,
      levels: ["minimal", "standard", "aggressive"],
      sampling: false,
      inputScope: "tool-results",
      available: true,
      requires: null
    },
    {
      id: "codex-responses",
      fields: [
        { key: "compressShell", type: "boolean", label: "压缩 shell 输出", defaultValue: true },
        { key: "compressPatch", type: "boolean", label: "压缩 patch 输出", defaultValue: true },
        { key: "compressSearch", type: "boolean", label: "压缩 search 输出", defaultValue: true },
        { key: "compressBuild", type: "boolean", label: "压缩 build 输出", defaultValue: true }
      ],
      label: "Codex Tool Output",
      description: "Conservative compression of shell/patch/search/build tool output on the OpenAI Responses API.",
      why: "Responses 接口里 shell / patch / search / build 工具输出的保守压缩。",
      stackPriority: 12,
      lossy: true,
      cacheImpact: "low",
      isSingleMode: true,
      levels: null,
      sampling: false,
      inputScope: "tool-results",
      available: true,
      requires: null
    },
    {
      id: "headroom",
      fields: [
        { key: "minRows", type: "number", label: "最小行数", description: "表格行数少于这个值就不压", defaultValue: 8, min: 2, max: 200 }
      ],
      label: "Headroom (GCF)",
      description: "Column-wise compaction of tabular JSON into [N rows] form while keeping the structure readable.",
      why: "把表格化的 JSON 按列压紧成 [N rows]，结构仍然可读。",
      stackPriority: 15,
      lossy: false,
      cacheImpact: "low",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "tool-results",
      available: true,
      requires: null
    },
    {
      id: "relevance",
      fields: [
        { key: "overlapThreshold", type: "number", label: "重叠阈值", description: "与用户问题词重叠低于此值的句子被丢掉（默认 0.1）", defaultValue: 0.1, min: 0, max: 1 },
        { key: "budgetPercent", type: "number", label: "保留预算", description: "最多保留原文的多少比例，是上限不是目标（默认 0.5）", defaultValue: 0.5, min: 0.1, max: 1 },
        { key: "boilerplateWeight", type: "number", label: "套话权重", description: "套话句子的降权幅度（默认 0.5）", defaultValue: 0.5, min: 0, max: 1 }
      ],
      label: "Relevance",
      description: "Sentence-level relevance scoring against the last user query; low-scoring sentences are dropped.",
      why: "按最后一条用户消息给句子打分，丢掉低分句。",
      stackPriority: 18,
      lossy: true,
      cacheImpact: "moderate",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "caveman",
      fields: [
        { key: "lang", type: "select", label: "语言", description: "auto 按内容自动判断", defaultValue: "auto", options: [{ value: "auto", label: "auto" }, { value: "zh", label: "中文" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }, { value: "de", label: "Deutsch" }, { value: "es", label: "Español" }, { value: "fr", label: "Français" }, { value: "it", label: "Italiano" }, { value: "pt-BR", label: "Português" }, { value: "ru", label: "Русский" }, { value: "hu", label: "Magyar" }, { value: "id", label: "Indonesia" }] },
        { key: "groups", type: "multiselect", label: "规则组", description: "启用哪些规则类别", defaultValue: ["dedup", "filler", "context", "structural", "ultra"], options: [{ value: "dedup", label: "去重" }, { value: "filler", label: "填充词" }, { value: "context", label: "上下文冗余" }, { value: "structural", label: "句式结构" }, { value: "ultra", label: "激进" }] }
      ],
      label: "Caveman",
      description: "Rule-based prose compaction (~30% at full strength) driven by per-language rule packs.",
      why: "按语言规则表删掉啰嗦措辞、客套话、冗余从句，保留代码与事实（约 30%）。",
      stackPriority: 20,
      lossy: true,
      cacheImpact: "moderate",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "read-lifecycle",
      fields: [
        { key: "keepStub", type: "boolean", label: "保留短 stub", description: "折叠后留一行说明，而不是完全删掉", defaultValue: true },
        { key: "stubChars", type: "number", label: "stub 长度", description: "折叠后保留的字符数", defaultValue: 120, min: 0, max: 600 }
      ],
      label: "Read Lifecycle",
      description: "Collapses Read tool results that a strictly-later Read or Write superseded, keeping only the newest view of each path.",
      why: "同一文件反复 Read 时，把被后续 Read/Write 覆盖掉的旧结果折叠成短 stub，只留最新一次。",
      stackPriority: 22,
      lossy: true,
      cacheImpact: "moderate",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "tool-results",
      available: true,
      requires: null
    },
    {
      id: "aggressive",
      fields: [
        { key: "keepTurns", type: "number", label: "保留最近轮次", description: "最近这么多轮对话原样保留", defaultValue: 4, min: 1, max: 30 },
        { key: "summaryChars", type: "number", label: "摘要长度", description: "每段被摘要化内容的字符上限", defaultValue: 400, min: 80, max: 4000 }
      ],
      label: "Aggressive",
      description: "Summarizes older turns and progressively ages them out (~50%), keeping recent detail intact.",
      why: "把较早的轮次摘要化并逐步老化，只保留最近的细节（约 50%）。",
      stackPriority: 30,
      lossy: true,
      cacheImpact: "high",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "llmlingua",
      fields: [
        { key: "rate", type: "number", label: "压缩率", description: "保留多少比例的内容", defaultValue: 0.5, min: 0.1, max: 0.9 }
      ],
      label: "LLMLingua-2",
      description: "LLMLingua-2 ONNX semantic pruning on a worker thread; the model is an optional dependency.",
      why: "用 LLMLingua-2 的 ONNX 模型做语义剪枝。",
      stackPriority: 35,
      lossy: true,
      cacheImpact: "high",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: false,
      requires: "需要 @atjsh/llmlingua-2 + ONNX 模型文件，插件宿主里跑不了 worker"
    },
    {
      id: "ultra",
      fields: [
        { key: "compressionRate", type: "number", label: "剪枝比例", description: "最多剪掉多少比例的 token（默认 0.5）", defaultValue: 0.5, min: 0.05, max: 0.95 },
        { key: "minScoreThreshold", type: "number", label: "分数门槛", description: "低于此分的 token 才可剪，分数越高剪得越少（默认 0.3）", defaultValue: 0.3, min: 0, max: 1 },
        { key: "maxTokensPerMessage", type: "number", label: "单条上限", description: "单条消息最多处理的 token 数，0 表示不限", defaultValue: 0, min: 0, max: 1e5 }
      ],
      label: "Ultra",
      description: "Heuristic token-level pruning (~75%) — the most aggressive fully-local option.",
      why: "启发式 token 级剪枝，最激进的纯本地压缩（约 75%）。",
      stackPriority: 40,
      lossy: true,
      cacheImpact: "high",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "ionizer",
      fields: [
        { key: "sampleRate", type: "number", label: "采样率", description: "保留多少比例的片段", defaultValue: 0.4, min: 0.1, max: 0.9 }
      ],
      label: "Ionizer",
      description: "Sampling-based compaction that drops low-information fragments and keeps the skeleton and key facts. Deliberately lossy.",
      why: "按采样策略丢掉低信息量片段，保留骨架与关键事实（故意有损）。",
      stackPriority: 50,
      lossy: true,
      cacheImpact: "high",
      isSingleMode: false,
      levels: null,
      sampling: true,
      inputScope: "messages",
      available: true,
      requires: null
    },
    {
      id: "llm",
      fields: [
        { key: "maxChars", type: "number", label: "单段上限", description: "交给后端压缩的文本长度上限", defaultValue: 4000, min: 500, max: 20000 }
      ],
      label: "LLM Compressor",
      description: "Condenses prose through a pluggable chat-completion backend. Ships with a no-op backend, so out of the box it never mutates the payload.",
      why: "用一个 LLM 压缩散文。没有外部模型后端时原样放行。",
      stackPriority: 60,
      lossy: true,
      cacheImpact: "high",
      isSingleMode: false,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: false,
      requires: "需要一个外部 chat-completion 后端，本插件内无法提供"
    },
    {
      id: "omniglyph",
      fields: [
        { key: "dpi", type: "number", label: "渲染 DPI", description: "上下文转图片时的清晰度", defaultValue: 150, min: 72, max: 300 }
      ],
      label: "OmniGlyph",
      description: "Experimental context-as-image encoding routed directly to Claude Fable 5 only — the most aggressive and least broadly compatible option; not recommended as a general-purpose default.",
      why: "把上下文编码成图片喂给模型（实验性，只对 Claude Fable 5 直连有效，最激进也最不通用）。",
      stackPriority: 90,
      lossy: true,
      cacheImpact: "high",
      isSingleMode: true,
      levels: null,
      sampling: false,
      inputScope: "messages",
      available: false,
      requires: "需要 omniglyph npm 包与支持图片直传的供应商"
    }
  ];
  var ORDER = ENGINES.slice().sort((a, b) => a.stackPriority - b.stackPriority).map((e) => e.id);
  var byId = new Map(ENGINES.map((e) => [e.id, e]));
  function engineById(id) {
    return byId.get(id) || null;
  }

  // engines/index.js
  var MODULES = {
    "session-dedup": exports_session_dedup,
    lite: exports_lite,
    rtk: exports_rtk,
    "codex-responses": exports_codex_responses,
    headroom: exports_headroom,
    relevance: exports_relevance,
    ultra: exports_ultra,
    caveman: exports_caveman,
    aggressive: exports_aggressive,
    ionizer: exports_ionizer,
    llm: exports_llm,
    ccr: exports_ccr,
    "read-lifecycle": exports_read_lifecycle
  };
  var REGISTRY = new Map;
  for (const meta of ENGINES) {
    const mod = MODULES[meta.id];
    if (!mod)
      continue;
    REGISTRY.set(meta.id, { ...meta, ...mod, stackPriority: meta.stackPriority, ported: true });
  }
  var PIPELINE = ORDER.map((id) => REGISTRY.get(id)).filter(Boolean);
  var PORTED_IDS = Array.from(REGISTRY.keys());
  function engineModule(id) {
    return REGISTRY.get(id) || null;
  }

  // pipeline.js
  var INTERNAL_MARKER = "__magpieCompressCore";
  var TELEMETRY_VERSION = 1;
  function clone(value) {
    return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }
  function byteLength2(value) {
    return new TextEncoder().encode(JSON.stringify(value) || "").length;
  }
  function strategyEnabled(engine, options = {}) {
    if (engine.available === false)
      return false;
    const strategies = options.strategies;
    return strategies && Object.prototype.hasOwnProperty.call(strategies, engine.id) ? strategies[engine.id] === true : engine.defaultOn === true;
  }
  function restore(target, snapshot) {
    for (const key of Object.keys(target))
      delete target[key];
    Object.assign(target, snapshot);
  }
  var PRESERVE_PREFIX = "\x00pcc:";
  var PRESERVE_SUFFIX = "\x00";
  function preserveSettings(options) {
    const preserve = options && typeof options.preserve === "object" && options.preserve ? options.preserve : {};
    const turns = Number(preserve.lastTurns);
    return {
      system: preserve.system !== false,
      lastTurns: Number.isFinite(turns) ? Math.max(0, Math.min(50, Math.floor(turns))) : 2
    };
  }
  function guardPreservedSegments(body, ctx, options) {
    const settings = preserveSettings(options);
    const plan = { system: settings.system, lastTurns: settings.lastTurns, turns: 0, segments: 0, bytes: 0 };
    const idle = { plan, restore: () => ({ ...plan, restored: 0, markers: 0, rolledBack: false }) };
    const view = conversationView(body, ctx && ctx.protocol);
    if (!view || view.segments.length === 0)
      return idle;
    const order = [];
    const groups = new Map;
    for (const seg of view.segments) {
      if (!groups.has(seg.index)) {
        groups.set(seg.index, []);
        order.push(seg.index);
      }
      groups.get(seg.index).push(seg);
    }
    const userStarts = order.filter((index) => (groups.get(index) || []).some((seg) => seg.role === "user"));
    let guardFrom = null;
    if (settings.lastTurns > 0 && userStarts.length > 0) {
      guardFrom = userStarts.length > settings.lastTurns ? userStarts[userStarts.length - settings.lastTurns] : userStarts[0];
      plan.turns = Math.min(settings.lastTurns, userStarts.length);
    }
    const markers = new Map;
    const snapshot = clone(body);
    for (const seg of view.segments) {
      const keepSystem = settings.system && seg.role === "system";
      const keepTurn = guardFrom !== null && seg.index >= 0 && seg.index >= guardFrom;
      if (!keepSystem && !keepTurn)
        continue;
      plan.segments += 1;
      plan.bytes += seg.text.length;
      const marker = PRESERVE_PREFIX + markers.size + PRESERVE_SUFFIX;
      markers.set(marker, seg.text);
      seg.set(marker);
    }
    if (markers.size === 0)
      return idle;
    return {
      plan,
      restore() {
        const after = conversationView(body, ctx && ctx.protocol);
        if (after) {
          for (const seg of after.segments) {
            const original = markers.get(seg.text);
            if (original !== undefined)
              seg.set(original);
          }
        }
        const scan = conversationView(body, ctx && ctx.protocol);
        const leftover = scan ? scan.segments.some((seg) => typeof seg.text === "string" && seg.text.includes(PRESERVE_PREFIX)) : false;
        if (leftover) {
          restore(body, snapshot);
          return { ...plan, restored: 0, markers: markers.size, rolledBack: true };
        }
        return { ...plan, restored: markers.size, markers: markers.size, rolledBack: false };
      }
    };
  }
  function reasonFor(engine, ctx) {
    if (engine.available === false)
      return "unavailable";
    if (engine.id === "codex-responses" && ctx.protocol !== "responses")
      return "protocol_not_responses";
    if (engine.id === "codex-responses")
      return "no_eligible_response_item";
    if (engine.id === "headroom")
      return "no_eligible_json_array_or_not_smaller";
    if (engine.id === "session-dedup")
      return "no_repeat_eligible_block";
    if (engine.id === "rtk")
      return "no_matching_tool_output_filter";
    return "nothing_to_remove";
  }
  function texts(body, protocol) {
    return conversationView(body, protocol)?.segments.map((s) => s.text) || [];
  }
  function canonicalJson(text) {
    const canonical = (value) => {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? JSON.stringify(parsed) : value;
      } catch {
        return value;
      }
    };
    const trimmed = text.trim();
    if (trimmed.startsWith("["))
      return canonical(trimmed);
    return text.replace(/```json\n([\s\S]*?)\n```/g, (_, json) => canonical(json.trim()));
  }
  function dedupRoundTrip(beforeBody, body, ctx) {
    const map = ctx.state?.sessionDedup?.map || {};
    const before = texts(beforeBody, ctx.protocol), after = texts(body, ctx.protocol);
    let checked = 0, passed = 0;
    for (let i = 0;i < after.length; i++) {
      if (!after[i].includes("[dedup:ref sha="))
        continue;
      checked++;
      const restored = after[i].replace(/\[dedup:ref sha=([0-9a-f]{24})\]/g, (ref, sha) => map[sha] ?? ref);
      if (restored === before[i])
        passed++;
    }
    return { checked, passed };
  }
  function headroomRoundTrip(beforeBody, body, ctx) {
    const before = texts(beforeBody, ctx.protocol), after = texts(body, ctx.protocol);
    let checked = 0, passed = 0;
    for (let i = 0;i < after.length; i++) {
      const count = (after[i].match(/```gcf-generic/g) || []).length;
      if (!count)
        continue;
      checked += count;
      if (canonicalJson(before[i]) === restoreText(after[i]))
        passed += count;
    }
    return { checked, passed };
  }
  function runPipeline(body, ctx, options = {}, beforeBody = null) {
    const started = Date.now();
    const beforeBytes = byteLength2(body);
    const records = [];
    ctx.state = ctx.state || {};
    const guard = guardPreservedSegments(body, ctx, options);
    const budget = Number(options.budgetMs);
    const budgetMs = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;
    let failOpen = 0, roundTripsChecked = 0, roundTripsPassed = 0, budgetHit = 0;
    for (const engine of PIPELINE) {
      const record = { id: engine.id, label: engine.label || engine.id, available: engine.available !== false, enabled: strategyEnabled(engine, options), status: "skipped", reason: engine.available === false ? "unavailable" : "disabled", beforeBytes: byteLength2(body), afterBytes: 0, ms: 0 };
      if (!record.enabled) {
        record.afterBytes = record.beforeBytes;
        records.push(record);
        continue;
      }
      if (budgetMs > 0 && Date.now() - started > budgetMs) {
        record.reason = "budget_exceeded";
        record.afterBytes = record.beforeBytes;
        budgetHit += 1;
        records.push(record);
        continue;
      }
      const t = Date.now();
      const snapshot = clone(body);
      const stateSnapshot = clone(ctx.state);
      try {
        const cfg = options[engine.id] && typeof options[engine.id] === "object" ? options[engine.id] : {};
        const changed = engine.apply(body, ctx, cfg) === true;
        record.afterBytes = byteLength2(body);
        record.ms = Date.now() - t;
        record.status = changed ? "hit" : "skipped";
        record.reason = changed ? "changed" : reasonFor(engine, ctx);
        record.savedBytes = Math.max(0, record.beforeBytes - record.afterBytes);
        if (changed && engine.id === "session-dedup")
          record.roundTrip = dedupRoundTrip(snapshot, body, ctx);
        if (changed && engine.id === "headroom")
          record.roundTrip = headroomRoundTrip(snapshot, body, ctx);
        if (record.roundTrip) {
          roundTripsChecked += record.roundTrip.checked;
          roundTripsPassed += record.roundTrip.passed;
          if (record.roundTrip.passed !== record.roundTrip.checked)
            throw new Error("round_trip_mismatch");
        }
      } catch (error) {
        restore(body, snapshot);
        ctx.state = stateSnapshot;
        record.afterBytes = byteLength2(body);
        record.ms = Date.now() - t;
        record.status = "fail_open";
        record.reason = String(error?.message) === "round_trip_mismatch" ? "round_trip_mismatch" : "engine_error";
        record.error = String(error?.message || error).slice(0, 160);
        failOpen++;
      }
      records.push(record);
    }
    const preserved = guard.restore();
    const afterBytes = byteLength2(body);
    return {
      version: TELEMETRY_VERSION,
      ts: new Date().toISOString(),
      model: String(ctx.model || body.model || "").slice(0, 160),
      agent: String(ctx.agent || "unknown").slice(0, 80),
      protocol: String(ctx.protocol || "unknown"),
      session: String(ctx.session || "").slice(0, 100),
      beforeBytes,
      afterBytes,
      savedBytes: Math.max(0, beforeBytes - afterBytes),
      savedPct: beforeBytes ? Math.round((beforeBytes - afterBytes) / beforeBytes * 1e4) / 100 : 0,
      estimatedBeforeTokens: Math.ceil(beforeBytes / 4),
      estimatedAfterTokens: Math.ceil(afterBytes / 4),
      totalMs: Date.now() - started,
      budgetMs: budgetMs || 250,
      budgetExceeded: budgetHit,
      failOpen,
      roundTripsChecked,
      roundTripsPassed,
      preserved,
      strategies: records
    };
  }
  function removeInternalMarker(body) {
    if (body && typeof body === "object")
      delete body[INTERNAL_MARKER];
  }

  // lab.js
  var MAX_LAB_BYTES = 256000;
  var PROTOCOLS = new Set(["chat", "responses", "anthropic", "gemini"]);
  var encoder = new TextEncoder;
  function conversationText(body, protocol) {
    const view = conversationView(body, protocol);
    if (!view)
      return "";
    return view.segments.map((segment, index) => {
      const tags = [`#${index + 1}`, segment.role || "unknown"];
      if (segment.toolOutput)
        tags.push("tool");
      return `[${tags.join("] [")}] ${segment.text}`;
    }).join(`
`);
  }
  function inputError(message) {
    throw new Error(`实验室输入错误：${message}`);
  }
  function parseRequest(request) {
    if (!request || typeof request !== "object" || Array.isArray(request))
      inputError("请求必须是对象");
    const { mode, input, protocol, strategy } = request;
    if (mode !== "text" && mode !== "json")
      inputError("mode 仅支持 text 或 json");
    if (!PROTOCOLS.has(protocol))
      inputError("protocol 仅支持 chat、responses、anthropic、gemini");
    if (typeof input !== "string")
      inputError("input 必须是字符串");
    if (encoder.encode(input).length > MAX_LAB_BYTES)
      inputError(`input 不能超过 ${MAX_LAB_BYTES} 字节`);
    if (mode === "text")
      return { model: "lab", messages: [{ role: "user", content: input }] };
    let body;
    try {
      body = JSON.parse(input);
    } catch {
      inputError("JSON 格式无效");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      inputError("JSON 顶层必须是对象");
    return body;
  }
  async function runLab(request, options = {}) {
    const body = parseRequest(request);
    const { id, mode, protocol, strategy } = request;
    const meta = typeof strategy === "string" ? engineById(strategy) : null;
    if (!meta)
      inputError("策略不在引擎目录中");
    if (meta.available === false)
      inputError("策略当前不可用");
    if (!engineModule(strategy))
      inputError("策略没有可用实现");
    if (!options || typeof options !== "object" || Array.isArray(options))
      inputError("options 必须是对象");
    const strategies = Object.fromEntries(ENGINES.map((engine) => [engine.id, false]));
    strategies[strategy] = true;
    const bench = { ...options, strategies, preserve: { system: false, lastTurns: 0 } };
    const before = clone(body);
    const beforeText = conversationText(before, protocol);
    try {
      const ctx = { protocol, state: {}, origin: "local" };
      const result = await runPipeline(body, ctx, bench);
      const report = result;
      const record = report.strategies.find((item) => item.id === strategy) || null;
      removeInternalMarker(body, options, strategy);
      const after = body;
      return {
        id,
        ok: true,
        at: new Date().toISOString(),
        mode,
        protocol,
        strategy,
        before,
        after,
        beforeText,
        afterText: conversationText(after, protocol),
        record,
        report,
        error: null
      };
    } catch (error) {
      return {
        id,
        ok: false,
        at: new Date().toISOString(),
        mode,
        protocol,
        strategy,
        before,
        after: before,
        beforeText,
        afterText: beforeText,
        record: null,
        report: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // page/lab-engine.js
  var encoder2 = new TextEncoder;
  var REASON_ZH = {
    no_repeat_eligible_block: "输入里没有重复出现的块——去重要靠同一会话里已经发过的文本。",
    nothing_to_remove: "扫过了：这段文本里没有它能去掉的东西。",
    no_whitespace_or_tool_result_change: "输入里没有多余空白、重复行或可以精简的工具输出。",
    no_matching_tool_output_filter: "输入里没有识别到命令输出——这个策略只处理工具结果。",
    no_eligible_json_array_or_not_smaller: "没有够大的 JSON 数组可折叠，或者压完反而更大。",
    no_eligible_response_item: "这条请求里没有 Responses 协议的 shell / patch / search 工具输出。",
    protocol_not_responses: "这个策略只对 Responses 协议生效，实验室目前按 chat 跑。",
    budget_exceeded: "超出了这次试压的时间预算。",
    round_trip_mismatch: "压完还原不回去，已按 fail-open 回滚。",
    engine_error: "策略内部报错，已按 fail-open 回滚。",
    unavailable: "这个策略在当前环境里跑不了。",
    disabled: "这次没启用这个策略。",
    changed: "改动了。"
  };
  globalThis.CompressLab = {
    engines: ENGINES.map(function(e) {
      return { id: e.id, label: e.label, available: e.available !== false, why: e.why || "" };
    }),
    async run(input, strategy, options, mode) {
      if (typeof input !== "string" || !input.trim())
        throw new Error("请输入要试压的文本。");
      if (encoder2.encode(input).length > 256000)
        throw new Error("试压文本不能超过 256 KB。");
      const meta = engineById(strategy);
      if (!meta || meta.available === false)
        throw new Error("这个策略当前不可用。");
      const shape = mode === "json" ? "json" : "text";
      if (shape === "json") {
        let parsed = null;
        try {
          parsed = JSON.parse(input);
        } catch {
          throw new Error("请求体 JSON 解析失败，检查一下括号和引号。");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("请求体 JSON 的顶层必须是对象。");
      }
      const result = await runLab({ id: `lab-${Date.now()}`, mode: shape, input, protocol: "chat", strategy }, options);
      if (!result.ok)
        throw new Error(result.error || "试压失败");
      const record = result.record || {};
      return {
        id: result.id,
        at: result.at,
        strategy,
        label: meta.label || strategy,
        why: meta.why || "",
        mode: shape,
        status: record.status || "skipped",
        reason: record.reason || "",
        reasonText: REASON_ZH[record.reason] || "",
        ms: record.ms || 0,
        before: result.report.beforeBytes,
        after: result.report.afterBytes,
        saved: result.report.savedBytes,
        beforeText: result.beforeText,
        afterText: result.afterText,
        error: null
      };
    }
  };
})();
