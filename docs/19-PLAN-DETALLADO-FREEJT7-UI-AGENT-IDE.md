# Plan Detallado: Free JT7 — UI + Agente + IDE Propio

Fecha: 2026-04-27  
Basado en: docs 15, 16, 17 y 18 del proyecto + sesión de aclaración.

---

## Contexto y objetivo

Free JT7 tiene base operativa parcial: extensión VS Code, panel propio, SessionEngine,
ProviderRouter y MCP local. Sin embargo el panel está roto/incompleto, el IDE depende del
host externo y el agente necesita OpenClaw o Copilot para tener herramientas reales.

**Meta de este plan**: que Free JT7 funcione como una app standalone tipo Cursor/Windsurf,
con chat de agente principal, control total del IDE (VSCodium portable), soporte de cualquier
proveedor de modelos (OpenRouter, HF, CLŌD y más), y OpenClaw integrado al máximo con
fallback local automático.

---

## Restricciones confirmadas

- **IDE base**: VSCodium portable (perfil aislado `~/.freejt7-app/`).
- **SO**: Linux y Windows (ambos).
- **Proveedores prioritarios fase 1**: OpenRouter, HuggingFace (HF), CLŌD.
- **OpenClaw**: integración máxima (sessions_spawn, subagents, sessions_yield) con fallback
  automático si no está disponible.
- **UI prioritaria**: chat de agente principal como primera funcionalidad operativa.
- **Trazabilidad**: reconciliar todo antes de construir (6 tareas stale cerradas primero).

---

## Arquitectura objetivo (5 capas)

### Capa 1 — Provider Core (inspirada en OpenCode)

Fuente única de verdad para `providerID/modelID`. Catálogo dinámico por proveedor.
Config avanzada por proveedor/modelo y defaults por contexto.

Componentes:
- `src-js/core/provider-registry.js`: catálogo de proveedores y modelos disponibles.
- `src-js/core/provider-config.js`: config por proveedor (baseURL, headers, opciones).
- `src-js/core/provider-router.js` (ya existe, extender): enruta al proveedor correcto.

Contrato mínimo de un proveedor:
```json
{
  "id": "openrouter",
  "label": "OpenRouter",
  "baseURL": "https://openrouter.ai/api/v1",
  "models": ["openai/gpt-4o", "anthropic/claude-3-5-sonnet"],
  "primary": "openai/gpt-4o",
  "fallbacks": ["anthropic/claude-3-5-sonnet"],
  "authType": "bearer"
}
```

### Capa 2 — Agent Runtime (inspirada en OpenClaw)

SessionEngine con herramientas de sesión y subagentes. Cola de ejecución, estados y
verificación por tarea. Modo agente real por defecto, fallback local seguro.

Componentes:
- `src-js/core/session-engine.js` (ya existe, extender con session tools).
- `src-js/core/openclaw-agent-runtime.js` (ya existe, agregar sessions_spawn/yield/subagents).
- `src-js/core/local-agent-runtime.js` (ya existe, hardening y expansión).
- `src-js/core/extension.runtime.js` (ya existe, mantener fallback chain).

Flujo de selección de runtime:
```
OpenClaw disponible y configurado → openclaw-agent-runtime
  └─ No disponible → local-agent-runtime (shell + patch + read + write + verify)
Copilot SDK disponible → copilot-agent-runtime
  └─ No disponible → idem fallback local
```

### Capa 3 — Policy & Safety (fusión OpenCode + OpenClaw)

Matriz de permisos por tool, por agente y por nivel de riesgo. Aprobaciones de
exec/elevated. Perfilado operativo.

Perfiles predefinidos:
- `coding`: lectura amplia, escritura en workspace, exec restringido a linters/tests.
- `messaging`: sin exec, solo lectura y escritura de texto.
- `minimal`: solo lectura, ninguna ejecución.
- `admin`: todo habilitado, requiere aprobación para acciones high-risk.

Hardening MCP obligatorio (pendiente de la auditoría 15):
- `jt7_file_write`: restringir a workspace o allowlist explícita.
- `jt7_file_read`: limitar a workspace del proyecto activo.
- `allowedWebDomains`: pasar de `["*"]` a lista configurable.
- `systemExec`: bloquear intérpretes con `-c`, `--eval`, `-Command` salvo aprobación.
- `MT5 trading`: gate high-risk con aprobación explícita o flag fuerte.

