const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  onNewAnalysis: (callback) => ipcRenderer.on('new-analysis', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Add desktop-specific features
window.isElectron = true;
window.isDesktop = true;

// Add desktop app info
window.appInfo = {
  name: 'TrafficSense AI',
  version: '1.0.0',
  platform: navigator.platform
};
