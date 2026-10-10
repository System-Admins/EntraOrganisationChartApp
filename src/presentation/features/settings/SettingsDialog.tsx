import type { ReactNode } from 'react';
import { Dialog } from '../../shared/Dialog';
import { useStrings } from '../../shared/languageContext';
import { DeveloperCredit } from './DeveloperCredit';
import { SETTINGS_STRINGS } from './strings';

interface SettingsDialogProps {
  readonly open: boolean;
  /** The dialog closed itself (its Close button, Escape, a click beside it): set `open` to false. */
  readonly onClose: () => void;
  /** One DialogSection per group of settings; a new group is one more child. */
  readonly children: ReactNode;
}

/** The settings in a modal Dialog, which the owner closes through `open`, because only close() hands the focus back. */
export function SettingsDialog({ open, onClose, children }: SettingsDialogProps) {
  const t = useStrings(SETTINGS_STRINGS);
  return (
    <Dialog open={open} title={t.title} closeLabel={t.close} onClose={onClose}>
      {children}
      <DeveloperCredit />
    </Dialog>
  );
}
