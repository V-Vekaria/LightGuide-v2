import type { ComponentChildren } from 'preact';
import type { UserMessage } from './messages';

export type BannerTone = 'warn' | 'info' | 'ok';

/**
 * The one way this app reports something going wrong.
 *
 * It is inline and dismissible on purpose. The alternative — `alert()` — puts
 * a system modal over the whole screen titled with the device's IP address
 * ("192.168.4.1 says: …"), blocks every other control until it is dismissed,
 * and shows the raw exception text. Mid-shoot that is worse than the failure
 * it reports.
 *
 * `children` carries the buttons for the confirmation variants (import,
 * discard, delete), so a confirmation reads as one block instead of a message
 * with orphaned controls under it.
 */
export function Banner({
  tone = 'warn',
  message,
  onDismiss,
  children,
}: {
  tone?: BannerTone;
  message: UserMessage;
  onDismiss?: () => void;
  children?: ComponentChildren;
}) {
  return (
    <div class={`banner banner-${tone}`} role="status">
      <div class="banner-title">{message.title}</div>
      <div class="banner-detail">{message.detail}</div>
      {children}
      {onDismiss && (
        <button type="button" class="banner-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
