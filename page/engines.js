// 由 scripts/gen-page-catalog.mjs 生成，不要手改。真相源是 catalog.js 与各引擎的 configSchema。
globalThis.CompressCatalog = {
  "engines": [
    {
      "id": "session-dedup",
      "label": "Session Dedup",
      "description": "Lossless — elides only text already sent earlier in the same session; nothing is summarized or dropped. Negligible latency overhead.",
      "why": "同一会话里已经发过的文本，后面再出现就换成引用；不总结也不丢内容。",
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
          "description": "小于这个长度的文本块不参与去重",
          "defaultValue": 80,
          "min": 20,
          "max": 4000
        },
        {
          "key": "minJaccard",
          "type": "number",
          "label": "相似度阈值",
          "description": "越高越保守，1 表示只合并完全相同的块",
          "defaultValue": 0.85,
          "min": 0.5,
          "max": 1
        },
        {
          "key": "shingleSize",
          "type": "number",
          "label": "分片大小",
          "description": "相似度计算的分片长度",
          "defaultValue": 3,
          "min": 2,
          "max": 8
        }
      ]
    },
    {
      "id": "ccr",
      "label": "CCR",
      "description": "Lossless — replaces large repeated/contiguous blocks with content-addressed references instead of deleting them; the original content stays retrievable.",
      "why": "把大的重复或连续块换成内容寻址引用，原文仍可取回。",
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
      "why": "只清空白、重复行和格式，零语义改动，永远可以开着（约 15%）。",
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
          "description": "对 tool_result 做空白与格式清理",
          "defaultValue": true
        },
        {
          "key": "preserveSystemPrompt",
          "type": "boolean",
          "label": "保护系统提示词",
          "description": "完全不碰 system 消息",
          "defaultValue": false
        },
        {
          "key": "maxToolLength",
          "type": "number",
          "label": "工具输出上限",
          "description": "超过这个字符数的工具输出会被截断",
          "defaultValue": 2000,
          "min": 200,
          "max": 20000
        }
      ]
    },
    {
      "id": "rtk",
      "label": "RTK Tool Output",
      "description": "Strips ANSI noise, progress bars, and repeated lines from command/tool output while preserving failures, warnings, and summaries (60-90% upstream savings)",
      "why": "剥掉命令输出里的 ANSI 噪音、进度条、重复行，保留报错、警告和摘要（60–90%）。",
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
          "key": "level",
          "type": "select",
          "label": "强度",
          "description": "minimal 只去噪音，aggressive 连摘要一起压",
          "defaultValue": "standard",
          "options": [
            {
              "value": "minimal",
              "label": "minimal"
            },
            {
              "value": "standard",
              "label": "standard"
            },
            {
              "value": "aggressive",
              "label": "aggressive"
            }
          ]
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
          "key": "compressShell",
          "type": "boolean",
          "label": "压缩 shell 输出",
          "defaultValue": true
        },
        {
          "key": "compressPatch",
          "type": "boolean",
          "label": "压缩 patch 输出",
          "defaultValue": true
        },
        {
          "key": "compressSearch",
          "type": "boolean",
          "label": "压缩 search 输出",
          "defaultValue": true
        },
        {
          "key": "compressBuild",
          "type": "boolean",
          "label": "压缩 build 输出",
          "defaultValue": true
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
          "description": "表格行数少于这个值就不压",
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
      "why": "按语言规则表删掉啰嗦措辞、客套话、冗余从句，保留代码与事实（约 30%）。",
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
      "why": "同一文件反复 Read 时，把被后续 Read/Write 覆盖掉的旧结果折叠成短 stub，只留最新一次。",
      "stackPriority": 22,
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
      "why": "把较早的轮次摘要化并逐步老化，只保留最近的细节（约 50%）。",
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
      "why": "启发式 token 级剪枝，最激进的纯本地压缩（约 75%）。",
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
          "label": "剪枝比例",
          "description": "Fraction of word tokens to keep (0–1). Lower = more aggressive.",
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
    "session-dedup",
    "ccr",
    "lite",
    "rtk",
    "codex-responses",
    "headroom",
    "relevance",
    "caveman",
    "read-lifecycle",
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
