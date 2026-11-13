import { render, screen } from '@testing-library/react';
import { Logo } from './Logo';

describe('Logo', () => {
  it('con texto, el nombre "MailFlow" aparece una sola vez', () => {
    const { container } = render(<Logo />);
    expect(screen.getAllByText('MailFlow')).toHaveLength(1);
    expect(screen.queryByRole('img', { name: 'MailFlow' })).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('soloIsotipo expone "MailFlow" una sola vez como imagen', () => {
    render(<Logo soloIsotipo />);
    expect(screen.getAllByRole('img', { name: 'MailFlow' })).toHaveLength(1);
    expect(screen.queryByText('MailFlow')).not.toBeInTheDocument();
  });
});
