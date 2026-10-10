import type { ComponentProps, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './IconButton.module.css';
import { useTooltip, type TooltipHostProps } from './useTooltip';

/** No `title`: the browser's own tooltip would show on top of this one. */
interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'title' | keyof TooltipHostProps> {
  readonly icon: IconName;
  /** Accessible name and tooltip. */
  readonly label: string;
  readonly children?: ReactNode;
}

export function IconButton({ icon, label, children, className, ...buttonProps }: IconButtonProps) {
  const { hostProps, tooltip } = useTooltip(label, buttonProps.disabled);
  return (
    <button
      type="button"
      aria-label={label}
      className={className ? `${styles.button} ${className}` : styles.button}
      {...buttonProps}
      {...hostProps}
    >
      <Icon name={icon} />
      {children}
      {tooltip}
    </button>
  );
}
