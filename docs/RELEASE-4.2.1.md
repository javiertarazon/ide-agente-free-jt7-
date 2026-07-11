# Release 4.2.1 - MT5 Automation Hotfix

**Fecha**: 2026-03-13  
**VersiÃ³n**: 4.2.1  
**Etapa**: EstabilizaciÃ³n de login y automatizaciÃ³n MT5

---

## Resumen Ejecutivo

Esta versiÃ³n corrige bloqueos de inicio de sesiÃ³n MT5 y habilita automatizaciÃ³n robusta por UI cuando el SDK se queda colgado. Se agrega auto-login por llamada usando archivo de credenciales y timeouts controlados para evitar procesos colgados.

---

## Cambios Principales

### 1. Login por Desktop (fallback)
- Nueva herramienta MCP: `jt7_mt5_desktop_login`
- Abre diÃ¡logo de login con shortcut (`%fl`) y completa campos por SendKeys

### 2. Auto-login por llamada
- `jt7_mt5_*` puede leer `credentials_file` y autenticar en cada ejecuciÃ³n
- NormalizaciÃ³n de comillas en credenciales y login

### 3. Control de timeouts
- Timeout configurable por `timeout_ms` para evitar bloqueos al inicializar MT5

---

## Uso RÃ¡pido

### Auto-login sin exponer secretos
```json
{
  "method": "tools/call",
  "params": {
    "name": "jt7_mt5_account_info",
    "arguments": {
      "credentials_file": "C:/ruta/CREDENCIALES_DEMO.local.env",
      "timeout_ms": 60000
    }
  }
}
```

### Login por UI (fallback)
```json
{
  "method": "tools/call",
  "params": {
    "name": "jt7_mt5_desktop_login",
    "arguments": {
      "login": 174873,
      "password": "***",
      "server": "ThinkMarkets-Demo",
      "openShortcut": "%fl",
      "delayMs": 450
    }
  }
}
```

---

## Notas

- Si `jt7_mt5_login` se cuelga, ejecutar primero `jt7_mt5_desktop_login`.
- Para operaciÃ³n headless, preferir `credentials_file` en cada tool.