### Capa 4 — Control UI + Gateway

Panel como frontend principal. Chat-first. Sesiones, tareas, riesgos y estado de gateway.
Control-plane embebido. Observabilidad y trazabilidad por run.

Vistas mínimas requeridas:
1. **Chat principal**: input, stream, historial, indicador de modelo/proveedor activo.
2. **Panel de sesiones**: lista de sesiones, estado, subagentes activos.
3. **Panel de tareas**: cola, estado por tarea, log de verificación.
4. **Configuración**: proveedor, modelo, perfil de policy, API keys.
5. **Estado del gateway**: health, último run, bloqueos activos (desde `RESUME.md`).

### Capa 5 — Interoperabilidad de runtimes

Backends por tarea: `local`, `openclaw`, `acp:<harness>`. Selección de runtime por
objetivo, costo, latencia y capacidad. Trazabilidad unificada cross-runtime.

---

## Fase 0 — Reconciliación de trazabilidad (PRIMERO, ~1-2 días)

Esta fase desbloquea todo lo demás. Sin trazabilidad limpia es imposible saber qué está
roto, qué está absorbido y cuál es el próximo paso real.

### Tareas stale a cerrar o reconciliar

| ID tarea | Acción requerida |
|:---|:---|
| `20260426-phase-5-agent-ui-browser-desktop` | Evaluar si absorbida por Fase 4/5 de este plan. Marcar o cerrar. |
| `20260424-panel-chat-first-tabs-model-persistence` | Absorbida por Fase 1 de este plan. Cerrar con referencia. |
| `20260422-agente-mt5-design` | Mover a Fase 4 (Policy) como sub-tarea de MT5 high-risk gate. |
| `20260317-copilot-sdk-router-impl` | Verificar si el router Copilot SDK ya está fusionado. Cerrar o completar. |
| `20260419-router-hooks-functional-blocked-gate` | Determinar si el bloqueo sigue activo. Si no, cerrar. |
| `20260425-openclaw-agent-external` | Absorbida por Fase 2 de este plan. Cerrar con referencia. |

### Normalizar `docs/TASKS.md`

- Eliminar entradas duplicadas del router Copilot SDK.
- Estados: usar solo `pendiente`, `en-progreso`, `completado`, `absorbido`, `cancelado`.
- Agregar campo `absorbe:` cuando una tarea cierra otra.

### Actualizar `copilot-agent/RESUME.md`

El nuevo formato mínimo de RESUME.md:

```markdown
## Estado actual
- Último run exitoso: <run_id> (<fecha>)
- Último run fallido: <run_id> (<fecha>) — <razón>

## Bloqueos activos
- [ ] <descripción del bloqueo> — owner: <quien>

## Siguiente acción recomendada
<acción concreta con comando o archivo>
```

### Enlazar verificaciones a runs

Cada entrada en `audit-log.jsonl` debe incluir:
```json
{
  "ts": "2026-04-27T10:00:00Z",
  "run_id": "20260427-mi-tarea",
  "step": "npm run test:control-panel-ui-smoke",
  "exit_code": 0,
  "artifact": "copilot-agent/runs/20260427-mi-tarea.json"
}
```

### Criterio de cierre de Fase 0

- `docs/TASKS.md` sin duplicados ni estados inconsistentes.
- Las 6 tareas stale cerradas o marcadas `absorbido` con referencia.
- `RESUME.md` con formato nuevo y bloqueos activos listados.
- `audit-log.jsonl` con al menos las últimas 5 verificaciones enlazadas a run_id.

---

## Fase 1 — UI + Chat de agente principal (~1 semana)

Esta es la funcionalidad más crítica. El objetivo es tener el chat de agente funcionando
como Cursor/Windsurf: input, stream del modelo, historial persistente, selector de
proveedor y modo agente/directo.

### 1.1 — Auditoría del código roto del panel

Antes de escribir código nuevo, auditar `src-js/` para identificar:
- Qué partes del panel fallan en tiempo de ejecución (errores en consola del webview).
- Qué imports están rotos o tienen dependencias no resueltas.
- Qué smokes fallan actualmente: ejecutar todos los smokes existentes y listar los fallidos.

Comando de partida:
```bash
npm run test:control-panel-ui-smoke
npm run test:panel-execution-mode-smoke
npm run test:session-engine-verification-smoke
```

