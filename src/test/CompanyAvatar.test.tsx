import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CompanyAvatar from '../components/CompanyAvatar';

describe('CompanyAvatar', () => {
  it('renders with correct size', () => {
    const { container } = render(<CompanyAvatar code="JKH" size={48} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('48px');
    expect(el.style.height).toBe('48px');
  });

  it('renders with default size 32', () => {
    const { container } = render(<CompanyAvatar code="HNB" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('32px');
  });

  it('has company-avatar class', () => {
    const { container } = render(<CompanyAvatar code="CDB" size={24} />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toBe('company-avatar');
  });
});
