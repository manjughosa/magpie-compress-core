// engines/relevance/config.js — relevance 引擎的配置契约
// 逐字移植自 OmniRoute: open-sse/services/compression/engines/relevance/configSchema.ts
//
// 适配点：
//   1. TypeScript 类型注解（EngineConfigField[] / EngineValidationResult / RelevanceConfig）全部去掉，
//      只剩运行期数据与函数——moejs 里没有编译器，也没有 ../types.ts。
//   2. 三个函数体逐字保留：RELEVANCE_SCHEMA、validateRelevanceConfig、resolveRelevanceConfig。
//      默认值（0.1 / 0.5 / 0.5）是上游行为的一部分，不许改。
//   3. 导出名对齐 magpie 契约（CONTRACT.md）：configSchema 是主名，
//      RELEVANCE_SCHEMA 作为别名保留，方便 lead 在 catalog.js 里复用同一份字段表。
//
// 砍掉的东西：无。

/** relevance 的配置字段表，逐字来自上游 RELEVANCE_SCHEMA。 */
export const RELEVANCE_SCHEMA = [
  {
    key: "enabled",
    type: "boolean",
    label: "Enabled",
    defaultValue: false,
  },
  {
    key: "overlapThreshold",
    type: "number",
    label: "Overlap threshold",
    description: "Sentences with Jaccard overlap below this are candidates for removal.",
    defaultValue: 0.1,
    min: 0,
    max: 1,
  },
  {
    key: "budgetPercent",
    type: "number",
    label: "Budget percent",
    description: "Target fraction of original character count to retain (0–1).",
    defaultValue: 0.5,
    min: 0.1,
    max: 1,
  },
  {
    key: "boilerplateWeight",
    type: "number",
    label: "Boilerplate weight",
    description: "Weight applied to boilerplate penalty when scoring sentences.",
    defaultValue: 0.5,
    min: 0,
    max: 1,
  },
]

/** 契约主名。 */
export const configSchema = RELEVANCE_SCHEMA

/**
 * 校验一份 relevance 配置，返回 { valid, errors }。
 * 逐字移植：布尔字段查类型，三个数值字段查 [0,1] 区间。
 */
export function validateRelevanceConfig(config) {
  const errors = []
  if (config.enabled !== undefined && typeof config.enabled !== "boolean") {
    errors.push("enabled must be a boolean")
  }
  for (const key of ["overlapThreshold", "budgetPercent", "boilerplateWeight"]) {
    if (config[key] !== undefined) {
      const v = config[key]
      if (typeof v !== "number" || v < 0 || v > 1) {
        errors.push(`${key} must be a number between 0 and 1`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 把用户传入的 stepConfig 合并成完整配置。
 * 逐字移植：逐字段 typeof 判定后回落到上游默认值（不是 configSchema 的 defaultValue 推导，
 * 而是写死的 0.1 / 0.5 / 0.5 —— 两者数值相同，但语义来源不同，保持与上游一致）。
 */
export function resolveRelevanceConfig(stepConfig) {
  const sc = stepConfig && typeof stepConfig === "object" ? stepConfig : {}
  return {
    enabled: typeof sc.enabled === "boolean" ? sc.enabled : false,
    overlapThreshold: typeof sc.overlapThreshold === "number" ? sc.overlapThreshold : 0.1,
    budgetPercent: typeof sc.budgetPercent === "number" ? sc.budgetPercent : 0.5,
    boilerplateWeight: typeof sc.boilerplateWeight === "number" ? sc.boilerplateWeight : 0.5,
  }
}
