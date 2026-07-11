"""
MT5 Bridge Module - Integración completa MT5 para MCP
Proporciona API para controlar MT5 desde Python
"""

import MetaTrader5 as mt5
import os
from pathlib import Path
from datetime import datetime, timedelta
import json
import logging
import subprocess
import time

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MT5_BRIDGE")


class MT5Bridge:
    """Puente de conexión y control de MetaTrader5"""
    
    def __init__(self, mt5_path: str = None):
        """
        Inicializar el puente MT5
        
        Args:
            mt5_path: Ruta a terminal64.exe (auto-detecta si no se proporciona)
        """
        self.mt5_path = mt5_path or self._find_mt5_path()
        self.connected = False
        self.account_info = {}
        
    def _find_mt5_path(self) -> str:
        """Auto-detectar ubicación de MT5"""
        possible_paths = [
            r"C:\Program Files\MetaTrader 5\terminal64.exe",
            r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe",
            os.path.expandvars(r"%ProgramFiles%\MetaTrader 5\terminal64.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\MetaTrader 5\terminal64.exe"),
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"MT5 encontrado en: {path}")
                return path
        
        logger.warning("MT5 no encontrado automáticamente, usando path por defecto")
        return r"C:\Program Files\MetaTrader 5\terminal64.exe"

    def _start_terminal(self) -> bool:
        """Iniciar la terminal MT5 de escritorio si no estÃ¡ en ejecuciÃ³n"""
        if not self.mt5_path or not os.path.exists(self.mt5_path):
            logger.error(f"MT5 path no encontrado: {self.mt5_path}")
            return False
        try:
            subprocess.Popen(
                [self.mt5_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info("Terminal MT5 iniciada (desktop)")
            return True
        except Exception as e:
            logger.error(f"Error iniciando MT5: {e}")
            return False

    def _initialize_mt5(
        self,
        login: int = None,
        password: str = None,
        server: str = None,
        retries: int = 6,
        wait_seconds: float = 2.0,
    ) -> bool:
        """Inicializar MT5 con reintentos y arranque de terminal si es necesario"""
        kwargs = {"path": self.mt5_path}
        if login is not None and password and server:
            kwargs.update(login=login, password=password, server=server)

        if mt5.initialize(**kwargs):
            return True

        last_error = mt5.last_error()
        logger.warning(f"MT5 init fallÃ³: {last_error}. Reintentando con arranque de terminal...")
        try:
            mt5.shutdown()
        except Exception:
            pass

        if not self._start_terminal():
            return False

        for _ in range(retries):
            time.sleep(wait_seconds)
            if mt5.initialize(**kwargs):
                return True

        return False
    
    def connect(self) -> dict:
        """
        Conectar a MT5
        
        Returns:
            dict: Estado de conexión y detalles
        """
        try:
            if not self._initialize_mt5():
                error = mt5.last_error()
                logger.error(f"MT5 init failed: {error}")
                return {
                    "success": False,
                    "error": f"Failed to initialize MT5: {error}",
                    "mt5_path": self.mt5_path,
                }

            self.connected = True
            info = mt5.terminal_info()
            logger.info("MT5 conectado exitosamente")

            return {
                "success": True,
                "message": "MT5 conectado",
                "terminal_info": {
                    "company": info.company,
                    "name": info.name,
                    "language": info.language,
                    "path": info.path,
                    "data_path": info.data_path,
                    "commondata_path": info.commondata_path,
                },
            }
        except Exception as e:
            logger.error(f"Error conectando MT5: {e}")
            return {"success": False, "error": str(e)}
    
    def login(self, login: int, password: str, server: str) -> dict:
        """
        Login en cuenta MT5
        
        Args:
            login: ID de cuenta
            password: Contraseña
            server: Servidor (ej: ThinkMarkets-Demo)
            
        Returns:
            dict: Resultado del login
        """
        if not self.connected:
            if not self._initialize_mt5(login=login, password=password, server=server):
                error = mt5.last_error()
                return {
                    "success": False,
                    "error": f"AutenticaciÃ³n fallida: {error}",
                    "login": login,
                    "server": server,
                }
            self.connected = True

        try:
            # Hacer login
            auth_result = mt5.login(login=login, password=password, server=server)
            
            if not auth_result:
                error = mt5.last_error()
                logger.error(f"Login fallido: {error}")
                return {
                    "success": False,
                    "error": f"Autenticación fallida: {error}",
                    "login": login,
                    "server": server
                }
            
            # Obtener info de cuenta
            account_info = mt5.account_info()
            self.account_info = {
                "login": account_info.login,
                "server": account_info.server,
                "name": account_info.name,
                "currency": account_info.currency,
                "balance": account_info.balance,
                "credit": account_info.credit,
                "equity": account_info.equity,
                "margin": account_info.margin,
                "free_margin": account_info.margin_free,
                "margin_level": account_info.margin_level,
                "leverage": account_info.leverage,
            }
            
            logger.info(f"Login exitoso: {account_info.name} ({login})")
            
            return {
                "success": True,
                "message": f"Login exitoso en {server}",
                "account": self.account_info
            }
        except Exception as e:
            logger.error(f"Error en login: {e}")
            return {"success": False, "error": str(e)}
    
    def get_account_info(self) -> dict:
        """Obtener información de la cuenta actual"""
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            info = mt5.account_info()
            return {
                "success": True,
                "account": {
                    "login": info.login,
                    "server": info.server,
                    "name": info.name,
                    "currency": info.currency,
                    "balance": float(info.balance),
                    "credit": float(info.credit),
                    "equity": float(info.equity),
                    "margin": float(info.margin),
                    "free_margin": float(info.margin_free),
                    "margin_level": float(info.margin_level),
                    "leverage": info.leverage,
                    "drawdown": float(info.equity - info.balance) if info.equity else 0,
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_symbols(self, filter_text: str = None) -> dict:
        """
        Obtener lista de símbolos disponibles
        
        Args:
            filter_text: Filtrar por nombre (opcional)
            
        Returns:
            dict: Lista de símbolos
        """
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            symbols = mt5.symbols_get()
            
            if filter_text:
                symbols = [s for s in symbols if filter_text.upper() in s.name.upper()]
            
            symbols_list = [
                {
                    "name": s.name,
                    "description": s.description,
                    "bid": s.bid,
                    "ask": s.ask,
                    "point": s.point,
                    "digits": s.digits,
                    "spread": s.spread,
                    "volume": s.volume,
                }
                for s in symbols[:50]  # Limitar a 50 para no saturar
            ]
            
            return {
                "success": True,
                "total": len(symbols),
                "showing": len(symbols_list),
                "symbols": symbols_list
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_symbol_info(self, symbol: str) -> dict:
        """Obtener información detallada de un símbolo"""
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            symbol_info = mt5.symbol_info(symbol)
            
            if not symbol_info:
                return {"success": False, "error": f"Símbolo {symbol} no encontrado"}
            
            return {
                "success": True,
                "symbol": {
                    "name": symbol_info.name,
                    "description": symbol_info.description,
                    "bid": symbol_info.bid,
                    "ask": symbol_info.ask,
                    "last": symbol_info.last,
                    "point": symbol_info.point,
                    "digits": symbol_info.digits,
                    "spread": symbol_info.spread,
                    "spread_float": symbol_info.spread_float,
                    "volume": symbol_info.volume,
                    "volume_real": symbol_info.volume_real,
                    "time": symbol_info.time,
                    "contract_size": symbol_info.trade_contract_size,
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def open_order(self, symbol: str, order_type: str, volume: float, price: float = None, 
                   sl: float = None, tp: float = None, comment: str = "") -> dict:
        """
        Abrir una orden
        
        Args:
            symbol: Símbolo (ej: EURUSD)
            order_type: 'BUY' o 'SELL'
            volume: Volumen en lotes
            price: Precio límite (None para orden de mercado)
            sl: Stop Loss
            tp: Take Profit
            comment: Comentario de la orden
            
        Returns:
            dict: Resultado de la orden
        """
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            # Decidir tipo de orden
            action = mt5.TRADE_ACTION_DEAL
            order_type_mt5 = mt5.ORDER_TYPE_BUY if order_type.upper() == "BUY" else mt5.ORDER_TYPE_SELL
            
            if price is not None:
                order_type_mt5 = mt5.ORDER_TYPE_BUY_LIMIT if order_type.upper() == "BUY" else mt5.ORDER_TYPE_SELL_LIMIT
            
            # Preparar request
            request = {
                "action": action,
                "symbol": symbol,
                "volume": volume,
                "type": order_type_mt5,
                "price": price if price else mt5.symbol_info_tick(symbol).ask if order_type.upper() == "BUY" else mt5.symbol_info_tick(symbol).bid,
                "sl": sl,
                "tp": tp,
                "comment": comment,
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_FOK,
            }
            
            # Enviar orden
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                error = mt5.last_error()
                logger.error(f"Orden rechazada: {error}")
                return {
                    "success": False,
                    "error": f"Orden rechazada: {error}",
                    "retcode": result.retcode
                }
            
            logger.info(f"Orden abierta: {order_type} {volume} {symbol} @ {result.price}")
            
            return {
                "success": True,
                "ticket": result.order,
                "volume": result.volume,
                "price": result.price,
                "bid": result.bid,
                "ask": result.ask,
                "comment": "Orden abierta exitosamente"
            }
        except Exception as e:
            logger.error(f"Error abriendo orden: {e}")
            return {"success": False, "error": str(e)}
    
    def close_order(self, ticket: int, volume: float = None) -> dict:
        """
        Cerrar una orden abierta
        
        Args:
            ticket: ID de la orden
            volume: Volumen a cerrar (None para cerrar total)
            
        Returns:
            dict: Resultado del cierre
        """
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            # Obtener orden abierta
            position = mt5.positions_get(ticket=ticket)
            
            if not position:
                return {"success": False, "error": f"Posición {ticket} no encontrada"}
            
            position = position[0]
            symbol = position.symbol
            volume_to_close = volume if volume else position.volume
            
            # Determinar tipo de cierre
            order_type = mt5.ORDER_TYPE_SELL if position.type == 0 else mt5.ORDER_TYPE_BUY
            
            # Preparar request de cierre
            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": symbol,
                "volume": volume_to_close,
                "type": order_type,
                "position": ticket,
                "price": mt5.symbol_info_tick(symbol).bid if position.type == 0 else mt5.symbol_info_tick(symbol).ask,
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_FOK,
            }
            
            # Enviar cierre
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                error = mt5.last_error()
                return {"success": False, "error": f"Cierre rechazado: {error}"}
            
            logger.info(f"Orden cerrada: Ticket {ticket}")
            
            return {
                "success": True,
                "ticket": result.order,
                "volume": result.volume,
                "close_price": result.price,
                "comment": "Orden cerrada exitosamente"
            }
        except Exception as e:
            logger.error(f"Error cerrando orden: {e}")
            return {"success": False, "error": str(e)}
    
    def get_positions(self) -> dict:
        """Obtener todas las posiciones abiertas"""
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            positions = mt5.positions_get()
            
            if not positions:
                return {"success": True, "positions": [], "count": 0}
            
            positions_list = [
                {
                    "ticket": p.ticket,
                    "symbol": p.symbol,
                    "type": "BUY" if p.type == 0 else "SELL",
                    "volume": p.volume,
                    "open_price": p.price_open,
                    "current_price": p.price_current,
                    "sl": p.sl,
                    "tp": p.tp,
                    "profit": float(p.profit),
                    "commission": float(p.commission),
                    "open_time": datetime.fromtimestamp(p.time).isoformat(),
                    "comment": p.comment,
                }
                for p in positions
            ]
            
            total_profit = sum(p["profit"] for p in positions_list)
            
            return {
                "success": True,
                "count": len(positions_list),
                "total_profit": float(total_profit),
                "positions": positions_list
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_history(self, days: int = 7) -> dict:
        """Obtener historial de órdenes cerradas"""
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            from_date = datetime.now() - timedelta(days=days)
            
            history = mt5.history_deals_get(from_date, datetime.now())
            
            if not history:
                return {"success": True, "history": [], "count": 0}
            
            history_list = [
                {
                    "ticket": d.ticket,
                    "order": d.order,
                    "symbol": d.symbol,
                    "type": "BUY" if d.type == 0 else "SELL",
                    "volume": d.volume,
                    "price": d.price,
                    "profit": float(d.profit),
                    "commission": float(d.commission),
                    "time": datetime.fromtimestamp(d.time).isoformat(),
                    "comment": d.comment,
                }
                for d in history
            ]
            
            return {
                "success": True,
                "count": len(history_list),
                "period_days": days,
                "history": history_list
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def modify_order(self, ticket: int, sl: float = None, tp: float = None) -> dict:
        """Modificar Stop Loss y/o Take Profit de una orden"""
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            position = mt5.positions_get(ticket=ticket)
            
            if not position:
                return {"success": False, "error": f"Posición {ticket} no encontrada"}
            
            position = position[0]
            
            request = {
                "action": mt5.TRADE_ACTION_SLTP,
                "position": ticket,
                "sl": sl if sl else position.sl,
                "tp": tp if tp else position.tp,
            }
            
            result = mt5.order_send(request)
            
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {"success": False, "error": f"Modificación rechazada: {mt5.last_error()}"}
            
            logger.info(f"Orden modificada: {ticket} SL={sl} TP={tp}")
            
            return {
                "success": True,
                "ticket": ticket,
                "new_sl": sl,
                "new_tp": tp,
                "comment": "Orden modificada exitosamente"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def get_candles(self, symbol: str, timeframe: str = "H1", count: int = 100) -> dict:
        """
        Obtener velas OHLC
        
        Args:
            symbol: Símbolo
            timeframe: Período (M1, M5, M15, M30, H1, H4, D1, W1, MN1)
            count: Número de velas
            
        Returns:
            dict: Datos de velas
        """
        if not self.connected:
            return {"success": False, "error": "MT5 no conectado"}
        
        try:
            # Mapear timeframe
            tf_map = {
                "M1": mt5.TIMEFRAME_M1,
                "M5": mt5.TIMEFRAME_M5,
                "M15": mt5.TIMEFRAME_M15,
                "M30": mt5.TIMEFRAME_M30,
                "H1": mt5.TIMEFRAME_H1,
                "H4": mt5.TIMEFRAME_H4,
                "D1": mt5.TIMEFRAME_D1,
                "W1": mt5.TIMEFRAME_W1,
                "MN1": mt5.TIMEFRAME_MN1,
            }
            
            tf = tf_map.get(timeframe.upper(), mt5.TIMEFRAME_H1)
            
            # Obtener velas
            rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
            
            if rates is None:
                return {"success": False, "error": f"No data para {symbol}"}
            
            candles = [
                {
                    "time": datetime.fromtimestamp(r['time']).isoformat(),
                    "open": float(r['open']),
                    "high": float(r['high']),
                    "low": float(r['low']),
                    "close": float(r['close']),
                    "tick_volume": int(r['tick_volume']),
                    "real_volume": int(r['real_volume']),
                }
                for r in rates
            ]
            
            return {
                "success": True,
                "symbol": symbol,
                "timeframe": timeframe,
                "count": len(candles),
                "candles": candles
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def disconnect(self) -> dict:
        """Desconectar de MT5"""
        try:
            mt5.shutdown()
            self.connected = False
            logger.info("MT5 desconectado")
            return {"success": True, "message": "Desconectado de MT5"}
        except Exception as e:
            return {"success": False, "error": str(e)}


# Funciones helper para uso directo
def init_mt5_bridge(mt5_path: str = None) -> MT5Bridge:
    """Crear instancia del puente MT5"""
    bridge = MT5Bridge(mt5_path)
    return bridge
