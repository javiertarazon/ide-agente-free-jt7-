"use strict";
/**
 * api-provider-adapter.js
 * Adaptador de proveedores externos de API para el agente Free JT7.
 * Soporta: OpenRouter, HuggingFace (HF) y ZAI (ZhipuAI).
 * Devuelve el mismo shape que runCopilotRouter para compatibilidad con formatRouterMarkdown.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const {
  getModelLimits,
  compactPrompt,
} = require('./context-budget');
const {
  serializeConversationRequest,
} = require('./chat-context');

const FREE_PROVIDER_MODELS = Object.freeze({
  openrouter: [
    { label: "Hermes 3 Llama 405B (NousResearch)", value: "nousresearch/hermes-3-llama-3.1-405b:free" },
    { label: "Nemotron Super 120B (NVIDIA)", value: "nvidia/nemotron-3-super-120b-a12b:free" },
    { label: "GPT-OSS 120B (OpenAI)", value: "openai/gpt-oss-120b:free" },
    { label: "Gemma 4 31B (Google)", value: "google/gemma-4-31b-it:free" },
    { label: "Gemma 4 26B (Google)", value: "google/gemma-4-26b-a4b-it:free" },
    { label: "Qwen3 Coder (Alibaba)", value: "qwen/qwen3-coder:free" },
    { label: "Llama 3.3 70B (Meta)", value: "meta-llama/llama-3.3-70b-instruct:free" },
    { label: "MiniMax M2.5 (MiniMax)", value: "minimax/minimax-m2.5:free" },
    { label: "Qwen3 80B (Alibaba)", value: "qwen/qwen3-next-80b-a3b-instruct:free" },
    { label: "Gemma 3 27B (Google)", value: "google/gemma-3-27b-it:free" },
    { label: "GPT-OSS 20B (OpenAI)", value: "openai/gpt-oss-20b:free" },
    { label: "Gemma 3 12B (Google)", value: "google/gemma-3-12b-it:free" },
    { label: "Gemma 3 4B (Google)", value: "google/gemma-3-4b-it:free" },
    { label: "Nemotron Nano 30B (NVIDIA)", value: "nvidia/nemotron-3-nano-30b-a3b:free" },
    { label: "GLM 4.5 Air (ZAI)", value: "z-ai/glm-4.5-air:free" },
  ],
  hf: [
    { label: "Qwen 2.5 7B Turbo", value: "Qwen/Qwen2.5-7B-Instruct-Turbo" },
    { label: "Llama 3.3 70B Turbo (Meta)", value: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    { label: "DeepSeek V3", value: "deepseek-ai/DeepSeek-V3" },
    { label: "DeepSeek R1", value: "deepseek-ai/DeepSeek-R1" },
  ],
  zai: [
    { label: "GLM-4.5-Flash (gratuito)", value: "glm-4.5-flash" },
    { label: "GLM-4.7-Flash (gratuito)", value: "glm-4.7-flash" },
  ],
  clod: [
    { label: "GPT OSS 20B (OpenAI)", value: "OpenAI/gpt-oss-20B" },
    { label: "Gemma 4 31B IT (Google)", value: "google/gemma-4-31B-it" },
    { label: "DeepSeek R1 (DeepSeek)", value: "deepseek-ai/DeepSeek-R1" },
    { label: "Qwen 3 235B Thinking (Qwen)", value: "Qwen/Qwen3-235B-A22B-Thinking-2507" },
    { label: "GLM 5.1 (ZAI)", value: "zai-org/GLM-5.1" },
    { label: "Llama 3.3 70B Turbo (Meta)", value: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    { label: "Gemini 2.5 Flash (Google)", value: "gemini-2.5-flash" },
    { label: "Kimi K2.5 (Moonshot)", value: "moonshotai/Kimi-K2.5" },
  ],
  copilot: [],
});

const FREE_PROVIDER_DEFAULT_MODELS = Object.freeze({
  openrouter: "openai/gpt-oss-20b:free",
  hf: "Qwen/Qwen2.5-7B-Instruct-Turbo",
  zai: "glm-4.5-flash",
  clod: "OpenAI/gpt-oss-20B",
  copilot: "",
});

function cloneModelEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({ label: entry.label, value: entry.value }))
    : [];
}

function getFreeModelsCatalog(provider) {
  if (provider) {
    return cloneModelEntries(FREE_PROVIDER_MODELS[provider]);
  }
  return Object.fromEntries(
    Object.entries(FREE_PROVIDER_MODELS).map(([key, entries]) => [key, cloneModelEntries(entries)])
  );
}

function getFreeModelDefault(provider) {
  return FREE_PROVIDER_DEFAULT_MODELS[provider] || "";
}

function getFreeModelDefaults() {
  return { ...FREE_PROVIDER_DEFAULT_MODELS };
}

// Límites de salida por proveedor cuando no se conoce el modelo exacto
const PROVIDER_OUTPUT_TOKENS = {
  openrouter: 1500,
  hf:         1200,
  zai:        1500,
  clod:       1500,
};

// ---------------------------------------------------------------------------
// Clave de API — primero SecretStorage, luego variables de entorno, luego archivo local ignorado
// ---------------------------------------------------------------------------

async function getApiKey(provider, secretStorage, options = {}) {
  // 1. VS Code SecretStorage (guardada por el comando freejt7.setApiKey)
  if (secretStorage) {
    try {
      const authProfile = String(options.authProfile || "").trim();
      if (authProfile && authProfile !== "default") {
        const profiled = await secretStorage.get(`freejt7.apiKey.${provider}.${authProfile}`)
          || await secretStorage.get(`freejt7.apiKey.${authProfile}.${provider}`);
        if (profiled) return profiled;
      }
      const stored = await secretStorage.get(`freejt7.apiKey.${provider}`);
      if (stored) return stored;
    } catch (_) {}
  }

  // 2. Variables de entorno del proceso
  const fromEnv = readProcessEnv(provider);
  if (fromEnv) return fromEnv;

  // 3. Archivo local ignorado "env api" o ".env" en la raíz de la extensión
  const fromFile = readEnvApiFile(provider, options);
  if (fromFile) return fromFile;

  return null;
}

function readProcessEnv(provider) {
  const keyMap = {
    openrouter: "OPENROUTER_API_KEY",
    hf: "HUGGINGFACE_API_KEY",
    zai: "ZAI_API_KEY",
    clod: "CLOD_API_KEY",
  };
  return process.env[keyMap[provider]] || null;
}

function getEnvApiCandidateRoots(options = {}) {
  const roots = [];
  const extensionRoot = path.resolve(__dirname, "..", "..");
  roots.push(extensionRoot);

  // Soporta configurar claves desde el workspace abierto del usuario.
  if (options.workspacePath) {
    roots.push(path.resolve(String(options.workspacePath)));
  }

  if (process.cwd()) {
    roots.push(path.resolve(process.cwd()));
  }

  return Array.from(new Set(roots.filter(Boolean)));
}

function readEnvApiFile(provider, options = {}) {
  const candidates = [];
  for (const base of getEnvApiCandidateRoots(options)) {
    candidates.push(path.join(base, "env api"));
    candidates.push(path.join(base, "env_api"));
    candidates.push(path.join(base, ".env"));
  }
  const keyMap = {
    openrouter: "OPENROUTER_API_KEY",
    hf: "HUGGINGFACE_API_KEY",
    zai: "ZAI_API_KEY",
    clod: "CLOD_API_KEY",
  };
  // Patrones alternativos para formato legible: "email provider: key" o "provider:key"
  // Cada patrón es específico para evitar falsos positivos (ej: modelos como openrouter:anthropic/claude)
  const altPatterns = {
    openrouter: /\bopenrouter:(sk-or-v1-\S+)/i,
    hf:         /\bhf:(hf_\S+)/i,
    zai:        /\bzai:\s*([a-f0-9]{32}\.\S+)/i,
    clod:       /\bclod:\s*(\S+)/i,
  };
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      // Formato 1: KEY=VALUE (estándar .env)
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const k = line.slice(0, eqIdx).trim();
        if (k === keyMap[provider]) return line.slice(eqIdx + 1).trim();
      }
      // Formato 2: formato legible "email provider: key" o "provider:key"
      const pat = altPatterns[provider];
      if (pat) {
        const m = line.match(pat);
        if (m && m[1]) return m[1].trim();
      }
    }
  }
  return null;
}

function normalizeApiKey(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function createTaggedError(message, flags = {}) {
  const error = new Error(message);
  Object.assign(error, flags);
  return error;
}

function summarizeRemoteMessage(message) {
  const value = String(message || "").trim();
  if (!value) return "";
  if (/^provider returned error$/i.test(value)) return "";
  if (/^http\s+\d+$/i.test(value)) return "";
  return value;
}

function truncateText(value, maxChars) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 18)).trimEnd()}\n...[truncado]`;
}

function isRateLimitMessage(message) {
  return /rate limit|too many requests|quota exceeded|exceeded your current quota|requests limit|429/i.test(String(message || ""));
}

function isTransientNetworkError(err) {
  const code = String(err && err.code ? err.code : "").toUpperCase();
  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
  ].includes(code);
}

/**
 * Detecta si un error es por exceso de contexto para activar retry.
 */
