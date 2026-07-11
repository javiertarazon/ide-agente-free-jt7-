/**
 * MT5 Tools para MCP Server
 * Expone todas las funcionalidades de MT5 como herramientas MCP
 */

import { spawn } from "child_process";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { isApproved } from "../policy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRADING_METHODS = new Set(["open_order", "close_order", "modify_order"]);

function resolveApprovalToken(policy) {
  return String(
    policy?.mt5TradingApprovalToken ||
    policy?.mt5?.tradingApprovalToken ||
    process.env.FREEJT7_MT5_APPROVAL_TOKEN ||
    process.env.MT5_TRADING_APPROVAL_TOKEN ||
    ""
  ).trim();
}

function isMt5TradingApproved(params, policy) {
  if (isApproved(params)) {
    return { ok: true };
  }
  const expected = resolveApprovalToken(policy);
  const supplied = String(params?.approvalToken || params?.approval_token || "").trim();
  if (expected && supplied && supplied === expected) {
    return { ok: true };
  }
  return {
    ok: false,
    success: false,
    error: "Operacion MT5 de trading bloqueada: requiere approved=true/allowHighRisk=true o approvalToken valido.",
    requiresApproval: true,
    approval: {
      accepted: ["approved", "allowHighRisk", "approvalToken"],
      tokenConfigured: Boolean(expected),
    },
  };
}

