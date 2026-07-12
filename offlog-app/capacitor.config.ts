import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.offlog.app',
  appName: 'Offlog',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
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
      iconColor: '#5457e0',
    },
  },
};

export default config;
