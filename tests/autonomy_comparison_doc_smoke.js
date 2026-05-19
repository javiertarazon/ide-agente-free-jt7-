'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DOC = path.join(__dirname, '..', 'docs', '23-COMPARATIVA-FREEJT7-CODEX-TRAE-AUTONOMIA-2026-05-15.md');

function main() {
  const text = fs.readFileSync(DOC, 'utf8');
  const requiredSections = [
    '# Comparativa de autonomía: Free JT7 vs Codex vs Trae/SOLO',
    '## 2. Resumen ejecutivo',
    '## 3. Matriz comparativa por dimensión',
    '## 5. Evaluación específica pedida por el usuario',
    '### 5.2 Subagentes',
    '### 5.3 Memoria persistente',
    '### 5.4 Herramientas y skills',
    '### 5.5 MCP servidores',
    '### 5.6 Privilegios y capacidades',
    '### 5.7 Proveedores de modelos',
    '## 6. Brechas prioritarias para llegar a “agente autónomo completo”',
    '## 7. Dictamen final',
    '## 8. Estado de cierre de la brecha cuantificada',
  ];
  for (const section of requiredSections) {
    assert.ok(text.includes(section), `Falta seccion requerida: ${section}`);
  }
  for (const source of [
    'https://developers.openai.com/codex/cloud',
    'https://developers.openai.com/codex/cloud/internet-access',
    'https://www.trae.ai/solo',
    'https://www.trae.ai/solo-web',
  ]) {
    assert.ok(text.includes(source), `Falta fuente externa: ${source}`);
  }
  for (const evidence of [
    '`src-js/core/freejt7-agent-runtime.js`',
    '`src-js/core/session-engine.js`',
    '`src-js/core/provider-registry.js`',
    '`src-js/core/native-autonomy-doctor.js`',
    '`npm run doctor:native -- --json`',
  ]) {
    assert.ok(text.includes(evidence), `Falta evidencia local: ${evidence}`);
  }
  assert.match(text, /Free JT7 \| 76\/100/, 'Debe incluir puntuacion Free JT7');
  assert.match(text, /3-5 iteraciones de hardening/, 'Debe incluir roadmap resumido');
  assert.match(text, /sí, la brecha técnica del gate quedó cerrada/i, 'Debe aclarar que el gate queda cerrado con evidencia local');
  process.stdout.write('autonomy_comparison_doc_smoke: ok\n');
}

if (require.main === module) main();

module.exports = { main };
