# Ejemplos de Uso - MT5 Automation desde VS Code

## 1. Conectar a MT5

### Comando desde Terminal VS Code
```bash
# Verificar conexión
python -m mcp.servers.mt5 --test-connection

# Output esperado:
# ✅ Conectado a ThinkMarkets-Demo
# Account: 174873
# Balance: $XXXX.XX
```

### Desde CLI de MCP
```
mcp tools mt5_connect
  --login 174873
  --password "Jatr28037$"
  --server "ThinkMarkets-Demo"
```

## 2. Obtener datos de mercado en tiempo real

### Ejemplo 1: Obtener cotización actual
```python
# En la terminal o script de debugger de VS Code
mcp tools mt5_get_symbol_info
  --symbol "EURUSD"

# Output:
# {
#   "symbol": "EURUSD",
#   "bid": 1.0856,
#   "ask": 1.0857,
#   "spread": 0.0001,
#   "spread_points": 10,
#   "volume": 250000,
#   "time": "2026-03-13T14:32:15Z"
# }
```

### Ejemplo 2: Descargar historial de 100 velas H1
```python
mcp tools mt5_get_candles
  --symbol "EURUSD"
  --timeframe 60
  --count 100

# Output: Array de 100 candles con OHLCV
```

## 3. Gestión de órdenes automática

### Crear orden BUY
```python
mcp tools mt5_place_order
  --symbol "EURUSD"
  --order_type "BUY"
  --volume 0.1
  --price 1.0856
  --sl 1.0836
  --tp 1.0900
  --comment "Entrada manual desde VS Code"

# Output:
# {
#   "order_id": 12345678,
#   "status": "ACCEPTED",
#   "entry_price": 1.0856,
#   "sl": 1.0836,
#   "tp": 1.0900
# }
```

### Cerrar orden por ID
```python
mcp tools mt5_close_order
  --order_id 12345678
  --close_price 1.0870

# Output:
# {
#   "order_id": 12345678,
#   "status": "CLOSED",
#   "profit_loss": 140,
#   "commission": -3.50
# }
```

### Modificar SL/TP
```python
mcp tools mt5_modify_order
  --order_id 12345678
  --sl 1.0846
  --tp 1.0920

# Output:
# {
#   "order_id": 12345678,
#   "status": "MODIFIED",
#   "new_sl": 1.0846,
#   "new_tp": 1.0920
# }
```

## 4. Análisis técnico automático

### Calcular indicadores
```python
mcp tools mt5_calculate_indicators
  --symbol "EURUSD"
  --timeframe 240
  --indicators '["ema", "rsi", "atr", "stoch"]'
  --periods '{"ema": [20, 50, 200], "rsi": 14, "atr": 14}'

# Output:
# {
#   "ema": {"20": 1.0850, "50": 1.0845, "200": 1.0840},
#   "rsi": 65.4,
#   "atr": 0.0045,
#   "stoch": {"k": 78.2, "d": 75.6}
# }
```

## 5. Monitoreo de posiciones

### Listar todas las posiciones abiertas
```python
mcp tools mt5_get_positions

# Output:
# [
#   {
#     "ticket": 12345678,
#     "symbol": "EURUSD",
#     "type": "BUY",
#     "volume": 0.1,
#     "entry_price": 1.0856,
#     "current_price": 1.0870,
#     "profit_pips": 14,
#     "profit_usd": 140,
#     "sl": 1.0836,
#     "tp": 1.0900,
#     "open_time": "2026-03-13T14:15:00Z"
#   }
# ]
```

### Monitorear balance en tiempo real
```python
mcp tools mt5_get_account_info

# Output:
# {
#   "balance": 4800.50,
#   "equity": 4940.50,
#   "profit_loss": 140.00,
#   "used_margin": 425.00,
#   "available_margin": 4375.50,
#   "margin_level": 1162,
#   "open_positions": 1,
#   "pending_orders": 0
# }
```

## 6. Historial y reportes

### Obtener historial de operaciones cerradas
```python
mcp tools mt5_get_closed_deals
  --limit 10

# Output: Últimas 10 operaciones cerradas con P&L
```

