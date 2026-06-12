import {
  type ComputedRef,
  type Ref,
  onBeforeUnmount,
  onMounted,
  watch,
} from "vue";

/** Matches the capture field id in GameView. */
export const RACE_CAPTURE_INPUT_ID = "race-capture-input";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(",");

export function isRaceCaptureInput(el: Element | null): boolean {
  return el instanceof HTMLElement && el.id === RACE_CAPTURE_INPUT_ID;
}

/** True when the user is intentionally using another control (not the race capture field). */
export function isInteractiveElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (isRaceCaptureInput(el)) return false;
  if (el.closest("[inert]")) return false;
  if (el.isContentEditable) return true;
  return Boolean(el.closest(INTERACTIVE_SELECTOR));
}

export function shouldDeferRaceKeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (isRaceCaptureInput(target)) return false;
  return isInteractiveElement(target);
}

export type RaceTypingCaptureOptions = {
  inputRef: Ref<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Called for race keys when focus is not on another interactive control. */
  onRaceKeydown: (e: KeyboardEvent) => void;
  /** When false, skip auto-refocus (e.g. navigating away). Defaults to true. */
  active?: Ref<boolean> | ComputedRef<boolean>;
};

/**
 * Keeps the race capture input focused during gameplay without fighting real UI controls.
 *
 * Why focus is lost today:
 * - Clicks on non-focusable regions (3D canvas, paragraph, layout) move focus to <body>.
 * - blur handlers that only check relatedTarget miss cases where relatedTarget is null.
 * - Re-renders / connection updates can run after focus was lost and never restore it.
 * - Relying only on @blur on the input misses focus moves that skip the input entirely.
 *
 * Strategy:
 * - Window capture keydown handles typing even when focus is on body/canvas (primary path).
 * - Debounced, guarded refocus when focus lands outside interactive controls.
 * - Brief suspend window after pointer/focus on buttons so clicks complete without flicker.
 */
export function useRaceTypingCapture(options: RaceTypingCaptureOptions) {
  const { inputRef, onRaceKeydown, active } = options;

  let refocusGeneration = 0;
  let refocusPending = false;
  let suspendRefocusUntil = 0;

  function isActive(): boolean {
    return active?.value !== false;
  }

  function suspendRefocus(ms = 200): void {
    suspendRefocusUntil = Date.now() + ms;
  }

  function shouldAutoFocus(): boolean {
    if (!isActive()) return false;
    if (Date.now() < suspendRefocusUntil) return false;
    const activeEl = document.activeElement;
    if (activeEl === inputRef.value) return false;
    if (isInteractiveElement(activeEl)) return false;
    return true;
  }

  function scheduleRefocus(): void {
    if (!isActive() || refocusPending) return;
    refocusPending = true;
    const generation = ++refocusGeneration;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refocusPending = false;
        if (generation !== refocusGeneration) return;
        if (!shouldAutoFocus()) return;
        const input = inputRef.value;
        if (!input || !input.isConnected) return;
        try {
          input.focus({ preventScroll: true });
        } catch {
          /* ignore — e.g. element not visible yet */
        }
      });
    });
  }

  function onWindowKeydown(e: KeyboardEvent): void {
    if (!isActive()) return;
    if (shouldDeferRaceKeys(e.target)) return;
    onRaceKeydown(e);
    if (document.activeElement !== inputRef.value) {
      scheduleRefocus();
    }
  }

  function onDocumentPointerDown(e: PointerEvent): void {
    if (!isActive()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (isInteractiveElement(target)) {
      suspendRefocus(300);
      return;
    }
    scheduleRefocus();
  }

  function onCaptureBlur(e: FocusEvent): void {
    if (!isActive()) return;
    const next = e.relatedTarget;
    if (next instanceof Element && isInteractiveElement(next)) {
      suspendRefocus(300);
      return;
    }
    scheduleRefocus();
  }

  function onDocumentFocusIn(e: FocusEvent): void {
    if (!isActive()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (isRaceCaptureInput(target)) return;
    if (isInteractiveElement(target)) {
      suspendRefocus(300);
      return;
    }
    scheduleRefocus();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      scheduleRefocus();
    }
  }

  function onPointerDownCapture(e: PointerEvent): void {
    if (!isActive()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (isRaceCaptureInput(target)) return;
    if (isInteractiveElement(target)) return;
    scheduleRefocus();
  }

  onMounted(() => {
    window.addEventListener("keydown", onWindowKeydown, true);
    document.addEventListener("focusin", onDocumentFocusIn, true);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduleRefocus();
  });

  onBeforeUnmount(() => {
    refocusGeneration += 1;
    window.removeEventListener("keydown", onWindowKeydown, true);
    document.removeEventListener("focusin", onDocumentFocusIn, true);
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  if (active) {
    watch(active, (on) => {
      if (on) scheduleRefocus();
    });
  }

  return {
    scheduleRefocus,
    suspendRefocus,
    onCaptureBlur,
    onPointerDownCapture,
    clearCaptureValue,
  };
}

export function clearCaptureValue(e: Event): void {
  const el = e.target;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = "";
  }
}