Registrar cada fallo con el mensaje de error en `copilot-agent/audit-log.jsonl`.

### 1.2 — Chat stream funcional

Archivo principal: `src-js/panel/chat.js` (o equivalente en el webview).

Requisitos mínimos:
- Input de texto con envío por Enter o botón.
- Streaming de respuesta token a token (SSE o chunks del proveedor).
- Indicador visual de "pensando" mientras el modelo responde.
- Scroll automático al fondo del chat durante el stream.
- Manejo de errores visible al usuario (rate limit, timeout, error de red).

Interfaz esperada hacia el proveedor:
```javascript
// src-js/core/provider-router.js
async function streamCompletion({ providerId, modelId, messages, onToken, onDone, onError }) {
  // Selecciona proveedor, hace la llamada, llama onToken por cada chunk
}
```

### 1.3 — Sesiones persistentes

Archivo: `src-js/core/session-engine.js` (ya existe, reparar la persistencia).

Requisitos:
- Cada conversación tiene un `sessionId` único.
- El historial de mensajes se guarda en disco: `~/.freejt7-app/sessions/<sessionId>.json`.
- Al abrir el panel se listan las sesiones recientes ordenadas por `updatedAt`.
- Se puede reabrir una sesión y continuar el historial.
- El contexto local automático (rutas en el prompt) sigue funcionando.

Formato mínimo de sesión:
```json
{
  "sessionId": "ses-20260427-abc",
  "createdAt": "2026-04-27T10:00:00Z",
  "updatedAt": "2026-04-27T11:30:00Z",
  "providerId": "openrouter",
  "modelId": "openai/gpt-4o",
  "mode": "agent",
  "messages": [
    { "role": "user", "content": "...", "ts": "..." },
    { "role": "assistant", "content": "...", "ts": "..." }
  ]
}
```

### 1.4 — Selector de modo agent/direct

En el UI del panel, selector visible con dos opciones:
- `agent`: usa SessionEngine con herramientas y verificación (OpenClaw o local).
- `direct`: llama al proveedor directamente sin herramientas (para pruebas rápidas).

En modo `direct`, el estado de la tarea debe quedar como `partial/unverified` en la
auditoría, nunca como `succeeded`. Agregar smoke que valide este comportamiento.

### 1.5 — Proveedores prioritarios operativos

Implementar o reparar en `src-js/core/provider-registry.js`:

**OpenRouter**:
```javascript
{
  id: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  streamSupport: true,
  models: [] // cargados dinámicamente desde /models
}
```

**HuggingFace Inference API**:
```javascript
{
  id: 'hf',
  baseURL: 'https://api-inference.huggingface.co/models',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  streamSupport: true,
  models: [] // configurados manualmente por el usuario
}
```

**CLŌD**:
```javascript
{
  id: 'clod',
  baseURL: process.env.CLOD_BASE_URL || 'http://localhost:8080',
  authHeader: 'X-API-Key',
  authPrefix: '',
  streamSupport: true,
  models: [] // consultados al gateway local
}
```

Cada proveedor debe tener un smoke dedicado:
```bash
npm run test:provider-openrouter-smoke
npm run test:provider-hf-smoke
npm run test:provider-clod-smoke
```

### 1.6 — VSCodium portable + perfil aislado

El perfil aislado ya está parcialmente implementado (Fase 1 del doc 16). Verificar y
completar para Linux y Windows:

**Linux** (ya validado con .deb y .rpm):
```bash
npm run app:standalone        # instala VSIX en perfil y abre
npm run app:standalone:setup  # solo prepara, no abre
```

**Windows** (pendiente):
```powershell
# Equivalente en PowerShell
npm run app:standalone:win
```

El settings de perfil debe incluir:
```json
{
  "workbench.colorTheme": "Default Dark Modern",
  "freejt7.panel.autoOpen": true,
  "freejt7.panel.defaultMode": "agent",
  "extensions.ignoreRecommendations": true
}
```

### Criterio de cierre de Fase 1

- Chat con stream funcionando con los 3 proveedores (OpenRouter, HF, CLŌD).
- Sesiones persistentes: cerrar y reabrir panel recupera el historial.
- Selector agent/direct visible y funcional.
- `npm run test:control-panel-ui-smoke` pasa en verde.
- `npm run test:panel-execution-mode-smoke` pasa en verde.
- VSCodium portable abre con perfil aislado en Linux. Windows: al menos dry-run verde.

