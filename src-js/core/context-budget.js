'use strict';

const DEFAULT_CHARS_PER_TOKEN = 3.5;
const SYSTEM_OVERHEAD_TOKENS = 512;

const MODEL_CONTEXT_LIMITS = {
  'google/gemma-3-4b-it:free': { contextTokens: 32768, outputTokens: 8192 },
  'google/gemma-3-12b-it:free': { contextTokens: 32768, outputTokens: 8192 },
  'google/gemma-3-27b-it:free': { contextTokens: 131072, outputTokens: 8192 },
  'google/gemma-4-26b-a4b-it:free': { contextTokens: 262144, outputTokens: 32768 },
  'google/gemma-4-31b-it:free': { contextTokens: 262144, outputTokens: 32768 },
  'google/gemma-3n-e2b-it:free': { contextTokens: 8192, outputTokens: 2048 },
  'google/gemma-3n-e4b-it:free': { contextTokens: 8192, outputTokens: 2048 },
  'meta-llama/llama-3.3-70b-instruct:free': { contextTokens: 65536, outputTokens: 8192 },
  'meta-llama/llama-3.2-3b-instruct:free': { contextTokens: 131072, outputTokens: 4096 },
  'qwen/qwen3-coder:free': { contextTokens: 262000, outputTokens: 32768 },
  'qwen/qwen3-next-80b-a3b-instruct:free': { contextTokens: 262144, outputTokens: 8192 },
  'openai/gpt-oss-120b:free': { contextTokens: 131072, outputTokens: 8192 },
  'openai/gpt-oss-20b:free': { contextTokens: 131072, outputTokens: 8192 },
  'nvidia/nemotron-3-super-120b-a12b:free': { contextTokens: 262144, outputTokens: 32768 },
  'nvidia/nemotron-3-nano-30b-a3b:free': { contextTokens: 256000, outputTokens: 8192 },
  'nvidia/nemotron-nano-12b-v2-vl:free': { contextTokens: 128000, outputTokens: 4096 },
  'nvidia/nemotron-nano-9b-v2:free': { contextTokens: 128000, outputTokens: 4096 },
  'z-ai/glm-4.5-air:free': { contextTokens: 131072, outputTokens: 96000 },
  'arcee-ai/trinity-large-preview:free': { contextTokens: 131000, outputTokens: 8192 },
  'nousresearch/hermes-3-llama-3.1-405b:free': { contextTokens: 131072, outputTokens: 8192 },
  'minimax/minimax-m2.5:free': { contextTokens: 196608, outputTokens: 8192 },
  'liquid/lfm-2.5-1.2b-instruct:free': { contextTokens: 32768, outputTokens: 4096 },
  'liquid/lfm-2.5-1.2b-thinking:free': { contextTokens: 32768, outputTokens: 4096 },
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free': { contextTokens: 32768, outputTokens: 4096 },
  'Qwen/Qwen2.5-7B-Instruct-Turbo': { contextTokens: 32768, outputTokens: 2048 },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { contextTokens: 131072, outputTokens: 4096 },
  'deepseek-ai/DeepSeek-V3': { contextTokens: 131072, outputTokens: 4096 },
  'deepseek-ai/DeepSeek-R1': { contextTokens: 131072, outputTokens: 8192 },
  'mistralai/Mistral-7B-Instruct-v0.3': { contextTokens: 32768, outputTokens: 1200 },
  'meta-llama/Llama-3.1-8B-Instruct': { contextTokens: 131072, outputTokens: 2048 },
  'microsoft/Phi-3.5-mini-instruct': { contextTokens: 131072, outputTokens: 2048 },
  'Qwen/Qwen2.5-7B-Instruct': { contextTokens: 131072, outputTokens: 2048 },
  'google/gemma-2-9b-it': { contextTokens: 8192, outputTokens: 1200 },
  'HuggingFaceH4/zephyr-7b-beta': { contextTokens: 4096, outputTokens: 1200 },
  'glm-4.5-flash': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4.7-flash': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4.5': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4.5-air': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4.6': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4.7': { contextTokens: 128000, outputTokens: 4096 },
  'glm-5': { contextTokens: 128000, outputTokens: 4096 },
  'glm-5-turbo': { contextTokens: 128000, outputTokens: 4096 },
  'glm-5.1': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4-flash': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4-air': { contextTokens: 128000, outputTokens: 4096 },
  'glm-4-airx': { contextTokens: 128000, outputTokens: 4096 },
  'codegeex-4': { contextTokens: 128000, outputTokens: 4096 },
  '__default__': { contextTokens: 4096, outputTokens: 1024 },
};

function stringifyBudgetInput(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    if (typeof value.content === 'string') {
      return value.content;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return String(value);
    }
  }
  return String(value);
}

function estimateTokens(value, charsPerToken = DEFAULT_CHARS_PER_TOKEN) {
  const text = stringifyBudgetInput(value);
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / charsPerToken);
}