function isContextError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /maximum context length|context length|too many tokens|input is too long|prompt is too long|context_length_exceeded/i.test(msg);
}

function hasMeaningfulProviderErrorPayload(payload) {
  if (!payload || payload.error == null) return false;

  const error = payload.error;
  if (typeof error === 'string') return error.trim().length > 0;
  if (typeof error === 'number' || typeof error === 'boolean') return Boolean(error);
  if (typeof error !== 'object') return Boolean(error);

  return Boolean(
    error.message
      || error.code
      || error.type
      || error.param
      || error.detail
      || error.details
      || error.reason
  );
}

function extractStructuredText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => extractStructuredText(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text.trim();
    if (typeof value.content === 'string') return value.content.trim();
    if (Array.isArray(value.content)) return extractStructuredText(value.content);
  }
  return '';
}

function extractChatCompletionText(payload) {
  const choice = payload?.choices?.[0];
  if (!choice) return '';

  const messageText = extractStructuredText(choice.message?.content);
  if (messageText) return messageText;

  const reasoningText = extractStructuredText(choice.message?.reasoning_content || choice.reasoning_content);
  if (reasoningText) return reasoningText;

  return extractStructuredText(choice.text);
}

function normalizeProviderRequest(request) {
  if (request && typeof request === 'object' && !Array.isArray(request)) {
    const text = String(request.text || request.prompt || '').trim();
    const systemPrompt = String(request.systemPrompt || '').trim();
    const messages = Array.isArray(request.messages)
      ? request.messages
        .map((entry) => ({
          role: String(entry?.role || '').trim().toLowerCase(),
          content: extractStructuredText(entry?.content || entry?.text || entry?.message),
        }))
        .filter((entry) => ['system', 'user', 'assistant'].includes(entry.role) && entry.content)
      : [];
    return {
      text,
      systemPrompt,
      messages,
      serializedPrompt: serializeConversationRequest({ text, systemPrompt, messages }),
    };
  }

  const text = String(request || '').trim();
  return {
    text,
    systemPrompt: '',
    messages: text ? [{ role: 'user', content: text }] : [],
    serializedPrompt: text,
  };
}

