# MT5 MCP Server

Servidor Model Context Protocol (MCP) para integrar **MetaTrader 5** completamente en VS Code y permitir automatización completa de operaciones de trading.

## Características

✅ **Conexión Automática** - Conecta/desconecta a MT5 programáticamente
✅ **Gestión de Órdenes** - Abre, cierra y modifica órdenes automáticamente  
✅ **Información de Cuenta** - Monitorea balance, equity, posiciones abiertas
✅ **Datos de Mercado** - Accede a datos históricos y análisis técnico
✅ **Trading Automatizado** - Ejecuta trading automático con SL/TP
✅ **Caché Inteligente** - Mejora rendimiento con caché

## Instalación

### 1. Instalar MetaTrader 5 SDK

```bash
pip install -r requirements.txt
```

### 2. Copiar credenciales (Opcional)

El servidor buscará credenciales en `~/.mt5/free-jt7/credentials.json`:

```json
{
  "demo": {
    "account": 123456,
    "password": "tu_password",
    "server": "ICMarkets-Demo"
  },
  "live": {
    "account": 654321,
    "password": "tu_password_live",
    "server": "ICMarkets-Live"
  }
}
```

## Uso desde VS Code

### Conectar a MT5

```python
# Desde Claude Code o agentes
resultado = mcp.call_tool("mt5:connect", {
    "account": 123456,
    "password": "tu_password",
    "server": "ICMarkets-Demo"
})
```

### Obtener Información de Cuenta

```python
info = mcp.call_tool("mt5:get_account", {})
# Retorna: balance, equity, profit, posiciones abiertas, etc.
```

### Colocar una Orden

```python
resultado = mcp.call_tool("mt5:place_order", {
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.1,
    "price": 1.0950,
    "stop_loss": 1.0900,
    "take_profit": 1.1000,
    "comment": "Orden automática"
})
```

### Cerrar Posición

```python
resultado = mcp.call_tool("mt5:close_position", {
    "ticket": 12345
})
```

### Modificar SL/TP

```python
resultado = mcp.call_tool("mt5:modify_position", {
    "ticket": 12345,
    "stop_loss": 1.0900,
    "take_profit": 1.1000
})
```

### Obtener Datos de Mercado

```python
datos = mcp.call_tool("mt5:get_market_data", {
    "symbol": "EURUSD",
    "count": 100
})
# Retorna: lista de velas con open, high, low, close, volume
```

## Recursos Disponibles

El servidor expone estos recursos:

### `mt5://account`
Información actual de la cuenta (balance, equity, profit)

### `mt5://positions`
Todas las posiciones abiertas con precios y P&L

### `mt5://orders`
Todas las órdenes pendientes

### `mt5://status`
Estado de conexión a MT5

## Ejemplo: Trading Automático

```python
# Verificar estado
status = mcp.read_resource("mt5://status")

# Conectar
mcp.call_tool("mt5:connect", {
    "account": 123456,
    "password": "pass",
    "server": "ICMarkets-Demo"
})

# Obtener cuenta
account = mcp.call_tool("mt5:get_account", {})
print(f"Balance: {account['balance']}")
print(f"Equity: {account['equity']}")

# Colocar orden
orden = mcp.call_tool("mt5:place_order", {
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.1,
    "price": 1.0950,
    "stop_loss": 1.0900,
    "take_profit": 1.1000
})

# Monitorear
posiciones = mcp.call_tool("mt5:get_positions", {})
for pos in posiciones:
    print(f"{pos['symbol']}: {pos['profit']} USD")

# Cerrar cuando sea necesario
if posiciones[0]['profit'] > 50:
    mcp.call_tool("mt5:close_position", {
        "ticket": posiciones[0]['ticket']
    })

# Desconectar
mcp.call_tool("mt5:disconnect", {})
```

## Configuración Avanzada

### Cambiar Ruta de MT5

```json
{
  "mt5_path": "C:\Program Files\MetaTrader 5\terminal64.exe"
}
```

### Habilitar/Deshabilitar Caché

```json
{
  "cache_enabled": true,
  "cache_ttl": 300  // 5 minutos
}
```

## Seguridad

⚠️ **IMPORTANTE**: 
- Nunca commits tus credenciales en Git
- El archivo `credentials.json` tiene permisos 600 (solo lectura del propietario)
- Usa variables de entorno para credenciales en producción
- Encripta credenciales con `cryptography` si es necesario

## Logs

Los logs se guardan en `~/.mt5/free-jt7/` con estructuras:

```
~/.mt5/free-jt7/
├── config.json         # Configuración
├── credentials.json    # Credenciales (encriptadas idealmente)
├── cache.json          # Caché de datos
└── mt5_server.log      # Logs del servidor
```

## Solución de Problemas

### "MetaTrader5 no está instalado"
```bash
pip install MetaTrader5
```

### "MT5 no se conecta"
1. Verify MT5 is running: `terminal64.exe`
2. Check credentials: cuenta, contraseña, servidor
3. Check network/firewall
4. See logs in `~/.mt5/free-jt7/`

### "Ordenes no se ejecutan"
- Verificar que la sesión de trading esté abierta
- Verificar spread del símbolo
- Verificar dinero disponible (free_margin)
- Verificar horarios de mercado

## Roadmap

- [ ] WebSocket para actualizaciones en tiempo real
- [ ] Alarmas y notificaciones automáticas
- [ ] Backtesting integrado
- [ ] Dashboard de trading en VS Code
- [ ] Análisis técnico automatizado
- [ ] Machine Learning para predicciones
- [ ] Integración con TradingView

## Licencia

MIT
