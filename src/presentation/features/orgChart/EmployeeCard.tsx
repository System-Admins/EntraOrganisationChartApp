import { memo, useId, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from 'react';
import type { OrgNode } from '@/domain/orgChart/orgChart';
import { classNames } from '../../shared/classNames';
import { useDisplayOptions } from '../../shared/displayOptions';
import { Icon, type IconName } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { FLAG_LABELS, SHARED_STRINGS } from '../../shared/strings';
import { telHref } from '../../shared/telHref';
import { useContact } from '../contact/useContact';
import { DETAILS_PANEL_ID } from '../employeeDetails/detailsPanelId';
import { describePresence } from '../presence/describePresence';
import { usePresence } from '../presence/presenceContext';
import { Avatar } from '../photos/Avatar';
import { cardContentOf, type CardContent } from './cardContent';
import styles from './EmployeeCard.module.css';
import { CARD_STRINGS } from './strings';

interface EmployeeCardProps {
  readonly node: OrgNode;
  /** aria-level: the tree's level, which a heading over a flagged branch makes one more than the person's. */
  readonly level: number;
  /** aria-posinset and aria-setsize, counting the people a page of a long list leaves out. */
  readonly position: number;
  readonly setSize: number;
  readonly expanded: boolean;
  readonly selected: boolean;
  /** Changes with every search or panel reveal of this person, restarting the highlight; 0 for none. */
  readonly highlight: number;
  /** Whether this card, and the buttons in it, are in the tab order; one card is, the arrow keys reach the rest. */
  readonly tabbable: boolean;
  /** Id of the rendered reports group, for aria-owns. */
  readonly groupId: string | undefined;
  /** A click: folds or unfolds the reports (if any) and selects the person. Enter and Space are tree keys (OrgChartCanvas). */
  readonly onActivate: () => void;
  /** Folds or unfolds the reports without selecting the person: the report badge. */
  readonly onToggle: () => void;
  readonly onFocus: () => void;
}

const AVATAR_SIZE = 40;

/** Lets the stylesheet indent the contact lines to the text column beside the avatar. */
const CARD_STYLE = { '--avatar-size': `${String(AVATAR_SIZE)}px` } as CSSProperties;

/** The parts of a card that name or describe it to assistive technology. */
type CardPart = 'name' | 'flag' | 'jobTitle' | 'department' | 'presence';

const partId = (cardId: string, part: CardPart) => `${cardId}-${part}`;

const stopPropagation = (event: MouseEvent) => {
  event.stopPropagation();
};

export const EmployeeCard = memo(function EmployeeCard({
  node,
  level,
  position,
  setSize,
  expanded,
  selected,
  highlight,
  tabbable,
  groupId,
  onActivate,
  onToggle,
  onFocus,
}: EmployeeCardProps) {
  const { employee, childIds, teamSize } = node;
  const contact = useContact();
  const language = useLanguage();
  const id = useId();
  const content = cardContentOf(node);
  const reports = childIds.length;
  const presence = usePresence(employee.id, false);
  const tabIndex = tabbable ? 0 : -1;
  // Presence is a description, not part of the name: otherwise every poll would rename the focused card.
  const describedBy = [
    content.flag && partId(id, 'flag'),
    content.jobTitle && partId(id, 'jobTitle'),
    content.department && partId(id, 'department'),
    presence && partId(id, 'presence'),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="treeitem"
      tabIndex={tabIndex}
      aria-labelledby={partId(id, 'name')}
      aria-describedby={describedBy || undefined}
      aria-level={level}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-expanded={reports > 0 ? expanded : undefined}
      aria-selected={selected}
      // The side panel shows the selected person's details or team; it lists search results only while nobody is selected.
      aria-controls={selected ? DETAILS_PANEL_ID : undefined}
      aria-owns={groupId}
      data-employee-id={employee.id}
      className={classNames(styles.card, selected && styles.selected)}
      style={CARD_STYLE}
      onClick={onActivate}
      onFocus={onFocus}
    >
      {highlight > 0 && <span key={highlight} className={styles.pulse} aria-hidden="true" />}
      <CardFace
        content={content}
        id={id}
        avatar={<Avatar employee={employee} size={AVATAR_SIZE} />}
        tabIndex={tabIndex}
        onEmail={() => {
          contact(employee, 'email');
        }}
      />
      {presence && (
        <span id={partId(id, 'presence')} className="visually-hidden">
          {describePresence(presence, language)}
        </span>
      )}
      {reports > 0 && (
        <ReportBadge reports={reports} teamSize={teamSize} expanded={expanded} tabIndex={tabIndex} groupId={groupId} onToggle={onToggle} />
      )}
    </div>
  );
});

type UnlistedCardProps = Omit<EmployeeCardProps, 'selected' | 'highlight' | 'onActivate'>;

/** The place of someone the rules keep unlisted, over people below who are shown: no name, photo, details or status, and nobody to select. */
export const UnlistedCard = memo(function UnlistedCard({
  node,
  level,
  position,
  setSize,
  expanded,
  tabbable,
  groupId,
  onToggle,
  onFocus,
}: UnlistedCardProps) {
  const shared = useStrings(SHARED_STRINGS);
  const id = useId();
  const content: CardContent = { ...cardContentOf(node), name: shared.unlisted };
  const reports = node.childIds.length;
  const tabIndex = tabbable ? 0 : -1;

  return (
    <div
      role="treeitem"
      tabIndex={tabIndex}
      aria-labelledby={partId(id, 'name')}
      aria-describedby={content.flag ? partId(id, 'flag') : undefined}
      aria-level={level}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-expanded={reports > 0 ? expanded : undefined}
      aria-owns={groupId}
      // The tree's keys find it by this, as a heading; printing loads photos only for items with a person's id (printContext.tsx).
      data-tree-key={node.employee.id}
      className={classNames(styles.card, styles.unlisted)}
      style={CARD_STYLE}
      // A click only folds or unfolds, as there is nobody whose details it could open.
      onClick={reports > 0 ? onToggle : undefined}
      onFocus={onFocus}
    >
      <CardFace
        content={content}
        id={id}
        avatar={
          <span className={styles.placeholder}>
            <Icon name="person" size={20} />
          </span>
        }
        tabIndex={tabIndex}
      />
      {reports > 0 && (
        <ReportBadge reports={reports} teamSize={node.teamSize} expanded={expanded} tabIndex={tabIndex} groupId={groupId} onToggle={onToggle} />
      )}
    </div>
  );
});

interface ReportBadgeProps {
  readonly reports: number;
  readonly teamSize: number;
  readonly expanded: boolean;
  readonly tabIndex: number;
  readonly groupId: string | undefined;
  readonly onToggle: () => void;
}

/** Folds or unfolds the reports without selecting anyone. */
function ReportBadge({ reports, teamSize, expanded, tabIndex, groupId, onToggle }: ReportBadgeProps) {
  const { directReports, reportsInTotal } = useStrings(CARD_STRINGS);
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      className={styles.badge}
      title={reportsInTotal(directReports(reports), teamSize)}
      aria-label={directReports(reports)}
      aria-expanded={expanded}
      aria-controls={groupId}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon name="person" size={12} />
      {reports}
      <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
    </button>
  );
}

