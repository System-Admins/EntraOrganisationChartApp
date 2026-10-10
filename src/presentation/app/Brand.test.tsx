// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Branding } from '@/application/settings/branding';
import { Brand } from './Brand';
import styles from './Brand.module.css';

const branding: Branding = {
  title: 'Organization chart',
  logoUrl: '/branding/logo.svg',
  logoUrlDark: null,
  logoAlt: null,
  faviconUrl: null,
  fontFamily: null,
  colors: {},
  darkColors: {},
};

afterEach(cleanup);

describe('Brand', () => {
  it('links to the start page on its own', () => {
    render(<Brand branding={branding} />);

    expect(screen.getByRole('link', { name: 'Organization chart' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Organization chart');
  });

  it('says just before it leaves for the start page, but not for a click that opens it in a new tab or window', () => {
    const onLeave = vi.fn();
    render(<Brand branding={branding} onLeave={onLeave} />);
    const link = screen.getByRole('link', { name: 'Organization chart' });

    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) fireEvent.click(link, { [modifier]: true });
    fireEvent.click(link, { button: 1 });
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(link);
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('restarts in place when embedded, instead of leaving the embedding\'s address', () => {
    const onHome = vi.fn();
    render(<Brand branding={branding} onHome={onHome} />);

    fireEvent.click(screen.getByRole('button', { name: 'Organization chart' }));

    expect(onHome).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('gives only a logo without a dark variant the backplate of the dark themes', () => {
    const { container } = render(<Brand branding={branding} />);
    expect([...container.querySelectorAll('img')].map((img) => img.className)).toEqual([styles.logo]);
    cleanup();

    const themed = render(<Brand branding={{ ...branding, logoUrlDark: '/branding/logo-white.svg' }} />);
    expect([...themed.container.querySelectorAll('img')].map((img) => img.className)).toEqual([styles.lightOnly, styles.darkOnly]);
  });

  it('names a logo shown alone after the organization, or the default title', () => {
    render(<Brand branding={{ ...branding, title: '', logoAlt: 'Contoso' }} />);
    expect(screen.getByRole('link', { name: 'Contoso' })).toBeTruthy();
    cleanup();

    render(<Brand branding={{ ...branding, title: '' }} />);
    expect(screen.getByRole('link', { name: 'Organization chart' })).toBeTruthy();
  });

  it('shows the chart\'s own name, in the viewer\'s language, where config.json gives no title', () => {
    render(<Brand branding={{ ...branding, title: null }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Organization chart');
    expect(screen.getByRole('link', { name: 'Organization chart' }).getAttribute('title')).toBe('Back to the start');
  });

  it('leaves a title from config.json as it is written', () => {
    render(<Brand branding={{ ...branding, title: 'Contoso organization' }} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Contoso organization');
  });
});