---

## Fase 2 — Agent Runtime: OpenClaw máximo + fallback local (~1-2 semanas)

El objetivo de esta fase es dar a Free JT7 autonomía real multi-turno con delegación.
Integrar sessions_spawn, subagents y sessions_yield de OpenClaw en el SessionEngine.

### 2.1 — Integración sessions_spawn en SessionEngine

Archivo: `src-js/core/session-engine.js`

Nuevo método:
```javascript
async spawnSubagent({ parentSessionId, goal, tools, model, maxTurns }) {
  // 1. Si OpenClaw disponible → openclaw-agent-runtime.spawnSession(...)
  // 2. Si no → local-agent-runtime.spawnLocalAgent(...)
  // 3. Registrar relación parentSessionId → childSessionId en audit
  return { childSessionId, status: 'running' }
}
```

El método debe ser transparente: el caller no sabe si está usando OpenClaw o el runtime
local. El fallback es automático.

### 2.2 — sessions_yield y continuidad

Cuando un subagente termina, su resultado debe entregarse al agente padre y actualizar
el historial de la sesión padre. Implementar en `openclaw-agent-runtime.js`:

```javascript
async yieldResult({ childSessionId, parentSessionId }) {
  const result = await openclaw('sessions_yield', { session_key: childSessionId });
  // Agregar result al historial de parentSessionId
  await sessionEngine.appendMessage(parentSessionId, {
    role: 'tool_result',
    content: result,
    source: childSessionId
  });
}
```

### 2.3 — session_status y sessions_history en el panel

El panel debe mostrar:
- Estado de cada subagente activo: `running`, `succeeded`, `failed`, `cancelled`.
- Historial de la sesión (sessions_history) accesible desde la UI.
- Relación padre-hijo visual: el subagente aparece anidado bajo la tarea padre.

### 2.4 — Controles de subagentes en la UI

En el panel de sesiones, para cada subagente activo:
- Botón "ver log": abre el historial del subagente en una vista lateral.
- Botón "steer": envía un mensaje de dirección al subagente en curso.
- Botón "cancelar": llama a sessions_cancel en OpenClaw o abort en local-runtime.
- Botón "retomar": si el subagente quedó pausado, continúa desde el último estado.

### 2.5 — Persistencia taskId → sessionId

En `copilot-agent/runs/<run_id>.json` guardar:
```json
{
  "runId": "20260427-tarea-x",
  "taskId": "task-abc",
  "sessionId": "ses-20260427-abc",
  "subagents": [
    { "childSessionId": "ses-20260427-child-1", "goal": "...", "status": "succeeded" }
  ],
  "startedAt": "...",
  "completedAt": "...",
  "verificationResult": "passed"
}
```

### 2.6 — Fallback local-agent-runtime hardening

El runtime local debe poder hacer al menos:
- Leer archivos del workspace (`jt7_file_read` restringido al workspace).
- Escribir archivos del workspace (`jt7_file_write` restringido al workspace).
- Ejecutar comandos básicos: `npm test`, `python -m pytest`, `git status`.
- Verificar el resultado: ejecutar el comando de prueba y parsear exit code.

Comandos POSIX/Windows portables (ya iniciado en la auditoría 15):
```javascript
const CMD_MAP = {
  'Get-ChildItem': 'ls -la',
  'Get-Content': 'cat',
  'Get-Location': 'pwd',
  'Select-String': 'grep'
};
// En Windows: no hacer mapping, usar los comandos PS directamente
```

### Criterio de cierre de Fase 2

- `sessions_spawn` crea subagentes reales en OpenClaw (o locales si no está disponible).
- Los subagentes son visibles en el panel con estado actualizado.
- `sessions_yield` entrega el resultado al padre y actualiza el historial.
- Cancelar un subagente desde la UI funciona y actualiza el estado.
- `npm run test:session-engine-verification-smoke` pasa en verde.
- Nuevo smoke: `npm run test:subagent-e2e-smoke` pasa en verde.

---

## Fase 3 — Resiliencia multi-provider (~1 semana)

El objetivo es que los errores transitorios (429, timeout, modelo no disponible) sean
manejados automáticamente sin intervención del usuario.

### 3.1 — Contrato primary + fallbacks por sesión

