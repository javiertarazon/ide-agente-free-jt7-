# Release 4.2.0 - MT5 MCP Server Integration

**Fecha**: 2026-02-27  
**Versión**: 4.2.0  
**Etapa**: Integración del servidor MCP con soporte para herramientas de MetaTrader 5

---

## Resumen Ejecutivo

Esta release integra el servidor MCP (Model Context Protocol) con soporte nativo para MetaTrader 5, permitiendo que los agentes IA (Claude, Copilot, Gemini) ejecuten operaciones de trading, análisis de mercado y gestión de cuentas de forma automática y segura.

---

## Cambios Principales

### 1. Nuevo Servidor MCP (`servidor mpc free jt7/`)

**Ubicación**: `e:\javie\agente-freejt7-extension-funcional\servidor mpc free jt7\`

**Componentes principales**:

```
servidor mpc free jt7/
├── src/
│   ├── index.js                    # Servidor MCP principal
│   ├── policy.js                   # Lógica de control de acceso
│   ├── selftest.js                 # Auto-validación del servidor
│   ├── tools/
│   │   ├── web.js                  # Herramientas HTTP/web
│   │   ├── scraping.js             # Extracción de contenido web
│   │   ├── system.js               # Operaciones del sistema (exec, file I/O)
│   │   ├── desktop.js              # Control de desktop
│   │   ├── media.js                # Herramientas multimedia (YouTube, etc.)
│   │   └── mt5.js                  # ⭐ NUEVO: Herramientas MetaTrader 5
│   ├── policies/
│   │   └── policy.yaml             # Configuración de permisos y límites
│   └── config.yaml                 # Configuración del servidor
├── package.json
├── .env.example
└── README.md                       # Documentación de operación
```

---

### 2. Herramientas de MT5 (`src/tools/mt5.js`)

**Exporta las siguientes herramientas**:

#### Gestión de Cuentas
- `mt5_get_account_info` - Obtiene información de la cuenta (saldo, equidad, apalancamiento, etc.)
- `mt5_get_positions` - Lista todas las posiciones abiertas
- `mt5_get_orders` - Lista órdenes pendientes
- `mt5_get_deals` - Historial de operaciones completadas

#### Análisis de Mercado
- `mt5_get_symbol_info` - Información de un símbolo (spread, precio, horario de trading)
- `mt5_get_rates` - Datos OHLC para análisis técnico
- `mt5_search_symbols` - Búsqueda de instrumentos por patrón

#### Operaciones de Trading
- `mt5_place_order` - Coloca órdenes con validación de riesgo
- `mt5_close_position` - Cierra una posición existente
- `mt5_modify_order` - Ajusta SL/TP de órdenes pendientes
- `mt5_cancel_order` - Cancela órdenes pendientes

#### Herramientas de Análisis
- `mt5_calculate_pip_value` - Calcula valor del pip para riesgo
- `mt5_get_market_hours` - Horarios de trading por sesión
- `mt5_check_trading_conditions` - Validaciones pre-trading

---

### 3. Cambios en `src/index.js`

**Cambio 1**: Importación de MT5
```javascript
import { mt5Tools } from "./tools/mt5.js";
```

**Cambio 2**: Exportación de herramientas
```javascript
const tools = {
  // ... otras herramientas ...
  jt7_youtube_download_request: { ... },
  ...mt5Tools  // ⭐ Nuevas herramientas de MT5
};
```

**Impacto**: Todas las herramientas de MT5 están ahora disponibles para uso del servidor MCP.

---

## Control de Acceso y Seguridad

### Política de Acceso (`policy.yaml`)

```yaml
mt5:
  enabled: true
  require_authentication: true
  max_risk_per_trade: 2.0              # % Máximo de riesgo
  max_positions_open: 10               # Límite de posiciones
  max_cost_per_order: 5000             # Máximo costo en USD
  forbidden_symbols: ["XAU/USD", "GCZ"]  # Símbolos bloqueados
  allowed_pairs: null                  # null = todos permitidos
  trading_hours_check: true
  rate_limit: 30                       # máx 30 órdenes/hora
