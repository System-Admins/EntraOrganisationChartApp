import { useId } from 'react';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import { MICROSOFT_ACCOUNT_URL } from '@/application/settings/appSettings';
import { classNames } from '../../shared/classNames';
import controls from '../../shared/DialogControls.module.css';
import { DialogSection } from '../../shared/DialogSection';
import { Icon } from '../../shared/Icon';
import { useStrings } from '../../shared/languageContext';
import { Avatar } from '../photos/Avatar';
import styles from './SettingsDialog.module.css';
import { ACCOUNT_STRINGS } from './strings';

interface AccountSettingsProps {
  /** Null until the directory has been read (useSignedInUser): signing out is possible before that. */
  readonly user: SignedInUser | null;
  /** Left out where there is no chart to show the user in. */
  readonly onShow?: () => void;
  /** Left out where the user heads no team that would leave anyone out of the chart, or the chart shows theirs alone already. */
  readonly onShowTeam?: () => void;
  /** Where the user changes their profile photo; null offers no link. */
  readonly changePhotoUrl: string | null;
  /** Left out where the host page owns the sign-in. */
  readonly onSignOut?: () => void;
  /** Where the host page owns the sign-in: what Sign out deletes in the browser, without the sign-out. */
  readonly onForget?: () => void;
}

/** Also offers what the toolbar's profile and Sign out do, because the narrow header has no room for them. */
export function AccountSettings({ user, onShow, onShowTeam, changePhotoUrl, onSignOut, onForget }: AccountSettingsProps) {
  const t = useStrings(ACCOUNT_STRINGS);
  const hintId = useId();
  const forgetHintId = useId();
  const changePhoto = user !== null && changePhotoUrl !== null;
  return (
    <DialogSection title={t.title}>
      {user && (
        <div className={styles.identity}>
          <Avatar employee={user} size={40} showPresence={false} />
          <div className={styles.names}>
            <span className={styles.accountName}>{user.displayName}</span>
            {user.userPrincipalName !== user.displayName && (
              <span className={styles.accountAddress}>{user.userPrincipalName}</span>
            )}
          </div>
        </div>
      )}
      <div className={controls.actions}>
        {user && onShow && (
          <button type="button" className={controls.button} onClick={onShow}>
            {t.showMe}
          </button>
        )}
        {user && onShowTeam && (
          <button type="button" className={controls.button} onClick={onShowTeam}>
            {t.showMyTeam}
          </button>
        )}
        {changePhoto && (
          <a
            className={controls.button}
            href={changePhotoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby={hintId}
          >
            {t.changePhoto}
            <Icon name="external" size={16} />
          </a>
        )}
        {onSignOut && (
          <button type="button" className={classNames(controls.button, controls.danger)} onClick={onSignOut}>
            {t.signOut}
          </button>
        )}
      </div>
      {changePhoto && (
        <p id={hintId} className={controls.hint}>
          {/* Microsoft's page has no address for the photo alone, so the hint says where to look on it. */}
          {changePhotoUrl === MICROSOFT_ACCOUNT_URL ? t.myAccountHint : t.newTabHint}
        </p>
      )}
      {onForget && (
        <>
          <div className={controls.actions}>
            <button type="button" className={controls.button} aria-describedby={forgetHintId} onClick={onForget}>
              {t.forget}
            </button>
          </div>
          <p id={forgetHintId} className={controls.hint}>
            {t.forgetHint}
          </p>
        </>
      )}
    </DialogSection>
  );
}
