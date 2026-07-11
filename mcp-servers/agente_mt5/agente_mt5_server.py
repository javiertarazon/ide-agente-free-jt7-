#!/usr/bin/env python3
"""
Agente MT5 MCP Server
Analisis de simbolos y generacion de senales (sin auto-ejecucion de ordenes).
"""

from __future__ import annotations

import json
import logging
import math
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from mcp.server import Server, InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import Resource, TextContent, Tool
import mcp.types as types

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.mt5_bridge import init_mt5_bridge  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("AGENTE_MT5")

server = Server("agente-mt5", version="0.1.0")
_bridge = init_mt5_bridge()


@dataclass
class SignalScore:
    trend: float
    reversion: float
    breakout: float
    aggregate: float
    direction: str
    confidence: float


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _ema(values: list[float], period: int) -> list[float]:
    if not values or period <= 1:
        return values[:]
    alpha = 2.0 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(alpha * v + (1 - alpha) * out[-1])
    return out


def _rsi(values: list[float], period: int = 14) -> float:
    if len(values) < period + 1:
        return 50.0
    gains = []
    losses = []
    for i in range(1, len(values)):
        diff = values[i] - values[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _atr(candles: list[dict[str, Any]], period: int = 14) -> float:
    if len(candles) < period + 1:
        return 0.0
    trs = []
    for i in range(1, len(candles)):
        h = _safe_float(candles[i].get("high"))
        l = _safe_float(candles[i].get("low"))
        pc = _safe_float(candles[i - 1].get("close"))
        tr = max(h - l, abs(h - pc), abs(l - pc))
        trs.append(tr)
    tail = trs[-period:]
    return sum(tail) / len(tail) if tail else 0.0


def _compute_signal(candles_m15: list[dict[str, Any]], candles_h1: list[dict[str, Any]]) -> SignalScore:
    closes_m15 = [_safe_float(c.get("close")) for c in candles_m15]
    closes_h1 = [_safe_float(c.get("close")) for c in candles_h1]

    if len(closes_m15) < 60 or len(closes_h1) < 60:
        return SignalScore(0.0, 0.0, 0.0, 0.0, "FLAT", 0.0)

    ema20_h1 = _ema(closes_h1, 20)
    ema50_h1 = _ema(closes_h1, 50)
    ema20_m15 = _ema(closes_m15, 20)

    latest = closes_m15[-1]
    rsi14 = _rsi(closes_m15, 14)
    rsi2 = _rsi(closes_m15, 2)
    atr14 = _atr(candles_m15, 14)

    trend = 0.0
    if ema20_h1[-1] > ema50_h1[-1] and latest >= ema20_m15[-1]:
        trend = 1.0
    elif ema20_h1[-1] < ema50_h1[-1] and latest <= ema20_m15[-1]:
        trend = -1.0

    reversion = 0.0
    if rsi2 < 8 and rsi14 < 45:
        reversion = 1.0
    elif rsi2 > 92 and rsi14 > 55:
        reversion = -1.0

    breakout = 0.0
    lookback = 20
    highest = max(closes_m15[-lookback:])
    lowest = min(closes_m15[-lookback:])
    threshold = 0.1 * atr14
    if latest > highest + threshold:
        breakout = 1.0
    elif latest < lowest - threshold:
        breakout = -1.0

    # Ponderacion simple por contexto de tendencia
    if ema20_h1[-1] > ema50_h1[-1] or ema20_h1[-1] < ema50_h1[-1]:
        w_trend, w_reversion, w_breakout = 0.45, 0.20, 0.35
    else:
        w_trend, w_reversion, w_breakout = 0.33, 0.34, 0.33

    agg = w_trend * trend + w_reversion * reversion + w_breakout * breakout
    confidence = min(1.0, abs(agg))

    if agg >= 0.35:
        direction = "BUY"
    elif agg <= -0.35:
        direction = "SELL"
    else:
        direction = "FLAT"

    return SignalScore(trend, reversion, breakout, agg, direction, confidence)


def _risk_check(symbol_info: dict[str, Any], candles_m15: list[dict[str, Any]]) -> dict[str, Any]:
    spread = _safe_float(symbol_info.get("spread"))
    atr = _atr(candles_m15, 14)
    spread_limit = max(1.5, atr * 0.12) if atr > 0 else 1.5

    blocked = spread > spread_limit
    reasons = []
    if blocked:
        reasons.append("spread_anomalo")

    if atr <= 0:
        reasons.append("atr_no_disponible")

    return {
        "blocked": blocked,
        "spread": spread,
        "spread_limit": spread_limit,
        "atr14": atr,
        "reasons": reasons,
    }


@server.list_resources()
def handle_list_resources() -> list[types.Resource]:
    return [
        Resource(
            uri="agente-mt5://status",
            name="Agente MT5 Status",
            description="Estado de conexion y configuracion del agente",
            mimeType="application/json",
        )
    ]


@server.read_resource()
def handle_read_resource(uri: str) -> str:
    if uri != "agente-mt5://status":
        raise ValueError(f"Unknown resource: {uri}")
    return json.dumps(
        {
            "name": "agente-mt5",
            "version": "0.1.0",
            "mode": "signals-only",
            "connected": bool(getattr(_bridge, "connected", False)),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        },
        indent=2,
    )


@server.call_tool()
def handle_call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    try:
        if name == "agente_mt5_connect":
            mt5_path = arguments.get("mt5_path")
            if mt5_path:
                global _bridge
                _bridge = init_mt5_bridge(mt5_path)

            login = arguments.get("login")
            password = arguments.get("password")
            broker_server = arguments.get("server")

            result = _bridge.connect()
            if result.get("success") and login and password and broker_server:
                result = _bridge.login(int(login), str(password), str(broker_server))

            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]

        if name == "agente_mt5_universe":
            filter_text = arguments.get("filter")
            result = _bridge.get_symbols(filter_text=filter_text)
            max_items = int(arguments.get("max_items", 20))
            if result.get("success"):
                result["symbols"] = result.get("symbols", [])[:max_items]
                result["showing"] = len(result.get("symbols", []))
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]

        if name == "agente_mt5_features":
            symbol = arguments["symbol"]
            candles = _bridge.get_candles(symbol=symbol, timeframe="M15", count=int(arguments.get("count", 200)))
            if not candles.get("success"):
                return [TextContent(type="text", text=json.dumps(candles, indent=2, default=str))]

            data = candles["candles"]
            closes = [_safe_float(c.get("close")) for c in data]
            features = {
                "symbol": symbol,
                "count": len(data),
                "last_close": closes[-1] if closes else 0.0,
                "ema20": _ema(closes, 20)[-1] if closes else 0.0,
                "ema50": _ema(closes, 50)[-1] if closes else 0.0,
                "rsi14": _rsi(closes, 14),
                "rsi2": _rsi(closes, 2),
                "atr14": _atr(data, 14),
            }
            return [TextContent(type="text", text=json.dumps(features, indent=2, default=str))]

        if name == "agente_mt5_signal":
            symbol = arguments["symbol"]
            m15 = _bridge.get_candles(symbol=symbol, timeframe="M15", count=250)
            h1 = _bridge.get_candles(symbol=symbol, timeframe="H1", count=250)
            info = _bridge.get_symbol_info(symbol)

            if not m15.get("success"):
                return [TextContent(type="text", text=json.dumps(m15, indent=2, default=str))]
            if not h1.get("success"):
                return [TextContent(type="text", text=json.dumps(h1, indent=2, default=str))]
            if not info.get("success"):
                return [TextContent(type="text", text=json.dumps(info, indent=2, default=str))]

            score = _compute_signal(m15["candles"], h1["candles"])
            risk = _risk_check(info["symbol"], m15["candles"])

            result = {
                "symbol": symbol,
                "direction": "FLAT" if risk["blocked"] else score.direction,
                "confidence": round(score.confidence, 4),
                "score": {
                    "trend": score.trend,
                    "reversion": score.reversion,
                    "breakout": score.breakout,
                    "aggregate": round(score.aggregate, 4),
                },
                "risk": risk,
                "mode": "signals-only",
                "disclaimer": "Salida cuantitativa experimental. No constituye consejo financiero.",
            }
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]

        if name == "agente_mt5_risk_check":
            symbol = arguments["symbol"]
            m15 = _bridge.get_candles(symbol=symbol, timeframe="M15", count=250)
            info = _bridge.get_symbol_info(symbol)
            if not m15.get("success"):
                return [TextContent(type="text", text=json.dumps(m15, indent=2, default=str))]
            if not info.get("success"):
                return [TextContent(type="text", text=json.dumps(info, indent=2, default=str))]

            result = _risk_check(info["symbol"], m15["candles"])
            result["symbol"] = symbol
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]

        if name == "agente_mt5_backtest":
            return [
                TextContent(
                    type="text",
                    text=json.dumps(
                        {
                            "success": True,
                            "status": "pending",
                            "message": "Backtest detallado se implementa en fase 2 con costos, slippage y walk-forward.",
                            "kpi_target": {"sharpe": ">1.0", "profit_factor": ">1.3", "max_drawdown": "<10%"},
                        },
                        indent=2,
                    ),
                )
            ]

        return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}, indent=2))]
    except Exception as exc:
        logger.exception("Error in tool %s", name)
        return [TextContent(type="text", text=json.dumps({"error": str(exc)}, indent=2, default=str))]


