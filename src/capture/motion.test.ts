import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { easeSnap } from './motion.ts';

describe('easeSnap', () => {
  it('is pinned at the endpoints', () => {
    assert.equal(easeSnap(0), 0);
    assert.equal(easeSnap(1), 1);
  });

  it('eases out (ahead of linear in the first half)', () => {
    assert.ok(easeSnap(0.3) > 0.3);
    assert.ok(easeSnap(0.5) > 0.5);
    assert.ok(easeSnap(0.5) < 1);
  });
});
