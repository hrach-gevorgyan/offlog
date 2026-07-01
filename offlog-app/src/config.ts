// Credentials come from .env.local (git-ignored via *.local).
// The sync URL is also stored in localStorage so it can be changed in-app.

const envUrl = import.meta.env.VITE_COUCH_URL as string | undefined;
const envUser = import.meta.env.VITE_COUCH_USER as string | undefined;
const envPass = import.meta.env.VITE_COUCH_PASS as string | undefined;

export const DEFAULT_SYNC_URL = envUrl ?? 'http://192.168.27.200:5984/offlog';
export const COUCH_USER = envUser ?? 'offlog';
export const COUCH_PASS = envPass ?? 'REDACTED_CREDENTIAL';

export function getSyncUrl(): string {
  return localStorage.getItem('offlog_sync_url') ?? DEFAULT_SYNC_URL;
}

export function setSyncUrl(url: string) {
  localStorage.setItem('offlog_sync_url', url);
}
