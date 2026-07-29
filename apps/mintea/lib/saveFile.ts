import { Platform } from 'react-native';

/** Thrown when there is no way to hand the user a file on this platform. */
export class FileSaveUnsupportedError extends Error {
  constructor() {
    super('Exporting is only available in the web app right now.');
    this.name = 'FileSaveUnsupportedError';
  }
}

export const canSaveFiles = Platform.OS === 'web';

/**
 * Hands a generated file to the user.
 *
 * Web only for now. The native route needs expo-file-system to write into the
 * cache and expo-sharing to surface a share sheet, and neither is installed —
 * adding them means a native rebuild, so rather than ship a path that would
 * fail the first time someone tapped it, native says so plainly and the button
 * is disabled with an explanation.
 */
export async function saveTextFile(
  filename: string,
  contents: string,
  mimeType = 'text/csv',
): Promise<void> {
  if (!canSaveFiles) throw new FileSaveUnsupportedError();

  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
