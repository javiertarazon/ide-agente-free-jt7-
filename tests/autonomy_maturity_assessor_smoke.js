'use strict';

const assert = require('assert');

const { assessAutonomyMaturity, DIMENSIONS } = require('../src-js/core/autonomy-maturity-assessor');
const { runNativeAutonomyDoctor } = require('../src-js/core/native-autonomy-doctor');

function main() {
  const assessment = assessAutonomyMaturity({ rootDir: process.cwd() });
  assert.equal(DIMENSIONS.length, 4, 'Debe medir cuatro brechas principales');
  assert.equal(assessment.closed, true, 'Debe declarar la brecha cerrada cuando existe evidencia ready y parcial');
  assert.equal(assessment.status, 'closed');
  assert.ok(assessment.score >= assessment.targetScore, 'Debe producir score de cierre verificable');
  assert.deepEqual(assessment.openGaps, [], 'No deben quedar gaps abiertos tras implementar evidencia ready');
  for (const id of ['sandboxing', 'parallelSubagents', 'semanticMemory', 'reviewRollbackUx']) {
    const dimension = assessment.dimensions.find((item) => item.id === id);
    assert.ok(dimension, `Debe medir dimension: ${id}`);
    assert.equal(dimension.closed, true, `Debe cerrar dimension: ${id}`);
    assert.deepEqual(dimension.missingReadyEvidence, [], `No debe faltar evidencia ready: ${id}`);
  }

  const doctor = runNativeAutonomyDoctor({ rootDir: process.cwd() });
  const section = doctor.sections.find((item) => item.id === 'autonomyMaturity');
  assert.ok(section, 'Doctor debe incluir gate de madurez autonoma');
  assert.equal(section.status, 'ok', 'El gate no debe romper el doctor: sus brechas son warnings');
  assert.equal(doctor.summary.warnings, 0, 'Doctor no debe reportar warnings cuando el gate queda cerrado');
  assert.equal(section.details.closed, true, 'Doctor debe declarar cierre total del gate de madurez');
  process.stdout.write('autonomy_maturity_assessor_smoke: ok\n');
}

if (require.main === module) main();

module.exports = { main };
