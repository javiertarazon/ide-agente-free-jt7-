#!/usr/bin/env python3
"""
MT5 MCP Server - Integración completa de MetaTrader 5 con VS Code
Maneja todas las funciones de MT5 automáticamente desde el IDE
"""

import asyncio
import json
import os
import sys
import logging
from pathlib import Path
from typing import Any, Optional
from datetime import datetime, timedelta
import subprocess
import psutil
import time
import platform

from mcp.server import Server, InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource,
    TextContent,
    Tool,
)
import mcp.types as types

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Intentar importar MetaTrader5
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    logger.warning("MetaTrader5 no está instalado. Instálalo con: pip install MetaTrader5")

# Configuración
CONFIG_DIR = Path.home() / ".mt5" / "free-jt7"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = CONFIG_DIR / "config.json"
CREDENTIALS_FILE = CONFIG_DIR / "credentials.json"
CACHE_FILE = CONFIG_DIR / "cache.json"

# Crear servidor MCP
server = Server("mt5-service", version="0.1.0")

# ===================== CONFIGURACIÓN =====================

def _default_mt5_path() -> str:
    """Ruta por defecto de terminal64.exe según el sistema operativo"""
    if platform.system() == "Linux":
        return str(Path.home() / ".wine-mt5/drive_c/Program Files/MetaTrader 5/terminal64.exe")
    return "C:\\Program Files\\MetaTrader 5\\terminal64.exe"


def load_config() -> dict:
    """Carga la configuración de MT5"""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {
        "mt5_path": _default_mt5_path(),
        "accounts": [],
        "default_account": None,
        "auto_connect": True,
        "cache_enabled": True,
        "cache_ttl": 300,  # 5 minutos
    }

def save_config(config: dict):
    """Guarda la configuración de MT5"""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def load_credentials() -> dict:
    """Carga las credenciales de MT5 (encriptadas idealmente)"""
    if CREDENTIALS_FILE.exists():
        with open(CREDENTIALS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_credentials(credentials: dict):
    """Guarda las credenciales de MT5"""
    # En producción, encriptar esto
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(credentials, f, indent=2)
    # Cambiar permisos del archivo
    os.chmod(CREDENTIALS_FILE, 0o600)

def get_cache() -> dict:
    """Obtiene el caché"""
    if CACHE_FILE.exists():
        with open(CACHE_FILE, 'r') as f:
            cache = json.load(f)
            # Limpiar caché expirado
            config = load_config()
            ttl = config.get("cache_ttl", 300)
            now = time.time()
            cleaned = {}
            for key, (value, timestamp) in cache.items():
                if now - timestamp < ttl:
                    cleaned[key] = (value, timestamp)
            if cleaned != cache:
                save_cache(cleaned)
            return cleaned
    return {}

def save_cache(cache: dict):
    """Guarda el caché"""
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, default=str)

def update_cache(key: str, value: Any):
    """Actualiza una entrada en el caché"""
    cache = get_cache()
    cache[key] = (value, time.time())
    save_cache(cache)

# ===================== FUNCIONES MT5 =====================

def check_mt5_installed() -> bool:
    """Verifica si MT5 está instalado"""
    if not MT5_AVAILABLE:
        return False
    config = load_config()
    mt5_path = config.get("mt5_path", _default_mt5_path())
    return Path(mt5_path).exists()

def start_mt5(path: Optional[str] = None) -> bool:
    """Inicia MetaTrader 5"""
    try:
        if not check_mt5_installed():
            return False
        
        config = load_config()
        mt5_path = path or config.get("mt5_path")
        
        logger.info(f"Intentando iniciar MT5: {mt5_path}")
        if platform.system() == "Linux":
            wine_prefix = str(Path.home() / ".wine-mt5")
            env = {
                **os.environ,
                "WINEPREFIX": wine_prefix,
                "WINEARCH": "win64",
                "DISPLAY": os.environ.get("DISPLAY", ":0"),
            }
            subprocess.Popen(["wine", mt5_path], env=env)
        else:
            subprocess.Popen(mt5_path)
        time.sleep(5)  # Esperar a que se inicie
        return True
    except Exception as e:
        logger.error(f"Error al iniciar MT5: {e}")
        return False

def is_mt5_running() -> bool:
    """Verifica si MT5 está ejecutándose"""
    try:
        for proc in psutil.process_iter(['name']):
            if 'terminal' in proc.name().lower():
                return True
        return False
    except Exception:
        return False

