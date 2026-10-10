import { Fragment, useId, useMemo, useState } from 'react';
import { TEAM_CHANNELS, type TeamChannel } from '@/application/abstractions/contactLauncher';
import { formatList } from '@/application/common/intl';
import { GetTeamContactQuery } from '@/application/features/contact/getTeamContact';
import {
  ADDRESS_SEPARATOR,
  GROUP_CHAT_SIZE,
  LEFT_OUT_REASONS,
  MAX_LINK_PEOPLE,
  type TeamChannelPlan,
  type TeamContactPlan,
} from '@/application/features/contact/teamContact';
import type { Language } from '@/application/settings/language';
import type { Employee } from '@/domain/employees/employee';
import tiles from '../../shared/ActionTile.module.css';
import { Icon, type IconName } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { useCopiedFeedback } from '../../shared/useCopiedFeedback';
import { useCopyText } from '../../shared/useCopyText';
import { useQuery } from '../../shared/useQuery';
import { describeDestination } from './describeDestination';
import { TEAM_CONTACT_STRINGS } from './strings';
import styles from './TeamContact.module.css';
import { useContactDestinations } from './useContactDestinations';
import { useContactTeam } from './useContactTeam';

/** Who the people of the list beside the tiles are, which the heading, the tiles' names and the group chat's name say. */
export type ContactGroup =
  | { readonly kind: 'directReports' | 'wholeTeam'; readonly manager: string }
  /** The team's people in one department or city, by the name its row shows. */
  | { readonly kind: 'place'; readonly manager: string; readonly place: string }
  /** A department's own people, where the department tree places it, whose name the group chat takes. */
  | { readonly kind: 'department'; readonly department: string };

interface TeamContactProps {
  /** Everyone the tiles reach as the chart shows them, the person asking aside: the people of the list beside them. */
  readonly people: readonly Employee[];
  readonly group: ContactGroup;
  /** One below the heading over it: an h4 in the details' Team section, an h3 under the team list's h2. */
  readonly headingLevel?: 3 | 4;
}

interface Sentence {
  readonly kind: 'chatLimit' | 'meetingLimit' | 'copy' | 'teams' | 'email';
  readonly text: string;
}

const ICONS = { chat: 'chat', email: 'mail', meeting: 'calendar' } as const satisfies Record<TeamChannel, IconName>;

