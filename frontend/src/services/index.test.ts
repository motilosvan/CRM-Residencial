import { describe, expect, it } from 'vitest';
import { usaMock } from './index';

describe('selección de servicios', () => {
  it('en pruebas se usa el mock', () => {
    expect(usaMock).toBe(true);
  });
});