def connect_mt5(account: int, password: str, server: str) -> bool:
    """Conecta a una cuenta de MT5"""
    try:
        if not MT5_AVAILABLE:
            logger.error("MetaTrader5 no disponible")
            return False
        
        if not is_mt5_running():
            logger.warning("MT5 no está ejecutándose. Iniciando...")
            if not start_mt5():
                return False
            time.sleep(3)
        
        logger.info(f"Conectando a cuenta {account} en {server}")
        if mt5.initialize(login=account, password=password, server=server):
            logger.info("Conexión exitosa")
            update_cache("last_connection", {
                "account": account,
                "server": server,
                "timestamp": datetime.now().isoformat()
            })
            return True
        else:
            logger.error(f"Error de inicialización: {mt5.last_error()}")
            return False
    except Exception as e:
        logger.error(f"Error en conexión: {e}")
        return False

def disconnect_mt5() -> bool:
    """Desconecta de MT5"""
    try:
        if MT5_AVAILABLE:
            mt5.shutdown()
        return True
    except Exception as e:
        logger.error(f"Error al desconectar: {e}")
        return False

def get_account_info() -> dict:
    """Obtiene información de la cuenta"""
    try:
        if not MT5_AVAILABLE:
            return {"error": "MT5 no disponible"}
        
        account_info = mt5.account_info()
        if account_info:
            return {
                "login": account_info.login,
                "name": account_info.name,
                "server": account_info.server,
                "currency": account_info.currency,
                "balance": account_info.balance,
                "equity": account_info.equity,
                "profit": account_info.profit,
                "free_margin": account_info.free_margin,
                "margin_level": round(account_info.margin_level, 2) if account_info.margin_level > 0 else 0,
                "positions": mt5.positions_total(),
                "orders": mt5.orders_total(),
            }
        return {"error": "No conectado"}
    except Exception as e:
        return {"error": str(e)}

def get_positions() -> list:
    """Obtiene todas las posiciones abiertas"""
    try:
        if not MT5_AVAILABLE:
            return []
        
        positions = mt5.positions_get()
        if positions:
            return [
                {
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "type": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
                    "volume": pos.volume,
                    "open_price": pos.price_open,
                    "current_price": mt5.symbol_info_tick(pos.symbol).ask if pos.type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(pos.symbol).bid,
                    "profit": round(pos.profit, 2),
                    "open_time": pos.time,
                    "comment": pos.comment,
                }
                for pos in positions
            ]
        return []
    except Exception as e:
        logger.error(f"Error obteniendo posiciones: {e}")
        return []

def get_orders() -> list:
    """Obtiene todas las órdenes pendientes"""
    try:
        if not MT5_AVAILABLE:
            return []
        
        orders = mt5.orders_get()
        if orders:
            return [
                {
                    "ticket": order.ticket,
                    "symbol": order.symbol,
                    "type": order.type,
                    "volume": order.volume_current,
                    "open_price": order.price_open,
                    "current_price": order.price_current,
                    "sl": order.sl,
                    "tp": order.tp,
                    "time_setup": order.time_setup,
                    "comment": order.comment,
                }
                for order in orders
            ]
        return []
    except Exception as e:
        logger.error(f"Error obteniendo órdenes: {e}")
        return []

def place_order(symbol: str, order_type: str, volume: float, price: float, 
                stop_loss: float = 0, take_profit: float = 0, comment: str = "") -> dict:
    """Coloca una orden en MT5"""
    try:
        if not MT5_AVAILABLE:
            return {"error": "MT5 no disponible"}
        
        # Validar tipo de orden
        if order_type.upper() == "BUY":
            order_type_mt5 = mt5.ORDER_TYPE_BUY
        elif order_type.upper() == "SELL":
            order_type_mt5 = mt5.ORDER_TYPE_SELL
        elif order_type.upper() == "BUY_LIMIT":
            order_type_mt5 = mt5.ORDER_TYPE_BUY_LIMIT
        elif order_type.upper() == "SELL_LIMIT":
            order_type_mt5 = mt5.ORDER_TYPE_SELL_LIMIT
        else:
            return {"error": f"Tipo de orden inválido: {order_type}"}
        
        # Crear solicitud de orden
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type_mt5,
            "price": price,
            "sl": stop_loss,
            "tp": take_profit,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        # Enviar orden
        result = mt5.order_send(request)
        
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return {
                "success": True,
                "ticket": result.order,
                "volume": volume,
                "price": price,
                "symbol": symbol,
            }
        else:
            return {
                "success": False,
                "error": f"Error {result.retcode}: {result.comment}",
            }
    except Exception as e:
        return {"error": str(e)}