AGENTE_TOOLS = [
    Tool(
        name="agente_mt5_connect",
        description="Conecta el agente a MT5 y opcionalmente realiza login en cuenta demo.",
        inputSchema={
            "type": "object",
            "properties": {
                "mt5_path": {"type": "string"},
                "login": {"type": "integer"},
                "password": {"type": "string"},
                "server": {"type": "string"},
            },
        },
    ),
    Tool(
        name="agente_mt5_universe",
        description="Lista simbolos disponibles para analisis.",
        inputSchema={
            "type": "object",
            "properties": {
                "filter": {"type": "string"},
                "max_items": {"type": "integer", "default": 20},
            },
        },
    ),
    Tool(
        name="agente_mt5_features",
        description="Calcula features tecnicas base para un simbolo.",
        inputSchema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "count": {"type": "integer", "default": 200},
            },
            "required": ["symbol"],
        },
    ),
    Tool(
        name="agente_mt5_signal",
        description="Genera senal BUY/SELL/FLAT con enfoque multivoto y filtro de riesgo.",
        inputSchema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
            },
            "required": ["symbol"],
        },
    ),
    Tool(
        name="agente_mt5_risk_check",
        description="Evalua guardrails de riesgo para un simbolo.",
        inputSchema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
            },
            "required": ["symbol"],
        },
    ),
    Tool(
        name="agente_mt5_backtest",
        description="Punto de entrada para backtest (fase inicial placeholder).",
        inputSchema={"type": "object", "properties": {}},
    ),
]


@server.list_tools()
def handle_list_tools() -> list[types.Tool]:
    return AGENTE_TOOLS


async def main() -> None:
    logger.info("Iniciando Agente MT5 MCP Server")
    init_options = InitializationOptions(
        server_name="agente-mt5",
        server_version="0.1.0",
        capabilities=server.get_capabilities(
            notification_options=None,
            experimental_capabilities={},
        ),
    )

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, init_options)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
