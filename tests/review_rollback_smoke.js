'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createReviewRollback, makeLineDiff } = require('../src-js/core/review-rollback');

function main() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-review-'));
  const file = path.join(workspaceRoot, 'src.txt');
  fs.writeFileSync(file, 'linea 1\nlinea 2\n', 'utf8');
  const review = createReviewRollback({ workspaceRoot });
  const snapshot = review.createSnapshot(['src.txt'], { id: 'unit-snapshot' });
  fs.writeFileSync(file, 'linea 1\nlinea cambiada\nlinea 3\n', 'utf8');

  const preview = review.preview(snapshot);
  assert.equal(preview.length, 1);
  assert.equal(preview[0].changed, true);
  assert.ok(preview[0].diff.length >= 1);
  assert.deepEqual(makeLineDiff('a\nb', 'a\nc')[0], { line: 2, before: 'b', after: 'c' });

  const rolled = review.rollback(snapshot);
  assert.equal(rolled.status, 'rolled-back');
  assert.equal(fs.readFileSync(file, 'utf8'), 'linea 1\nlinea 2\n');
  assert.throws(() => review.createSnapshot(['../escape.txt']), /fuera del workspace/);
  process.stdout.write('review_rollback_smoke: ok\n');
}

if (require.main === module) main();
module.exports = { main };