function buildBudgetedMessages(requestInfo, goalInfo, options = {}) {
  const provider = options.provider;
  const model = options.model;
  const budget = Math.max(Number(goalInfo?.promptCharsBudget || 0), 1500);
  const baseMessages = [];

  if (requestInfo.systemPrompt) {
    baseMessages.push({ role: 'system', content: requestInfo.systemPrompt });
  }

  const normalizedMessages = Array.isArray(requestInfo.messages) && requestInfo.messages.length > 0
    ? requestInfo.messages.slice()
    : (requestInfo.text ? [{ role: 'user', content: requestInfo.text }] : []);

  const kept = [];
  let usedChars = baseMessages.reduce((total, entry) => total + entry.content.length + 32, 0);

  for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
    const entry = normalizedMessages[index];
    const content = String(entry?.content || '').trim();
    const role = String(entry?.role || '').trim().toLowerCase();
    if (!content || !['user', 'assistant', 'system'].includes(role)) continue;
    const estimatedChars = content.length + 32;
    const mustKeep = index === normalizedMessages.length - 1;
    if (!mustKeep && usedChars + estimatedChars > budget) {
      continue;
    }
    kept.unshift({ role, content });
    usedChars += estimatedChars;
  }

  if (kept.length === 0 && requestInfo.text) {
    kept.push({ role: 'user', content: requestInfo.text });
  }

  const lastMessage = kept[kept.length - 1];
  if (lastMessage && usedChars > budget && lastMessage.role === 'user') {
    const availableBudget = Math.max(500, budget - (usedChars - lastMessage.content.length));
    const compacted = compactPrompt(lastMessage.content, {
      provider,
      model,
      factor: 0.6,
      label: 'Free JT7 provider last-message compact',
    });
    lastMessage.content = truncateText(compacted.text || lastMessage.content, availableBudget);
  }

  const messages = [...baseMessages, ...kept];
  const truncated = messages.length < baseMessages.length + normalizedMessages.length;
  return { messages, truncated };
}

