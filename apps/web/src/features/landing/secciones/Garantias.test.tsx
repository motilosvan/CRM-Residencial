import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Garantias } from './Garantias';

describe('Garantias', () => {
  it('C7: no hay nada enfocable en la cinta ni en su copia decorativa', () => {
    const { container } = render(<Garantias />);
    expect(container.querySelectorAll('[tabindex], a, button, input')).toHaveLength(0);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