En la config de sesión, el usuario (o el sistema) define:
```json
{
  "model": {
    "primary": "openrouter:openai/gpt-4o",
    "fallbacks": [
      "openrouter:anthropic/claude-3-5-sonnet",
      "hf:mistralai/Mixtral-8x7B-Instruct-v0.1",
      "clod:default"
    ],
    "fallbackOnErrors": [429, 503, 408]
  }
}
```

### 3.2 — Cooldown y retry por proveedor

En `src-js/core/provider-router.js`:
```javascript
const providerCooldowns = new Map(); // providerId → expiry timestamp

async function routeWithFallback(request) {
  const chain = [request.model.primary, ...request.model.fallbacks];
  for (const modelRef of chain) {
    const [providerId] = modelRef.split(':');
    if (isCooledDown(providerId)) continue;
    try {
      return await callProvider(providerId, modelRef, request);
    } catch (err) {
      if ([429, 503].includes(err.status)) {
        setCooldown(providerId, 60_000); // 60s cooldown
        logFallback(request.sessionId, modelRef, err.status);
      } else throw err;
    }
  }
  throw new Error('All providers exhausted');
}
```

### 3.3 — Rotación de auth profiles

Si un proveedor tiene múltiples API keys configuradas (para evitar rate limit por key):
```json
{
  "providerId": "openrouter",
  "authProfiles": [
    { "id": "key-1", "apiKey": "sk-or-..." },
    { "id": "key-2", "apiKey": "sk-or-..." }
  ],
  "authRotationStrategy": "round-robin"
}
```

### 3.4 — Ruta efectiva en auditoría

Cada llamada completada registra en `audit-log.jsonl`:
```json
{
  "ts": "...",
  "run_id": "...",
  "step": "provider-call",
  "requested": "openrouter:openai/gpt-4o",
  "effective": "hf:mistralai/Mixtral-8x7B-Instruct-v0.1",
  "fallback_reason": "429",
  "exit_code": 0
}
```

### Criterio de cierre de Fase 3

- Un 429 del proveedor primario activa el fallback automáticamente y la respuesta llega.
- La UI muestra el proveedor efectivo usado (no el primario pedido).
- `npm run test:panel-rate-limit-smoke` pasa en verde.
- Nuevo smoke: `npm run test:provider-fallback-chain-smoke` pasa en verde.

---

## Fase 4 — Policy engine + hardening MCP + empaquetado Windows (~1-2 semanas)

### 4.1 — Policy engine profesional

Implementar en `src-js/core/policy-engine.js`:

```javascript
const PROFILES = {
  coding: {
    'jt7_file_read':  'allow',  // dentro del workspace
    'jt7_file_write': 'ask',    // siempre pedir confirmación
    'systemExec':     'ask',    // solo linters/tests
    'jt7_web_fetch':  'allow',
    'mt5_trade':      'deny'
  },
  minimal: {
    'jt7_file_read':  'allow',
    'jt7_file_write': 'deny',
    'systemExec':     'deny',
    'jt7_web_fetch':  'deny',
    'mt5_trade':      'deny'
  }
};

async function evaluate(tool, context) {
  const rule = PROFILES[context.profile]?.[tool] ?? 'ask';
  if (rule === 'allow') return { granted: true };
  if (rule === 'deny')  return { granted: false, reason: 'policy-deny' };
  // 'ask' → mostrar diálogo de aprobación en el panel
  return await requestApproval(tool, context);
}
```

### 4.2 — Hardening MCP

Cambios en `servidor mpc free jt7/src/index.js`:

**jt7_file_write**:
```javascript
// Antes: sin restricción de path
// Después:
const workspace = getWorkspacePath();
if (!filePath.startsWith(workspace)) {
  throw new Error(`Write outside workspace denied: ${filePath}`);
}
```

**allowedWebDomains**:
```javascript
// Antes: ["*"]
// Después: configurable, default a lista curada
const allowedDomains = config.allowedWebDomains ?? [
  'github.com', 'stackoverflow.com', 'docs.anthropic.com',
  'huggingface.co', 'openrouter.ai'
];
```

**systemExec** — bloquear intérpretes con flags peligrosos:
```javascript
const BLOCKED_FLAGS = ['-c', '--eval', '-Command', '-e', '--exec'];
const hasBlockedFlag = args.some(a => BLOCKED_FLAGS.includes(a));
if (hasBlockedFlag && !context.elevated) {
  throw new Error('Exec with interpreter flags requires elevated approval');
}
```

