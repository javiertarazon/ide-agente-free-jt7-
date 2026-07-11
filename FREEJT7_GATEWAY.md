# Free JT7 Gateway Runbook

- Proyecto: `/home/javier28/Público/copilot vs code/agente free jt7 extension/agente-freejt7-extension-funcional`
- Config: `/home/javier28/Público/copilot vs code/agente free jt7 extension/agente-freejt7-extension-funcional/.openclaw/openclaw.json`
- Estado: `/home/javier28/Público/copilot vs code/agente free jt7 extension/agente-freejt7-extension-funcional/.openclaw/state`
- IDE/modelo por defecto: `vscode` / `github-copilot` / `copilot-default`
- Runtime OpenClaw: `Node.js 22.14+` en `~/.local/bin/openclaw` o equivalente en PATH
- Retención objetivo: `30 dias`

## Comandos rapidos
```bash
python3 skills_manager.py easy-onboard --project "/ruta/proyecto" --interactive
python3 skills_manager.py credentials-wizard --project "/ruta/proyecto" --interactive
python3 skills_manager.py credentials-apply --project "/ruta/proyecto"
python3 skills_manager.py gateway-status
python3 skills_manager.py gateway-start --dry-run
python3 skills_manager.py channel-login --channel whatsapp
python3 skills_manager.py channel-login --channel telegram
python3 skills_manager.py pairing-list --channel telegram
python3 skills_manager.py pairing-approve --channel telegram --code <CODE>
python3 skills_manager.py plugin-list
python3 skills_manager.py plugin-validate
python3 skills_manager.py phase7-smoke
python3 skills_manager.py gateway-resilience
```
