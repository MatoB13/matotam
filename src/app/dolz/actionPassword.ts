// The action password the sniper asks for before it moves USDC or cards. Kept only in this tab
// (memory + sessionStorage), so it is gone when the tab closes and never sits in the page URL.

const KEY = "dolz-action-password";
let memory: string | null = null;

export function getActionPassword(): string | null {
  if (memory) return memory;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActionPassword(value: string | null): void {
  memory = value || null;
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the password still lives in memory until the page reloads.
  }
}

/** Header that carries the password to the dashboard API, which forwards it to the sniper. */
export function actionHeaders(): Record<string, string> {
  const password = getActionPassword();
  return password ? { "x-dolz-password": password } : {};
}