function normalizeProviderError(provider, statusCode, payload, goalInfo) {
  const message = String(
    payload?.error?.message
      || payload?.message
      || payload?.error
      || payload?.raw
      || `HTTP ${statusCode || 500}`
  );

  if (isContextError(message)) {
    const modelInfo = goalInfo?.model ? ` (modelo: ${goalInfo.model}, budget: ${goalInfo.promptCharsBudget} chars)` : "";
    const detail = goalInfo?.truncated
      ? `Free JT7 ya recortó el prompt${modelInfo}, pero el proveedor sigue rechazando por contexto excesivo. Intenta abrir un chat nuevo o usar un modelo con mayor ventana de contexto (ej: meta-llama/llama-3.1-8b-instruct:free con 128k tokens).`
      : `El proveedor rechazó la solicitud por exceso de contexto${modelInfo}. Free JT7 activará retry con prompt reducido automáticamente.`;
    return createTaggedError(
      `Free JT7 (${provider}): ${detail}\n\nDetalle remoto: ${message}`,
      { isContextError: true, isRetryable: false },
    );
  }

  if ((statusCode || 0) === 429 || isRateLimitMessage(message)) {
    const modelInfo = goalInfo?.model ? ` para el modelo ${goalInfo.model}` : "";
    const remoteDetail = summarizeRemoteMessage(message);
    const detail = [
      `Free JT7 (${provider}): HTTP 429${modelInfo}. El proveedor devolvió un rate limit temporal.`,
      "Espera un momento y vuelve a intentar, o cambia a un modelo/proveedor menos saturado desde el panel.",
      remoteDetail ? `Detalle remoto: ${remoteDetail}` : "",
    ].filter(Boolean).join("\n\n");
    return createTaggedError(detail, {
      isRateLimitError: true,
      isUserActionRequired: false,
      isRetryable: false,
    });
  }

  if ((statusCode || 0) === 401 || (statusCode || 0) === 403) {
    const remoteDetail = summarizeRemoteMessage(message);
    const detail = [
      `Free JT7 (${provider}): autenticación rechazada por el proveedor (HTTP ${statusCode || 401}).`,
      "Revisa la API key configurada para ese proveedor antes de reintentar.",
      remoteDetail ? `Detalle remoto: ${remoteDetail}` : "",
    ].filter(Boolean).join("\n\n");
    return createTaggedError(detail, {
      isAuthError: true,
      isUserActionRequired: true,
      isRetryable: false,
    });
  }

  if ((statusCode || 0) >= 500 || (statusCode || 0) === 408) {
    const remoteDetail = summarizeRemoteMessage(message);
    const detail = [
      `Free JT7 (${provider}): error temporal del proveedor (HTTP ${statusCode || 500}).`,
      "Free JT7 puede reintentar automáticamente si el fallo es transitorio.",
      remoteDetail ? `Detalle remoto: ${remoteDetail}` : "",
    ].filter(Boolean).join("\n\n");
    return createTaggedError(detail, {
      isTransientProviderError: true,
      isRetryable: true,
    });
  }

  if ((statusCode || 0) < 400 && hasMeaningfulProviderErrorPayload(payload)) {
    const remoteDetail = summarizeRemoteMessage(message);
    const detail = [
      `Free JT7 (${provider}): el proveedor devolvió un payload de error aunque la respuesta HTTP fue 200.`,
      remoteDetail ? `Detalle remoto: ${remoteDetail}` : 'Prueba con otro modelo o reintenta desde el panel.',
    ].filter(Boolean).join('\n\n');
    return createTaggedError(detail, {
      isProviderPayloadError: true,
      isRetryable: false,
    });
  }

  const remoteDetail = summarizeRemoteMessage(message);
  const suffix = remoteDetail ? ` ${remoteDetail}` : "";
  return createTaggedError(`Free JT7 (${provider}): error HTTP ${statusCode || 500}.${suffix}`.trim(), {
    isRetryable: false,
  });
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

// Timeout de socket para llamadas a proveedores externos (ms).
// Los modelos thinking de ZAI pueden tardar más — se usa 90s para darles margen.
const HTTP_TIMEOUT_MS = 90000;

function httpsJson(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const hasBody = body !== undefined;
    const data = hasBody ? JSON.stringify(body) : "";
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ""),
      method,
      timeout: HTTP_TIMEOUT_MS,
      headers: {
        ...headers,
      },
    };
    if (hasBody) {
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode || 0, body: JSON.parse(raw) });
        } catch {
          resolve({ statusCode: res.statusCode || 0, body: { raw } });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(createTaggedError(
        `Free JT7: timeout (${HTTP_TIMEOUT_MS / 1000}s) al llamar a ${parsed.hostname}. El modelo puede ser lento — intenta con un modelo más pequeño.`,
        { isRetryable: true, isTransientNetworkError: true },
      ));
    });
    req.on("error", (error) => {
      if (isTransientNetworkError(error)) {
        error.isRetryable = true;
        error.isTransientNetworkError = true;
      }
      reject(error);
    });
    if (hasBody) {
      req.write(data);
    }
    req.end();
  });
}

