import { isNativePlatform } from '../../config';
import { showError } from '../store';

export const REPO_URL = 'https://github.com/hrach-gevorgyan/offlog';
export const PRIVACY_URL = `${REPO_URL}/blob/main/docs/privacy.md`;

// Opens a web page in the phone's browser. Inside the Android WebView a plain
// window.open() would navigate the app itself away.
export async function openLink(url: string) {
  try {
    if (isNativePlatform()) {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      await AppLauncher.openUrl({ url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch {
    showError('Could not open the link.');
  }
}