```

### Herramientas de Validación

Cada herramienta incluye:
1. **Validación de credenciales**: Requiere autenticación MT5
2. **Control de políticas**: Verifica límites configurados
3. **Logging de auditoría**: Registra todas las operaciones
4. **Manejo de errores**: Respuestas claras ante fallos

---

## Guía de Instalación y Uso

### Requisitos Previos
- Node.js 18+
- MetaTrader 5 instalado y accesible
- Credenciales válidas de MT5

### Instalación
```bash
cd "servidor mpc free jt7"
npm install
npm run build
```

### Iniciar el Servidor
```bash
npm start
# o con self-test
npm start -- --self-test
```

### Conectar desde Claude/Copilot
El servidor expone una interfaz MCP estándar en stdin/stdout compatible con:
- Claude Code
- VS Code Copilot
- Cualquier cliente MCP estándar

---

## Ejemplos de Uso

### Obtener información de la cuenta
```javascript
// Request MCP
{
  method: "tools/call",
  params: {
    name: "mt5_get_account_info"
  }
}

// Response esperada
{
  account_number: 12345678,
  balance: 10000.00,
  equity: 10500.00,
  free_margin: 10500.00,
  margin_level: 105.0,
  leverage: 100
}
```

### Colocar una orden con validación
```javascript
{
  method: "tools/call",
  params: {
    name: "mt5_place_order",
    arguments: {
      symbol: "EURUSD",
      order_type: "BUY",
      volume: 1.0,
      stop_loss: 1.0800,
      take_profit: 1.1000,
      max_risk_percent: 1.5
    }
  }
}

// Response
{
  order_id: 987654,
  status: "ACCEPTED",
  symbol: "EURUSD",
  type: "BUY",
  volume: 1.0,
  open_price: 1.0900,
  risk_percent: 1.45,
  risk_usd: 145.00
}
```

---

## Pruebas y Validación

### Self-Test
```bash
npm start -- --self-test
```

Valida:
- ✅ Disponibilidad de MetaTrader 5
- ✅ Credenciales configuradas
- ✅ Conectividad de red
- ✅ Carga de políticas
- ✅ Integridad de herramientas

### Pruebas Manuales
```bash
# En otra terminal
cat test-request.json | npm start
```

---

## Configuración por Ambiente

### `.env.development`
```env
MT5_LOGIN=12345678
MT5_PASSWORD=password
MT5_SERVER=MetaQuotes-Demo
LOG_LEVEL=debug
POLICY_FILE=policies/policy.yaml
```

### `.env.production`
```env
MT5_LOGIN=<use-docker-secret>
MT5_PASSWORD=<use-docker-secret>
MT5_SERVER=MetaQuotes-Live
LOG_LEVEL=warn
POLICY_FILE=policies/policy.production.yaml
```

---

## Diagnosticar Problemas

### Servidor no inicia
```bash
npm start -- --self-test
```

### MT5 no es accesible
```bash
node -e "const m=require('mt5.js'); m.check()"
```

### Herramientas no disponibles
```bash
curl http://localhost:3000/tools
# Debe listar todas las herramientas incluyendo mt5_*
```

---

## Notas sobre Compatibilidad

| Versión | Estado | Notas |
|---------|--------|-------|
| 4.0.0-4.1.9 | ❌ Incompatible | Usar version anterior de servidor |
| 4.2.0+ | ✅ Compatible | Integración MCP/MT5 completa |
| Node 16 | ⚠️ Advertencia | Use Node 18+ para máxima estabilidad |

---

## Roadmap para 4.3.0

- [ ] WebSocket nativo para real-time quotes
- [ ] Soporte para ordenes OCO (One-Cancels-Other)
- [ ] Análisis técnico integrado (Bollinger, RSI, etc.)
- [ ] Backtesting de estrategias
- [ ] Dashboard web de monitoreo

---

## Cambios Relacionados

### Documentación
- 📄 [README.md](/servidor%20mpc%20free%20jt7/README.md) - Documentación completa
- 📄 [ARCHITECTURE.md](/servidor%20mpc%20free%20jt7/docs/ARCHITECTURE.md) - Diagrama de componentes

### Scripts
- 🔧 `scripts/setup-mt5-mcp.ps1` - Instalación automática (próximamente)
- 🔧 `scripts/test-mt5-mcp.ps1` - Suite de pruebas

---

## Créditos y Agradecimientos

- **Arquitectura MCP**: Based on [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **MT5 Integration**: Using official MetaTrader 5 SDK
- **Free JT7 Team**: Implementación y testing

---

## Soporte y Contacto

Para issues, preguntas o sugerencias:
- 📧 Email: support@freejt7.dev
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions

---

**Última actualización**: 2026-02-27  
**Próxima revisión**: 2026-03-27