function httpsPost(url, headers, body) {
  return httpsJson(url, { method: "POST", headers, body });
}

// ---------------------------------------------------------------------------
// Llamadas a cada proveedor
// ---------------------------------------------------------------------------

async function callOpenRouter(goalInfo, model, apiKey) {
  const m = model || "openai/gpt-oss-20b:free";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "vscode-freejt7-extension",
      "X-Title": "Free JT7 Agent",
    },
    {
      model: m,
      max_tokens: limits.outputTokens,
      messages: goalInfo.messages,
    }
  );
  const responseText = extractChatCompletionText(resp.body);
  if ((resp.statusCode || 0) >= 400 || (hasMeaningfulProviderErrorPayload(resp.body) && !responseText)) {
    throw normalizeProviderError("openrouter", resp.statusCode, resp.body, goalInfo);
  }
  return responseText || JSON.stringify(resp.body);
}

async function callHuggingFace(goalInfo, model, apiKey) {
  const m = model || "Qwen/Qwen2.5-7B-Instruct-Turbo";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://router.huggingface.co/together/v1/chat/completions",
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      messages: goalInfo.messages,
      max_tokens: limits.outputTokens,
    }
  );
  const responseText = extractChatCompletionText(resp.body);
  if ((resp.statusCode || 0) >= 400 || (hasMeaningfulProviderErrorPayload(resp.body) && !responseText)) {
    throw normalizeProviderError("hf", resp.statusCode, resp.body, goalInfo);
  }
  return responseText || JSON.stringify(resp.body);
}

