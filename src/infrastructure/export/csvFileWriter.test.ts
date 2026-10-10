import { describe, expect, it } from 'vitest';
import { toCsv } from './csvFileWriter';

const lines = (csv: string) => csv.split('\r\n').slice(1, -1);

describe('toCsv', () => {
  it('starts with a byte order mark and ends every line with CRLF', () => {
    expect(toCsv({ columns: ['Name', 'City'], rows: [['Anna', 'Tromsø']] }, ',')).toBe('﻿Name,City\r\nAnna,Tromsø\r\n');
  });

  it('quotes cells that hold a separator, quotes or line breaks', () => {
    const csv = toCsv({ columns: ['A'], rows: [['Sales, Nordics'], ['The "A" team'], ['Two\nlines'], ['Oslo; HQ'], ['Oslo HQ']] }, ',');

    expect(lines(csv)).toEqual(['"Sales, Nordics"', '"The ""A"" team"', '"Two\nlines"', '"Oslo; HQ"', 'Oslo HQ']);
  });

  it('quotes either separator, so a spreadsheet set to the other one keeps a cell whole instead of running its second part', () => {
    const csv = toCsv({ columns: ['A', 'B'], rows: [['Oslo; HQ', 'Sales, Nordics'], ['x,=WEBSERVICE("u")', 'plain']] }, ';');

    expect(lines(csv)).toEqual(['"Oslo; HQ";"Sales, Nordics"', '"x,=WEBSERVICE(""u"")";plain']);
  });

  it('keeps spreadsheets from running a cell as a formula, but leaves phone numbers readable', () => {
    const cells = ['=HYPERLINK("x")', '+SUM(A1)', '-2+3', '@cmd', '+47 22 33 44 55', '(0)22 33-44/55'];

    const csv = toCsv({ columns: ['A'], rows: cells.map((cell) => [cell]) }, ',');

    expect(lines(csv)).toEqual([`"'=HYPERLINK(""x"")"`, "'+SUM(A1)", "'-2+3", "'@cmd", '+47 22 33 44 55', '(0)22 33-44/55']);
  });
});
