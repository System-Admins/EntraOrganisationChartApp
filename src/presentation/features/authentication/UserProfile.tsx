import type { SignedInUser } from '@/application/abstractions/signedInUser';
import { classNames } from '../../shared/classNames';
import { useStrings } from '../../shared/languageContext';
import { useTooltip } from '../../shared/useTooltip';
import { Avatar } from '../photos/Avatar';
import { PROFILE_STRINGS } from './strings';
import styles from './UserProfile.module.css';

interface UserProfileProps {
  readonly user: SignedInUser;
  /** Shows the user's own place in the chart, or says that the chart leaves them out. */
  readonly onShow: () => void;
  readonly className?: string;
}

const AVATAR_SIZE = 28;

/** Who is signed in: the photo, and the name where the header has room for it. Pressing it finds the user. */
export function UserProfile({ user, onShow, className }: UserProfileProps) {
  const t = useStrings(PROFILE_STRINGS);
  // The address tells a person's accounts apart when they share a name, such as an administrator's second one.
  const account =
    user.displayName === user.userPrincipalName ? user.displayName : `${user.displayName} (${user.userPrincipalName})`;
  const label = t.label(account);
  const { hostProps, tooltip } = useTooltip(label);
  return (
    <button
      type="button"
      className={classNames(styles.profile, className)}
      aria-label={label}
      onClick={onShow}
      {...hostProps}
    >
      <Avatar employee={user} size={AVATAR_SIZE} showPresence={false} />
      <span className={styles.name}>{user.displayName}</span>
      {tooltip}
    </button>
  );
}