async function callZai(goalInfo, model, apiKey) {
  const m = model || "glm-4.5-flash";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      max_tokens: limits.outputTokens,
      messages: goalInfo.messages,
    }
  );
  const responseText = extractChatCompletionText(resp.body);
  if ((resp.statusCode || 0) >= 400 || (hasMeaningfulProviderErrorPayload(resp.body) && !responseText)) {
    throw normalizeProviderError("zai", resp.statusCode, resp.body, goalInfo);
  }
  return responseText || JSON.stringify(resp.body);
}

async function callClod(goalInfo, model, apiKey) {
  const m = model || "OpenAI/gpt-oss-20B";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://api.clod.io/v1/chat/completions",
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      max_tokens: limits.outputTokens,
      messages: goalInfo.messages,
    }
  );
  const responseText = extractChatCompletionText(resp.body);
  if ((resp.statusCode || 0) >= 400 || (hasMeaningfulProviderErrorPayload(resp.body) && !responseText)) {
    throw normalizeProviderError("clod", resp.statusCode, resp.body, goalInfo);
  }
  return responseText || JSON.stringify(resp.body);
}

// ---------------------------------------------------------------------------
// Punto de entrada principal — devuelve el mismo shape que runCopilotRouter
// ---------------------------------------------------------------------------

async function callProviderWithRetry(provider, goalInfo, model, apiKey) {
  let callFn;
  if (provider === "openrouter") callFn = callOpenRouter;
  else if (provider === "hf") callFn = callHuggingFace;
  else if (provider === "zai") callFn = callZai;
  else if (provider === "clod") callFn = callClod;
  else throw createTaggedError(`Free JT7: Proveedor desconocido: \"${provider}\"`, { isRetryable: false });

  try {
    return { text: await callFn(goalInfo, model, apiKey), retried: false, goalInfo };
  } catch (firstErr) {
    if ((firstErr.isContextError || isContextError(firstErr)) && goalInfo.promptCharsBudget > 1500) {
      const originalGoal = goalInfo._originalGoal || goalInfo.text;
      const retryGoalInfo = compactPrompt(originalGoal, { provider, model, factor: 0.4, label: 'Free JT7 provider retry' });
      retryGoalInfo.requestInfo = goalInfo.requestInfo || normalizeProviderRequest(originalGoal);
      const retryMessages = buildBudgetedMessages(retryGoalInfo.requestInfo, retryGoalInfo, { provider, model });
      retryGoalInfo.messages = retryMessages.messages;
      retryGoalInfo.historyTruncated = retryMessages.truncated;
      try {
        const retryText = await callFn(retryGoalInfo, model, apiKey);
        return { text: retryText, retried: true, goalInfo: retryGoalInfo };
      } catch (retryErr) {
        throw retryErr.isContextError || isContextError(retryErr) ? retryErr : firstErr;
      }
    }
    throw firstErr;
  }
}

async function fetchClodModels(apiKey) {
  const response = await httpsJson(
    "https://api.clod.io/v1/models",
    { headers: { "Authorization": `Bearer ${apiKey}` } },
  );
  if ((response.statusCode || 0) >= 400) {
    throw normalizeProviderError("clod", response.statusCode, response.body, { model: "", promptCharsBudget: 0 });
  }
  const items = Array.isArray(response.body?.data) ? response.body.data : [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const value = String(item.id || item.name || "").trim();
      if (!value) return null;
      const owner = String(item.owned_by || item.provider || "").trim();
      return {
        label: owner ? `${value} (${owner})` : value,
        value,
      };
    })
    .filter(Boolean);
}