def close_position(ticket: int) -> dict:
    """Cierra una posición abierta"""
    try:
        if not MT5_AVAILABLE:
            return {"error": "MT5 no disponible"}
        
        # Obtener la posición
        position = mt5.positions_get(ticket=ticket)
        if not position:
            return {"error": f"Posición {ticket} no encontrada"}
        
        pos = position[0]
        close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        
        # Obtener precio actual
        tick = mt5.symbol_info_tick(pos.symbol)
        close_price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
        
        # Crear solicitud de cierre
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": pos.volume,
            "type": close_type,
            "position": ticket,
            "price": close_price,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return {
                "success": True,
                "ticket": ticket,
                "closed_price": close_price,
                "profit": pos.profit,
            }
        else:
            return {
                "success": False,
                "error": f"Error {result.retcode}: {result.comment}",
            }
    except Exception as e:
        return {"error": str(e)}

def modify_position(ticket: int, stop_loss: float = 0, take_profit: float = 0) -> dict:
    """Modifica los niveles SL/TP de una posición"""
    try:
        if not MT5_AVAILABLE:
            return {"error": "MT5 no disponible"}
        
        position = mt5.positions_get(ticket=ticket)
        if not position:
            return {"error": f"Posición {ticket} no encontrada"}
        
        pos = position[0]
        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": ticket,
            "symbol": pos.symbol,
            "sl": stop_loss or pos.sl,
            "tp": take_profit or pos.tp,
        }
        
        result = mt5.order_send(request)
        
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return {
                "success": True,
                "ticket": ticket,
                "sl": stop_loss,
                "tp": take_profit,
            }
        else:
            return {
                "success": False,
                "error": f"Error {result.retcode}: {result.comment}",
            }
    except Exception as e:
        return {"error": str(e)}

def get_market_data(symbol: str, timeframe: int = mt5.TIMEFRAME_D1, count: int = 100) -> list:
    """Obtiene datos de mercado históricos"""
    try:
        if not MT5_AVAILABLE:
            return []
        
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
        if rates is not None:
            return [
                {
                    "time": datetime.fromtimestamp(r['time']).isoformat(),
                    "open": r['open'],
                    "high": r['high'],
                    "low": r['low'],
                    "close": r['close'],
                    "volume": int(r['tick_volume']),
                }
                for r in rates
            ]
        return []
    except Exception as e:
        logger.error(f"Error obteniendo datos de mercado: {e}")
        return []

# ===================== RECURSOS MCP =====================

@server.list_resources()
def handle_list_resources() -> list[types.Resource]:
    """Lista los recursos disponibles"""
    resources = [
        Resource(
            uri="mt5://account",
            name="Account Info",
            description="Información de la cuenta actual",
            mimeType="application/json"
        ),
        Resource(
            uri="mt5://positions",
            name="Open Positions",
            description="Todas las posiciones abiertas",
            mimeType="application/json"
        ),
        Resource(
            uri="mt5://orders",
            name="Pending Orders",
            description="Todas las órdenes pendientes",
            mimeType="application/json"
        ),
        Resource(
            uri="mt5://status",
            name="Connection Status",
            description="Estado de la conexión a MT5",
            mimeType="application/json"
        ),
    ]
    return resources

@server.read_resource()
def handle_read_resource(uri: str) -> str:
    """Lee un recurso específico"""
    if uri == "mt5://account":
        return json.dumps(get_account_info(), indent=2, default=str)
    elif uri == "mt5://positions":
        return json.dumps(get_positions(), indent=2)
    elif uri == "mt5://orders":
        return json.dumps(get_orders(), indent=2)
    elif uri == "mt5://status":
        return json.dumps({
            "connected": MT5_AVAILABLE and is_mt5_running(),
            "mt5_available": MT5_AVAILABLE,
            "mt5_running": is_mt5_running(),
            "config_dir": str(CONFIG_DIR),
        }, indent=2)
    else:
        raise ValueError(f"Unknown resource: {uri}")

# ===================== HERRAMIENTAS MCP =====================

