// Preload que expõe a API nativa esperada pelo site do Nerimity.
// Espelha o WindowAPI do app oficial para que recursos como compartilhamento
// de tela, barra de título customizada e notificações funcionem.
const { contextBridge, ipcRenderer } = require('electron');

const listener = (channel) => (callback) => {
  if (typeof callback !== 'function') return () => {};
  const wrapped = (_event, value) => callback(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('WindowAPI', {
  isElectron: true,

  // versão / janela
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  minimize: () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  setFullscreen: (value) => ipcRenderer.send('window-set-fullscreen', value),
  close: () => ipcRenderer.send('window-close'),

  // configurações
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (value) => ipcRenderer.send('set-autostart', value),
  getAutostartMinimized: () => ipcRenderer.invoke('get-autostart-minimized'),
  setAutostartMinimized: (value) =>
    ipcRenderer.send('set-autostart-minimized', value),
  getHardwareAccelerationDisabled: () =>
    ipcRenderer.invoke('get-hw-acceleration-disabled'),
  setHardwareAccelerationDisabled: (value) =>
    ipcRenderer.send('set-hw-acceleration-disabled', value),
  getCustomTitlebarDisabled: () =>
    ipcRenderer.invoke('get-custom-titlebar-disabled'),
  setCustomTitlebarDisabled: (value) =>
    ipcRenderer.send('set-custom-titlebar-disabled', value),

  // notificações (troca o ícone da bandeja)
  setNotification: (value, count) =>
    ipcRenderer.send('set-notification', value, count),

  // ---- COMPARTILHAMENTO DE TELA (Wayland + X11) ----
  // O site lista as fontes aqui, mostra seu próprio seletor e depois chama
  // setDesktopCaptureSourceId antes de navigator.mediaDevices.getDisplayMedia().
  getDesktopCaptureSources: () => ipcRenderer.invoke('get-desktop-capture-sources'),
  setDesktopCaptureSourceId: (id) =>
    ipcRenderer.invoke('set-desktop-capture-source-id', id),

  // atividade / RPC (no-ops seguros no Linux)
  getRunningPrograms: (ignored) => ipcRenderer.invoke('get-running-programs', ignored),
  restartActivityStatus: (programs) =>
    ipcRenderer.send('restart-activity-status', programs),
  restartRPCServer: () => ipcRenderer.send('restart-rpc-server'),
  rpcChanged: listener('rpc-changed'),
  activityStatusChanged: listener('activity-status-changed'),

  // atalhos globais
  onGlobalKey: listener('global-key'),
  startGlobalKeyListener: () => ipcRenderer.send('start-global-key-listener'),
  stopGlobalKeyListener: () => ipcRenderer.send('stop-global-key-listener'),

  relaunchApp: () => ipcRenderer.send('relaunch-app'),

  // correção ortográfica / clipboard
  replaceMisspelling: (word) => ipcRenderer.send('replace-misspelling', word),
  onSpellcheck: listener('spellcheck'),
  clipboardPaste: () => ipcRenderer.send('clipboard-actions', 'paste'),
  clipboardCut: () => ipcRenderer.send('clipboard-actions', 'cut'),
  clipboardCopy: () => ipcRenderer.send('clipboard-actions', 'copy'),

  // loopback de áudio (recurso nativo no Windows; no-op no Linux)
  appLoopbackStart: (id) => ipcRenderer.send('app-loopback-start', id),
  appLoopbackStartV2: (opts) => ipcRenderer.send('app-loopback-start-v2', opts),
  appLoopbackReset: () => ipcRenderer.send('app-loopback-reset'),
  appLoopbackData: listener('app-loopback-data'),
});

// API exclusiva dos recursos adicionais (não faz parte do WindowAPI oficial).
contextBridge.exposeInMainWorld('NeriExtras', {
  isWayland: () => ipcRenderer.invoke('extra-is-wayland'),
  getSetting: (key, fallback) => ipcRenderer.invoke('extra-get-setting', key, fallback),
  setSetting: (key, value) => ipcRenderer.send('extra-set-setting', key, value),
  openExternal: (url) => ipcRenderer.invoke('extra-open-external', url),
  chooseAudioFolder: () => ipcRenderer.invoke('extra-choose-folder'),
  listAudioFiles: (folder) => ipcRenderer.invoke('extra-list-audio-files', folder),
  readAudioFile: (filePath) => ipcRenderer.invoke('extra-read-audio-file', filePath),
  openSoundux: (folder) => ipcRenderer.invoke('extra-open-soundux', folder),
  ttsSpeak: (text) => ipcRenderer.invoke('extra-tts-speak', text),
  openQpwgraph: () => ipcRenderer.invoke('extra-open-qpwgraph'),
  pipewireIsolate: (enable) => ipcRenderer.invoke('extra-pipewire-isolate', enable),
  venmicList: () => ipcRenderer.invoke('extra-venmic-list'),
  venmicStart: (include) => ipcRenderer.invoke('extra-venmic-start', include),
  venmicStop: () => ipcRenderer.invoke('extra-venmic-stop'),
  // O fullscreen nativo dos controles do <video> não passa pelo JavaScript da
  // página. O processo principal avisa quando o Electron entra nesse modo.
  onNativeFullscreen: listener('neri-native-fullscreen'),
});