async function fetchProviderModels(provider, secretStorage, options = {}) {
  if (provider !== "clod") {
    return getFreeModelsCatalog(provider);
  }
  const apiKey = normalizeApiKey(await getApiKey(provider, secretStorage, options));
  if (!apiKey) {
    return getFreeModelsCatalog(provider);
  }
  try {
    const models = await fetchClodModels(apiKey);
    return models.length ? models : getFreeModelsCatalog(provider);
  } catch (_) {
    return getFreeModelsCatalog(provider);
  }
}

async function callProvider(goal, config, secretStorage, options = {}) {
  const { provider, model, authProfile } = config;
  const apiKey = normalizeApiKey(await getApiKey(provider, secretStorage, { ...options, authProfile: authProfile || options.authProfile }));
  if (!apiKey) {
    throw createTaggedError(
      `Free JT7: No hay API Key para \"${provider}\". Usa el comando \"Free JT7: Configurar API Key de Proveedor\".`,
      { isConfigurationError: true, isUserActionRequired: true, isRetryable: false },
    );
  }

  const requestInfo = normalizeProviderRequest(goal);
  const serializedPrompt = requestInfo.serializedPrompt || requestInfo.text;
  const goalInfo = compactPrompt(serializedPrompt, { provider, model, label: 'Free JT7 provider call' });
  goalInfo._originalGoal = serializedPrompt;
  goalInfo.requestInfo = requestInfo;
  const { messages, truncated } = buildBudgetedMessages(requestInfo, goalInfo, { provider, model });
  goalInfo.messages = messages;
  goalInfo.historyTruncated = truncated;
  goalInfo.usesStructuredConversation = messages.length > 1;

  const { text: responseText, retried, goalInfo: finalGoalInfo } = await callProviderWithRetry(provider, goalInfo, model, apiKey);
  const usedGoalInfo = finalGoalInfo || goalInfo;
  let summary = responseText;
  const notices = [];

  if (usedGoalInfo.truncated) {
    notices.push(`⚠️ **Free JT7 recortó el prompt automáticamente** para ajustarlo a la ventana de contexto del modelo \`${model || provider}\` (budget: ${usedGoalInfo.promptCharsBudget} chars, original: ${usedGoalInfo.originalLength} chars, enviado: ~${usedGoalInfo.estimatedTokens} tokens).`);
  }
  if (retried) {
    notices.push(`🔄 **Retry automático activado**: el primer intento falló por exceso de contexto. Se reintentó con prompt reducido al 40% del budget.`);
  }
  if (usedGoalInfo.historyTruncated) {
    notices.push('🧠 **Free JT7 recortó parte del historial conversacional** para mantener la continuidad sin exceder la ventana de contexto del modelo.');
  }
  if (notices.length > 0) {
    summary = `${responseText}\n\n---\n${notices.join("\n")}`;
  }

  const runId = `ext-${provider}-${Date.now()}`;
  const now = new Date().toISOString();

  return {
    runId,
    run: {
      run_id: runId,
      status: "completed",
      summary,
      model_resolution: { provider, model: model || "default" },
      quality_gate: { passed: true },
      started_at: now,
      ended_at: now,
      steps: [],
    },
    final: {
      status: "completed",
      summary,
      completedTasks: ["main"],
      changedFiles: [],
      verification: usedGoalInfo.truncated ? [`Prompt recortado automaticamente para ${provider} (${usedGoalInfo.estimatedTokens} tokens estimados enviados).`] : [],
      residualRisks: [],
      contextBudget: {
        provider,
        model: model || 'default',
        promptCharsBudget: usedGoalInfo.promptCharsBudget,
        originalLength: usedGoalInfo.originalLength,
        finalLength: usedGoalInfo.finalLength,
        truncated: Boolean(usedGoalInfo.truncated),
        retried,
      },
    },
    plan: { tasks: [], summary: serializedPrompt || String(goal || '') },
    executionResults: [],
    runPaths: {},
  };
}

module.exports = {
  getApiKey,
  callProvider,
  fetchProviderModels,
  getFreeModelsCatalog,
  getFreeModelDefault,
  getFreeModelDefaults,
  normalizeProviderError,
};
