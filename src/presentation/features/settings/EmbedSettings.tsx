import { useId, useRef } from 'react';
import controls from '../../shared/DialogControls.module.css';
import { DialogSection } from '../../shared/DialogSection';
import { Icon } from '../../shared/Icon';
import { useStrings } from '../../shared/languageContext';
import { useCopiedFeedback } from '../../shared/useCopiedFeedback';
import { useCopyText } from '../../shared/useCopyText';
import { EMBED_STRINGS } from './strings';

interface EmbedSettingsProps {
  /** The chart's own address with who is in it now (GetEmbedAddressQuery). */
  readonly address: string;
  /** The chart's title, which names the frame among the parts of the page that shows it. */
  readonly title: string;
}

/** Code for another page, such as a SharePoint page, that shows the chart as it is now; only the chart's own site knows its address. */
export function EmbedSettings({ address, title }: EmbedSettingsProps) {
  const t = useStrings(EMBED_STRINGS);
  const copyText = useCopyText();
  const { copied, announced, afterCopy } = useCopiedFeedback();
  const field = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const code = iframeCode(address, title);

  const copyCode = () => {
    void copyText(code).then((done) => {
      afterCopy(done);
      // The code is on screen already: selected in its field, it is ready to copy by hand.
      if (!done) field.current?.focus();
    });
  };

  return (
    <DialogSection title={t.title}>
      <label className={controls.copyByHand}>
        {t.code}
        <textarea
          ref={field}
          readOnly
          rows={4}
          value={code}
          aria-describedby={hintId}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      </label>
      <div className={controls.actions}>
        <button type="button" className={controls.button} aria-describedby={hintId} onClick={copyCode}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? t.copied : t.copy}
        </button>
      </div>
      <p id={hintId} className={controls.hint}>
        {t.hint}
      </p>
      {/* Heard by screen readers, which don't announce the button's new label while it keeps the focus. */}
      <span className="visually-hidden" role="status">
        {announced ? t.announcement : ''}
      </span>
    </DialogSection>
  );
}

/** As the Embed web part takes it, the size README.md suggests: the column's width, 800px high, without a border. */
function iframeCode(address: string, title: string): string {
  return `<iframe src="${attribute(address)}" title="${attribute(title)}" width="100%" height="800" style="border:0"></iframe>`;
}

/** For a double-quoted attribute: an & in the address, or a quote in a title such as R&D's "chart", must not end it or read as markup. */
function attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