### Estadísticas diarias
```python
mcp tools mt5_get_daily_stats
  --date "2026-03-13"

# Output:
# {
#   "date": "2026-03-13",
#   "trades": 5,
#   "wins": 3,
#   "losses": 2,
#   "pnl": 250.00,
#   "win_rate": 60.0,
#   "best_trade": 120.00,
#   "worst_trade": -85.00
# }
```

## 7. Integración con Notebooks

### Ejemplo Jupyter/Python en VS Code
```python
from mcp_client import MCPClient

client = MCPClient(server_url="http://localhost:3000")

# Obtener datos
eurusd_info = client.call_tool("mt5_get_symbol_info", {"symbol": "EURUSD"})
candles = client.call_tool("mt5_get_candles", {
    "symbol": "EURUSD",
    "timeframe": 240,
    "count": 100
})

# Procesar con pandas
import pandas as pd
df = pd.DataFrame(candles)
print(df.describe())

# Calcular estadísticas
print(f"Máximo: {df['high'].max()}")
print(f"Mínimo: {df['low'].min()}")
print(f"Promedio: {df['close'].mean()}")
```

## 8. Automatización con Watchers

### Monitorear símbolo y ejecutar acción
```python
# En VS Code debugger o terminal
mcp tools mt5_watch_symbol
  --symbol "EURUSD"
  --condition "price_above:1.0870"
  --action "notify"
  --interval 5

# Monitorear hasta que se cumpla la condición,
# luego ejecutar la acción cada 5 segundos
```

## 9. Backtest de estrategias

### Ejecutar backtest
```python
mcp tools mt5_backtest
  --symbol "EURUSD"
  --strategy "TM_VOLATILITY_75"
  --start_date "2026-01-01"
  --end_date "2026-03-13"
  --initial_balance 5000
  --risk_per_trade 0.005
  --sl_atr 1.8
  --tp_atr 2.2

# Output:
# {
#   "total_trades": 45,
#   "win_rate": 62.2,
#   "profit_factor": 2.15,
#   "max_drawdown": -8.5,
#   "sharpe_ratio": 1.84,
#   "final_balance": 5950.00
# }
```

## 10. Alertas y notificaciones

### Crear alerta de precio
```python
mcp tools mt5_create_alert
  --symbol "EURUSD"
  --alert_type "price_level"
  --level 1.0900
  --condition "ABOVE"
  --notify_channels '["email", "telegram", "vs_code"]'

# Output:
# {
#   "alert_id": "ALR_12345",
#   "status": "ACTIVE",
#   "channels": ["email", "telegram", "vs_code"]
# }
```

---

## Tips de productividad en VS Code

### 1. Crear snippets personalizados
File → Preferences → Configure User Snippets → python.json

```json
{
  "MT5 Connect": {
    "prefix": "mt5connect",
    "body": [
      "mcp tools mt5_connect \\",
      "  --login $1 \\",
      "  --password \"$2\" \\",
      "  --server \"$3\""
    ]
  },
  "MT5 Get Symbol": {
    "prefix": "mt5symbol",
    "body": "mcp tools mt5_get_symbol_info --symbol \"$1\""
  }
}
```

### 2. Tasks en VS Code
Crear `.vscode/tasks.json` para comandos frecuentes:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "MT5: Conectar",
      "type": "shell",
      "command": "python",
      "args": ["-m", "mcp.servers.mt5", "--connect"],
      "group": { "kind": "test", "isDefault": true }
    }
  ]
}
```

### 3. Keybindings personalizados
Agregar en `.vscode/keybindings.json`:

```json
[
  {
    "key": "ctrl+shift+m",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "mcp tools mt5_get_account_info\n" }
  }
]
```

---

## Troubleshooting

| Error | Solución |
|-------|----------|
| `Connection refused` | Verificar que MT5 está abierto y el servidor MCP está activo |
| `Invalid credentials` | Validar login/password en `CREDENCIALES_DEMO.local.env` |
| `Order rejected` | Revisar spread, margin disponible, horario de mercado |
| `Timeout on candles` | Reducir `count` o aumentar timeout en configuración |
| `Symbol not found` | Verificar que el símbolo existe en MT5 (e.g., "EURUSD" vs "EUR/USD") |