**MT5 trading** — gate explícito:
```javascript
if (tool.startsWith('mt5_') && MT5_TRADING_TOOLS.includes(tool)) {
  if (!context.mt5ApprovalToken) {
    throw new Error('MT5 trading requires explicit approval token');
  }
}
```

### 4.3 — Score de riesgo en el panel

Cada tarea muestra un badge de riesgo calculado por `policy-engine.js`:
- `low`: solo lectura, sin exec.
- `medium`: escritura en workspace o exec de tests.
- `high`: exec con flags, escritura fuera del workspace.
- `critical`: MT5 trading o escritura en paths del sistema.

### 4.4 — Control-plane en la UI

Nueva vista en el panel: **Estado del gateway**.

Muestra:
- Health del gateway OpenClaw (GET /health).
- Versión del runtime activo.
- Último run exitoso y fallido.
- Bloqueos activos (leídos de RESUME.md).
- Botón "reiniciar gateway" con confirmación.
- Editor de config seguro: lookup del schema + patch validado antes de aplicar.

### 4.5 — Empaquetado .exe Windows

Completar la Fase 2 del doc 16 para Windows:

```bash
npm run package:win  # genera freejt7-desktop-setup.exe
```

Requisitos:
- Incluye VSCodium portable para Windows.
- Instala perfil aislado en `%APPDATA%\freejt7-app\`.
- Crea acceso directo en el escritorio.
- Launcher `freejt7-desktop.exe` que abre el IDE con el perfil correcto.
- Si no tiene permisos de admin: instala en `%LOCALAPPDATA%\freejt7-desktop\`.

### Criterio de cierre de Fase 4

- Policy engine rechaza escrituras fuera del workspace (smoke dedicado).
- MT5 trading sin token de aprobación lanza error (smoke dedicado).
- Score de riesgo visible en el panel por cada tarea.
- Gateway health visible en la UI.
- `npm run package:win` genera un instalador funcional (al menos dry-run en Linux).
- Nuevos smokes:
  - `npm run test:policy-engine-smoke`
  - `npm run test:mcp-security-write-outside-workspace-smoke`
  - `npm run test:mt5-gate-smoke`

---

## Fase 5 — ACP + IDE propio + release candidate (~2 semanas)

### 5.1 — Adaptador ACP para runtimes externos

Implementar `src-js/core/acp-adapter.js`:

```javascript
// ACP (Agent Communication Protocol) permite invocar runtimes externos
// como Claude Code, Codex o OpenCode desde Free JT7

class ACPAdapter {
  constructor(config) {
    this.runtime = config.runtime; // 'claude-cli', 'codex', 'opencode', 'pi'
    this.endpoint = config.endpoint;
  }

