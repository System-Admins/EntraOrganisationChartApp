// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SupportDesk } from '@/application/settings/appSettings';
import { SupportLink } from './SupportLink';
import { SupportDeskProvider } from './supportDesk';

afterEach(cleanup);

/** The link at the end of a message, as every message that sends people to their IT support has it. */
function renderMessage(desk: SupportDesk | null) {
  render(
    <SupportDeskProvider desk={desk}>
      <p data-testid="message">
        Please tell IT.
        <SupportLink />
      </p>
    </SupportDeskProvider>,
  );
  return screen.getByTestId('message');
}

const described = (element: HTMLElement) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;

describe('SupportLink', () => {
  it('adds nothing, not even a space, where config.json names no support desk', () => {
    expect(renderMessage(null).textContent).toBe('Please tell IT.');
  });

  it('opens a web page in a new tab, and says so before the press, on screen too', () => {
    const message = renderMessage({ label: 'Contoso Service Desk', url: 'https://servicedesk.contoso.com/orgchart' });
    const link = screen.getByRole('link', { name: 'Contoso Service Desk' });

    expect(link.getAttribute('href')).toBe('https://servicedesk.contoso.com/orgchart');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(described(link)).toBe('(opens in a new tab)');
    expect(message.textContent).toBe('Please tell IT. Contoso Service Desk (opens in a new tab)');
    // The icon keeps to the last word, as a line may break before it.
    expect(link.lastElementChild?.textContent).toBe('Desk');
    expect(link.lastElementChild?.querySelector('svg')).not.toBeNull();
  });

  it('opens a mail address in the mail app, in place, and says so instead', () => {
    renderMessage({ label: null, url: 'mailto:servicedesk@contoso.com' });
    const link = screen.getByRole('link', { name: 'Contact your IT support' });

    expect(link.getAttribute('href')).toBe('mailto:servicedesk@contoso.com');
    expect(link.hasAttribute('target')).toBe(false);
    expect(described(link)).toBe('(opens your mail app)');
  });

  it('keeps a name config.json gives, and knows a mail address written in capitals', () => {
    renderMessage({ label: 'Contoso Service Desk', url: 'MAILTO:servicedesk@contoso.com' });
    expect(described(screen.getByRole('link', { name: 'Contoso Service Desk' }))).toBe('(opens your mail app)');
  });
});
