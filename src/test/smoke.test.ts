// Smoke test — verifies the test infrastructure works.
// Not testing application logic here; real tests live alongside their source files.
import { describe, it, expect } from 'vitest';

describe('test infrastructure', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('supports array matchers', () => {
    expect(['a', 'b', 'c']).toContain('b');
  });
});