function getModelLimits(model) {
  if (model && MODEL_CONTEXT_LIMITS[model]) {
    return MODEL_CONTEXT_LIMITS[model];
  }
  if (model) {
    const slug = String(model).toLowerCase();
    for (const [key, limits] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (key === '__default__') {
        continue;
      }
      if (slug.includes(key.replace(':free', '').toLowerCase())) {
        return limits;
      }
    }
  }
  return MODEL_CONTEXT_LIMITS.__default__;
}

function normalizeFactor(factor) {
  if (typeof factor !== 'number' || Number.isNaN(factor)) {
    return 1;
  }
  return Math.min(1, Math.max(0.1, factor));
}

function calcPromptCharsBudget(model, factor = 1, charsPerToken = DEFAULT_CHARS_PER_TOKEN) {
  const limits = getModelLimits(model);
  const inputTokenBudget = Math.max(
    512,
    limits.contextTokens - limits.outputTokens - SYSTEM_OVERHEAD_TOKENS,
  );
  return Math.floor(inputTokenBudget * charsPerToken * normalizeFactor(factor));
}

function trimTextToBudget(value, maxChars, notice = '...[Free JT7: recortado por budget]...', headRatio = 0.5) {
  const text = stringifyBudgetInput(value);
  if (!text || text.length <= maxChars) {
    return {
      text,
      truncated: false,
      originalLength: text.length,
      finalLength: text.length,
      estimatedTokens: estimateTokens(text),
    };
  }
  const safeNotice = String(notice || '...');
  const usable = Math.max(32, maxChars - safeNotice.length - 2);
  const normalizedHeadRatio = Math.min(0.9, Math.max(0.1, headRatio));
  const headSize = Math.max(16, Math.floor(usable * normalizedHeadRatio));
  const tailSize = Math.max(16, usable - headSize);
  const trimmed = [
    text.slice(0, headSize).trimEnd(),
    safeNotice,
    text.slice(-tailSize).trimStart(),
  ].join('\n');
  return {
    text: trimmed,
    truncated: true,
    originalLength: text.length,
    finalLength: trimmed.length,
    estimatedTokens: estimateTokens(trimmed),
  };
}

function compactPrompt(value, options = {}) {
  const model = options.model || options.provider || 'unknown';
  const factor = normalizeFactor(options.factor);
  const budget = calcPromptCharsBudget(model, factor, options.charsPerToken || DEFAULT_CHARS_PER_TOKEN);
  const label = options.label || 'Free JT7';
  const notice = options.notice || `...[${label}: contexto recortado automaticamente]...`;
  const normalized = stringifyBudgetInput(value).replace(/\r\n/g, '\n').trim();
  const result = trimTextToBudget(normalized, budget, notice, options.headRatio == null ? 0.65 : options.headRatio);
  return {
    ...result,
    model,
    promptCharsBudget: budget,
    availableTokens: Math.ceil(budget / (options.charsPerToken || DEFAULT_CHARS_PER_TOKEN)),
  };
}

function allocatePromptBudget(model, sections, factor = 1) {
  const sectionEntries = Object.entries(sections || {}).filter(([, ratio]) => typeof ratio === 'number' && ratio > 0);
  const availableChars = calcPromptCharsBudget(model, factor);
  const totalRatio = sectionEntries.reduce((sum, [, ratio]) => sum + ratio, 0) || 1;
  const budgets = {};
  let allocated = 0;
  sectionEntries.forEach(([name, ratio], index) => {
    if (index === sectionEntries.length - 1) {
      budgets[name] = Math.max(64, availableChars - allocated);
      return;
    }
    const next = Math.max(64, Math.floor((availableChars * ratio) / totalRatio));
    budgets[name] = next;
    allocated += next;
  });
  return {
    model,
    availableChars,
    availableTokens: Math.ceil(availableChars / DEFAULT_CHARS_PER_TOKEN),
    sections: budgets,
  };
}

function summarizeBudgetUsage(stage, model, allocation, sectionInfos) {
  const sections = {};
  for (const [name, info] of Object.entries(sectionInfos || {})) {
    sections[name] = {
      budgetChars: allocation?.sections?.[name] || 0,
      originalChars: info?.originalLength || 0,
      finalChars: info?.finalLength || info?.text?.length || 0,
      truncated: Boolean(info?.truncated),
      estimatedTokens: info?.estimatedTokens || 0,
    };
  }
  return {
    stage,
    model,
    availableChars: allocation?.availableChars || 0,
    availableTokens: allocation?.availableTokens || 0,
    sections,
  };
}

module.exports = {
  DEFAULT_CHARS_PER_TOKEN,
  SYSTEM_OVERHEAD_TOKENS,
  MODEL_CONTEXT_LIMITS,
  stringifyBudgetInput,
  estimateTokens,
  getModelLimits,
  calcPromptCharsBudget,
  trimTextToBudget,
  compactPrompt,
  allocatePromptBudget,
  summarizeBudgetUsage,
};