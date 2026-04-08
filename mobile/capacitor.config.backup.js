// Backup JavaScript version - use this if TypeScript causes issues
const config = {
  appId: 'com.trafficsense.ai',
  appName: 'TrafficSense AI',
  webDir: '../frontend',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: "launch_screen",
      useDialog: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a'
    },
    Geolocation: {
      permissions: ['location', 'locationAlways']
    },
    Network: {
      permissions: ['network']
    },
    Haptics: {
      permissions: ['vibration']
    }
  }
};

// Export for CommonJS (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
}

// Export for ES modules
if (typeof exports !== 'undefined') {
  exports.default = config;
}
