[中文](./ccr-retrieval-chain.md) | English

# CCR Compression-Retrieve Chain (task-3 · 2026-10-29)

> **What this is**: ccr replaces large blocks of text in a request with a one-line hash
> tag (`[CCR retrieve hash=…]`), while the original text is stored verbatim in a local
> store file. When the model needs the original text, it calls the `omniroute_ccr_retrieve`
> tool to retrieve it by hash — hence "lossless compression". **The prerequisite is that
> the agent's tool list includes this retrieve tool**: when it is absent, the ccr gate
> lets the request pass through without compressing anything (`no_retrieve_tool`), because
> once compressed the model would have no way to get the original back. Installation:
> click the "Install retrieve" button in the panel, or run `magpie library mcp add`
> (see below). A more accessible introduction is in the README's "ccr and retrieve"
> section; this document covers the technical details.

## Architecture

```
Caller body (tools includes omniroute_ccr_retrieve)
   │  magpie → Bun host observability.hooks.js
   ▼
engines/ccr/index.js  applyCcr()
   ├─ Gate detectRetrieveCapability (single implementation in harness.js, upstream #7746;
   │    direct = tools[] / indirect = code tool + agent / deferred = ToolSearch manifest;
   │    can be turned off with requireRetrieveTool:false)
   ├─ Hit: message segments → preamble (200 chars) + [CCR retrieve hash=<24hex> chars=N]
   ├─ Original text written to shared store (injected as ctx.ccrStore; not injected =
   │    per-request in-memory store, moejs semantics)
   └─ Protocol directive [CCR protocol]… injected idempotently into system
      (deferred uses the ToolSearch variant)
   ▼
ccr-store-file.js  createPersistentCcrStore()
   └─ Debounced 2s flush to disk at <data dir>/ccr-store.json
      (blocks >512KB stay in memory only, same as upstream)
   ▼
mcp/ccr-retrieve-server.mjs (stdio MCP, zero dependencies)
   └─ omniroute_ccr_retrieve(hash, mode=full|head|tail|lines|grep|stats)
      full ≤256KiB; retrieve counts merged and written back to file →
      ramp takes effect across processes
```

## The Gate's Reachable Shapes (harness.js)

| Shape | Criterion | Typical callers |
|:--|:--|:--|
| `direct` | `body.tools[]` contains a name ending in `omniroute_ccr_retrieve` (`__ _ . / : -` separators all work) | Claude Code (older versions), Copilot, codex `type:"mcp"` |
| `indirect` | There is a code tool (eval/execute/…) and the agent is in the `INDIRECT_CALL_HINTS` allowlist (a **declaration heuristic, not proof of reachability**) | omp / pi / opencode |
| `deferred` | system/instructions mention "deferred tools / ToolSearch", and the tool name appears **on its own line** | Claude Code 2.1.3xx (deferred MCP tool loading) |
| `none` | None of the above hold | hindsight, clients without retrieve installed |

`deferred` was added on 2026-11-04: Claude Code moved MCP tools out of `tools[]` into a
ToolSearch manifest in system, so a gate that only checks `tools[]` silently degrades to
`no_retrieve_tool`. The detection reads only `tools[]` / `system` / `instructions` and
**does not scan message bodies** — a tool name mentioned in the body does not mean the
model can call it. `test/harness-matrix.test.mjs` pins a fixture for each shape.

Two additions on 2026-11-12:

- The detection now also accepts one more shape: explicit text blocks (`text` / `input_text`
  only) inside the content block array of a **system/developer message**
  (`[{type:"text",text:…}]`); user/assistant/tool messages and every other block type stay
  out of scope. A native Claude CLI loopback request confirms this container: the old gate returns `none`
  and the repaired gate returns `deferred`. Historical linearized captures still cannot
  recover the container structure of older requests.
- **Indirect reach is not proof of retrieval**: `indirect` is only a declaration heuristic
  (a code tool plus an agent on the allowlist) and does not prove the model will call it.
  codex usually ships a shell/`exec_command`, but a shell is not a retrieval channel, so
  codex has been removed from `INDIRECT_CALL_HINTS`: ccr only compresses for codex when the
  tool is declared explicitly (full name in `tools[]`, or `type:"mcp"`) or a deferred
  manifest matches. If `/mcp/run/ccr-retrieve` returns 404 on the current host (the gateway
  run gate did not hand the server to that agent), prefer setting ccr-retrieve to direct
  (the stdio command) in the Library: the sync rewrites each agent's configuration from it
  and survives later syncs. Whether each client is actually repaired must be verified
  independently; a code-side fix is not proof of it.

