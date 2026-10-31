// 由 scripts/gen-page-catalog.mjs 生成，不要手改。真相源是 catalog.js 与各引擎的 configSchema。
globalThis.CompressCatalog = {
  "engines": [
    {
      "id": "session-dedup",
      "label": "Session Dedup",
      "description": "Lossless — elides only text already sent earlier in the same session; nothing is summarized or dropped. Negligible latency overhead.",
      "why": "本会话里已出现过的重复文本换成引用；原文仍在历史中，不总结、不删改。",
      "stackPriority": 3,
      "lossy": false,
      "cacheImpact": "low",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "minBlockChars",
          "type": "number",
          "label": "最小块字符",
          "description": "小于这个长度的文本块不参与去重。",
          "defaultValue": 80,
          "min": 20,
          "max": 4000
        },
        {
          "key": "fuzzy",
          "type": "boolean",
          "label": "模糊近似去重",
          "description": "把与更早消息相似度 ≥85% 的整条消息换成可取回的 CCR 引用。需要调用方带 CCR retrieve 工具，否则自动跳过。相似度阈值等细参只能手写 options。",
          "defaultValue": false
        },
        {
          "key": "preserveCurrentTurn",
          "type": "boolean",
          "label": "保护当前轮",
          "description": "默认关：正在发送的这一轮也照常去重，前缀严格稳定、缓存不失配。开启后当前轮原样送出，代价是它变成历史的那一轮被改写一次、缓存失配一次。",
          "defaultValue": false
        }
      ]
    },
    {
      "id": "ccr",
      "label": "CCR",
      "description": "Lossless — replaces large repeated/contiguous blocks with content-addressed references instead of deleting them; the original content stays retrievable.",
      "why": "把大的重复/连续块换成可取回的引用；装了 retrieve 工具才启用。",
      "stackPriority": 4,
      "lossy": false,
      "cacheImpact": "low",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "minChars",
          "type": "number",
          "label": "Minimum block characters",
          "description": "Minimum character count for a block to be a CCR candidate.",
          "defaultValue": 600,
          "min": 100,
          "max": 1000000
        },
        {
          "key": "retrievalRampFactor",
          "type": "number",
          "label": "Retrieval ramp factor (H8)",
          "description": "How steeply frequently-retrieved blocks resist compression. Each prior retrieval raises the effective minimum block size linearly; 1 disables the ramp (binary skip at the threshold only).",
          "defaultValue": 2,
          "min": 1,
          "max": 100
        },
        {
          "key": "minBlockBytes",
          "type": "number",
          "label": "最小块字节",
          "description": "小于这个 UTF-8 字节数的块不换成引用；0 表示只用 minChars 的字符阈值。",
          "defaultValue": 2048,
          "min": 0,
          "max": 65536
        },
        {
          "key": "minRepeat",
          "type": "number",
          "label": "最少重复次数",
          "description": "同一块在本次 body 里至少出现几次才折叠；1 = 上游语义（不要求重复）。",
          "defaultValue": 1,
          "min": 1,
          "max": 10
        },
        {
          "key": "requireRetrieveTool",
          "type": "boolean",
          "label": "要求调用方能取回",
          "description": "上游门控：只有 tools[] 里声明了 omniroute_ccr_retrieve 的调用方才压缩。关掉它 = marker 无法兑现，引擎实际有损。",
          "defaultValue": true
        }
      ]
    },
    {
      "id": "lite",
      "label": "Lite Cleanup",
      "description": "Safest mode (~15% savings, <1ms latency): whitespace/dedup/formatting cleanup only, zero semantic change. Always safe to leave on.",
      "why": "只清空白、重复行和格式；内容唯一的流量上通常只省 0.1–1%，不是固定 15%。",
      "stackPriority": 5,
      "lossy": false,
      "cacheImpact": "none",
      "isSingleMode": true,
      "levels": null,
      "sampling": false,
      "inputScope": "mixed",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "compressToolResults",
          "type": "boolean",
          "label": "压缩工具输出",
          "description": "超过 maxToolLength 的工具输出只留头部并标记截断（有损，默认关）。开启会改写模型已读过的消息、前缀失配；只留头部意味着报错常在尾部时会丢。要保住报错行请改用 rtk（它按 severity 词表保护）。",
          "defaultValue": false
        },
        {
          "key": "maxToolLength",
          "type": "number",
          "label": "工具输出上限",
          "description": "超过这个字符数的工具输出会被截断，仅在「压缩工具输出」开启时生效。低于 2000 回落到 2000。",
          "defaultValue": 2000,
          "min": 200,
          "max": 20000
        },
        {
          "key": "preserveSystemPrompt",
          "type": "boolean",
          "label": "保护系统提示词",
          "description": "完全不碰 system 消息。默认关：system 段也参与空白折叠与同文去重。",
          "defaultValue": false
        },
        {
          "key": "preserveCurrentTurn",
          "type": "boolean",
          "label": "保护当前轮",
          "description": "默认关：全量改写，严格前缀稳定，缓存一次都不失配（代价是刚打的字也会被折叠空白）。开启换回保守模式：最后一条 assistant 之后的消息原样送出，只在它变成历史的那一轮被改写一次、缓存失配一次。",
          "defaultValue": false
        },
        {
          "key": "supportsVision",
          "type": "boolean",
          "label": "目标模型看得见图",
          "description": "默认 true（不动图）。设成 false 才把 data:image/* 附件换成一行 [image: png] 占位——那是「模型读不了图」的兼容处理，不是压缩。早前的版本按模型名自动判定，结果名字不像视觉模型的会把用户截图换掉。",
          "defaultValue": true
        }
      ]
    },
    {
      "id": "rtk",
      "label": "RTK Tool Output",
      "description": "Strips ANSI noise, progress bars, and repeated lines from command/tool output while preserving failures, warnings, and summaries (60-90% upstream savings)",
      "why": "只作用于工具输出：剥 ANSI/进度条/重复行，保留报错与摘要；噪音密集时该部分可省 60–95%。",
      "stackPriority": 10,
      "lossy": true,
      "cacheImpact": "moderate",
      "isSingleMode": true,
      "levels": [
        "minimal",
        "standard",
        "aggressive"
      ],
      "sampling": false,
      "inputScope": "tool-results",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "intensity",
          "type": "select",
          "label": "强度",
          "description": "minimal 放宽行数上限只去噪音，standard 默认，aggressive 收紧头尾保留、压得更狠。",
          "defaultValue": "standard",
          "options": [
            {
              "value": "minimal",
              "label": "轻（minimal）"
            },
            {
              "value": "standard",
              "label": "标准（standard）"
            },
            {
              "value": "aggressive",
              "label": "激进（aggressive）"
            }
          ]
        },
        {
          "key": "maxLinesPerResult",
          "type": "number",
          "label": "每个结果最多行数",
          "description": "工具输出超过这个行数就截断，保头+尾+报错行（severity 词表恒保留）。0 表示不按行截。",
          "defaultValue": 120,
          "min": 0,
          "max": 10000
        },
        {
          "key": "maxCharsPerResult",
          "type": "number",
          "label": "每个结果最多字符",
          "description": "在行数截断之后再按字符兜底。0 表示不按字符截。",
          "defaultValue": 0,
          "min": 0,
          "max": 1000000
        },
        {
          "key": "deduplicateThreshold",
          "type": "number",
          "label": "重复行折叠阈值",
          "description": "同一行连续出现达到这个次数就折叠成一条带计数的摘要。",
          "defaultValue": 3,
          "min": 2,
          "max": 100
        },
        {
          "key": "enableGrouping",
          "type": "boolean",
          "label": "相似行分组",
          "description": "把结构相似的行归并成组（默认关，opt-in）。",
          "defaultValue": false
        },
        {
          "key": "groupingThreshold",
          "type": "number",
          "label": "分组阈值",
          "description": "相似行达到这个条数才分组，仅在「相似行分组」开启时生效。",
          "defaultValue": 3,
          "min": 2,
          "max": 100
        },
        {
          "key": "disabledFilters",
          "type": "multiselect",
          "label": "停用的内置过滤器",
          "description": "勾选的内置过滤器不生效。留空 = 全部启用。",
          "defaultValue": [],
          "options": [
            {
              "value": "git-status",
              "label": "git-status"
            },
            {
              "value": "git-log",
              "label": "git-log"
            },
            {
              "value": "git-diff",
              "label": "git-diff"
            },
            {
              "value": "docker-logs",
              "label": "docker-logs"
            },
            {
              "value": "npm-install",
              "label": "npm-install"
            },
            {
              "value": "build-typescript",
              "label": "build-typescript"
            },
            {
              "value": "error-stacktrace",
              "label": "error-stacktrace"
            },
            {
              "value": "generic-output",
              "label": "generic-output"
            }
          ]
        },
        {
          "key": "applyToToolResults",
          "type": "boolean",
          "label": "作用于工具结果",
          "description": "对 tool / tool_result 内容做处理（默认开）。关掉基本等于停用本引擎。",
          "defaultValue": true
        },
        {
          "key": "preserveDocstrings",
          "type": "boolean",
          "label": "保留文档字符串",
          "description": "代码块里的 docstring / 文档注释原样保留（默认开）。",
          "defaultValue": true
        }
      ]
    },
    {
      "id": "codex-responses",
      "label": "Codex Tool Output",
      "description": "Conservative compression of shell/patch/search/build tool output on the OpenAI Responses API.",
      "why": "Responses 接口里 shell / patch / search / build 工具输出的保守压缩。",
      "stackPriority": 12,
      "lossy": true,
      "cacheImpact": "low",
      "isSingleMode": true,
      "levels": null,
      "sampling": false,
      "inputScope": "tool-results",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "minBytes",
          "type": "number",
          "label": "最小输出字节",
          "description": "工具输出小于这个字节数就不压（压了也不划算）。",
          "defaultValue": 512,
          "min": 0,
          "max": 2000000
        },
        {
          "key": "maxOutputBytes",
          "type": "number",
          "label": "最大输出字节",
          "description": "单个工具输出的处理上限，超过则不再尝试压缩。",
          "defaultValue": 2097152,
          "min": 1,
          "max": 10000000
        },
        {
          "key": "maxCandidateBytes",
          "type": "number",
          "label": "最大候选字节",
          "description": "参与压缩判断的候选块字节上限。",
          "defaultValue": 524288,
          "min": 1,
          "max": 2000000
        },
        {
          "key": "maxLines",
          "type": "number",
          "label": "最多保留行数",
          "description": "日志类输出折叠后最多保留的行数。",
          "defaultValue": 160,
          "min": 1,
          "max": 10000
        },
        {
          "key": "minSearchMatches",
          "type": "number",
          "label": "搜索结果最小匹配数",
          "description": "web_search 类输出达到这个匹配条数才折叠。",
          "defaultValue": 8,
          "min": 2,
          "max": 10000
        },
        {
          "key": "minLogLines",
          "type": "number",
          "label": "日志最小行数",
          "description": "日志类输出达到这个行数才折叠。",
          "defaultValue": 24,
          "min": 2,
          "max": 10000
        }
      ]
    },
    {
      "id": "headroom",
      "label": "Headroom (GCF)",
      "description": "Column-wise compaction of tabular JSON into [N rows] form while keeping the structure readable.",
      "why": "把表格化的 JSON 按列压紧成 [N rows]，结构仍然可读。",
      "stackPriority": 15,
      "lossy": false,
      "cacheImpact": "low",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "tool-results",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "minRows",
          "type": "number",
          "label": "最小行数",
          "description": "表格化 JSON 的行数少于这个值就不压（压了也省不下什么）。",
          "defaultValue": 8,
          "min": 2,
          "max": 200
        }
      ]
    },
    {
      "id": "relevance",
      "label": "Relevance",
      "description": "Sentence-level relevance scoring against the last user query; low-scoring sentences are dropped.",
      "why": "按最后一条用户消息给句子打分，丢掉低分句。",
      "stackPriority": 18,
      "lossy": true,
      "cacheImpact": "moderate",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "overlapThreshold",
          "type": "number",
          "label": "Overlap threshold",
          "description": "Sentences with Jaccard overlap below this are candidates for removal.",
          "defaultValue": 0.1,
          "min": 0,
          "max": 1
        },
        {
          "key": "budgetPercent",
          "type": "number",
          "label": "Budget percent",
          "description": "Target fraction of original character count to retain (0–1).",
          "defaultValue": 0.5,
          "min": 0.1,
          "max": 1
        },
        {
          "key": "boilerplateWeight",
          "type": "number",
          "label": "Boilerplate weight",
          "description": "Weight applied to boilerplate penalty when scoring sentences.",
          "defaultValue": 0.5,
          "min": 0,
          "max": 1
        }
      ]
    },
    {
      "id": "caveman",
      "label": "Caveman",
      "description": "Rule-based prose compaction (~30% at full strength) driven by per-language rule packs.",
      "why": "按语言规则包压缩用户散文；实测约 10–20%（上游标称 30%），保留代码与事实。",
      "stackPriority": 20,
      "lossy": true,
      "cacheImpact": "moderate",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "lang",
          "type": "select",
          "label": "语言",
          "description": "auto 按内容自动判断（汉字无假名判中文，其余按关键词打分）；失败回落到英文规则包。",
          "defaultValue": "auto",
          "options": [
            {
              "value": "auto",
              "label": "自动检测"
            },
            {
              "value": "en",
              "label": "English"
            },
            {
              "value": "zh",
              "label": "简体中文"
            },
            {
              "value": "de",
              "label": "Deutsch"
            },
            {
              "value": "es",
              "label": "Español"
            },
            {
              "value": "fr",
              "label": "Français"
            },
            {
              "value": "hu",
              "label": "Magyar"
            },
            {
              "value": "id",
              "label": "Bahasa Indonesia"
            },
            {
              "value": "it",
              "label": "Italiano"
            },
            {
              "value": "ja",
              "label": "日本語"
            },
            {
              "value": "pt-BR",
              "label": "Português (BR)"
            },
            {
              "value": "ru",
              "label": "Русский"
            }
          ]
        },
        {
          "key": "groups",
          "type": "multiselect",
          "label": "规则组",
          "description": "只跑选中的规则组。zh 包只有 dedup / filler / ultra 三组。",
          "defaultValue": [
            "context",
            "dedup",
            "filler",
            "structural",
            "ultra"
          ],
          "options": [
            {
              "value": "context",
              "label": "上下文（context）"
            },
            {
              "value": "dedup",
              "label": "去重（dedup）"
            },
            {
              "value": "filler",
              "label": "填充词（filler）"
            },
            {
              "value": "structural",
              "label": "结构（structural）"
            },
            {
              "value": "ultra",
              "label": "激进（ultra）"
            }
          ]
        },
        {
          "key": "intensity",
          "type": "select",
          "label": "强度",
          "description": "lite 只删客套话，full 加结构性改写，ultra 最激进。",
          "defaultValue": "full",
          "options": [
            {
              "value": "lite",
              "label": "轻（lite）"
            },
            {
              "value": "full",
              "label": "标准（full）"
            },
            {
              "value": "ultra",
              "label": "激进（ultra）"
            }
          ]
        },
        {
          "key": "compressRoles",
          "type": "multiselect",
          "label": "作用角色",
          "description": "默认只压 user 消息，system 提示词与 assistant 历史保持原样。",
          "defaultValue": [
            "user"
          ],
          "options": [
            {
              "value": "user",
              "label": "user"
            },
            {
              "value": "assistant",
              "label": "assistant"
            },
            {
              "value": "system",
              "label": "system"
            }
          ]
        },
        {
          "key": "preserveCode",
          "type": "boolean",
          "label": "保护代码与路径",
          "description": "代码围栏、行内代码、URL、文件路径、错误行永不被改写。关掉有破坏代码的风险。",
          "defaultValue": true
        },
        {
          "key": "minMessageLength",
          "type": "number",
          "label": "最小压缩长度",
          "description": "短于这个字符数的文本段直接跳过（规则作用在短句上容易误伤）。",
          "defaultValue": 50,
          "min": 0,
          "max": 4000
        }
      ]
    },
    {
      "id": "read-lifecycle",
      "label": "Read Lifecycle",
      "description": "Collapses Read tool results that a strictly-later Read or Write superseded, keeping only the newest view of each path.",
      "why": "同一文件反复 Read 时，把被后续 Read/Write 覆盖掉的旧结果折叠成短 stub，只留最新一次。（注意：同一条路径被再次 Read/Write 时，更早的结果会被折叠，prefix 随之失配。）",
      "stackPriority": 2,
      "lossy": true,
      "cacheImpact": "moderate",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "tool-results",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "keepStub",
          "type": "boolean",
          "label": "保留 stub 行",
          "description": "关掉后旧 Read 结果被整段清空（最省，但模型看不到任何痕迹）。",
          "defaultValue": true
        },
        {
          "key": "stubChars",
          "type": "number",
          "label": "stub 摘要字符数",
          "description": "stubKeepSummary 开启时，摘要里保留原文多少字符；0 = 只给字符/行数。",
          "defaultValue": 120,
          "min": 0,
          "max": 2000
        },
        {
          "key": "stubKeepSummary",
          "type": "boolean",
          "label": "stub 保留原文摘要",
          "description": "在 stub 行后追加「原 N 字符 / M 行 + 开头片段」，让模型知道被折叠的是什么。",
          "defaultValue": false
        },
        {
          "key": "readToolNames",
          "type": "multiselect",
          "label": "Read 工具名",
          "description": "空 = 用内置集合；非空 = 替换内置集合。",
          "defaultValue": [],
          "options": [
            {
              "value": "read",
              "label": "read"
            },
            {
              "value": "read_file",
              "label": "read_file"
            },
            {
              "value": "readfile",
              "label": "readfile"
            },
            {
              "value": "view",
              "label": "view"
            },
            {
              "value": "view_file",
              "label": "view_file"
            },
            {
              "value": "cat",
              "label": "cat"
            }
          ]
        },
        {
          "key": "writeToolNames",
          "type": "multiselect",
          "label": "Write 工具名",
          "description": "空 = 用内置集合；非空 = 替换内置集合。",
          "defaultValue": [],
          "options": [
            {
              "value": "write",
              "label": "write"
            },
            {
              "value": "write_file",
              "label": "write_file"
            },
            {
              "value": "writefile",
              "label": "writefile"
            },
            {
              "value": "edit",
              "label": "edit"
            },
            {
              "value": "edit_file",
              "label": "edit_file"
            },
            {
              "value": "multiedit",
              "label": "multiedit"
            },
            {
              "value": "str_replace",
              "label": "str_replace"
            },
            {
              "value": "str_replace_editor",
              "label": "str_replace_editor"
            },
            {
              "value": "str_replace_based_edit_tool",
              "label": "str_replace_based_edit_tool"
            },
            {
              "value": "apply_patch",
              "label": "apply_patch"
            },
            {
              "value": "create_file",
              "label": "create_file"
            },
            {
              "value": "update_file",
              "label": "update_file"
            }
          ]
        }
      ]
    },
    {
      "id": "aggressive",
      "label": "Aggressive",
      "description": "Summarizes older turns and progressively ages them out (~50%), keeping recent detail intact.",
      "why": "把较早的轮次摘要化并逐步老化，只保留最近的细节（约 50%）。（注意：每新增一轮对话都会重写更早的轮次，prompt cache 的 prefix 会随之前移失配。）",
      "stackPriority": 30,
      "lossy": true,
      "cacheImpact": "high",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "keepTurns",
          "type": "number",
          "label": "保留最近轮次",
          "description": "最近这么多轮对话原样保留",
          "defaultValue": 4,
          "min": 1,
          "max": 30
        },
        {
          "key": "summaryChars",
          "type": "number",
          "label": "摘要长度",
          "description": "每段被摘要化内容的字符上限",
          "defaultValue": 400,
          "min": 80,
          "max": 4000
        }
      ]
    },
    {
      "id": "llmlingua",
      "label": "LLMLingua-2",
      "description": "LLMLingua-2 ONNX semantic pruning on a worker thread; the model is an optional dependency.",
      "why": "用 LLMLingua-2 的 ONNX 模型做语义剪枝。",
      "stackPriority": 35,
      "lossy": true,
      "cacheImpact": "high",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": false,
      "requires": "需要 @atjsh/llmlingua-2 + ONNX 模型文件，插件宿主里跑不了 worker",
      "fields": [
        {
          "key": "rate",
          "type": "number",
          "label": "压缩率",
          "description": "保留多少比例的内容",
          "defaultValue": 0.5,
          "min": 0.1,
          "max": 0.9
        }
      ]
    },
    {
      "id": "ultra",
      "label": "Ultra",
      "description": "Heuristic token-level pruning (~75%) — the most aggressive fully-local option.",
      "why": "启发式 token 级剪枝；实测约 30–35%（上游标称 75%，默认保留率 0.5）。",
      "stackPriority": 40,
      "lossy": true,
      "cacheImpact": "high",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "compressionRate",
          "type": "number",
          "label": "保留比例",
          "description": "剪枝后**保留**多少比例的词 token（0–1，默认 0.5 = 保留一半）。数值越低压得越狠。",
          "defaultValue": 0.5,
          "min": 0,
          "max": 1
        },
        {
          "key": "minScoreThreshold",
          "type": "number",
          "label": "分数门槛",
          "description": "低于此分的 token 才可剪；分数越高剪得越少。",
          "defaultValue": 0.3,
          "min": 0,
          "max": 1
        },
        {
          "key": "maxTokensPerMessage",
          "type": "number",
          "label": "单条上限",
          "description": "单条消息最多处理的 token 数，0 表示不限。",
          "defaultValue": 0,
          "min": 0,
          "max": 32768
        }
      ]
    },
    {
      "id": "ionizer",
      "label": "Ionizer",
      "description": "Sampling-based compaction that drops low-information fragments and keeps the skeleton and key facts. Deliberately lossy.",
      "why": "按采样策略丢掉低信息量片段，保留骨架与关键事实（故意有损）。",
      "stackPriority": 50,
      "lossy": true,
      "cacheImpact": "high",
      "isSingleMode": false,
      "levels": null,
      "sampling": true,
      "inputScope": "messages",
      "available": true,
      "requires": null,
      "fields": [
        {
          "key": "sampleRate",
          "type": "number",
          "label": "采样率",
          "description": "保留多少比例的片段",
          "defaultValue": 0.4,
          "min": 0.1,
          "max": 0.9
        }
      ]
    },
    {
      "id": "llm",
      "label": "LLM Compressor",
      "description": "Condenses prose through a pluggable chat-completion backend. Ships with a no-op backend, so out of the box it never mutates the payload.",
      "why": "用一个 LLM 压缩散文。没有外部模型后端时原样放行。",
      "stackPriority": 60,
      "lossy": true,
      "cacheImpact": "high",
      "isSingleMode": false,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": false,
      "requires": "需要一个外部 chat-completion 后端，本插件内无法提供",
      "fields": [
        {
          "key": "maxChars",
          "type": "number",
          "label": "单段上限",
          "description": "交给后端压缩的文本长度上限",
          "defaultValue": 4000,
          "min": 500,
          "max": 20000
        }
      ]
    },
    {
      "id": "omniglyph",
      "label": "OmniGlyph",
      "description": "Experimental context-as-image encoding routed directly to Claude Fable 5 only — the most aggressive and least broadly compatible option; not recommended as a general-purpose default.",
      "why": "把上下文编码成图片喂给模型（实验性，只对 Claude Fable 5 直连有效，最激进也最不通用）。",
      "stackPriority": 90,
      "lossy": true,
      "cacheImpact": "high",
      "isSingleMode": true,
      "levels": null,
      "sampling": false,
      "inputScope": "messages",
      "available": false,
      "requires": "需要 omniglyph npm 包与支持图片直传的供应商",
      "fields": [
        {
          "key": "dpi",
          "type": "number",
          "label": "渲染 DPI",
          "description": "上下文转图片时的清晰度",
          "defaultValue": 150,
          "min": 72,
          "max": 300
        }
      ]
    }
  ],
  "order": [
    "read-lifecycle",
    "session-dedup",
    "ccr",
    "lite",
    "rtk",
    "codex-responses",
    "headroom",
    "relevance",
    "caveman",
    "aggressive",
    "llmlingua",
    "ultra",
    "ionizer",
    "llm",
    "omniglyph"
  ],
  "presets": [
    "off",
    "safe",
    "custom",
    "all"
  ]
};