/** Chat, e-mail or a meeting in one step with exactly the people listed beside it, as people expect. Key it by the list to reset it. */
export function TeamContact({ people, group, headingLevel = 4 }: TeamContactProps) {
  const t = useStrings(TEAM_CONTACT_STRINGS);
  const language = useLanguage();
  const destinations = useContactDestinations();
  const contactTeam = useContactTeam();
  const copyText = useCopyText();
  const { copied, announced, afterCopy } = useCopiedFeedback();
  // The addresses that could not be copied, shown to copy by hand until a copy succeeds.
  const [manualText, setManualText] = useState<string | null>(null);
  const id = useId();
  // Asked again for every list: a refresh or other filters can change who is in it.
  const request = useMemo(() => new GetTeamContactQuery(people), [people]);
  const { data: plan } = useQuery(request);
  const copyHintId = `${id}-copy`;
  const whom =
    group.kind === 'place' ? t.inPlace(group.place) : group.kind === 'department' ? t.inPlace(group.department) : t[group.kind];
  const topic = group.kind === 'department' ? group.department : t.chatTopic(group.manager, group.kind === 'place' ? group.place : null);
  const Heading = headingLevel === 3 ? 'h3' : 'h4';

  const copyAddresses = (addresses: readonly string[]) => {
    const text = addresses.join(ADDRESS_SEPARATOR);
    void copyText(text).then((done) => {
      setManualText(done ? null : text);
      afterCopy(done);
    });
  };

  // Where the link opens, as its tile's description and tooltip.
  const opens = (channel: TeamChannel) =>
    destinations && { 'aria-describedby': `${id}-${channel}`, title: describeDestination(destinations[channel], language) };

  const tile = (channel: TeamChannel, { people: reached, reach }: TeamChannelPlan) => {
    if (reach === 'copy') {
      return (
        <button
          key={channel}
          type="button"
          className={tiles.tile}
          // A short label like the other tiles'; the name says what it copies, until Copied says it itself.
          aria-label={copied ? undefined : t.copyAddresses}
          aria-describedby={copyHintId}
          onClick={() => { copyAddresses(reached); }}
        >
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? t.copied : t.copy}
        </button>
      );
    }
    if (reach !== 'link') return [];
    return (
      <button
        key={channel}
        type="button"
        className={tiles.tile}
        aria-label={t.names[channel](whom)}
        {...opens(channel)}
        onClick={() => { contactTeam(people, channel, topic); }}
      >
        <Icon name={ICONS[channel]} />
        {t.labels[channel]}
      </button>
    );
  };

  const buttons = plan ? TEAM_CHANNELS.flatMap((channel) => tile(channel, plan[channel])) : [];
  const sentences = plan ? explain(plan, language) : [];
  return (
    <>
      {(buttons.length > 0 || sentences.length > 0) && (
        <div>
          <Heading className={styles.heading}>{t.heading(whom)}</Heading>
          {buttons.length > 0 && <div className={styles.tiles}>{buttons}</div>}
          {/* Read only through aria-describedby, which also reaches hidden text. */}
          {plan &&
            destinations &&
            TEAM_CHANNELS.filter((channel) => plan[channel].reach === 'link').map((channel) => (
              <span key={channel} id={`${id}-${channel}`} hidden>
                {describeDestination(destinations[channel], language)}
              </span>
            ))}
          {sentences.length > 0 && (
            <p className={styles.note}>
              {sentences.map(({ kind, text }, index) => (
                <Fragment key={kind}>
                  {index > 0 && ' '}
                  <span id={kind === 'copy' ? copyHintId : undefined}>{text}</span>
                </Fragment>
              ))}
            </p>
          )}
          {manualText !== null && (
            <label className={styles.manual}>
              {t.manual}
              <textarea
                readOnly
                rows={3}
                value={manualText}
                autoFocus
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
              />
            </label>
          )}
        </div>
      )}
      {/* Heard by screen readers, which don't announce the tile's new label while it keeps the focus. */}
      <span className="visually-hidden" role="status">
        {announced ? t.announcement : ''}
      </span>
    </>
  );
}

/** Why a tile is missing or stands in for another, then whom the channels leave out, which explains one that reaches nobody. */
function explain({ chat, email, meeting }: TeamContactPlan, language: Language): Sentence[] {
  const t = TEAM_CONTACT_STRINGS[language];
  // Chat and meeting reach the same people, so the chat's tell for both.
  const leftOut = ({ leftOut: counts }: TeamChannelPlan) =>
    formatList(
      language,
      LEFT_OUT_REASONS.flatMap((reason) => {
        const count = counts[reason];
        return count === undefined ? [] : [t.leftOut[reason](count)];
      }),
      'conjunction',
    );
  const notInTeams = leftOut(chat);
  const notByEmail = leftOut(email);
  const sentences: (Sentence | false)[] = [
    chat.reach === 'tooMany' && { kind: 'chatLimit', text: t.chatLimit(GROUP_CHAT_SIZE.max) },
    meeting.reach === 'tooMany' && { kind: 'meetingLimit', text: t.meetingLimit(MAX_LINK_PEOPLE) },
    email.reach === 'copy' && { kind: 'copy', text: t.copyHint(MAX_LINK_PEOPLE) },
    notInTeams !== '' && { kind: 'teams', text: t.teamsLeaveOut(notInTeams) },
    notByEmail !== '' && { kind: 'email', text: t.emailLeavesOut(notByEmail) },
  ];
  return sentences.filter((sentence) => sentence !== false);
}