  async runTask({ goal, context, tools }) {
    // Envía la tarea al harness externo via ACP
    const response = await fetch(`${this.endpoint}/acp/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, context, tools, runtime: this.runtime })
    });
    return response.json();
  }
}
```

### 5.2 — Selección de backend por tarea

En la UI, para cada nueva tarea el usuario puede elegir el backend:
- `local`: runtime local de Free JT7.
- `openclaw`: OpenClaw como orchestrador.
- `acp:claude-cli`: Claude Code como backend especializado.
- `acp:opencode`: OpenCode como backend.

El SessionEngine registra el backend efectivo en `copilot-agent/runs/<run_id>.json`.

### 5.3 — Trazabilidad cross-runtime

Independientemente del backend usado, toda tarea genera:
- Un `run_id` único.
- Un archivo `copilot-agent/runs/<run_id>.json` con el log completo.
- Una entrada en `audit-log.jsonl` con backend, resultado y exit_code.
- El resultado de verificación (passed/failed/unverified) siempre registrado.

### 5.4 — Branding y experiencia de producto

Completar Fase 3 del doc 16:
- Nombre: **Free JT7 Desktop**.
- Icono propio en el IDE y en el instalador.
- Wizard de onboarding al primer arranque:
  1. Seleccionar proveedor de modelos.
  2. Introducir API key.
  3. Seleccionar modelo por defecto.
  4. Seleccionar perfil de policy (coding / minimal / admin).
  5. Smoke automático para verificar que todo funciona.
- Tiempo objetivo del wizard: < 5 minutos.

### 5.5 — SLOs operativos por ruta

Definir y medir presupuestos de latencia:

| Ruta | P50 objetivo | P95 objetivo |
|:---|:---|:---|
| direct → proveedor | < 500ms TTFB | < 2s |
| agent → OpenClaw | < 1s inicio | < 5s primer token |
| agent → local runtime | < 200ms inicio | < 1s primer token |
| subagente spawn | < 500ms | < 2s |

### Criterio de cierre de Fase 5 (release candidate)

- Adaptador ACP funcional con al menos un harness externo probado.
- Selección de backend por tarea funcional en la UI.
- Trazabilidad cross-runtime: todos los backends generan run_id + audit entry.
- Wizard de onboarding completo en < 5 minutos en máquina limpia.
- Todos los smokes E2E pasan:
  - `npm run test:e2e-route-direct`
  - `npm run test:e2e-route-agent-openclaw`
  - `npm run test:e2e-route-agent-local`
  - `npm run test:e2e-route-subagent`
  - `npm run test:freejt7-app-bootstrap-smoke`
- SLOs medidos y documentados.

---

## Smokes requeridos por fase

### Existentes (verificar que siguen pasando)
- `npm run test:control-panel-ui-smoke`
- `npm run test:panel-execution-mode-smoke`
- `npm run test:session-engine-verification-smoke`
- `npm run test:mcp-documents-tools-smoke`
- `npm run test:installed-extension-smoke`
- `npm run test:panel-rate-limit-smoke`
- `npm run test:openrouter-http200-smoke`
- `npm run test:freejt7-app-bootstrap-smoke`

### Nuevos requeridos

| Smoke | Fase | Qué valida |
|:---|:---|:---|
| `test:provider-openrouter-smoke` | 1 | OpenRouter devuelve tokens |
| `test:provider-hf-smoke` | 1 | HF devuelve tokens |
| `test:provider-clod-smoke` | 1 | CLŌD devuelve tokens |
| `test:direct-mode-unverified-smoke` | 1 | Modo direct queda como `partial/unverified` |
| `test:subagent-e2e-smoke` | 2 | Spawn, yield y resultado de subagente |
| `test:provider-fallback-chain-smoke` | 3 | 429 activa fallback automático |
| `test:policy-engine-smoke` | 4 | allow/ask/deny por perfil |
| `test:mcp-security-write-outside-workspace-smoke` | 4 | Escritura fuera del workspace denegada |
| `test:mt5-gate-smoke` | 4 | MT5 sin token lanza error |
| `test:e2e-route-direct` | 5 | Ruta directa completa end-to-end |
| `test:e2e-route-agent-openclaw` | 5 | Ruta agente OpenClaw completa |
| `test:e2e-route-agent-local` | 5 | Ruta agente local completa |
| `test:e2e-route-subagent` | 5 | Ruta con subagente completa |

---

## Riesgos y mitigación

| Riesgo | Mitigación |
|:---|:---|
| Panel roto tiene deuda técnica profunda | Auditar primero (1.1) antes de escribir código nuevo |
| OpenClaw no disponible en el entorno del usuario | Fallback local automático + smoke sin OpenClaw |
| Drift de compatibilidad entre versiones de VSCodium | Perfil aislado + smoke de extensión instalada + versión fijada |
| Complejidad al mezclar rutas de runtime | Feature flags por fase + smokes dirigidos por ruta |
| Regresiones UI por nuevos estados de sesión | Snapshot/smoke de panel por estado antes de merge |
| Costo/token por subagentes sin control | Límites por depth, timeout y modelo de subagente en la config |
| .exe Windows requiere firma de código | En fase 5 usar NSIS sin firma, documetnar el aviso |
| MT5 accidentalmente habilitado | Gate hard en el código del MCP, no solo en policy |

---

## Criterios de aceptación global del proyecto

- 80%+ de tareas complejas resueltas en modo agente con evidencia de verificación.
- Subagentes operativos desde UI con continuidad y control de ciclo de vida.
- Fallback multi-provider funcional sin loops de error y sin intervención del usuario.
- Policy engine aplicando aprobaciones en tareas de riesgo alto y denegando en riesgo crítico.
- Cambio de runtime (`local/openclaw/acp`) sin romper historial de sesión.
- Free JT7 Desktop instalable en Linux y Windows en máquina limpia sin pasos manuales.
- Onboarding completo en < 5 minutos desde cero.
- Todos los smokes de la tabla anterior pasan en verde en la pipeline de CI.
