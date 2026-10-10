import { useCallback, useMemo, useState } from 'react';
import { SearchEmployeesQuery } from '@/application/features/employeeSearch/searchEmployees';
import type { OrgChart, OrgChartOptions } from '@/domain/orgChart/orgChart';
import { describeError, errorDetail, pointsToSupport } from '../../shared/errors';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { SHARED_STRINGS } from '../../shared/strings';
import { SupportLink } from '../../shared/SupportLink';
import { useQuery } from '../../shared/useQuery';
import { PeopleList, PEOPLE_LIST_CAP, type PeopleListEntry } from '../peopleList/PeopleList';
import { PeoplePanel } from '../peopleList/PeoplePanel';
import { hitDetails } from './hitDetails';
import styles from './SearchResults.module.css';
import { SEARCH_RESULTS_STRINGS, SEARCH_STRINGS } from './strings';

interface SearchResultsProps {
  /** The chart on screen, whose people the search goes through. */
  readonly chart: OrgChart;
  /** The chart's current options, as the suggestions have them. */
  readonly options: OrgChartOptions;
  /** What was searched for. */
  readonly term: string;
  /** Opens a match in the chart, with their details, as a suggestion does. */
  readonly onOpen: (employeeId: string) => void;
  readonly onClose: () => void;
}

/** Every match of a search beside the chart, the best first, as many as a list shows. Key it by the term. */
export function SearchResults({ chart, options, term, onOpen, onClose }: SearchResultsProps) {
  const t = useStrings(SEARCH_RESULTS_STRINGS);
  const search = useStrings(SEARCH_STRINGS);
  const { technicalDetails } = useStrings(SHARED_STRINGS);
  const language = useLanguage();
  // Asked again for every chart, as a refresh changes who matches without changing the options.
  const [asked, setAsked] = useState(() => ({ chart, query: new SearchEmployeesQuery(options, term, PEOPLE_LIST_CAP) }));
  if (asked.chart !== chart || asked.query.options !== options) {
    setAsked({ chart, query: new SearchEmployeesQuery(options, term, PEOPLE_LIST_CAP) });
  }
  const { data, error, reload } = useQuery(asked.query);
  const people = useMemo(
    () => data?.hits.map((hit): PeopleListEntry => ({ employee: hit.employee, detail: hitDetails(hit, search) || null })) ?? [],
    [data, search],
  );
  const open = useCallback(
    ({ employee }: PeopleListEntry) => {
      onOpen(employee.id);
    },
    [onOpen],
  );
  const detail = errorDetail(error);

  return (
    <PeoplePanel
      title={t.title}
      summary={data ? t.matchesFor(search.matches(data.total), term) : error === undefined ? t.searching : null}
      closeLabel={t.close}
      onClose={onClose}
    >
      {error !== undefined && (
        <div role="alert" className={styles.failed}>
          <p className={styles.reason}>
            {describeError(error, language)}
            {pointsToSupport(error) && <SupportLink />}
          </p>
          <button type="button" className={styles.retry} onClick={reload}>
            {t.tryAgain}
          </button>
          {/* Marked as English, which it stays whatever the page speaks, so that screen readers pronounce it as such. */}
          {detail && (
            <p className={styles.detail}>
              {technicalDetails} <span lang="en">{detail}</span>
            </p>
          )}
        </div>
      )}
      {data && data.total > data.hits.length && <p className={styles.note}>{t.best(data.hits.length)}</p>}
      {data && <PeopleList people={people} label={t.people} onOpen={open} />}
    </PeoplePanel>
  );
}
