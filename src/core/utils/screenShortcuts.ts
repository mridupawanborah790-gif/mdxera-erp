export const setActiveScreenScope = (screenId: string) => {
  if (typeof document === 'undefined') return;
  document.body.dataset.activeScreen = screenId;
};

const getActiveScreenScope = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  return document.body.dataset.activeScreen;
};

export const getFocusedElement = (): Element | null => {
  if (typeof document === 'undefined') return null;
  return document.activeElement;
};

export const isEditableElement = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
};

interface ScreenShortcutGuardOptions {
  allowWhenInputFocused?: boolean;
  allowedKeysWhenInputFocused?: string[];
}

export const shouldHandleScreenShortcut = (
  event: KeyboardEvent,
  screenId: string | string[],
  options: ScreenShortcutGuardOptions = {}
): boolean => {
  if (event.defaultPrevented || event.isComposing) return false;

  const activeScreen = getActiveScreenScope();
  const scopes = Array.isArray(screenId) ? screenId : [screenId];
  if (!activeScreen || !scopes.includes(activeScreen)) return false;

  const focusedElement = getFocusedElement();
  if (!isEditableElement(focusedElement)) return true;

  if (options.allowWhenInputFocused) return true;

  return (options.allowedKeysWhenInputFocused || []).includes(event.key);
};