@server.call_tool()
def handle_call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    """Maneja las llamadas a herramientas"""
    try:
        if name == "connect":
            account = arguments.get("account")
            password = arguments.get("password")
            server_name = arguments.get("server", "default")
            
            result = connect_mt5(account, password, server_name)
            return [TextContent(type="text", text=json.dumps({
                "success": result,
                "message": "Conexión exitosa" if result else "Error en la conexión"
            }, indent=2))]
        
        elif name == "disconnect":
            result = disconnect_mt5()
            return [TextContent(type="text", text=json.dumps({
                "success": result,
                "message": "Desconectado"
            }, indent=2))]
        
        elif name == "get_account":
            info = get_account_info()
            return [TextContent(type="text", text=json.dumps(info, indent=2, default=str))]
        
        elif name == "get_positions":
            positions = get_positions()
            return [TextContent(type="text", text=json.dumps(positions, indent=2))]
        
        elif name == "get_orders":
            orders = get_orders()
            return [TextContent(type="text", text=json.dumps(orders, indent=2))]
        
        elif name == "place_order":
            result = place_order(
                symbol=arguments.get("symbol"),
                order_type=arguments.get("type"),
                volume=float(arguments.get("volume", 0)),
                price=float(arguments.get("price", 0)),
                stop_loss=float(arguments.get("stop_loss", 0)),
                take_profit=float(arguments.get("take_profit", 0)),
                comment=arguments.get("comment", "")
            )
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
        
        elif name == "close_position":
            result = close_position(arguments.get("ticket"))
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
        
        elif name == "modify_position":
            result = modify_position(
                ticket=arguments.get("ticket"),
                stop_loss=float(arguments.get("stop_loss", 0)),
                take_profit=float(arguments.get("take_profit", 0))
            )
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
        
        elif name == "get_market_data":
            data = get_market_data(
                symbol=arguments.get("symbol"),
                count=arguments.get("count", 100)
            )
            return [TextContent(type="text", text=json.dumps(data, indent=2))]
        
        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
    
    except Exception as e:
        logger.error(f"Error en herramienta {name}: {e}")
        return [TextContent(type="text", text=json.dumps({
            "error": str(e)
        }, indent=2))]

# Definir herramientas disponibles
MT5_TOOLS = [
    Tool(
        name="connect",
        description="Conecta a una cuenta de MT5",
        inputSchema={
            "type": "object",
            "properties": {
                "account": {"type": "integer", "description": "Número de cuenta"},
                "password": {"type": "string", "description": "Contraseña"},
                "server": {"type": "string", "description": "Servidor (ej: 'ICMarkets-Demo')"},
            },
            "required": ["account", "password"]
        }
    ),
    Tool(
        name="disconnect",
        description="Desconecta de MT5",
        inputSchema={"type": "object", "properties": {}}
    ),
    Tool(
        name="get_account",
        description="Obtiene información de la cuenta actual",
        inputSchema={"type": "object", "properties": {}}
    ),
    Tool(
        name="get_positions",
        description="Obtiene todas las posiciones abiertas",
        inputSchema={"type": "object", "properties": {}}
    ),
    Tool(
        name="get_orders",
        description="Obtiene todas las órdenes pendientes",
        inputSchema={"type": "object", "properties": {}}
    ),
    Tool(
        name="place_order",
        description="Coloca una nueva orden",
        inputSchema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Símbolo (ej: 'EURUSD')"},
                "type": {"type": "string", "description": "Tipo de orden (BUY, SELL, BUY_LIMIT, SELL_LIMIT)"},
                "volume": {"type": "number", "description": "Volumen"},
                "price": {"type": "number", "description": "Precio"},
                "stop_loss": {"type": "number", "description": "Stop Loss (opcional)"},
                "take_profit": {"type": "number", "description": "Take Profit (opcional)"},
                "comment": {"type": "string", "description": "Comentario"},
            },
            "required": ["symbol", "type", "volume", "price"]
        }
    ),
    Tool(
        name="close_position",
        description="Cierra una posición abierta",
        inputSchema={
            "type": "object",
            "properties": {
                "ticket": {"type": "integer", "description": "ID de la posición"},
            },
            "required": ["ticket"]
        }
    ),
    Tool(
        name="modify_position",
        description="Modifica los niveles SL/TP de una posición",
        inputSchema={
            "type": "object",
            "properties": {
                "ticket": {"type": "integer", "description": "ID de la posición"},
                "stop_loss": {"type": "number", "description": "Nuevo Stop Loss"},
                "take_profit": {"type": "number", "description": "Nuevo Take Profit"},
            },
            "required": ["ticket"]
        }
    ),
    Tool(
        name="get_market_data",
        description="Obtiene datos de mercado históricos",
        inputSchema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Símbolo"},
                "count": {"type": "integer", "description": "Número de velas (default: 100)"},
            },
            "required": ["symbol"]
        }
    ),
]

@server.list_tools()
def handle_list_tools() -> list[types.Tool]:
    return MT5_TOOLS

async def main():
    """Punto de entrada principal"""
    logger.info("Iniciando servidor MCP de MT5")
    
    # Ejecutar servidor
    init_options = InitializationOptions(
        server_name="mt5-service",
        server_version="0.1.0",
        capabilities=types.ServerCapabilities(
            tools=types.ToolsCapability(),
            resources=types.ResourcesCapability(),
        ),
    )

    async with stdio_server() as (read_stream, write_stream):
        logger.info("Servidor MCP escuchando...")
        await server.run(read_stream, write_stream, init_options)

if __name__ == "__main__":
    asyncio.run(main())
