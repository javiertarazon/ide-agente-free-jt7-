# Servidor MCP Free JT7 - MetaTrader 5 Integration

Servidor **Model Context Protocol (MCP)** completo con automatización web, scraping, sistema, desktop y **control integral de MetaTrader 5** para agentes IA.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)  
![MT5](https://img.shields.io/badge/MT5-Compatible-orange)

---

## 🚀 Capacidades

### ✅ Sistema & Web
- `jt7_ping`: Verificar estado del servidor
- `jt7_web_fetch`: Descargas HTTP con control de política
- `jt7_scrape_text`: Extrae texto plano de URLs
- `jt7_browser_open`: Abre una URL permitida en el navegador por defecto
- `jt7_system_exec`: Ejecuta comandos (allowlist + timeout)
- `jt7_desktop_open`: Abre programas permitidos
- `jt7_file_read` / `jt7_file_write`: I/O de archivos
- `jt7_path_stat` / `jt7_dir_list`: Inspección de rutas y directorios
- `jt7_pdf_extract_text`: Lectura local de PDFs a texto
- `jt7_document_read`: Lectura normalizada de texto/JSON/HTML/CSV/PDF
- `jt7_path_search`: Búsqueda por nombre o contenido en rutas locales
- `jt7_youtube_info`: Metadatos vía oEmbed
- `jt7_youtube_download_request`: Descarga controlada

### ⭐ MetaTrader 5 (NUEVO v4.2.0)
- **Gestión de Cuentas**: Info, posiciones, órdenes, historial
- **Análisis**: Símbolos, OHLC, horarios, filtros
- **Trading**: Abrir, cerrar, modificar, cancelar órdenes
- **Cálculo**: Valor de pip, validación de riesgo
- **Seguridad**: Límites automáticos, auditoría, logging

---

## 🔧 Instalación Rápida

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar credenciales
echo "MT5_LOGIN=12345678" > .env
echo "MT5_PASSWORD=password" >> .env
echo "MT5_SERVER=MetaQuotes-Demo" >> .env

# 3. Validar (self-test)
npm run test

# 4. Iniciar servidor
npm start
```

---

## 📊 Herramientas MT5

### Gestión de Cuentas
| Tool | Descripción |
|------|-----------|
| `mt5_get_account_info` | Obtener balance, equity, margen |
| `mt5_get_positions` | Listar posiciones abiertas |
| `mt5_get_orders` | Obtener órdenes pendientes |
| `mt5_get_deals` | Historial de operaciones |

### Análisis de Mercado
| Tool | Descripción |
|------|-----------|
| `mt5_get_symbol_info` | Información de símbolo (spread, horario) |
| `mt5_get_rates` | Datos OHLC para análisis técnico |
| `mt5_search_symbols` | Búsqueda de instrumentos |

### Operaciones de Trading
| Tool | Descripción |
|------|-----------|
| `mt5_place_order` | Colocar orden (validación de riesgo) |
| `mt5_close_position` | Cerrar posición |
| `mt5_modify_order` | Cambiar SL/TP |
| `mt5_cancel_order` | Cancelar orden pendiente |

### Herramientas Avanzadas
| Tool | Descripción |
|------|-----------|
| `mt5_calculate_pip_value` | Calcular valor del pip |
| `mt5_get_market_hours` | Horarios de trading por sesión |

---

## 📝 Configuración

### `.env` (desarrollo)
```env
MT5_LOGIN=12345678
MT5_PASSWORD=tu_contraseña
MT5_SERVER=MetaQuotes-Demo
NODE_ENV=development
LOG_LEVEL=debug
```

### `policies/policy.yaml` (control de acceso)
```yaml
mt5:
  enabled: true
  max_risk_per_trade: 2.0
  max_positions_open: 10
  max_cost_per_order: 5000
  forbidden_symbols: ["XAU/USD"]
  trading_hours_check: true
  rate_limit: 30  # órdenes/hora
```

---

## 🧪 Pruebas

```bash
# Self-test automático
npm start -- --self-test

# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Desarrollo con auto-reload
npm run dev
```

---

## 📚 Ejemplos de Uso

### Obtener info de cuenta
```bash
echo '{"method":"tools/call","params":{"name":"mt5_get_account_info"}}' | npm start
```

### Colocar orden con riesgo controlado
```json
{
  "method": "tools/call",
  "params": {
    "name": "mt5_place_order",
    "arguments": {
      "symbol": "EURUSD",
      "order_type": "BUY",
      "volume": 1.0,
      "stop_loss": 1.0800,
      "take_profit": 1.1000,
      "max_risk_percent": 1.5
    }
  }
}
```

### Obtener datos OHLC
```bash
jq -n '{method:"tools/call",params:{name:"mt5_get_rates",arguments:{symbol:"EURUSD",timeframe:"H1",count:100}}}' | npm start
```

---

## 🔐 Seguridad

✅ **Validaciones automáticas**:
- Límites de riesgo por operación
- Máximo de posiciones simultáneas
- Símbolos bloqueados
- Horarios de mercado
- Límite de rate (órdenes/hora)

✅ **Logging y auditoría**:
- Todas las operaciones registro estructurado
- Trazabilidad completa
- Alertas ante límites excedidos

✅ **Aislamiento**:
- MCP secure protocol (stdio)
- Sin exposición HTTP pública
- Credenciales en .env (nunca en código)

---

## 🚀 Scripts disponibles

```bash
npm start              # Inicia servidor (stdio)
npm run test           # Tests completos
npm run test:unit      # Solo tests unitarios
npm run test:int       # Solo tests integración
npm run dev            # Dev mode (auto-reload)
npm run build          # Compilar
npm run lint           # ESLint
npm run format         # Prettier
npm run docker:build   # Build imagen Docker
npm run docker:run     # Ejecutar con Docker
```

---

## 📖 Documentación

- **[RELEASE-4.2.0.md](../docs/RELEASE-4.2.0.md)** - Changelog completo
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Diagrama de componentes
- **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Solución de problemas

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| MT5 no se conecta | Verificar `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` en `.env` |
| Herramientas vacías | Ejecutar `npm start -- --self-test` |
| Rendimiento lento | Habilitar profiling: `npm start -- --profile` |
| Errores de permissions | Verificar usuario de MT5 y permisos de archivo |

---

## 📧 Soporte

- 📧 support@freejt7.dev
- 🐛 Issues: GitHub Issues
- 💬 Discussions: GitHub Discussions

---

**Versión**: 0.1.0 (Release 4.2.0+)  
**Última actualización**: 2026-02-27  
**Mantenedor**: Free JT7 Team
