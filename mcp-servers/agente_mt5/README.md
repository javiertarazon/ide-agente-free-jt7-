# Agente MT5 (MCP)

Servidor MCP separado para analisis cuantitativo de simbolos en MT5.

## Alcance MVP

- Modo solo senales.
- Sin auto-ejecucion de ordenes.
- Generacion de senal BUY/SELL/FLAT por simbolo.
- Filtro de riesgo basico por spread y ATR.
- Conector reutilizando `tools/mt5_bridge.py`.

## Herramientas MCP

- agente_mt5_connect
- agente_mt5_universe
- agente_mt5_features
- agente_mt5_signal
- agente_mt5_risk_check
- agente_mt5_backtest (placeholder fase 1)

## Instalacion

1. Ir al directorio:

   cd mcp-servers/agente_mt5

2. Instalar dependencias:

   pip install -r requirements.txt

3. Ejecutar servidor:

   python agente_mt5_server.py

## Flujo sugerido

1. `agente_mt5_connect` para conectar al terminal.
2. `agente_mt5_universe` para listar simbolos.
3. `agente_mt5_signal` sobre EURUSD, XAUUSD, GBPUSD.
4. `agente_mt5_risk_check` antes de usar la senal.

## Notas

- Este modulo no ofrece consejos financieros.
- Resultado de senales es experimental y requiere validacion con backtest/walk-forward en fase 2.
