import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.offlog.app',
  appName: 'Offlog',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    // The WebView's colour before the first paint: the splash colour
    // (--hero-base), so launch never flashes white between the two.
    backgroundColor: '#575fca',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      // Android status bar icons must be a plain white silhouette with
      // transparency — a full-color icon (like the app launcher icon) gets
      // silently replaced by a generic system icon (the alert triangle).
      smallIcon: 'ic_stat_notify',
      iconColor: '#575fca',
    },
  },
};

export default config;
