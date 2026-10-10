import type { DepartmentNode } from '@/domain/orgChart/departmentTree';
import styles from './DepartmentPath.module.css';

interface DepartmentPathProps {
  /** From the top down. */
  readonly path: readonly DepartmentNode[];
  /** The list's name for assistive technology. */
  readonly label: string;
  /** Whether the last department opens too, as in the details; a department's own view names it in its heading. */
  readonly lastOpens: boolean;
  /** Words before the first department: the heading of the flagged branch it is in. */
  readonly lead?: string | null;
  /** Where nothing opens a department, the path is only read. */
  readonly onOpen?: (id: string) => void;
}

/** A department's path from the top down, each department a button that opens its people, as the reporting line's names open people. */
export function DepartmentPath({ path, label, lastOpens, lead = null, onOpen }: DepartmentPathProps) {
  return (
    <ol className={styles.line} aria-label={label}>
      {lead !== null && (
        <li>
          {lead}
          <span className={styles.separator} aria-hidden="true">›</span>
        </li>
      )}
      {path.map(({ id, name }, index) => {
        const last = index === path.length - 1;
        return (
          <li key={id}>
            {onOpen === undefined || (last && !lastOpens) ? (
              name
            ) : (
              <button
                type="button"
                className={styles.part}
                // The page hands the focus back to the part as Back leaves the department it opened.
                data-department-id={id}
                onClick={() => {
                  onOpen(id);
                }}
              >
                {name}
              </button>
            )}
            {!last && <span className={styles.separator} aria-hidden="true">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
