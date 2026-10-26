// Local OpenAI-compatible ground-truth endpoint. No upstream network access.
import http from "node:http"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const port = Number(process.env.COMPRESS_ECHO_PORT || 4319)
const dir = process.env.COMPRESS_ECHO_DIR || join(process.cwd(), "test", "artifacts")
mkdirSync(dir, { recursive: true })
const captures = join(dir, "echo-captures.jsonl")
let sequence = 0

const server = http.createServer((req, res) => {
  const chunks = []
  req.on("data", c => chunks.push(c))
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8")
    let body
    try { body = JSON.parse(raw || "{}") } catch { body = { parseError: true } }
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ object: "list", data: [{ id: "echo-test", object: "model" }] }))
      return
    }
    if (req.method === "GET" && req.url === "/captures") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" })
      res.end(existsSync(captures) ? `[${readFileSync(captures, "utf8").trim().split("\n").join(",")}]` : "[]")
      return
    }
    const id = ++sequence
    writeFileSync(captures, JSON.stringify({ id, ts: new Date().toISOString(), path: req.url, headers: req.headers, body }) + "\n", { flag: "a" })
    writeFileSync(join(dir, `echo-${id}.json`), JSON.stringify({ path: req.url, headers: req.headers, body }, null, 2))
    const bytes = Buffer.byteLength(raw)
    const isAnthropic = req.url.includes("/messages")
    const output = isAnthropic
      ? { id: `msg_echo_${id}`, type: "message", role: "assistant", model: "echo-test", content: [{ type: "text", text: "ECHO_OK" }], stop_reason: "end_turn", usage: { input_tokens: Math.ceil(bytes / 4), output_tokens: 1 } }
      : { id: `chatcmpl-echo-${id}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: "echo-test", choices: [{ index: 0, message: { role: "assistant", content: "ECHO_OK" }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(bytes / 4), completion_tokens: 1, total_tokens: Math.ceil(bytes / 4) + 1 } }
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify(output))
  })
})
server.listen(port, "127.0.0.1", () => console.log(`compress echo http://127.0.0.1:${port}/v1`))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))