function stripQuotes(value) {
  if (typeof value !== "string") return value;
  if (value.length >= 2 && value[0] === value[value.length - 1]) {
    if (value[0] === "'" || value[0] === "\"") {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseEnvFile(filePath) {
  const encodings = ["utf8", "latin1"];
  for (const enc of encodings) {
    try {
      const raw = fs.readFileSync(filePath, { encoding: enc });
      const env = {};
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [rawKey, ...rest] = trimmed.split("=");
        const key = rawKey.replace(/^\uFEFF/, "").trim().toUpperCase();
        const value = rest.join("=").trim();
        env[key] = stripQuotes(value);
      }
      return env;
    } catch (err) {
      if (enc === encodings[encodings.length - 1]) {
        return {};
      }
    }
  }
  return {};
}

/**
 * Ejecutar comando Python en el módulo mt5_bridge
 */
async function executePythonMT5(method, params) {
  return new Promise((resolve, reject) => {
    const resolvedParams = { ...(params || {}) };
    if (resolvedParams.credentials_file) {
      const env = parseEnvFile(resolvedParams.credentials_file);
      if (!resolvedParams.login && env.MT5_LOGIN) resolvedParams.login = env.MT5_LOGIN;
      if (!resolvedParams.login && env.MT5_ACCOUNT) resolvedParams.login = env.MT5_ACCOUNT;
      if (!resolvedParams.password && env.MT5_PASSWORD) resolvedParams.password = env.MT5_PASSWORD;
      if (!resolvedParams.server && env.MT5_SERVER) resolvedParams.server = env.MT5_SERVER;
    }
    resolvedParams.login = stripQuotes(resolvedParams.login);
    resolvedParams.password = stripQuotes(resolvedParams.password);
    resolvedParams.server = stripQuotes(resolvedParams.server);

    const repoRoot = path.resolve(__dirname, "../../..");
    const safeRoot = repoRoot.replace(/\\/g, "/");
    const pythonScript = `
import sys
import json
sys.path.insert(0, r"${safeRoot}")
from tools.mt5_bridge import init_mt5_bridge

payload = json.loads(sys.stdin.read() or "{}")
method = payload.get("method")
params = payload.get("params") or {}
mt5_path = params.get("mt5_path")

bridge = init_mt5_bridge(mt5_path)
result = {}

try:
    def normalize(value):
        if isinstance(value, str) and len(value) >= 2:
            if (value[0] == value[-1]) and value[0] in ["'", '"']:
                return value[1:-1]
        return value

    def load_env_file(path):
        env = {}
        encodings = ["utf8", "latin-1"]
        for enc in encodings:
            try:
                with open(path, "r", encoding=enc) as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" not in line:
                            continue
                        key, value = line.split("=", 1)
                        key_clean = key.strip().lstrip("\ufeff").upper()
                        env[key_clean] = normalize(value.strip())
                return env
            except UnicodeDecodeError:
                continue
            except Exception:
                return {}
        return env

    def resolve_creds():
        login = normalize(params.get("login"))
        password = normalize(params.get("password", "")) or ""
        server = normalize(params.get("server", "")) or ""
        cred_path = params.get("credentials_file")
        env_error = None
        if cred_path:
            env = load_env_file(cred_path)
            if not env:
                env_error = f"No se pudo leer credentials_file: {cred_path}"
            if not login:
                login = normalize(env.get("MT5_LOGIN") or env.get("MT5_ACCOUNT"))
            if not password:
                password = normalize(env.get("MT5_PASSWORD", "")) or ""
            if not server:
                server = normalize(env.get("MT5_SERVER", "")) or ""
        if login is not None:
            login = int(login)
        return login, password, server, env_error

    def ensure_login():
        login, password, server, env_error = resolve_creds()
        if login is None or not password or not server:
            if env_error:
                return {"success": False, "error": env_error}
            missing = []
            if login is None:
                missing.append("login")
            if not password:
                missing.append("password")
            if not server:
                missing.append("server")
            detail = ", ".join(missing) if missing else "desconocido"
            return {"success": False, "error": f"Credenciales requeridas para auto-login: {detail}"}
        return bridge.login(login=login, password=password, server=server)

    if method == "connect":
        result = bridge.connect()
    elif method == "login":
        login_value, password_value, server_value, _env_error = resolve_creds()
        result = bridge.login(
            login=login_value,
            password=password_value or "",
            server=server_value or ""
        )
    elif method == "disconnect":
        result = bridge.disconnect()
    elif method == "get_account_info":
        login_result = ensure_login()
        result = login_result if not login_result.get("success") else bridge.get_account_info()
    elif method == "get_symbols":
        login_result = ensure_login()
        result = login_result if not login_result.get("success") else bridge.get_symbols(filter_text=params.get("filter") or None)
    elif method == "get_symbol_info":
        login_result = ensure_login()
        result = login_result if not login_result.get("success") else bridge.get_symbol_info(params.get("symbol"))
    elif method == "open_order":
        login_result = ensure_login()
        if not login_result.get("success"):
            result = login_result
        else:
            result = bridge.open_order(
                symbol=params.get("symbol"),
                order_type=params.get("order_type"),
                volume=params.get("volume"),
                price=params.get("price"),
                sl=params.get("sl"),
                tp=params.get("tp"),
                comment=params.get("comment", "")
            )
    elif method == "close_order":
        login_result = ensure_login()
        if not login_result.get("success"):
            result = login_result
        else:
            result = bridge.close_order(
                ticket=params.get("ticket"),
                volume=params.get("volume")
            )
    elif method == "get_positions":
        login_result = ensure_login()
        result = login_result if not login_result.get("success") else bridge.get_positions()
    elif method == "get_history":
        login_result = ensure_login()
        result = login_result if not login_result.get("success") else bridge.get_history(days=params.get("days", 7))
    elif method == "modify_order":
        login_result = ensure_login()
        if not login_result.get("success"):
            result = login_result
        else:
            result = bridge.modify_order(
                ticket=params.get("ticket"),
                sl=params.get("sl"),
                tp=params.get("tp")
            )
    elif method == "get_candles":
        login_result = ensure_login()
        if not login_result.get("success"):
            result = login_result
        else:
            result = bridge.get_candles(
                symbol=params.get("symbol"),
                timeframe=params.get("timeframe", "H1"),
                count=params.get("count", 100)
            )
    else:
        result = {"success": False, "error": f"Metodo no soportado: {method}"}
except Exception as e:
    result = {"success": False, "error": str(e)}

print(json.dumps(result))
`;

    const timeoutMs = Number(resolvedParams?.timeout_ms || 25000);
    const python = spawn("python", ["-c", pythonScript]);
    let output = "";
    let errorOutput = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      python.kill("SIGKILL");
      resolve({
        success: false,
        error: `Timeout de ${timeoutMs}ms ejecutando MT5`,
      });
    }, timeoutMs);

    python.stdin.write(JSON.stringify({ method, params: resolvedParams }));
    python.stdin.end();

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    python.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Python error: ${errorOutput}`));
        return;
      }
      try {
        const result = JSON.parse(output);
        resolve(result);
      } catch (e) {
        reject(new Error(`Parse error: ${output}`));
      }
    });
  });
}

/**
 * Definir herramientas MT5
 */
function withApprovalFields(properties) {
  return {
    ...properties,
    approved: {
      type: "boolean",
      description: "Aprobacion explicita para operaciones reales de trading MT5",
    },
    allowHighRisk: {
      type: "boolean",
      description: "Alias de aprobacion explicita para operaciones de alto riesgo",
    },
    approvalToken: {
      type: "string",
      description: "Token de aprobacion MT5 configurado por policy/env",
    },
  };
}

export function createMt5Tools(policy = {}, options = {}) {
  const execute = options.executePythonMT5 || executePythonMT5;
  const runMt5 = async (method, params) => {
    const args = params || {};
    if (TRADING_METHODS.has(method)) {
      const approval = isMt5TradingApproved(args, policy);
      if (!approval.ok) return approval;
    }
    return await execute(method, args);
  };

  return {
  jt7_mt5_connect: {
    description:
      "Conectar a MetaTrader 5. Debe ejecutarse antes de cualquier operación.",
    inputSchema: {
      type: "object",
      properties: {
        mt5_path: {
          type: "string",
          description: "Ruta opcional a terminal64.exe",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout opcional para la ejecuciÃ³n (ms)",
        },
      },
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("connect", params || {});
    },
  },

  jt7_mt5_login: {
    description:
      "Login en cuenta MT5 con credenciales (login, password, server)",
    inputSchema: {
      type: "object",
      properties: {
        login: {
          type: "number",
          description: "Account ID",
        },
        password: {
          type: "string",
          description: "Account password",
        },
        server: {
          type: "string",
          description: 'Server name (ej: "ThinkMarkets-Demo")',
        },
        mt5_path: {
          type: "string",
          description: "Ruta opcional a terminal64.exe",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout opcional para la ejecuciÃ³n (ms)",
        },
      },
      required: ["login", "password", "server"],
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("login", params || {});
    },
  },

  jt7_mt5_disconnect: {
    description: "Desconectar de MT5",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: async () => {
      return await runMt5("disconnect", {});
    },
  },

  jt7_mt5_account_info: {
    description: "Obtener información de la cuenta (balance, equity, margin, etc)",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("get_account_info", params || {});
    },
  },

  jt7_mt5_symbols: {
    description: "Obtener lista de símbolos disponibles (con filtro opcional)",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            'Filtrar por nombre (ej: "EUR", "BTCUSD"). Opcional.',
        },
      },
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("get_symbols", params || {});
    },
  },

  jt7_mt5_symbol_info: {
    description: "Obtener información detallada de un símbolo (bid, ask, spread, etc)",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: 'Símbolo (ej: "EURUSD", "BTCUSD")',
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("get_symbol_info", params || {});
    },
  },

  jt7_mt5_open_order: {
    description:
      "Abrir una nueva orden (BUY/SELL a precio de mercado o límite)",
    inputSchema: {
      type: "object",
      properties: withApprovalFields({
        symbol: {
          type: "string",
          description: 'Símbolo (ej: "EURUSD")',
        },
        order_type: {
          type: "string",
          enum: ["BUY", "SELL"],
          description: "Tipo de orden",
        },
        volume: {
          type: "number",
          description: "Volumen en lotes",
        },
        price: {
          type: "number",
          description: "Precio límite. Si no se incluye, es orden de mercado.",
        },
        sl: {
          type: "number",
          description: "Stop Loss (precio)",
        },
        tp: {
          type: "number",
          description: "Take Profit (precio)",
        },
        comment: {
          type: "string",
          description: "Comentario para la orden",
        },
      }),
      required: ["symbol", "order_type", "volume"],
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("open_order", params || {});
    },
  },

  jt7_mt5_close_order: {
    description: "Cerrar una orden abierta (posición)",
    inputSchema: {
      type: "object",
      properties: withApprovalFields({
        ticket: {
          type: "number",
          description: "ID de la orden a cerrar",
        },
        volume: {
          type: "number",
          description: "Volumen a cerrar. Si no se incluye, cierra total.",
        },
      }),
      required: ["ticket"],
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("close_order", params || {});
    },
  },

  jt7_mt5_positions: {
    description: "Obtener todas las posiciones abiertas",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("get_positions", params || {});
    },
  },

  jt7_mt5_history: {
    description:
      "Obtener historial de órdenes cerradas (últimos N días)",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Días atrás a buscar. Default: 7",
        },
      },
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("get_history", params || {});
    },
  },

  jt7_mt5_modify_order: {
    description: "Modificar Stop Loss y/o Take Profit de una orden",
    inputSchema: {
      type: "object",
      properties: withApprovalFields({
        ticket: {
          type: "number",
          description: "ID de la orden",
        },
        sl: {
          type: "number",
          description: "Nuevo Stop Loss (precio)",
        },
        tp: {
          type: "number",
          description: "Nuevo Take Profit (precio)",
        },
      }),
      required: ["ticket"],
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("modify_order", params || {});
    },
  },

  jt7_mt5_candles: {
    description: "Obtener velas OHLC para análisis técnico",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: 'Símbolo (ej: "EURUSD")',
        },
        timeframe: {
          type: "string",
          enum: ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"],
          description: "Período. Default: H1",
        },
        count: {
          type: "number",
          description: "Número de velas. Default: 100",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (params) => {
      return await runMt5("get_candles", params || {});
    },
  },
};
}

export const mt5Tools = createMt5Tools();

export const mt5ToolsList = Object.entries(mt5Tools).map(([name, tool]) => ({
  name,
  description: tool.description,
  inputSchema: tool.inputSchema,
}));