interface MeasuringCardProps {
  readonly content: CardContent;
  /** Keeps the tree's form while the phone outline is on screen. */
  readonly asTree?: boolean;
  /** The part to measure: the card inside its borders. */
  readonly bodyRef: Ref<HTMLDivElement>;
}

/** Only takes up room for CardHeightProbe: no tree item, no employee id, no photo, no presence. */
export function MeasuringCard({ content, asTree = false, bodyRef }: MeasuringCardProps) {
  return (
    <div className={classNames(styles.card, asTree && styles.asTree)} style={CARD_STYLE}>
      <CardFace ref={bodyRef} content={content} avatar={<span className={styles.avatarSpace} />} tabIndex={-1} />
    </div>
  );
}

interface CardFaceProps {
  readonly content: CardContent;
  readonly avatar: ReactNode;
  readonly tabIndex: number;
  /** The card's id, which gives the parts that name and describe it theirs. */
  readonly id?: string;
  readonly onEmail?: () => void;
  readonly ref?: Ref<HTMLDivElement>;
}

/** Everything that adds to a card's height, shared by the real cards and the measuring ones so they can't differ. */
function CardFace({ content, avatar, tabIndex, id, onEmail, ref }: CardFaceProps) {
  const { flag, name, jobTitle, department, mail, phone, office, level } = content;
  const { showLevels } = useDisplayOptions();
  const flagLabels = useStrings(FLAG_LABELS);
  const shared = useStrings(SHARED_STRINGS);
  const t = useStrings(CARD_STRINGS);
  const idOf = (part: CardPart) => (id === undefined ? undefined : partId(id, part));

  return (
    <div ref={ref} className={styles.body}>
      {flag && (
        <span id={idOf('flag')} className={styles.flag}>
          <Icon name="warning" size={12} />
          {flagLabels[flag]}
        </span>
      )}
      <div className={styles.header}>
        {avatar}
        <div className={styles.identity}>
          <span id={idOf('name')} className={styles.name} title={name}>
            {name}
          </span>
          {jobTitle && (
            <span id={idOf('jobTitle')} className={styles.jobTitle} title={jobTitle}>
              {jobTitle}
            </span>
          )}
          {department && (
            <span id={idOf('department')} className={styles.department} title={department}>
              {department}
            </span>
          )}
        </div>
        {/* Assistive technology gets the level from aria-level whether this is shown or not, one more under a heading. */}
        {showLevels && (
          <span className={styles.level} aria-hidden="true">
            {shared.level(level)}
          </span>
        )}
      </div>
      {(mail ?? phone ?? office) && (
        <div className={styles.contacts}>
          {mail && (
            <button
              type="button"
              tabIndex={tabIndex}
              className={styles.contact}
              title={t.email(mail)}
              onClick={(event) => {
                event.stopPropagation();
                onEmail?.();
              }}
            >
              {contactLine('mail', t.contactLabels.mail, mail)}
            </button>
          )}
          {phone && (
            <a
              tabIndex={tabIndex}
              className={styles.contact}
              href={telHref(phone)}
              title={t.call(phone)}
              onClick={stopPropagation}
            >
              {contactLine('phone', t.contactLabels.phone, phone)}
            </a>
          )}
          {office && (
            <span className={styles.detail} title={office}>
              {contactLine('building', t.contactLabels.office, office)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function contactLine(icon: IconName, label: string, text: string): ReactNode {
  return (
    <>
      <Icon name={icon} size={14} />
      <span className="visually-hidden">{label}: </span>
      <span className={styles.contactText}>{text}</span>
    </>
  );
}
