# Diseno y Plan - Agente MT5

Fecha: 2026-04-22
Estado: plan de ejecucion listo

## 1) Objetivo del Agente MT5

Construir una nueva herramienta MCP llamada agente_mt5 orientada a:
- Analisis de simbolos por broker en MT5.
- Generacion de senales de compra/venta con enfoque cuantitativo.
- Control estricto de riesgo.
- Validacion estadistica (backtest y walk-forward) antes de uso operativo.

Importante:
- No se promete rentabilidad garantizada.
- El sistema debe buscar ventaja estadistica y robustez, no certeza.

## 2) Respuestas capturadas y supuestos de trabajo

Respuestas recibidas:
- Modo: solo analisis y senales.
- Cuenta inicial: demo.
- Temporalidad: intradia M15-H1.
- Estrategia base: multiestrategia con votacion.
- Metricas objetivo: Sharpe > 1, Profit Factor > 1.3, DD < 10%.
- Infraestructura: nuevo servidor MCP separado.
- Paralelizacion: si, paralelo completo.

Campos no respondidos (autonomia con supuestos conservadores):
- Simbolos iniciales: EURUSD, XAUUSD, GBPUSD.
- Riesgo: 0.5% por senal teorica y limite diario 2R, sin ejecucion automatica.
- Filtros: spread maximo dinamico por simbolo, ventana horaria liquida, exclusion de eventos de alta volatilidad.

## 3) Analisis tecnico del estado actual

Archivos analizados:
- mcp-servers/mt5/mt5_server.py
- tools/mt5_bridge.py
- mcp-servers/mt5/README.md

Hallazgos principales:
1. Duplicacion funcional entre mt5_server.py y mt5_bridge.py (conexion, ordenes, datos, posiciones).
2. Mezcla de capas: logica de conexion, trading y capa MCP estan acopladas.
3. Ruta Linux de MT5 desalineada con la instalacion real actual (hay riesgo de fallo por path fijo).
4. Faltan guardrails cuantitativos previos a senales/ordenes (riesgo, sesgo de spread, volatilidad, horario).
5. No existe pipeline robusto de investigacion: feature engineering, walk-forward, control de overfitting.
6. Credenciales en archivo JSON local sin hardening criptografico real.

## 4) Arquitectura objetivo de agente_mt5

Nuevo modulo sugerido:
- mcp-servers/agente_mt5/

Capas:
1. Connector Layer
- Adaptador unico sobre tools/mt5_bridge.py.
- Soporte robusto Linux/Wine path discovery.

2. Market Data Layer
- Velas M15/H1, spread, sesiones, volatilidad ATR, calendario basico.

3. Signal Engine (multivoto)
- Estrategia Tendencia: MA slope + ADX + pullback.
- Estrategia Reversion: RSI + bandas de volatilidad.
- Estrategia Breakout: rango + ATR expansion.
- Votador: score agregado con umbral minimo.

4. Risk Engine
- Riesgo por senal en R.
- Bloqueo por spread anomalo.
- Limite de perdida diaria teorica.
- Correlacion maxima entre simbolos.

5. Validation Engine
- Backtest con costos y slippage.
- Walk-forward por ventanas.
- Reportes: Sharpe, PF, DD, hit rate, expectancy.

6. MCP Interface
- Herramientas orientadas a analisis/senal, no auto-trading inicial.

## 5) Contrato MCP del nuevo agente

Herramientas fase MVP:
- agente_mt5_connect
- agente_mt5_universe
- agente_mt5_features
- agente_mt5_signal
- agente_mt5_risk_check
- agente_mt5_backtest
- agente_mt5_walkforward
- agente_mt5_report

Nota:
- Cualquier tool de envio de orden queda deshabilitada en fase inicial (solo senal).

## 6) Estrategia inicial (M15-H1)

Pipeline por simbolo:
1. Obtener velas M15 (timing) y H1 (contexto).
2. Calcular features tecnicas y microestructura minima (spread, ATR, momentum).
3. Calcular voto de cada subestrategia.
4. Aplicar filtros de riesgo.
5. Emitir salida estructurada:
- direccion: BUY / SELL / FLAT
- confianza: 0..1
- racional tecnico
- invalidacion
- objetivo teorico por R multiple

## 7) Plan de ejecucion paralelo por agentes

Lote paralelo A (diseno y contratos):
- Agente Explore
  - Tarea: mapa de dependencias MT5 actuales y puntos de ruptura.
  - Entregable: matriz de funciones reutilizables.

- Agente free-jt7
  - Tarea: diseno de contrato MCP de agente_mt5.
  - Entregable: schema de tools y recursos.

Lote paralelo B (cuant y riesgo):
- Agente openclaw
  - Tarea: especificacion de Signal Engine multivoto.
  - Entregable: formulas, pesos, umbrales.

- Agente free-jt7
  - Tarea: Risk Engine y reglas de bloqueo.
  - Entregable: checklist de guardrails y limites.

Lote paralelo C (implementacion y prueba):
- Agente openclaw
  - Tarea: scaffold de mcp-servers/agente_mt5 y wiring con mt5_bridge.
  - Entregable: servidor funcional con tools MVP.

- Agente free-jt7
  - Tarea: test de contrato y smoke de analisis de simbolos.
  - Entregable: suite de pruebas y reporte.

Lote paralelo D (validacion cuant):
- Agente openclaw
  - Tarea: backtest + walk-forward inicial sobre 3 simbolos.
  - Entregable: reporte KPI y recomendacion de go/no-go en demo.

## 8) Criterios de aceptacion

Minimos para pasar a fase demo operacional:
- Sharpe > 1
- Profit Factor > 1.3
- Max Drawdown < 10%
- Sensibilidad estable por parametros (sin sobreajuste evidente)
- Logs y trazabilidad completos por senal

## 9) Riesgos y mitigaciones

Riesgos:
- Sobreajuste por baja cantidad de datos.
- Deriva de mercado entre periodos.
- Falsos positivos en alta volatilidad.

Mitigaciones:
- Walk-forward obligatorio.
- Filtros de spread/volatilidad.
- Modo senales primero, sin ejecucion automatica.

## 10) Siguiente accion recomendada

Ejecutar Fase 1 (Lote paralelo A) y dejar creado el scaffold del nuevo servidor agente_mt5 con herramientas de analisis y riesgo, sin ejecucion automatica de ordenes.