All of the above is only the **gate**; an actual retrieval needs the caller to call the
tool, and historical hit numbers are snapshots from their own dates, not proof that every
client is healthy.

If a call reports `MCP tool call requires approval, but approval policy is never`, the client approval
layer is blocking it; transport reachability still needs independent verification. For the installed,
trusted CCR tool only, add this user-level override while preserving global sandbox and approval settings:

```toml
[mcp_servers.ccr-retrieve.tools.omniroute_ccr_retrieve]
approval_mode = "approve"
```

The tool updates retrieval counters, so authorize it explicitly rather than mislabeling it read-only.
On the current host this override survived Library sync, and a fresh native Codex session retrieved the
original without a temporary approval override. See the [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

## Installing the retrieve tool (caller agent side, one-time)

```sh
magpie library mcp add ccr-retrieve node <plugin directory>/mcp/ccr-retrieve-server.mjs
```

Or click the "Install retrieve" button in the UI (in the presets area, next to the save
button): the page writes options `ccrCommand: { id, action: "install-mcp" }`, and on the
next local request options-commands.js executes the same command (result recorded in
commands.json, idempotent; replaying the same id does not re-execute). The result is also
published as `compress-ccr-status.js` in the page directory; the panel polls for it and
re-renders the button: done locks in as "Installed", error shows "Install failed, click
to retry". Idempotency in three layers: the `completed` set (in-process) → the
commands.json journal (after a host restart, replaying the same id re-renders done
without executing) → add reporting "already has a server" is treated as success (same
name already installed). **Agent dispatch**: add without an agents parameter assigns the
server to zero agents by default (the gate still does not pass). It takes
`options.ccrAgents` (comma-separated ids); the default falls back to the union of agents
that already have library MCP entries in library.json (those ids are valid — magpie
fails the whole entry on unknown ids, so no guessing); if nothing can be resolved, it
installs without assigning. Store path resolution: argv > CCR_STORE_PATH >
COMPRESS_CORE_DATA_DIR/MAGPIE_CONFIG_DIR defaults.

## Differences from upstream (all deliberate)

| Aspect | Upstream OmniRoute | This port | Reason |
|:--|:--|:--|:--|
| Persistence layer | better-sqlite3 | JSON atomic write (tmp+rename) | No new npm dependencies |
| Tool registration | MCP built into the gateway | Standalone stdio MCP server | magpie has no onToolCall hook |
| Count concurrency | Single-process Map | Max-merge before flush to disk | hooks and the tool are two processes |
| Gate failure | Silent skip | state.ccrGateReason → telemetry reason `no_retrieve_tool` | Observability |

## Verification evidence

- test/ccr-persist.test.mjs P-1 through P-11 all green (serialization round-trip,
  expiry eviction, 512KB cap, persistent handle, end-to-end hit + fulfillment, gate
  reason, ramp persistence, MCP layer, path resolution, install-command journal, and
  idempotent replay)
- stdio smoke test: real child process JSON-RPC initialize/tools/list/tools/call;
  full mode retrieved 6000 chars byte-for-byte identical.
- Replay behavior unchanged: historical captures do not declare the retrieve tool, so
  ccr skips per the gate (upstream semantics); the telemetry reason changed from the
  generic `nothing_to_remove` to the accurate `no_retrieve_tool`.
- Blocks **strictly above** the 512KiB persistence cap: the Bun host skips compression by the
  serialization exclusion rule, the original text goes out unchanged (a block of exactly
  512KiB is still written).
- The production pipeline validates **only the segments this request actually replaced**
  (the injected protocol directive and pre-existing markers do not count); a mapping mismatch
  rolls back to the snapshot from just before ccr, not the body from before the whole
  pipeline. The Bun host `await`s the store being ready before compressing and publishes a
  marker only once this request's originals are flushed; on failure the original stays.
  A successful flush is not a promise of retrievable forever — TTL expiry and eviction still
  apply.
- Historical replay and hit numbers are snapshots taken on their own dates, not a
  guarantee that every client is healthy.
