import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yuanxing.nativeapp',
  appName: '沅興木業',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: false
  },
  server: {
    allowNavigation: ['yuanxing-v.onrender.com']
  }
};

export default config;
