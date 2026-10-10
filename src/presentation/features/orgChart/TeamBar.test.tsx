// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { narrowTo } from '@/domain/orgChart/orgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import styles from './OrgChartPage.module.css';
import stylesheet from './OrgChartPage.module.css?raw';
import { TeamBar } from './TeamBar';

afterEach(cleanup);

const COMPANY = [
  makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
  makeEmployee('lead', 'ceo', { displayName: 'Åse Vik' }),
  makeEmployee('dev', 'lead'),
  makeEmployee('tester', 'lead'),
];
const EVERYONE = { topPersons: ['ceo'], hide: SHOW_EVERYONE };

function renderBar(team: string, headId: string | null) {
  const onShowEveryone = vi.fn();
  const chart = buildOrgChart(COMPANY, narrowTo(EVERYONE, team));
  render(<TeamBar chart={chart} headId={headId} onShowEveryone={onShowEveryone} />);
  return { onShowEveryone };
}

/** The stylesheet without its comments, whose words would match too. */
const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');

describe('TeamBar', () => {
  it('says whose team alone the chart shows and how many people it has, as a region named by its words', () => {
    const { onShowEveryone } = renderBar('lead', 'lead');

    const bar = screen.getByRole('region', { name: "Showing only Åse Vik's team, 3 people." });
    fireEvent.click(within(bar).getByRole('button', { name: 'Show everyone' }));
    expect(onShowEveryone).toHaveBeenCalledOnce();
    expect(bar.classList).not.toContain(styles.barWarning);
  });

  it('counts the people the team\'s chart names, not the place of someone the address list hides', () => {
    const hiding = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } };
    const placed = [...COMPANY, makeEmployee('auditHead', 'lead', { hiddenFromAddressList: true }), makeEmployee('auditor', 'auditHead')];
    render(<TeamBar chart={buildOrgChart(placed, narrowTo(hiding, 'lead'))} headId="lead" onShowEveryone={vi.fn()} />);

    expect(screen.getByRole('region', { name: "Showing only Åse Vik's team, 4 people." })).toBeTruthy();
  });

  it('warns where the team\'s person was not found or is hidden, and still leads back to everyone', () => {
    const { onShowEveryone } = renderBar('gone@contoso.com', null);

    const bar = screen.getByRole('region', { name: 'The person whose team this chart shows was not found or is hidden.' });
    expect(bar.classList).toContain(styles.barWarning);
    expect(bar.textContent).not.toContain('gone@contoso.com');
    fireEvent.click(within(bar).getByRole('button', { name: 'Show everyone' }));
    expect(onShowEveryone).toHaveBeenCalledOnce();
  });

  it('takes a row of its own between the header and the chart, with a filled 44px button that keeps an edge in forced colours', () => {
    expect(css).toMatch(/\.page \{[^}]*grid-template-rows: auto auto 1fr auto;/);
    expect(css).toMatch(/\.bars \{[^}]*grid-row: 2;/);
    expect(css).toMatch(/\.main \{[^}]*grid-row: 3;/);
    expect(css).toMatch(/\.status \{[^}]*grid-row: 4;/);
    expect(css).toMatch(/\.barButton \{[^}]*min-height: 44px;[^}]*color: var\(--surface\);[^}]*background: var\(--accent-text\);/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.barButton \{\s*border: 1px solid ButtonText;\s*\}\s*\}/);
  });
});
