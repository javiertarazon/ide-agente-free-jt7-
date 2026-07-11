# Proyecto: agente-freejt7-extension-funcional

Este directorio contiene el runtime de Free JT7, los bridges para IDEs y
el sistema de gestion del catalogo de skills.

## Comandos del proyecto
- Validacion: `python skills_manager.py policy-validate`
- Estado: `python skills_manager.py doctor --strict`
- Skills activas: `python skills_manager.py list --active`
- Sincronizar Claude: `python skills_manager.py sync-claude`

<!-- SKILLS_LIBRARY_START -->
## Skills Library â€” Contexto Experto

Directorio: `.github/skills/` â€” **964 skills** en el indice.
Actualizacion: 2026-04-17 17:28 UTC

### Comandos de gestion
```
python skills_manager.py list              # listar todas
python skills_manager.py list --active     # ver activas
python skills_manager.py search QUERY      # buscar
python skills_manager.py activate   ID     # activar
python skills_manager.py deactivate ID     # desactivar
python skills_manager.py fetch             # importar skills
python skills_manager.py github-search Q   # buscar repos
```

### Skills Activas (22 de 964)

Lee los archivos SKILL.md listados abajo al responder preguntas
en ese dominio. Aplica su metodologia y mejores practicas.

| Skill | Archivo | Descripcion |
|-------|---------|-------------|
| agent-orchestration | .github/skills/agent-orchestration/SKILL.md |  |
| ai-agent-development | .github/skills/ai-agent-development/SKILL.md | AI agent development workflow for building autonomous agents, mul |
| ai-agents-architect | .github/skills/ai-agents-architect/SKILL.md | Expert in designing and building autonomous AI agents. Masters to |
| autonomous-agents | .github/skills/autonomous-agents/SKILL.md | Autonomous agents are AI systems that can independently decompose |
| backtesting-frameworks | .github/skills/backtesting-frameworks/SKILL.md | Build robust backtesting systems for trading strategies with prop |
| crewai | .github/skills/crewai/SKILL.md | Expert in CrewAI - the leading role-based multi-agent framework u |
| fastapi-pro | .github/skills/fastapi-pro/SKILL.md | Build high-performance async APIs with FastAPI, SQLAlchemy 2.0, a |
| free-jt7-global-runtime-audit | .github/skills/free-jt7-global-runtime-audit/SKILL.md | Audit and enforce Free JT7 global runtime behavior across IDEs (C |
| langgraph | .github/skills/langgraph/SKILL.md | Expert in LangGraph - the production-grade framework for building |
| mcp-builder | .github/skills/mcp-builder/SKILL.md | Guide for creating high-quality MCP (Model Context Protocol) serv |
| mcp-cli | .github/skills/mcp-cli/SKILL.md | Interface for MCP (Model Context Protocol) servers via CLI. Use w |
| multi-agent-patterns | .github/skills/multi-agent-patterns/SKILL.md | Master orchestrator, peer-to-peer, and hierarchical multi-agent a |
| python-pro | .github/skills/python-pro/SKILL.md | Master Python 3.12+ with modern features, async programming, |
| python-testing-patterns | .github/skills/python-testing-patterns/SKILL.md | Implement comprehensive testing strategies with pytest, fixtures, |
| quant-analyst | .github/skills/quant-analyst/SKILL.md | Build financial models, backtest trading strategies, and analyze |
| risk-manager | .github/skills/risk-manager/SKILL.md | Monitor portfolio risk, R-multiples, and position limits. Creates |
| risk-metrics-calculation | .github/skills/risk-metrics-calculation/SKILL.md | Calculate portfolio risk metrics including VaR, CVaR, Sharpe, Sor |
| systematic-debugging | .github/skills/systematic-debugging/SKILL.md | Use when encountering any bug, test failure, or unexpected behavi |
| using-superpowers | .github/skills/using-superpowers/SKILL.md | Use when starting any conversation - establishes how to find and  |
| verification-before-completion | .github/skills/verification-before-completion/SKILL.md | Use when about to claim work is complete, fixed, or passing, befo |
| vscode-ext-commands | .github/skills/vscode-ext-commands/SKILL.md | 'Guidelines for contributing commands in VS Code extensions. Indi |
| vscode-ext-localization | .github/skills/vscode-ext-localization/SKILL.md | 'Guidelines for proper localization of VS Code extensions, follow |

> **Instruccion para Claude**: Al inicio de cada sesion, lee los
> archivos SKILL.md de la tabla anterior. Cuando el usuario haga
> una solicitud relacionada con esa area, aplica el contexto experto
> de la skill correspondiente.
<!-- SKILLS_LIBRARY_END -->
