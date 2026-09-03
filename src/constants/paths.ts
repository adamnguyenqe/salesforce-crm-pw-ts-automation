/**
 * Resolves the browser-scoped storageState file path.
 *
 * @param browser - Browser key (e.g. 'chromium', 'webkit')
 * @returns Relative path to that browser's storageState file
 */
export const savedLoginFile = (browser: string): string => `.auth/storageState.${browser}.json`;
