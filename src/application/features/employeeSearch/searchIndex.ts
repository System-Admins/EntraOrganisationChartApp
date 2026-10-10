import type { Employee } from '@/domain/employees/employee';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { fold } from '@/domain/text/fold';
import type { ExtraField } from '../../settings/extraFields';

/** The details a search matches besides the name, in the order a hit lists them. */
export const SEARCH_FIELDS = [
  'jobTitle',
  'department',
  'companyName',
  'officeLocation',
  'city',
  'country',
  'mail',
  'userPrincipalName',
  'businessPhone',
  'mobilePhone',
] as const satisfies readonly (keyof Employee)[];

export type SearchField = (typeof SEARCH_FIELDS)[number];

/** What a term can be found in besides the name: a detail of SEARCH_FIELDS, or one of the organization's own fields. */
type Detail = SearchField | ExtraField;

const PHONE_FIELDS: ReadonlySet<Detail> = new Set<Detail>(['businessPhone', 'mobilePhone']);

export interface SearchMatch {
  readonly id: string;
  /** The details in which a term was found that the name did not match, in the order of SEARCH_FIELDS. */
  readonly fields: readonly SearchField[];
  /** The same among the organization's own fields that the index looks in, in config.json's order. */
  readonly extraFields: readonly ExtraField[];
}

export interface SearchMatches {
  /** At most the limit, best first. */
  readonly best: readonly SearchMatch[];
  /** Everyone who matches, beyond the limit too. */
  readonly total: number;
}

interface Entry {
  readonly id: string;
  /** As the directory spells it, which equal hits are ordered by. */
  readonly displayName: string;
  /** Folded, as the search compares it. */
  readonly name: string;
  /** Each detail the person has, the organization's own fields last: folded text, or the digits alone for a phone number. */
  readonly details: readonly (readonly [Detail, string])[];
}

const PHONE_TOKEN = /^[\d()+./-]+$/;
/** Shorter runs of digits match half the directory's numbers. */
const MIN_PHONE_DIGITS = 3;

/** Case- and accent-insensitive. Every token must match; name starts rank above word starts, then the rest. */
export class SearchIndex {
  private readonly entries: readonly Entry[];
  /** Orders equal hits the way the chart orders names (buildOrgChart): in the browser's own order. */
  private readonly names = new Intl.Collator(undefined, { sensitivity: 'base' });

  /** Over the people the chart names, not the places of the unlisted; `extraFields` are the organization's own fields that search looks in, as config.json says. */
  constructor(
    chart: OrgChart,
    private readonly extraFields: readonly ExtraField[] = [],
  ) {
    this.entries = [...chart.nodes.values()].filter(({ unlisted }) => !unlisted).map(({ employee }) => ({
      id: employee.id,
      displayName: employee.displayName,
      name: fold(employee.displayName),
      details: [
        ...SEARCH_FIELDS.flatMap((field) => {
          const value = employee[field];
          const searchable = value === null ? '' : PHONE_FIELDS.has(field) ? digitsOf(value) : fold(value);
          return searchable ? [[field, searchable] as const] : [];
        }),
        ...extraFields.flatMap((field) => {
          const searchable = fold(employee.extra[field.property] ?? '');
          return searchable ? [[field, searchable] as const] : [];
        }),
      ],
    }));
  }

  search(text: string, limit: number): SearchMatches {
    const words = fold(text).split(/\s+/).filter(Boolean);
    // A number typed in groups, the way directories store it ("+47 22 33 44 55"), is one phone token.
    const tokens = words.length > 1 && words.every((word) => PHONE_TOKEN.test(word)) ? [words.join('')] : words;
    if (tokens.length === 0) return { best: [], total: 0 };

    // Keeps only the best `limit` hits: sorting every match took up to 78 ms per keystroke at 50,000 people.
    const best: Hit[] = [];
    let total = 0;
    for (const entry of this.entries) {
      let score = 0;
      const fields = new Set<Detail>();
      for (const token of tokens) {
        const match = matchToken(entry, token);
        if (!match) {
          score = 0;
          break;
        }
        score += match.score;
        if (match.field) fields.add(match.field);
      }
      if (score === 0) continue;
      total++;
      const hit = { entry, score, fields };
      const last = best.at(-1);
      if (best.length >= limit && (last === undefined || !this.ranksBefore(hit, last))) continue;
      // Halving keeps a long list cheap, such as the results view's: equal hits stay in the order they came.
      let low = 0;
      let high = best.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.ranksBefore(hit, best[middle] as Hit)) high = middle;
        else low = middle + 1;
      }
      best.splice(low, 0, hit);
      if (best.length > limit) best.pop();
    }
    return {
      best: best.map(({ entry, fields }) => ({
        id: entry.id,
        fields: SEARCH_FIELDS.filter((field) => fields.has(field)),
        extraFields: this.extraFields.filter((field) => fields.has(field)),
      })),
      total,
    };
  }

  private ranksBefore(a: Hit, b: Hit): boolean {
    return a.score > b.score || (a.score === b.score && this.names.compare(a.entry.displayName, b.entry.displayName) < 0);
  }
}

interface Hit {
  readonly entry: Entry;
  readonly score: number;
  readonly fields: ReadonlySet<Detail>;
}

function matchToken(entry: Entry, token: string): { readonly score: number; readonly field: Detail | null } | null {
  if (entry.name.startsWith(token)) return { score: 3, field: null };
  if (entry.name.includes(` ${token}`) || entry.name.includes(`-${token}`)) return { score: 2, field: null };
  if (entry.name.includes(token)) return { score: 1, field: null };
  const numbers = PHONE_TOKEN.test(token) ? phoneDigits(token) : [];
  for (const [field, value] of entry.details) {
    const found = PHONE_FIELDS.has(field) ? numbers.some((digits) => value.includes(digits)) : value.includes(token);
    if (found) return { score: 1, field };
  }
  return null;
}

/** The digits as typed and without a dialling prefix (00 or 0), which the directory's numbers lack. */
function phoneDigits(token: string): string[] {
  const digits = digitsOf(token);
  const dialled = digits.startsWith('00') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  return [...new Set([digits, dialled])].filter((number) => number.length >= MIN_PHONE_DIGITS);
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}
