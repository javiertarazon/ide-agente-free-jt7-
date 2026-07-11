# Free JT7 Design Agent

Variables esperadas para Canva:

- CANVA_CLIENT_ID
- CANVA_CLIENT_SECRET
- CANVA_REDIRECT_URI opcional, por defecto http://localhost:8765/callback
- CANVA_TOKEN_FILE opcional, por defecto en copilot-agent/runs/design-agent/canva_tokens.json

Carga local recomendada:

- Si existe `.env.free-jt7` en la raíz del repo, el agente carga desde ahí solo `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI` y `CANVA_TOKEN_FILE`.
- Las variables ya exportadas en el entorno tienen prioridad y no se sobrescriben.
- `.env.free-jt7` ya está ignorado por git y es la opción recomendada para pruebas locales con Canva.

Comandos:

- python -m tools.design_agent.cli doctor --json
- python -m tools.design_agent.cli auth-canva --json
- python -m tools.design_agent.cli generate-video --workspace-root . --prompt "demo" --output-name demo --provider openrouter --model meta-llama/llama-3.3-70b-instruct:free --interactive-canva-auth --json
