/**
 * Global ambient type declarations for browser APIs not yet in TypeScript's
 * standard lib (as of ES2022 / DOM).
 *
 * BeforeInstallPromptEvent is a Chrome/Edge PWA API:
 * https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 *
 * NOTE: This file has NO top-level imports/exports so it is treated as a
 * script (ambient module) by TypeScript. Declarations here are globally
 * available without any import statement.
 */

interface BeforeInstallPromptEvent extends Event {
  /** Show the browser's install prompt to the user. */
  prompt(): Promise<void>;
  /**
   * Resolves after the user responds to the prompt.
   * `outcome` is "accepted" or "dismissed".
   */
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
