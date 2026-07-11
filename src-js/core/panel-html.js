'use strict';

const panelHelpers = require('./panel-helpers');

function createPanelHtml(webview, title, panelCatalog, panelOptions = {}) {
  const nonce = panelHelpers.getNonce();
  const catalogPayload = panelHelpers.encodeWebviewJsonPayload(
    panelCatalog || { modelsByProvider: {}, defaultModelByProvider: {} },
  );
  const standaloneMode = Boolean(panelOptions?.standaloneMode);
  const directOptionAttributes = standaloneMode ? ' disabled' : '';
  const directModeHint = standaloneMode
    ? '<div class="small">En perfil aislado, el panel fuerza modo agente para evitar bloqueos por proveedor.</div>'
    : '';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09101a;
      --bg-2: #0d1725;
      --bg-3: #111f33;
      --surface: rgba(10, 18, 30, 0.9);
      --surface-2: rgba(14, 25, 40, 0.9);
      --line: rgba(97, 130, 170, 0.28);
      --line-strong: rgba(121, 165, 219, 0.4);
      --txt: #edf4ff;
      --muted: #9cb1ce;
      --accent: #6be1c0;
      --accent-2: #4cb2ff;
      --ok: #7af0ab;
      --warn: #ffd27a;
      --danger: #ff8e97;
      --shadow: 0 26px 60px rgba(0, 0, 0, 0.32);
      --radius: 18px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "SF Pro Text", "Noto Sans", sans-serif;
      background:
        linear-gradient(180deg, #08111b 0%, #09121d 100%);
      color: var(--txt);
      padding: 12px;
    }

    button, input, select, textarea {
      font: inherit;
      color: inherit;
    }

    button, input, select, textarea {
      border: 1px solid rgba(95, 132, 177, 0.3);
      background: linear-gradient(180deg, rgba(20, 33, 53, 0.96), rgba(11, 18, 30, 0.96));
      border-radius: 12px;
      padding: 10px 12px;
    }

    input, select, textarea {
      color: var(--txt);
      caret-color: var(--accent);
    }

    select,
    select option,
    select optgroup {
      color: var(--txt);
      background: #0f1724;
    }

    input:focus,
    select:focus,
    textarea:focus {
      outline: 1px solid rgba(107, 225, 192, 0.55);
      border-color: rgba(107, 225, 192, 0.55);
      box-shadow: 0 0 0 3px rgba(107, 225, 192, 0.12);
    }

    button {
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    button:hover {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      background: linear-gradient(180deg, rgba(26, 43, 69, 0.98), rgba(15, 27, 43, 0.98));
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }

    textarea {
      resize: vertical;
      min-height: 110px;
      width: 100%;
    }

    .app {
      display: grid;
      gap: 10px;
      min-height: calc(100vh - 24px);
      grid-template-rows: auto auto 1fr;
    }

    .surface {
      background: linear-gradient(180deg, rgba(11, 18, 29, 0.98), rgba(8, 14, 23, 0.98));
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .subtitle {
      color: var(--muted);
      font-size: 12px;
      max-width: 680px;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .topbar-stack {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }

    .quick-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .quick-actions button {
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(17, 30, 49, 0.92);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(8, minmax(90px, 1fr));
      gap: 10px;
    }

    .stat-card {
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(97, 130, 170, 0.2);
      background: rgba(10, 18, 29, 0.92);
    }

    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--muted);
    }

    .stat-value {
      margin-top: 4px;
      font-size: 18px;
      font-weight: 700;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(230px, 270px) minmax(0, 1fr) minmax(320px, 380px);
      gap: 10px;
      min-height: 0;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 12px;
      gap: 10px;
    }

    .workspace {
      display: contents;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .section-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.9px;
      color: var(--muted);
    }

    .small {
      font-size: 12px;
      color: var(--muted);
    }

    .list {
      overflow: auto;
      min-height: 0;
      padding-right: 4px;
    }

    .session-item {
      padding: 10px 11px;
      border-radius: 10px;
      border: 1px solid rgba(97, 130, 170, 0.18);
      background: rgba(12, 21, 34, 0.88);
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 120ms ease, transform 120ms ease;
    }

    .session-item:hover {
      border-color: rgba(108, 162, 219, 0.45);
      transform: translateY(-1px);
    }

    .session-item.active {
      border-color: rgba(107, 225, 192, 0.65);
      box-shadow: inset 0 0 0 1px rgba(107, 225, 192, 0.2);
    }

    .session-name {
      font-size: 14px;
      font-weight: 600;
    }

    .session-meta,
    .session-preview {
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .conversation {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-height: 0;
      gap: 10px;
      grid-column: 2;
    }

    .conversation-shell {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 12px;
      gap: 10px;
    }

    .conversation-header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .session-title {
      font-size: 18px;
      font-weight: 650;
    }

    .session-subtitle {
      margin-top: 4px;
      font-size: 12px;
      color: var(--muted);
    }

    .chip-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 11px;
      color: var(--muted);
      border: 1px solid rgba(97, 130, 170, 0.28);
      background: rgba(8, 13, 21, 0.72);
    }

    .chip.ok { color: var(--ok); border-color: rgba(122, 240, 171, 0.4); }
    .chip.warn { color: var(--warn); border-color: rgba(255, 210, 122, 0.45); }
    .chip.err { color: var(--danger); border-color: rgba(255, 142, 151, 0.45); }
    .chip.active {
      color: var(--txt);
      border-color: rgba(107, 225, 192, 0.4);
      background: rgba(18, 35, 46, 0.74);
    }

    #chatHistory {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding-right: 6px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .empty-state {
      min-height: 180px;
      border: 1px dashed rgba(97, 130, 170, 0.32);
      border-radius: 18px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      color: var(--muted);
      background: rgba(8, 14, 24, 0.4);
    }

    .message-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .message-row.user {
      align-items: flex-end;
    }

    .message-row.assistant {
      align-items: flex-start;
    }

    .message-bubble {
      max-width: min(880px, 92%);
      border-radius: 12px;
      padding: 12px 14px;
      line-height: 1.5;
      word-break: break-word;
      border: 1px solid rgba(97, 130, 170, 0.18);
    }

    .message-bubble.raw {
      white-space: pre-wrap;
    }

    .message-paragraph {
      margin: 0 0 10px 0;
    }

    .message-paragraph:last-child {
      margin-bottom: 0;
    }

    .message-list {
      display: grid;
      gap: 7px;
      margin: 8px 0 10px 0;
    }

    .message-list-item {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      gap: 8px;
      align-items: start;
    }

    .message-list-item::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 999px;
      margin-top: 9px;
      background: var(--accent);
      opacity: 0.75;
    }

    .message-section-title {
      margin: 10px 0 6px 0;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent);
    }

    .message-row.user .message-bubble {
      background: linear-gradient(180deg, rgba(43, 101, 157, 0.95), rgba(26, 70, 118, 0.95));
      border-bottom-right-radius: 6px;
      color: #f6fbff;
    }

    .message-row.assistant .message-bubble {
      background: linear-gradient(180deg, rgba(16, 28, 44, 0.96), rgba(10, 19, 32, 0.96));
      border-bottom-left-radius: 6px;
    }

    .message-row.assistant.error .message-bubble {
      border-color: rgba(255, 142, 151, 0.35);
      background: linear-gradient(180deg, rgba(53, 23, 31, 0.96), rgba(35, 16, 24, 0.96));
    }

    .message-meta {
      font-size: 11px;
      color: var(--muted);
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      max-width: min(880px, 92%);
    }

    .composer {
      display: grid;
      gap: 10px;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(13, 22, 36, 0.98), rgba(10, 17, 28, 0.98));
      position: sticky;
      bottom: 0;
    }

    .composer-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      color: var(--muted);
      font-size: 12px;
    }

    .composer-actions {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .primary {
      background: linear-gradient(180deg, rgba(56, 141, 214, 0.98), rgba(29, 96, 163, 0.98));
      border-color: rgba(124, 188, 255, 0.5);
    }

    .inspector {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
      grid-column: 3;
    }

    .inspector-tabs {
      display: flex;
      gap: 8px;
      padding: 14px 14px 0 14px;
      flex-wrap: wrap;
    }

    .tab-btn {
      background: rgba(12, 21, 34, 0.7);
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
    }

    .tab-btn.active {
      border-color: rgba(107, 225, 192, 0.45);
      color: var(--txt);
      background: rgba(20, 36, 47, 0.92);
    }

    .tab-panels {
      min-height: 0;
      padding: 14px;
    }

    .tab-panel {
      display: none;
      height: 100%;
      min-height: 0;
    }

    .tab-panel.active {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .settings-grid {
      display: grid;
      gap: 10px;
    }

    .field {
      display: grid;
      gap: 6px;
    }

    .field label {
      font-size: 12px;
      color: var(--muted);
    }

    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .task-card {
      border: 1px solid rgba(97, 130, 170, 0.2);
      border-radius: 10px;
      padding: 11px;
      background: rgba(11, 19, 31, 0.84);
      margin-bottom: 10px;
    }

    .task-header,
    .task-footer {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .task-id {
      font-size: 11px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .task-goal,
    .task-detail,
    .event-item {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .task-goal {
      margin: 10px 0;
      line-height: 1.45;
      font-size: 13px;
    }

    .task-detail {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed rgba(97, 130, 170, 0.2);
      font-size: 12px;
      color: var(--muted);
    }

    .event-item {
      padding: 10px 0;
      border-bottom: 1px dashed rgba(97, 130, 170, 0.2);
      font-size: 12px;
      color: #d9e8ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .status-grid {
      display: grid;
      gap: 10px;
    }

    .status-panel {
      border: 1px solid rgba(97, 130, 170, 0.2);
      border-radius: 14px;
      padding: 12px;
      background: rgba(11, 19, 31, 0.74);
    }

    .status-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .check-list,
    .metric-list {
      display: grid;
      gap: 7px;
      font-size: 12px;
      color: #d9e8ff;
    }

    .check-item,
    .metric-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      border-bottom: 1px dashed rgba(97, 130, 170, 0.16);
      padding-bottom: 6px;
    }

    .check-item:last-child,
    .metric-line:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .list-fill {
      flex: 1;
      min-height: 0;
    }

    @media (max-width: 1180px) {
      .stats {
        grid-template-columns: repeat(4, minmax(120px, 1fr));
      }
      .layout {
        grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
      }
      .inspector {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 860px) {
      body { padding: 10px; }
      .app { min-height: calc(100vh - 20px); }
      .layout { grid-template-columns: 1fr; }
      .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .topbar { padding: 14px; }
      .conversation,
      .inspector {
        grid-column: auto;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <section class="surface topbar">
      <div class="brand">
        <div class="title">Free JT7</div>
        <div class="subtitle">Chat principal de Free JT7: sesiones a la izquierda, conversación al centro e inspector operativo a la derecha.</div>
      </div>
      <div class="topbar-stack">
        <div class="quick-actions">
          <button data-quick-prompt="resume">Retomar</button>
          <button data-quick-prompt="audit">Auditar</button>
          <button data-quick-prompt="fix">Corregir</button>
          <button data-quick-prompt="verify">Verificar</button>
        </div>
        <div class="toolbar">
          <input id="sessionTitle" placeholder="Título de sesión" value="Sesión Free JT7" style="min-width:220px;" />
          <button id="createSession" class="primary">Nueva sesión</button>
          <button id="refreshState">Refrescar</button>
        </div>
      </div>
    </section>

    <section class="stats">
      <article class="surface stat-card"><div class="stat-label">Sesiones</div><div id="statSessions" class="stat-value">0</div></article>
      <article class="surface stat-card"><div class="stat-label">Cola</div><div id="statQueue" class="stat-value">0</div></article>
      <article class="surface stat-card"><div class="stat-label">Running</div><div id="statRunning" class="stat-value">0</div></article>
      <article class="surface stat-card"><div class="stat-label">Aprobación</div><div id="statApproval" class="stat-value">0</div></article>
      <article class="surface stat-card"><div class="stat-label">Fallidas</div><div id="statFailed" class="stat-value">0</div></article>
      <article class="surface stat-card"><div class="stat-label">Completadas</div><div id="statCompleted" class="stat-value">0</div></article>
      <article class="surface stat-card"><div class="stat-label">SLO</div><div id="statSlo" class="stat-value">n/a</div></article>
      <article class="surface stat-card"><div class="stat-label">Riesgo alto</div><div id="statRiskHigh" class="stat-value">0</div></article>
    </section>

    <section class="layout">
      <aside class="surface sidebar">
        <div class="section-head">
          <div class="section-title">Sesiones</div>
          <div class="row small">
            <span>Orden</span>
            <select id="sessionSort">
              <option value="updated">actualizadas</option>
              <option value="created">creadas</option>
            </select>
          </div>
        </div>
        <div id="sessions" class="list list-fill"></div>
      </aside>

      <section class="workspace">
        <div class="conversation">
          <div class="surface conversation-shell">
            <div class="conversation-header">
              <div>
                <div class="session-title" id="activeSessionTitle">Sin sesión activa</div>
                <div class="session-subtitle">Habla con el agente aquí. Las tareas, eventos, configuración y estado quedan en el inspector lateral.</div>
              </div>
              <div class="chip-row">
                <span id="activeSession" class="chip active">sin sesión</span>
                <span id="activeMode" class="chip">agente free jt7</span>
                <span id="activeProvider" class="chip">openrouter</span>
                <span id="activeModel" class="chip">modelo por defecto</span>
                <span id="activeRuntime" class="chip">runtime auto</span>
              </div>
            </div>
            <div id="chatHistory" class="list-fill"></div>
          </div>

          <div class="composer">
            <div class="composer-meta">
              <span>Chat principal con Free JT7</span>
              <span>Ctrl/Cmd + Enter envía</span>
            </div>
            <textarea id="goal" placeholder="Escribe la instrucción para el agente. Ejemplo: audita la interfaz nueva, identifica fallos del proveedor activo y aplica un fix compatible."></textarea>
            <div class="composer-actions">
              <div class="small">Free JT7 decide la ruta y deja la trazabilidad en el inspector. El modo directo queda para pruebas puntuales del proveedor o modelo activo. Ctrl/Cmd + Enter envía.</div>
              <button id="enqueueTask" class="primary">Enviar al chat</button>
            </div>
          </div>
        </div>

        <aside class="surface inspector">
          <div class="inspector-tabs">
            <button class="tab-btn active" data-tab="tasks">Tareas</button>
            <button class="tab-btn" data-tab="events">Eventos</button>
            <button class="tab-btn" data-tab="settings">Configuración</button>
            <button class="tab-btn" data-tab="status">Estado</button>
          </div>
          <div class="tab-panels">
            <section class="tab-panel active" data-panel="tasks">
              <div class="section-head">
                <div class="section-title">Tareas</div>
                <div class="small">Aprobaciones, reintentos y continuidad sin salir del chat.</div>
              </div>
              <div id="tasks" class="list list-fill"></div>
            </section>

            <section class="tab-panel" data-panel="events">
              <div class="section-head">
                <div class="section-title">Eventos</div>
                <div class="small">Feed local del panel y del motor.</div>
              </div>
              <div id="events" class="list list-fill"></div>
            </section>

            <section class="tab-panel" data-panel="settings">
              <div class="section-head">
                <div class="section-title">Configuración</div>
                <div class="small">La selección se persiste por proveedor sin sacar al agente del centro.</div>
              </div>
              <div class="settings-grid">
                <div class="field">
                  <label for="executionMode">Modo de ejecución</label>
                  <select id="executionMode">
                    <option value="agent">agente free jt7</option>
                    <option value="direct"${directOptionAttributes}>modelo directo</option>
                  </select>
                  ${directModeHint}
                </div>
                <div class="field">
                  <label for="provider">Proveedor</label>
                  <select id="provider">
                    <option value="openrouter">openrouter</option>
                    <option value="hf">hf</option>
                    <option value="zai">zai</option>
                    <option value="clod">clod</option>
                  </select>
                </div>
                <div class="field">
                  <label for="modelSelect">Modelo</label>
                  <select id="modelSelect"></select>
                </div>
                <div class="row">
                  <button id="toggleCustomModel" type="button">Modelo manual</button>
                  <button id="refreshCatalog" type="button">Actualizar catálogo</button>
                  <button id="testProvider" type="button">Probar proveedor</button>
                </div>
                <div class="field">
                  <label for="modelCustom">Modelo personalizado</label>
                  <input id="modelCustom" placeholder="modelo/manual-id" style="display:none;" />
                </div>
                <div class="field">
                  <label for="risk">Riesgo por defecto del mensaje</label>
                  <select id="risk">
                    <option value="">risk auto</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
                <div class="field">
                  <label for="runtimeBackend">Backend de runtime</label>
                  <select id="runtimeBackend">
                    <option value="auto">auto (recomendado)</option>
                    <option value="openclaw">openclaw</option>
                    <option value="local">local</option>
                    <option value="acp:codex">acp:codex</option>
                    <option value="acp:claude-code">acp:claude-code</option>
                    <option value="acp:opencode">acp:opencode</option>
                  </select>
                </div>
                <div class="field">
                  <label for="policyProfile">Policy profile</label>
                  <select id="policyProfile">
                    <option value="coding">coding</option>
                    <option value="messaging">messaging</option>
                    <option value="minimal">minimal</option>
                  </select>
                </div>
                <div class="field">
                  <label for="authProfile">Auth profile</label>
                  <input id="authProfile" placeholder="default" />
                </div>
                <div class="field">
                  <label for="fallbackProviders">Fallbacks provider:model (coma)</label>
                  <input id="fallbackProviders" placeholder="hf:Qwen/Qwen2.5-7B-Instruct-Turbo, zai:glm-4.5-flash" />
                </div>
                <div class="row">
                  <button id="spawnSubagent" type="button">Spawn subagente</button>
                  <button id="sessionYield" type="button">Yield sesión</button>
                  <button id="sessionResume" type="button">Resume sesión</button>
                  <button id="sessionStatus" type="button">Session status</button>
                  <button id="sessionHistory" type="button">Session history</button>
                </div>
                <div class="row">
                  <button id="controlHealth" type="button">Gateway health</button>
                  <button id="controlSchema" type="button">Config schema</button>
                  <button id="controlPatch" type="button">Config patch</button>
                  <button id="controlRestart" type="button">Restart runtime</button>
                </div>
                <div class="small">Para CLŌD, el panel puede cargar el catálogo vivo desde tu API key si está disponible en SecretStorage, CLOD_API_KEY o env api.</div>
              </div>
            </section>

            <section class="tab-panel" data-panel="status">
              <div class="section-head">
                <div class="section-title">Estado operativo</div>
                <div class="small">Pulso mínimo para confirmar continuidad, ruta efectiva y salud general.</div>
              </div>
              <div id="operationalStatus" class="status-grid"></div>
            </section>
          </div>
        </aside>
      </section>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const directModeAllowed = ${standaloneMode ? 'false' : 'true'};
    const knownProviders = ['openrouter', 'hf', 'zai', 'clod'];
    const catalogPayload = '${catalogPayload}';
    let panelCatalog = { modelsByProvider: {}, defaultModelByProvider: {} };
    let initialCatalogDecodeError = '';

    function normalizeProviderValue(rawProvider) {
      const provider = String(rawProvider || '').trim().toLowerCase();
      return knownProviders.includes(provider) ? provider : 'openrouter';
    }

    function decodeBase64JsonPayload(payload) {
      const base64 = String(payload || '').trim();
      if (!base64) return '{}';
      const binary = atob(base64);
      let encoded = '';
      for (let idx = 0; idx < binary.length; idx += 1) {
        encoded += '%' + binary.charCodeAt(idx).toString(16).padStart(2, '0');
      }
      return decodeURIComponent(encoded);
    }

    try {
      const decodedCatalog = JSON.parse(decodeBase64JsonPayload(catalogPayload));
      if (decodedCatalog && typeof decodedCatalog === 'object') {
        panelCatalog = decodedCatalog;
      }
    } catch (error) {
      initialCatalogDecodeError = String((error && error.message) || error || 'catalog decode failed');
      panelCatalog = { modelsByProvider: {}, defaultModelByProvider: {} };
    }

    const persistedViewState = vscode.getState() || {};
    let currentSessionId = String(persistedViewState.currentSessionId || '');
    let currentState = null;
    let currentOperationalStatus = null;
    const preferredDefaultTab = 'tasks';
    let currentTab = String(persistedViewState.currentTab || preferredDefaultTab);
    const persistedProviderState = persistedViewState.providerState && typeof persistedViewState.providerState === 'object'
      ? persistedViewState.providerState
      : {};
    let providerState = {
      provider: normalizeProviderValue(persistedProviderState.provider || 'openrouter'),
      model: String(persistedProviderState.model || ''),
      executionMode: (!directModeAllowed || String(persistedProviderState.executionMode || 'agent') !== 'direct')
        ? 'agent'
        : 'direct',
      runtimeBackend: String(persistedProviderState.runtimeBackend || 'auto').trim().toLowerCase() || 'auto',
      policyProfile: String(persistedProviderState.policyProfile || 'coding').trim().toLowerCase() || 'coding',
      authProfile: String(persistedProviderState.authProfile || 'default').trim() || 'default',
      fallbackProviders: String(persistedProviderState.fallbackProviders || '').trim(),
    };
    const eventHistory = [];

    const $ = (id) => document.getElementById(id);

    function reportClientError(stage, errorLike) {
      const message = String((errorLike && errorLike.message) || errorLike || 'unknown error');
      try {
        vscode.postMessage({ type: 'panel.client.error', stage, message });
      } catch (_) {
        // ignore secondary webview messaging failures
      }
      const eventsContainer = $('events');
      if (eventsContainer) {
        const item = document.createElement('div');
        item.className = 'event-item err';
        item.textContent = '[client-error] ' + stage + ': ' + message;
        eventsContainer.prepend(item);
      }
    }

    window.addEventListener('error', (event) => {
      reportClientError('window.error', event.error || event.message || 'script error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      reportClientError('window.unhandledrejection', event.reason || 'promise rejection');
    });

    if (initialCatalogDecodeError) {
      reportClientError('catalog.decode', initialCatalogDecodeError);
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#39;');
    }

    function persistWebviewState() {
      vscode.setState({
        currentSessionId,
        currentTab,
        providerState,
      });
    }

    function chipClassForStatus(status) {
      if (status === 'completed') return 'ok';
      if (status === 'failed' || status === 'rejected' || status === 'canceled') return 'err';
      if (status === 'waiting_approval' || status === 'queued' || status === 'running') return 'warn';
      return '';
    }

    function chipClassForVerification(status) {
      if (status === 'verified') return 'ok';
      if (status === 'partial') return 'warn';
      if (status === 'unverified') return 'err';
      return '';
    }

    function formatAgo(isoValue) {
      if (!isoValue) return 'n/a';
      const timestamp = Date.parse(isoValue);
      if (Number.isNaN(timestamp)) return 'n/a';
      const deltaSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (deltaSec < 60) return deltaSec + 's';
      if (deltaSec < 3600) return Math.floor(deltaSec / 60) + 'm';
      if (deltaSec < 86400) return Math.floor(deltaSec / 3600) + 'h';
      return Math.floor(deltaSec / 86400) + 'd';
    }

    function getStateSessionsArray() {
      if (!currentState || !currentState.sessions) return [];
      return Object.values(currentState.sessions);
    }

    function getTaskIndex() {
      return currentState && currentState.taskIndex ? currentState.taskIndex : {};
    }

    function getEffectiveRoute(task) {
      const attempts = Array.isArray(task && task.routeMeta && task.routeMeta.attempts)
        ? task.routeMeta.attempts
        : [];
      const okAttempt = attempts.slice().reverse().find((attempt) => attempt && attempt.ok);
      if (okAttempt) {
        return {
          provider: okAttempt.provider || task.provider || providerState.provider || 'auto',
          model: okAttempt.model || task.model || providerState.model || 'default',
          backend: okAttempt.runtimeBackend || task.runtimeBackend || providerState.runtimeBackend || 'auto',
          fallbackUsed: Boolean(task.routeMeta && task.routeMeta.fallbackUsed),
        };
      }
      if (task && task.routePlan && typeof task.routePlan === 'object') {
        return {
          provider: task.routePlan.provider || task.provider || providerState.provider || 'auto',
          model: task.routePlan.model || task.model || providerState.model || 'default',
          backend: task.routePlan.runtimeBackend || task.runtimeBackend || providerState.runtimeBackend || 'auto',
          fallbackUsed: false,
        };
      }
      return {
        provider: task && task.provider ? task.provider : (providerState.provider || 'auto'),
        model: task && task.model ? task.model : (providerState.model || 'default'),
        backend: task && task.runtimeBackend ? task.runtimeBackend : (providerState.runtimeBackend || 'auto'),
        fallbackUsed: false,
      };
    }

    function getCurrentSession() {
      return currentState && currentState.sessions ? currentState.sessions[currentSessionId] : null;
    }

    function normalizeProviderModels(rawModels) {
      if (!Array.isArray(rawModels)) {
        return [];
      }
      return rawModels
        .map((model) => {
          if (typeof model === 'string') {
            return { label: model, value: model };
          }
          if (!model || typeof model !== 'object') {
            return null;
          }
          const value = String(model.value || model.id || model.name || '').trim();
          if (!value) {
            return null;
          }
          return {
            label: String(model.label || model.name || value),
            value,
          };
        })
        .filter(Boolean);
    }

    function getProviderModels(provider) {
      const normalizedProvider = normalizeProviderValue(provider);
      const rawModels = (panelCatalog.modelsByProvider && panelCatalog.modelsByProvider[normalizedProvider]) || [];
      return normalizeProviderModels(rawModels);
    }

    function getProviderDefaultModel(provider) {
      const normalizedProvider = normalizeProviderValue(provider);
      return (panelCatalog.defaultModelByProvider && panelCatalog.defaultModelByProvider[normalizedProvider]) || '';
    }

    function normalizeExecutionMode(provider, executionMode) {
      if (!directModeAllowed) {
        return 'agent';
      }
      return executionMode === 'direct' ? 'direct' : 'agent';
    }

    function normalizeRuntimeBackend(runtimeBackend) {
      const value = String(runtimeBackend || '').trim().toLowerCase();
      if (!value) return 'auto';
      if (value === 'auto' || value === 'openclaw' || value === 'local') return value;
      if (value.startsWith('acp:')) return value;
      return 'auto';
    }

    function normalizePolicyProfile(policyProfile) {
      const value = String(policyProfile || '').trim().toLowerCase();
      if (value === 'messaging' || value === 'minimal') return value;
      return 'coding';
    }

    function parseFallbackProviders(raw) {
      return String(raw || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((entry) => {
          const [provider, ...modelParts] = entry.split(':');
          return {
            provider: normalizeProviderValue(provider),
            model: modelParts.join(':').trim(),
          };
        });
    }

    function syncExecutionModeControl(provider, preferredMode = '') {
      const select = $('executionMode');
      const effectiveMode = normalizeExecutionMode(provider, preferredMode || providerState.executionMode || 'agent');
      select.value = effectiveMode;
      select.disabled = false;
      providerState.executionMode = effectiveMode;
    }

    function setCustomModelVisibility(visible) {
      const customInput = $('modelCustom');
      customInput.style.display = visible ? 'block' : 'none';
      $('toggleCustomModel').textContent = visible ? 'Ocultar manual' : 'Modelo manual';
      if (!visible) {
        customInput.value = '';
      } else if (!customInput.value.trim()) {
        customInput.value = String(providerState.model || '');
      }
    }

    function getEffectiveModelFromControls() {
      return $('modelCustom').style.display !== 'none' && $('modelCustom').value.trim()
        ? $('modelCustom').value.trim()
        : $('modelSelect').value;
    }

    function syncModelOptions(provider, preferredModel = '') {
      const select = $('modelSelect');
      const normalizedProvider = normalizeProviderValue(provider);
      const models = getProviderModels(normalizedProvider);
      const defaultModel = getProviderDefaultModel(normalizedProvider);
      const activeModel = preferredModel || providerState.model || defaultModel || models[0]?.value || '';

      select.innerHTML = '';

      select.disabled = false;
      $('modelCustom').disabled = false;

      if (!models.length) {
        const fallback = document.createElement('option');
        fallback.value = activeModel;
        fallback.textContent = activeModel || '(sin modelos catalogados)';
        select.appendChild(fallback);
        select.value = activeModel;
        providerState.model = activeModel;
        return;
      }

      for (const model of models) {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.label + (model.value === defaultModel ? ' (default)' : '');
        select.appendChild(option);
      }

      if (activeModel && !models.some((model) => model.value === activeModel)) {
        const custom = document.createElement('option');
        custom.value = activeModel;
        custom.textContent = activeModel + ' (actual)';
        select.insertBefore(custom, select.firstChild);
      }

      select.value = activeModel || defaultModel || models[0].value || '';
      providerState.model = activeModel || select.value || '';
    }

    function updateHeaderState() {
      const session = getCurrentSession();
      const runtimeLabel = providerState.runtimeBackend === 'local'
        ? 'runtime local limitado'
        : ('runtime ' + (providerState.runtimeBackend || 'auto'));
      $('activeSession').textContent = currentSessionId || 'sin sesión';
      $('activeSessionTitle').textContent = session ? (session.title || 'Sesión Free JT7') : 'Sin sesión activa';
      $('activeMode').textContent = providerState.executionMode === 'direct' ? 'modelo directo' : 'agente free jt7';
      $('activeProvider').textContent = providerState.provider || 'sin proveedor';
      $('activeModel').textContent = providerState.model || 'modelo por defecto';
      $('activeRuntime').textContent = runtimeLabel + ' · profile ' + (providerState.policyProfile || 'coding');
    }

    function switchTab(tab) {
      currentTab = tab;
      persistWebviewState();
      document.querySelectorAll('.tab-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tab);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.panel === tab);
      });
    }

    function log(line, cls = '') {
      eventHistory.unshift({ line: String(line || ''), cls, at: new Date().toISOString() });
      if (eventHistory.length > 200) {
        eventHistory.length = 200;
      }
      renderEvents();
    }

    function renderEvents() {
      const container = $('events');
      container.innerHTML = '';
      if (!eventHistory.length) {
        container.innerHTML = '<div class="empty-state">Aún no hay eventos locales del panel.</div>';
        return;
      }
      for (const item of eventHistory.slice(0, 160)) {
        const row = document.createElement('div');
        row.className = 'event-item';
        if (item.cls) {
          row.className += ' ' + item.cls;
        }
        row.textContent = '[' + formatAgo(item.at) + '] ' + item.line;
        container.appendChild(row);
      }
    }

    function ensureActiveSession() {
      const sessions = getStateSessionsArray();
      if (!sessions.length) {
        currentSessionId = '';
        updateHeaderState();
        return;
      }
      if (sessions.some((session) => session.sessionId === currentSessionId)) {
        updateHeaderState();
        return;
      }
      const sorted = sessions.slice().sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
      currentSessionId = sorted[0].sessionId;
      updateHeaderState();
    }

    function renderSessions() {
      const container = $('sessions');
      container.innerHTML = '';
      const sessions = getStateSessionsArray();
      if (!sessions.length) {
        container.innerHTML = '<div class="empty-state">Crea una sesión para empezar a trabajar en modo chat.</div>';
        return;
      }

      const sortMode = $('sessionSort').value || 'updated';
      const taskIndex = getTaskIndex();
      const sorted = sessions.slice().sort((a, b) => {
        const aValue = sortMode === 'created' ? Date.parse(a.createdAt || 0) : Date.parse(a.updatedAt || 0);
        const bValue = sortMode === 'created' ? Date.parse(b.createdAt || 0) : Date.parse(b.updatedAt || 0);
        return bValue - aValue;
      });

      for (const session of sorted) {
        const tasks = Array.isArray(session.tasks) ? session.tasks.map((taskId) => taskIndex[taskId]).filter(Boolean) : [];
        const lastTask = tasks[tasks.length - 1];
        const preview = lastTask ? String(lastTask.goal || '').slice(0, 120) : 'Sin mensajes todavía.';
        const item = document.createElement('div');
        item.className = 'session-item' + (session.sessionId === currentSessionId ? ' active' : '');
        item.innerHTML =
          '<div class="session-name">' + escapeHtml(session.title || 'Sesión') + '</div>' +
          '<div class="session-meta">' + escapeHtml(session.sessionId) + ' · ' + tasks.length + ' tareas · ' + formatAgo(session.updatedAt) + '</div>' +
          '<div class="session-preview">' + escapeHtml(preview) + '</div>';
        item.onclick = () => {
          currentSessionId = session.sessionId;
          persistWebviewState();
          vscode.postMessage({ type: 'session.select', sessionId: currentSessionId });
          rerenderAll();
        };
        container.appendChild(item);
      }
    }

    function renderOverview() {
      const sessions = getStateSessionsArray();
      const taskIndex = getTaskIndex();
      let running = 0;
      let waitingApproval = 0;
      let failed = 0;
      let completed = 0;
      let highRisk = 0;
      for (const task of Object.values(taskIndex)) {
        const status = String(task.status || '');
        if (status === 'running') running += 1;
        if (status === 'waiting_approval') waitingApproval += 1;
        if (status === 'failed' || status === 'rejected') failed += 1;
        if (status === 'completed') completed += 1;
        if (String(task.risk || '') === 'high' || String(task.risk || '') === 'critical') highRisk += 1;
      }
      $('statSessions').textContent = String(sessions.length);
      $('statQueue').textContent = String((currentState && Array.isArray(currentState.queue) ? currentState.queue.length : 0));
      $('statRunning').textContent = String(running);
      $('statApproval').textContent = String(waitingApproval);
      $('statFailed').textContent = String(failed);
      $('statCompleted').textContent = String(completed);
      $('statSlo').textContent = currentOperationalStatus?.slo?.successRateLabel || 'n/a';
      $('statRiskHigh').textContent = String(highRisk);
    }

    function extractTaskSummary(task) {
      function isJunkSummary(value) {
        const text = String(value || '').trim();
        if (!text) return true;
        return text.length <= 3 && !/[A-Za-z0-9\u00C0-\u024F]/.test(text);
      }

      function extractPayloadText(payload) {
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload.finalAssistantVisibleText === 'string' && payload.finalAssistantVisibleText.trim()) {
          return payload.finalAssistantVisibleText.trim();
        }
        if (typeof payload.finalAssistantRawText === 'string' && payload.finalAssistantRawText.trim()) {
          return payload.finalAssistantRawText.trim();
        }
        const payloadTexts = Array.isArray(payload.payloads)
          ? payload.payloads.map((item) => String(item && item.text || '').trim()).filter(Boolean)
          : [];
        if (payloadTexts.length) {
          return payloadTexts.join('\\n\\n');
        }
        if (payload.payload && typeof payload.payload === 'object') {
          return extractPayloadText(payload.payload);
        }
        return '';
      }

      if (!task) return '';
      const candidates = [];
      if (typeof task.result === 'string') candidates.push(task.result);
      if (task.result && typeof task.result.summary === 'string') candidates.push(task.result.summary);
      candidates.push(extractPayloadText(task.result));
      candidates.push(extractPayloadText(task.result && task.result.raw));
      for (const candidate of candidates) {
        if (!isJunkSummary(candidate)) return String(candidate).trim();
      }
      for (const candidate of candidates) {
        const text = String(candidate || '').trim();
        if (text) return text;
      }
      return '';
    }

    function buildTranscript(session) {
      if (!session) return [];
      const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
      const taskIndex = getTaskIndex();
      return history.map((entry) => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        text: (() => {
          const text = String(entry.text || '').trim();
          if (entry.role !== 'assistant') return text;
          if (text.length > 3 || /[A-Za-z0-9\u00C0-\u024F]/.test(text)) return text;
          const task = taskIndex[String(entry.taskId || '').trim()];
          return extractTaskSummary(task) || text;
        })(),
        meta: [
          entry.role === 'assistant' ? (entry.isError ? 'error' : 'respuesta') : 'solicitud',
          entry.executionMode === 'direct' ? 'modelo directo' : 'agente',
          entry.provider || providerState.provider,
          entry.model || providerState.model || 'default',
          entry.status || '',
          formatAgo(entry.at),
        ].filter(Boolean).join(' · '),
        isError: Boolean(entry.isError),
      }));
    }

    function appendFormattedMessageText(container, text, role) {
      const value = String(text || '').trim();
      container.innerHTML = '';
      if (!value) {
        container.classList.add('raw');
        container.textContent = '';
        return;
      }
      if (role === 'user') {
        container.classList.add('raw');
        container.textContent = value;
        return;
      }
      container.classList.remove('raw');
      const blocks = value.split(/\\n{2,}/).map((block) => block.trim()).filter(Boolean);
      if (!blocks.length) {
        container.textContent = value;
        return;
      }
      for (const block of blocks) {
        const lines = block.split(/\\n/).map((line) => line.trim()).filter(Boolean);
        if (!lines.length) continue;
        if (lines.length === 1 && /^[A-Za-z0-9 _/.-]{2,48}:$/.test(lines[0])) {
          const title = document.createElement('div');
          title.className = 'message-section-title';
          title.textContent = lines[0].replace(/:$/, '');
          container.appendChild(title);
          continue;
        }
        const listLines = lines.filter((line) => /^[-*]\s+/.test(line));
        if (listLines.length === lines.length && listLines.length > 0) {
          const list = document.createElement('div');
          list.className = 'message-list';
          for (const line of listLines) {
            const item = document.createElement('div');
            item.className = 'message-list-item';
            const textNode = document.createElement('span');
            textNode.textContent = line.replace(/^[-*]\s+/, '');
            item.appendChild(textNode);
            list.appendChild(item);
          }
          container.appendChild(list);
          continue;
        }
        const paragraph = document.createElement('p');
        paragraph.className = 'message-paragraph';
        paragraph.textContent = lines.join(' ');
        container.appendChild(paragraph);
      }
    }

    function renderChat() {
      const container = $('chatHistory');
      container.innerHTML = '';
      const session = getCurrentSession();
      if (!session) {
        container.innerHTML = '<div class="empty-state">Selecciona o crea una sesión para empezar a chatear con el agente.</div>';
        return;
      }
      const transcript = buildTranscript(session);
      if (!transcript.length) {
        container.innerHTML = '<div class="empty-state">Esta sesión está vacía. Escribe abajo y el chat será la vista principal.</div>';
        return;
      }
      for (const item of transcript) {
        const row = document.createElement('div');
        row.className = 'message-row ' + item.role + (item.isError ? ' error' : '');
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        appendFormattedMessageText(bubble, item.text || '', item.role);
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.textContent = item.meta || '';
        row.appendChild(bubble);
        row.appendChild(meta);
        container.appendChild(row);
      }
      container.scrollTop = container.scrollHeight;
    }

    function renderTasks() {
      const container = $('tasks');
      container.innerHTML = '';
      const session = getCurrentSession();
      if (!session) {
        container.innerHTML = '<div class="empty-state">Selecciona una sesión para ver su cola y sus aprobaciones.</div>';
        return;
      }
      const taskIndex = getTaskIndex();
      const tasks = (session.tasks || [])
        .map((taskId) => taskIndex[taskId])
        .filter(Boolean)
        .reverse();
      if (!tasks.length) {
        container.innerHTML = '<div class="empty-state">Todavía no hay tareas en esta sesión.</div>';
        return;
      }
      for (const task of tasks) {
        const canApprove = task.status === 'waiting_approval';
        const canRetry = task.status === 'failed' || task.status === 'rejected' || task.status === 'canceled';
        const canCancel = task.status === 'queued' || task.status === 'running' || task.status === 'waiting_approval';
        const effectiveRoute = getEffectiveRoute(task);
        const card = document.createElement('article');
        card.className = 'task-card';
        card.innerHTML =
          '<div class="task-header">' +
            '<span class="task-id">' + escapeHtml(task.taskId) + '</span>' +
            '<span class="chip ' + chipClassForStatus(task.status) + '">' + escapeHtml(task.status || 'queued') + '</span>' +
          '</div>' +
          '<div class="task-goal">' + escapeHtml(task.goal || '') + '</div>' +
          '<div class="task-footer">' +
            '<div class="row">' +
              '<span class="chip">ruta: ' + escapeHtml(effectiveRoute.backend + ' / ' + effectiveRoute.provider) + '</span>' +
              '<span class="chip">modelo: ' + escapeHtml(effectiveRoute.model || task.model || providerState.model || 'default') + '</span>' +
              '<span class="chip">modo: ' + escapeHtml(task.executionMode === 'direct' ? 'direct' : 'agent') + '</span>' +
              '<span class="chip">risk: ' + escapeHtml(task.risk || 'auto') + '</span>' +
              '<span class="chip ' + chipClassForVerification(String(task.verification && task.verification.status || '')) + '">verify: ' + escapeHtml(task.verification && task.verification.status || 'pending') + '</span>' +
              '<span class="chip">retries: ' + Number(task.retries || 0) + '/' + Number(task.maxRetries || 0) + '</span>' +
            '</div>' +
            '<div class="row">' +
              '<button data-action="approve" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canApprove ? '' : 'disabled') + '>Approve</button>' +
              '<button data-action="reject" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canApprove ? '' : 'disabled') + '>Reject</button>' +
              '<button data-action="continue" data-task-id="' + escapeHtml(task.taskId) + '">Continuar</button>' +
              '<button data-action="retry" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canRetry ? '' : 'disabled') + '>Retry</button>' +
              '<button data-action="cancel" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canCancel ? '' : 'disabled') + '>Cancel</button>' +
            '</div>' +
          '</div>';

        const capabilityPlan = task.routePlan && task.routePlan.capabilityPlan && typeof task.routePlan.capabilityPlan === 'object'
          ? task.routePlan.capabilityPlan
          : task.routeMeta && task.routeMeta.executionPlan && task.routeMeta.executionPlan.capabilityPlan && typeof task.routeMeta.executionPlan.capabilityPlan === 'object'
            ? task.routeMeta.executionPlan.capabilityPlan
            : null;
        if (capabilityPlan) {
          const detail = document.createElement('div');
          detail.className = 'task-detail';
          const skillsCount = Array.isArray(capabilityPlan.selectedSkills) ? capabilityPlan.selectedSkills.length : 0;
          const mcpCount = Array.isArray(capabilityPlan.mcpServers)
            ? capabilityPlan.mcpServers.filter((item) => item && item.enabled !== false).length
            : 0;
          const ops = Array.isArray(capabilityPlan.localOperations) ? capabilityPlan.localOperations.slice(0, 3).join(', ') : '';
          detail.textContent = 'plan: ' + String(capabilityPlan.toolMode || 'n/a')
            + ' | skills: ' + skillsCount
            + ' | mcp: ' + mcpCount
            + ' | profile: ' + String(task.policyProfile || providerState.policyProfile || 'coding')
            + (ops ? ' | ops: ' + ops : '');
          card.appendChild(detail);
        }

        const summary = extractTaskSummary(task);
        if (summary) {
          const detail = document.createElement('div');
          detail.className = 'task-detail';
          detail.textContent = 'resultado: ' + summary;
          card.appendChild(detail);
        } else if (task.error) {
          const detail = document.createElement('div');
          detail.className = 'task-detail';
          detail.textContent = 'error: ' + String(task.error);
          card.appendChild(detail);
        }

        if (task.verification && (Array.isArray(task.verification.evidence) || Array.isArray(task.verification.warnings))) {
          const detail = document.createElement('div');
          detail.className = 'task-detail';
          const evidence = Array.isArray(task.verification.evidence) ? task.verification.evidence.slice(0, 3).join(' | ') : '';
          const warnings = Array.isArray(task.verification.warnings) ? task.verification.warnings.slice(0, 2).join(' | ') : '';
          detail.textContent = warnings
            ? 'verify: ' + warnings + (evidence ? ' | evidence: ' + evidence : '')
            : (evidence ? 'evidence: ' + evidence : 'verify: sin detalle');
          card.appendChild(detail);
        }

        container.appendChild(card);
      }
    }

    function renderOperationalStatus() {
      const container = $('operationalStatus');
      if (!container) return;
      const status = currentOperationalStatus || {};
      const onboarding = status.onboarding || {};
      const slo = status.slo || {};
      const runtime = status.runtime || {};
      const resume = status.resume || {};
      const route = status.effectiveRoute || {};
      const checks = [
        ['Sesión activa', currentSessionId ? 'ok' : 'pendiente'],
        ['Modo agente', providerState.executionMode === 'agent' ? 'ok' : 'directo'],
        ['Proveedor configurado', providerState.provider || 'pendiente'],
        ['Runtime backend', providerState.runtimeBackend === 'local' ? 'local-limitado' : (providerState.runtimeBackend || runtime.backend || 'auto')],
        ['Policy profile', providerState.policyProfile || 'coding'],
        ['Onboarding mínimo', onboarding.complete ? 'ok' : 'pendiente'],
      ];
      container.innerHTML =
        '<div class="status-panel">' +
          '<div class="status-title">Listo para trabajar</div>' +
          '<div class="check-list">' +
            checks.map((item) => '<div class="check-item"><span>' + escapeHtml(item[0]) + '</span><span class="chip ' + (item[1] === 'ok' ? 'ok' : 'warn') + '">' + escapeHtml(item[1]) + '</span></div>').join('') +
          '</div>' +
        '</div>' +
        '<div class="status-panel">' +
          '<div class="status-title">Pulso operativo</div>' +
          '<div class="metric-list">' +
            '<div class="metric-line"><span>Objetivo éxito</span><span>' + escapeHtml(slo.targetSuccessRateLabel || '80%') + '</span></div>' +
            '<div class="metric-line"><span>Éxito observado</span><span class="chip ' + (slo.ok ? 'ok' : 'warn') + '">' + escapeHtml(slo.successRateLabel || 'n/a') + '</span></div>' +
            '<div class="metric-line"><span>Tareas medidas</span><span>' + Number(slo.measuredTasks || 0) + '</span></div>' +
            '<div class="metric-line"><span>Latencia media</span><span>' + escapeHtml(slo.avgDurationLabel || 'n/a') + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="status-panel">' +
          '<div class="status-title">Ruta efectiva / riesgo</div>' +
          '<div class="metric-list">' +
            '<div class="metric-line"><span>Última ruta efectiva</span><span>' + escapeHtml((route.backend || 'auto') + ' / ' + (route.provider || providerState.provider || 'auto')) + '</span></div>' +
            '<div class="metric-line"><span>Modelo efectivo</span><span>' + escapeHtml(route.model || providerState.model || 'default') + '</span></div>' +
            '<div class="metric-line"><span>Fallback usado</span><span>' + escapeHtml(route.fallbackUsed ? 'sí' : 'no') + '</span></div>' +
            '<div class="metric-line"><span>Riesgo alto/critical</span><span>' + Number(status.risk?.highOrCritical || 0) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="status-panel">' +
          '<div class="status-title">RESUME</div>' +
          '<div class="metric-list">' +
            '<div class="metric-line"><span>Última acción</span><span>' + escapeHtml(resume.lastAction || 'n/a') + '</span></div>' +
            '<div class="metric-line"><span>Bloqueos activos</span><span>' + Number(resume.activeBlockers || 0) + '</span></div>' +
            '<div class="metric-line"><span>Actualizado</span><span>' + escapeHtml(resume.updatedAt || 'n/a') + '</span></div>' +
          '</div>' +
        '</div>';
    }

    function rerenderAll() {
      ensureActiveSession();
      renderOverview();
      updateHeaderState();
      renderSessions();
      renderChat();
      renderTasks();
      renderEvents();
      renderOperationalStatus();
    }

    function persistProviderSelection() {
      providerState.provider = normalizeProviderValue($('provider').value);
      providerState.model = getEffectiveModelFromControls();
      providerState.executionMode = normalizeExecutionMode(providerState.provider, $('executionMode').value);
      providerState.runtimeBackend = normalizeRuntimeBackend($('runtimeBackend').value);
      providerState.policyProfile = normalizePolicyProfile($('policyProfile').value);
      providerState.authProfile = String($('authProfile').value || '').trim() || 'default';
      providerState.fallbackProviders = String($('fallbackProviders').value || '').trim();
      persistWebviewState();
      updateHeaderState();
      vscode.postMessage({
        type: 'provider.update',
        provider: providerState.provider,
        model: providerState.model,
        executionMode: providerState.executionMode,
        runtimeBackend: providerState.runtimeBackend,
        policyProfile: providerState.policyProfile,
        authProfile: providerState.authProfile,
        fallbackProviders: parseFallbackProviders(providerState.fallbackProviders),
      });
    }

    $('createSession').onclick = () => {
      vscode.postMessage({ type: 'session.create', title: $('sessionTitle').value });
    };

    $('refreshState').onclick = () => {
      vscode.postMessage({ type: 'state.get' });
    };

    $('refreshCatalog').onclick = () => {
      persistProviderSelection();
      vscode.postMessage({ type: 'catalog.refresh', provider: providerState.provider });
    };

    $('testProvider').onclick = () => {
      persistProviderSelection();
      vscode.postMessage({ type: 'provider.test', provider: providerState.provider, model: providerState.model });
    };

    $('spawnSubagent').onclick = () => {
      persistProviderSelection();
      if (!currentSessionId) {
        log('Crea o selecciona una sesión para spawnear subagentes.', 'warn');
        return;
      }
      const subGoal = $('goal').value.trim() || 'analiza el contexto actual y entrega el siguiente paso ejecutable';
      vscode.postMessage({
        type: 'session.spawnSubagent',
        sessionId: currentSessionId,
        payload: {
          goal: subGoal,
          provider: providerState.provider,
          model: providerState.model,
          executionMode: providerState.executionMode,
          runtimeBackend: providerState.runtimeBackend,
          policyProfile: providerState.policyProfile,
          authProfile: providerState.authProfile,
          fallbackProviders: parseFallbackProviders(providerState.fallbackProviders),
        },
      });
      log('Solicitud de subagente enviada.', 'ok');
    };

    $('sessionYield').onclick = () => {
      if (!currentSessionId) {
        log('No hay sesión activa para yield.', 'warn');
        return;
      }
      vscode.postMessage({ type: 'session.yield', sessionId: currentSessionId, reason: 'yield manual desde panel' });
    };

    $('sessionResume').onclick = () => {
      if (!currentSessionId) {
        log('No hay sesión activa para resume.', 'warn');
        return;
      }
      vscode.postMessage({ type: 'session.resume', sessionId: currentSessionId });
    };

    $('sessionStatus').onclick = () => {
      if (!currentSessionId) {
        log('No hay sesión activa para consultar status.', 'warn');
        return;
      }
      vscode.postMessage({ type: 'session.status', sessionId: currentSessionId });
    };

    $('sessionHistory').onclick = () => {
      if (!currentSessionId) {
        log('No hay sesión activa para consultar history.', 'warn');
        return;
      }
      vscode.postMessage({ type: 'session.history', sessionId: currentSessionId, limit: 20 });
    };

    $('controlHealth').onclick = () => {
      vscode.postMessage({ type: 'control.health' });
    };

    $('controlSchema').onclick = () => {
      vscode.postMessage({ type: 'control.schema.lookup' });
    };

    $('controlPatch').onclick = () => {
      const raw = window.prompt('Config patch JSON (ej: {"runtimeBackend":"local"})', '{"runtimeBackend":"auto"}');
      if (!raw) return;
      try {
        const patch = JSON.parse(raw);
        vscode.postMessage({ type: 'control.config.patch', patch });
      } catch (error) {
        log('Config patch JSON invalido: ' + String(error && error.message ? error.message : error), 'err');
      }
    };

    $('controlRestart').onclick = () => {
      vscode.postMessage({ type: 'control.restart.runtime' });
    };

    document.querySelectorAll('[data-quick-prompt]').forEach((button) => {
      button.onclick = () => {
        const key = String(button.getAttribute('data-quick-prompt') || '');
        const templates = {
          resume: 'continua la tarea actual, revisa el contexto y ejecuta el siguiente paso',
          audit: 'audita el estado actual, detecta brechas y propone remediación priorizada',
          fix: 'identifica el problema, aplica un arreglo mínimo compatible y verifícalo',
          verify: 'verifica lo ya hecho con pruebas y resume evidencia y riesgos residuales',
        };
        $('goal').value = templates[key] || $('goal').value;
        $('goal').focus();
      };
    });

    $('provider').onchange = () => {
      providerState.provider = normalizeProviderValue($('provider').value);
      providerState.model = '';
      setCustomModelVisibility(false);
      syncModelOptions(providerState.provider, '');
      syncExecutionModeControl(providerState.provider, providerState.executionMode);
      persistProviderSelection();
    };

    $('executionMode').onchange = () => {
      providerState.executionMode = normalizeExecutionMode(providerState.provider, $('executionMode').value);
      persistProviderSelection();
    };

    $('modelSelect').onchange = () => {
      persistProviderSelection();
    };

    $('toggleCustomModel').onclick = () => {
      const willShow = $('modelCustom').style.display === 'none';
      setCustomModelVisibility(willShow);
      if (willShow) {
        $('modelCustom').focus();
      } else {
        persistProviderSelection();
      }
    };

    $('modelCustom').addEventListener('input', () => {
      if ($('modelCustom').style.display === 'none') return;
      const customModel = $('modelCustom').value.trim();
      if (!customModel) return;
      providerState.model = customModel;
      persistWebviewState();
      updateHeaderState();
    });

    $('modelCustom').addEventListener('change', () => {
      if (!$('modelCustom').style.display || $('modelCustom').style.display === 'none') return;
      persistProviderSelection();
    });

    $('runtimeBackend').onchange = () => {
      persistProviderSelection();
    };

    $('policyProfile').onchange = () => {
      persistProviderSelection();
    };

    $('authProfile').onchange = () => {
      persistProviderSelection();
    };

    $('fallbackProviders').onchange = () => {
      persistProviderSelection();
    };

    $('sessionSort').onchange = () => {
      renderSessions();
    };

    $('enqueueTask').onclick = () => {
      persistProviderSelection();
      if (!currentSessionId) {
        log('Primero crea una sesión antes de enviar mensajes.', 'warn');
        return;
      }
      const goalText = $('goal').value.trim();
      if (!goalText) {
        log('Escribe una instrucción antes de enviar.', 'warn');
        return;
      }
      vscode.postMessage({
        type: 'task.enqueue',
        sessionId: currentSessionId,
        task: {
          goal: goalText,
          provider: providerState.provider,
          model: providerState.model,
          executionMode: providerState.executionMode,
          runtimeBackend: providerState.runtimeBackend,
          policyProfile: providerState.policyProfile,
          authProfile: providerState.authProfile,
          fallbackProviders: parseFallbackProviders(providerState.fallbackProviders),
          risk: $('risk').value,
        },
      });
      $('goal').value = '';
    };

    $('goal').addEventListener('keydown', (event) => {
      const wantsSend = event.key === 'Enter' && (event.ctrlKey || event.metaKey);
      if (wantsSend) {
        event.preventDefault();
        $('enqueueTask').click();
      }
    });

    $('tasks').onclick = (event) => {
      const target = event.target;
      if (!target || target.tagName !== 'BUTTON') return;
      const action = target.getAttribute('data-action');
      const taskId = target.getAttribute('data-task-id');
      if (!action || !taskId || !currentSessionId) return;
      if (action === 'approve') {
        vscode.postMessage({ type: 'approval.resolve', sessionId: currentSessionId, taskId, approved: true, reason: 'approved from panel' });
      }
      if (action === 'reject') {
        vscode.postMessage({ type: 'approval.resolve', sessionId: currentSessionId, taskId, approved: false, reason: 'rejected from panel' });
      }
      if (action === 'continue') {
        const task = getTaskIndex()[taskId];
        if (!task) return;
        const base = String(task.goal || '').trim();
        const summary = extractTaskSummary(task);
        $('goal').value = summary
          ? 'continua desde la tarea ' + taskId + ', toma en cuenta este resultado previo y ejecuta el siguiente paso:\\n' + summary
          : 'continua desde la tarea ' + taskId + ': ' + base;
        $('goal').focus();
      }
      if (action === 'retry') {
        vscode.postMessage({ type: 'task.retry', sessionId: currentSessionId, taskId });
      }
      if (action === 'cancel') {
        vscode.postMessage({ type: 'task.cancel', sessionId: currentSessionId, taskId });
      }
    };

    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    window.addEventListener('message', (event) => {
      const msg = event.data || {};

      if (msg.type === 'session.created' && msg.session) {
        currentSessionId = msg.session.sessionId;
        persistWebviewState();
        updateHeaderState();
        log('Sesión creada: ' + currentSessionId, 'ok');
      }

      if (msg.type === 'catalog.update' && msg.catalog) {
        panelCatalog = msg.catalog;
        syncModelOptions(providerState.provider, providerState.model);
        log('Catálogo de modelos actualizado para el panel.', 'ok');
      }

      if (msg.type === 'provider.test.result') {
        const line = msg.ok
          ? 'Test de proveedor OK: ' + (msg.provider || 'provider') + ' · ' + (msg.model || 'default')
          : 'Test de proveedor falló: ' + (msg.message || 'sin detalle');
        log(line, msg.ok ? 'ok' : 'err');
      }

      if (msg.type === 'panel.server.error') {
        log('panel error [' + String(msg.stage || 'unknown') + ']: ' + String(msg.message || 'sin detalle'), 'err');
      }

      if (msg.type === 'subagent.spawned' && msg.subagent) {
        log('Subagente creado: ' + String(msg.subagent.subagentId || 'n/a') + ' · ' + String(msg.subagent.runtimeBackend || 'auto'), 'ok');
      }

      if (msg.type === 'session.status.result' && msg.status) {
        const counters = msg.status.counters || {};
        log(
          'session_status [' + (msg.status.sessionId || 'n/a') + '] '
          + 'status=' + (msg.status.status || 'unknown')
          + ' queued=' + Number(counters.queued || 0)
          + ' running=' + Number(counters.running || 0)
          + ' waiting=' + Number(counters.waiting_approval || 0)
          + ' completed=' + Number(counters.completed || 0)
          + ' failed=' + Number(counters.failed || 0),
          'ok'
        );
      }

      if (msg.type === 'session.history.result' && msg.history) {
        log('session_history [' + (msg.history.sessionId || 'n/a') + '] mensajes=' + Number((msg.history.history || []).length), 'ok');
      }

      if (msg.type === 'control.health.result') {
        const health = msg.health || {};
        currentOperationalStatus = {
          ...(currentOperationalStatus || {}),
          runtime: health,
        };
        log(
          'gateway_health ok=' + String(Boolean(health.ok))
          + ' queue=' + Number(health.engineQueue || 0)
          + ' sessions=' + Number(health.sessions || 0)
          + ' cool=' + Number(health.router?.activeCooldowns || 0),
          health.ok ? 'ok' : 'warn'
        );
        renderOperationalStatus();
      }

      if (msg.type === 'control.schema.result' && msg.schema) {
        log('config.schema.lookup keys=' + Object.keys(msg.schema.properties || {}).length, 'ok');
      }

      if (msg.type === 'control.patch.result') {
        log(msg.ok ? 'config.patch aplicado.' : 'config.patch falló: ' + String(msg.message || 'sin detalle'), msg.ok ? 'ok' : 'err');
      }

      if (msg.type === 'control.restart.result') {
        log(msg.ok ? 'runtime reiniciado desde panel.' : 'runtime restart falló.', msg.ok ? 'ok' : 'err');
      }

      if (msg.type === 'state.snapshot') {
        currentState = msg.state;
        currentOperationalStatus = msg.operationalStatus || currentOperationalStatus || {};
        if (msg.catalog) {
          panelCatalog = msg.catalog;
        }
        const preferredSessionId = String(msg.activeSessionId || currentSessionId || '');
        if (preferredSessionId) {
          currentSessionId = preferredSessionId;
        }
        providerState = {
          provider: normalizeProviderValue(msg.provider || providerState.provider || 'openrouter'),
          model: String(msg.model || ''),
          executionMode: normalizeExecutionMode(
            normalizeProviderValue(msg.provider || providerState.provider || 'openrouter'),
            String(msg.executionMode || providerState.executionMode || 'agent'),
          ),
          runtimeBackend: normalizeRuntimeBackend(String(msg.runtimeBackend || providerState.runtimeBackend || 'auto')),
          policyProfile: normalizePolicyProfile(String(msg.policyProfile || providerState.policyProfile || 'coding')),
          authProfile: String(msg.authProfile || providerState.authProfile || 'default').trim() || 'default',
          fallbackProviders: String(msg.fallbackProviders || providerState.fallbackProviders || '').trim(),
        };
        persistWebviewState();
        $('provider').value = providerState.provider;
        syncModelOptions(providerState.provider, providerState.model);
        syncExecutionModeControl(providerState.provider, providerState.executionMode);
        $('runtimeBackend').value = providerState.runtimeBackend;
        $('policyProfile').value = providerState.policyProfile;
        $('authProfile').value = providerState.authProfile;
        $('fallbackProviders').value = providerState.fallbackProviders;
        rerenderAll();
      }

      if (msg.type === 'engine.event' && msg.event) {
        log(msg.event.type + ' [' + (msg.event.task ? msg.event.task.taskId : 'session') + ']');
        if (msg.state) {
          currentState = msg.state;
        }
        rerenderAll();
      }
    });

    syncModelOptions(providerState.provider, providerState.model);
    syncExecutionModeControl(providerState.provider, providerState.executionMode);
    $('runtimeBackend').value = normalizeRuntimeBackend(providerState.runtimeBackend);
    $('policyProfile').value = normalizePolicyProfile(providerState.policyProfile);
    $('authProfile').value = providerState.authProfile || 'default';
    $('fallbackProviders').value = providerState.fallbackProviders || '';
    persistWebviewState();
    setCustomModelVisibility(false);
    switchTab(currentTab);
    renderEvents();
    vscode.postMessage({ type: 'panel.ready' });
    vscode.postMessage({ type: 'state.get' });
  </script>
</body>
</html>`;
}

module.exports = { createPanelHtml };