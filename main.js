const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  session,
  desktopCapturer,
  ipcMain,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const {
  synthesizeEdgeTts,
  resolveVoiceForLocale,
  normalizeLocale,
} = require('./tts');

// Quando o AppImage é aberto pelo gerenciador de arquivos, stdout/stderr podem
// virar um pipe sem leitor. Um console.log nessa situação lança "write EPIPE"
// e derruba o processo principal. Silencia qualquer falha de escrita.
for (const stream of [process.stdout, process.stderr]) {
  try { stream?.on?.('error', () => {}); } catch (_) {}
}
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level]?.bind(console);
  if (!original) continue;
  console[level] = (...args) => {
    try { original(...args); } catch (_) {}
  };
}

let venmic = null;
let venmicReady = false;
function getVenmic() {
  if (venmicReady) return venmic;
  venmicReady = true;
  try {
    const base = __dirname.replace('app.asar', 'app.asar.unpacked');
    const prebuild = path.join(base, 'node_modules', '@vencord', 'venmic', 'prebuilds', `venmic-addon-linux-${process.arch}`, 'node-napi-v7.node');
    const mod = require(fs.existsSync(prebuild) ? prebuild : '@vencord/venmic');
    const PatchBay = mod.PatchBay || mod.default?.PatchBay;
    if (PatchBay) venmic = new PatchBay();
  } catch (e) {
    console.error('[venmic] failed to load:', e);
  }
  return venmic;
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const START_URL = process.env.NERIMITY_URL || 'https://nerimity.com/register';
const APP_NAME = 'Nerimity';
const ALLOWED_HOSTS = ['nerimity.com', 'www.nerimity.com'];

const ICON_DIR = path.join(__dirname, 'build', 'icons');
const iconPath = path.join(ICON_DIR, '512x512.png');
const notificationIconPath = path.join(ICON_DIR, 'notification-512.png');

// Diretório de dados exclusivo (evita conflito com o app Nerimity oficial)
const userDataDir = path.join(app.getPath('appData'), 'nerimity-webapp');
app.setPath('userData', userDataDir);

// Lock compartilhado entre o AppImage e o Flatpak: evita abrir duas cópias
// do nosso app ao mesmo tempo (o app oficial usa outro diretório e não é afetado).
const sharedLockFile = path.join(
  process.env.FLATPAK_ID
    ? path.join('/home', process.env.USER || 'user')
    : require('os').homedir(),
  '.config',
  'nerimity-webapp-instance.lock'
);

function acquireSharedLock() {
  try {
    if (fs.existsSync(sharedLockFile)) {
      const pid = parseInt(fs.readFileSync(sharedLockFile, 'utf8').trim(), 10);
      if (pid && pid !== process.pid) {
        process.kill(pid, 0); // ainda vivo?
        return false;
      }
    }
  } catch (_) {
    // lock órfão: assume a propriedade
  }
  try {
    fs.mkdirSync(path.dirname(sharedLockFile), { recursive: true });
    fs.writeFileSync(sharedLockFile, String(process.pid));
  } catch (error) {
    console.error('[lock] failed to write:', error);
  }
  return true;
}

function releaseSharedLock() {
  try {
    const pid = parseInt(fs.readFileSync(sharedLockFile, 'utf8').trim(), 10);
    if (pid === process.pid) fs.unlinkSync(sharedLockFile);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Wayland / X11: escolhe a plataforma Ozone explicitamente.
// A captura de tela usa desktopCapturer (portais no Wayland, XComposite no X11).
// ---------------------------------------------------------------------------
const isWayland =
  Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === 'wayland';
if (isWayland) {
  app.commandLine.appendSwitch('ozone-platform', 'wayland');
} else if (process.env.DISPLAY) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

// Reduz sinais de automação que fazem o Cloudflare Turnstile travar.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Cache de disco maior para acelerar recarregamentos de assets estáticos.
app.commandLine.appendSwitch('disk-cache-size', String(512 * 1024 * 1024));

// ---------------------------------------------------------------------------
// Configurações persistidas em JSON simples (sem dependências extras)
// ---------------------------------------------------------------------------
const settingsFile = path.join(userDataDir, 'settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    return {};
  }
}

function getSetting(key, fallback) {
  const value = readSettings()[key];
  return value === undefined ? fallback : value;
}

function setSetting(key, value) {
  const data = readSettings();
  data[key] = value;
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
}

// Precisa ser chamado antes do app ficar pronto
if (getSetting('hardwareAccelerationDisabled', false)) {
  app.disableHardwareAcceleration();
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
let mainWindow = null;
let tray = null;
let isQuitting = false;

// Fontes de captura de tela
let availableCaptureSources = [];
let selectedCaptureSource = null;

let didNavigateSuccessfully = false;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
function isInternalUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return ALLOWED_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function applyAutostart() {
  // Dentro do Flatpak o caminho do executável é interno ao sandbox;
  // o autostart deve ser feito pelo portal/desktop entry, não por aqui.
  if (process.env.FLATPAK_ID) return;

  const enabled = getSetting('autostart', true);
  const minimized = getSetting('autostartMinimized', true);
  app.setLoginItemSettings({
    enabled,
    openAtLogin: enabled,
    openAsHidden: minimized,
    path: app.getPath('exe'),
    args: minimized ? ['--hidden'] : [],
  });
}

// ---------------------------------------------------------------------------
// Compartilhamento de tela
// ---------------------------------------------------------------------------
function setupDisplayMedia(webContentsSession) {
  // useSystemPicker do Electron é macOS 15+ (experimental). No Wayland o
  // seletor do dono da sessão é aberto por desktopCapturer.getSources().
  console.log('[display-media] instalando handler', { isWayland });
  // Permite câmera para o stream composto e mantém copiar/colar funcionando.
  const allowedPermissions = new Set([
    'media',
    'display-capture',
    'clipboard-read',
    'clipboard-write',
    'clipboard-sanitized-write',
  ]);
  webContentsSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
  webContentsSession.setDisplayMediaRequestHandler(async (request, callback) => {
    console.log('[display-media] request', {
      video: request.videoRequested,
      audio: request.audioRequested,
      userGesture: request.userGesture,
      isWayland,
    });
    if (displayMediaInProgress) {
      console.warn('[display-media] ignorando request duplicada');
      try { callback(null); } catch (_) {}
      return;
    }
    displayMediaInProgress = true;
    try {
      cachedSourcesPayload = [];
      cachedSourcesRaw = [];
      cachedSourcesAt = 0;

      const preselected = selectedCaptureSource;
      selectedCaptureSource = null;
      availableCaptureSources = [];

      let video = preselected && preselected.id !== 'native-picker' ? preselected : null;

      if (!video) {
        // Abre o portal/seletor nativo uma única vez por solicitação.
        console.log('[display-media] abrindo seletor via desktopCapturer.getSources');
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 0, height: 0 },
        });
        console.log('[display-media] fontes retornadas:', sources.length);
        video = sources[0] || null;
      } else {
        console.log('[display-media] usando fonte preselecionada:', video.name);
      }

      if (!video) {
        try { callback(null); } catch (_) {}
        return;
      }

      let audio = false;
      if (request.audioRequested && !isWayland) {
        // No Wayland o áudio é escolhido depois do portal, pelo popup do
        // venmic na página; o portal não fornece loopback confiável.
        // Se nada for escolhido, o wrapper remove as tracks de áudio.
        const mode = getSetting('screenShareAudioMode', 'full');
        if (mode !== 'off' && mode !== 'silent') audio = 'loopback';
      }
      try {
        callback({ video, audio });
      } catch (cbErr) {
        console.error('[display-media] callback com audio falhou, tentando sem audio:', cbErr);
        try { callback({ video, audio: false }); } catch (_) {}
      }
    } catch (error) {
      console.error('[display-media] falha ao compartilhar:', error);
      try { callback(null); } catch (_) {}
    } finally {
      setTimeout(() => { displayMediaInProgress = false; }, 1500);
    }
  });
}

let cachedSourcesPayload = [];
let cachedSourcesRaw = [];
let cachedSourcesAt = 0;
let displayMediaInProgress = false;

async function listCaptureSources() {
  const useNativePicker = isWayland && getSetting('nativeScreenPicker', true);
  // No Wayland, getSources abre o portal: não chamar aqui para evitar spam.
  // O portal real abre apenas no handler de compartilhamento.
  if (useNativePicker) {
    const placeholder = {
      id: 'native-picker',
      name: 'Wayland screen/window picker',
      thumbnail: '',
    };
    availableCaptureSources = [];
    return [placeholder];
  }

  if (cachedSourcesPayload.length && Date.now() - cachedSourcesAt < 60000) {
    availableCaptureSources = cachedSourcesRaw;
    return cachedSourcesPayload;
  }
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 400, height: 400 },
      fetchWindowIcons: process.platform === 'win32' || process.platform === 'darwin',
    });
    availableCaptureSources = sources;
    cachedSourcesRaw = sources;
    cachedSourcesPayload = sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailUrl: source.thumbnail.toDataURL(),
    }));
    cachedSourcesAt = Date.now();
    return cachedSourcesPayload;
  } catch (error) {
    console.error('[desktop-capturer] falha ao listar fontes:', error);
    // No Wayland, a primeira chamada pode falhar enquanto o portal é iniciado.
    return cachedSourcesPayload;
  }
}

// ---------------------------------------------------------------------------
// Janela principal
// ---------------------------------------------------------------------------
function createWindow() {
  const startMinimized = process.argv.includes('--hidden');
  const customTitlebarDisabled = getSetting('customTitlebarDisabled', false);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 400,
    center: true,
    frame: customTitlebarDisabled,
    autoHideMenuBar: true,
    backgroundColor: '#131416',
    icon: iconPath,
    title: APP_NAME,
    show: !startMinimized,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  setupDisplayMedia(mainWindow.webContents.session);

  // Controles nativos de vídeo entram em fullscreen sem avisar a página via
  // requestFullscreen()/fullscreenchange. Avisamos o renderer para abrir o
  // nosso player de tela cheia com os controles do app.
  mainWindow.webContents.on('enter-html-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('neri-native-fullscreen');
    }
  });

  // Tema "vanilla" + recursos extras injetados na página
  const injectDir = path.join(__dirname, 'injected');
  const themeCssPath = path.join(injectDir, 'vanilla-theme.css');
  const extrasJsPath = path.join(injectDir, 'enhancements.js');
  const themeCss = fs.existsSync(themeCssPath)
    ? fs.readFileSync(themeCssPath, 'utf8')
    : '';
  const extrasJs = fs.existsSync(extrasJsPath)
    ? fs.readFileSync(extrasJsPath, 'utf8')
    : '';
  mainWindow.webContents.on('dom-ready', () => {
    if (themeCss) {
      mainWindow.webContents.insertCSS(themeCss).catch((error) =>
        console.error('[theme] falha ao injetar CSS:', error)
      );
    }
    if (extrasJs) {
      mainWindow.webContents.executeJavaScript(extrasJs).catch((error) =>
        console.error('[extras] falha ao injetar script:', error)
      );
    }
  });

  // Cache leve de metadados (canais/servidores) para acelerar abertura.
  // Não faz cache de conteúdo de conversas/mensagens.
  const apiCacheFilter = { urls: ['*://nerimity.com/api/*', '*://*.nerimity.com/api/*', '*://cdn.nerimity.com/*'] };
  mainWindow.webContents.session.webRequest.onHeadersReceived(apiCacheFilter, (details, callback) => {
    try {
      const headers = details.responseHeaders || {};
      const url = details.url || '';
      const isGet = details.method === 'GET';
      const isMessageContent = /\/messages(\/|\?|$)|\/posts(\/|\?|$)|\/typing(\/|\?|$)|\/read(\/|\?|$)/i.test(url);
      const isChannelMeta = /\/channels(\/|\?|$)|\/servers(\/|\?|$)|\/users(\/|\?|$)|\/inbox(\/|\?|$)|\/friends(\/|\?|$)/i.test(url);
      if (isGet && !isMessageContent && (isChannelMeta || url.includes('cdn.nerimity.com'))) {
        // remove cabeçalhos que impedem cache e aplica TTL curto
        Object.keys(headers).forEach((k) => {
          if (/^cache-control$/i.test(k) || /^pragma$/i.test(k) || /^expires$/i.test(k)) delete headers[k];
        });
        headers['Cache-Control'] = ['private, max-age=120, stale-while-revalidate=600'];
      }
      callback({ responseHeaders: headers });
    } catch (_) {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  // Corrige CORS dos anexos hospedados no Google Drive (como no app oficial)
  const driveFilter = {
    urls: ['https://drive.usercontent.google.com/*', 'https://drive.google.com/*'],
  };
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    driveFilter,
    (details, callback) => {
      if (details.requestHeaders) {
        [
          'Sec-Fetch-Mode',
          'Sec-Fetch-Site',
          'Sec-Ch-Ua',
          'Sec-Ch-Ua-Mobile',
          'Sec-Ch-Ua-Platform',
          'Sec-Fetch-Dest',
          'Origin',
        ].forEach((header) => delete details.requestHeaders[header]);
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    driveFilter,
    (details, callback) => {
      if (details.responseHeaders) {
        if (!details.url.startsWith('https://drive.usercontent.google.com')) {
          details.responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        }
        delete details.responseHeaders['Origin'];
      }
      callback({ responseHeaders: details.responseHeaders });
    }
  );

  registerIpcHandlers();

  mainWindow.webContents.on('did-navigate', () => {
    didNavigateSuccessfully = true;
  });
  mainWindow.webContents.on('did-fail-load', () => {
    if (didNavigateSuccessfully) return;
    console.log('Falha ao carregar; tentando novamente em 5s...');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(START_URL).catch(() => {});
      }
    }, 5000);
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    mainWindow.webContents.send('spellcheck', params.dictionarySuggestions);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!startMinimized) revealMainWindow();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(START_URL).catch((error) => {
    console.error('Falha ao carregar URL inicial:', error);
  });
}

// ---------------------------------------------------------------------------
// Recursos extras: gravação, soundboard e integração com o Soundux
// ---------------------------------------------------------------------------
const AUDIO_EXTENSIONS = /\.(mp3|wav|flac|ogg|m4a|opus|aac)$/i;

function audioMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.opus': 'audio/ogg',
      '.aac': 'audio/aac',
    }[ext] || 'audio/mpeg'
  );
}

function listAudioFiles(folder) {
  try {
    return fs
      .readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(folder, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } catch (error) {
    console.error('[soundboard] falha ao listar pasta:', error);
    return [];
  }
}

function hostArgs(args) {
  return process.env.FLATPAK_ID ? ['flatpak-spawn', '--host', ...args] : args;
}

function runOnHost(args, options = {}) {
  const command = hostArgs(args);
  return spawnSync(command[0], command.slice(1), {
    encoding: 'utf8',
    timeout: 15000,
    ...options,
  });
}

// Toca um buffer de áudio (MP3) usando o player disponível no host.
// Os bytes vão pelo stdin: funciona dentro do Flatpak sem depender de
// caminhos de /tmp compartilhados com o host.
async function playAudioBuffer(buffer) {
  const candidates = [
    ['pw-play', ['-']],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'error', '-']],
    ['mpv', ['--no-video', '--really-quiet', '-']],
    ['paplay', []],
    ['aplay', []],
  ];
  let lastError = 'no audio player available';
  for (const [cmd, args] of candidates) {
    const result = await new Promise((resolve) => {
      const command = hostArgs([cmd, ...args]);
      let child;
      try {
        child = spawn(command[0], command.slice(1), {
          stdio: ['pipe', 'ignore', 'pipe'],
        });
      } catch (error) {
        resolve({ ok: false, error: String(error.message || error) });
        return;
      }
      let stderr = '';
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) {}
        resolve({ ok: false, error: `${cmd}: timeout` });
      }, 60000);
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ ok: false, error: String(error.message || error) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(
          code === 0
            ? { ok: true, player: cmd }
            : { ok: false, error: (stderr || `${cmd} exited with ${code}`).slice(0, 200) }
        );
      });
      // Evita EPIPE se o player encerrar antes de consumir tudo.
      child.stdin?.on('error', () => {});
      try {
        child.stdin?.end(buffer);
      } catch (error) {
        clearTimeout(timer);
        resolve({ ok: false, error: String(error.message || error) });
      }
    });
    if (result.ok) return result;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}

function openSoundux(folder) {
  try {
    const config = {
      data: {
        tabs: [
          {
            id: 0,
            name: path.basename(folder) || 'Audios',
            path: folder,
            sounds: [],
            sortMode: 1,
          },
        ],
        width: 1280,
        height: 720,
        soundIdCounter: 0,
      },
      settings: {
        audioBackend: 2, // PipeWire
        viewMode: 0,
        theme: 0,
        language: null,
        outputs: [],
        selectedTab: 0,
        localVolume: 70,
        remoteVolume: 100,
        allowMultipleOutputs: false,
        useAsDefaultDevice: false,
        muteDuringPlayback: false,
        allowOverlapping: true,
        minimizeToTray: true,
        tabHotkeysOnly: false,
        deleteToTrash: true,
        pushToTalkKeys: [],
        stopHotkey: [],
      },
    };

    // Permite que o Soundux (Flatpak) leia a pasta escolhida.
    runOnHost([
      'flatpak',
      'override',
      '--user',
      '--filesystem=' + folder,
      'io.github.Soundux',
    ]);
    runOnHost(['flatpak', 'kill', 'io.github.Soundux']);

    const writeScript =
      'mkdir -p "$HOME/.var/app/io.github.Soundux/config/Soundux" && ' +
      'cat > "$HOME/.var/app/io.github.Soundux/config/Soundux/config.json"';
    const written = runOnHost(['sh', '-c', writeScript], {
      input: JSON.stringify(config),
    });
    if (written.error || written.status !== 0) {
      throw written.error || new Error(written.stderr || 'falha ao escrever config');
    }

    const command = hostArgs(['flatpak', 'run', 'io.github.Soundux']);
    const child = spawn(command[0], command.slice(1), {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    console.error('[soundux] falha ao abrir:', error);
    return { ok: false, error: String(error.message || error) };
  }
}

function registerIpcHandlers() {
  // Evita registrar duas vezes ao recriar a janela
  if (registerIpcHandlers.done) return;
  registerIpcHandlers.done = true;

  ipcMain.handle('get-app-version', () => app.getVersion());

  // Controles da janela (usados pela barra de título customizada do site)
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-toggle-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window-close', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      }, 150);
      return;
    }
    mainWindow.hide();
  });
  ipcMain.on('window-toggle-fullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  ipcMain.on('window-set-fullscreen', (_event, value) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setFullScreen(!!value);
  });

  // Configurações
  ipcMain.handle('get-autostart', () => getSetting('autostart', true));
  ipcMain.on('set-autostart', (_e, value) => {
    setSetting('autostart', !!value);
    applyAutostart();
  });
  ipcMain.handle('get-autostart-minimized', () => getSetting('autostartMinimized', true));
  ipcMain.on('set-autostart-minimized', (_e, value) => {
    setSetting('autostartMinimized', !!value);
    applyAutostart();
  });
  ipcMain.handle('get-hw-acceleration-disabled', () =>
    getSetting('hardwareAccelerationDisabled', false)
  );
  ipcMain.on('set-hw-acceleration-disabled', (_e, value) =>
    setSetting('hardwareAccelerationDisabled', !!value)
  );
  ipcMain.handle('get-custom-titlebar-disabled', () =>
    getSetting('customTitlebarDisabled', false)
  );
  ipcMain.on('set-custom-titlebar-disabled', (_e, value) =>
    setSetting('customTitlebarDisabled', !!value)
  );

  // Ícone de notificação na bandeja
  ipcMain.on('set-notification', (_e, value, count) => {
    if (!tray) return;
    const imagePath = value && fs.existsSync(notificationIconPath)
      ? notificationIconPath
      : iconPath;
    tray.setImage(nativeImage.createFromPath(imagePath).resize({ width: 24, height: 24 }));
    tray.setToolTip(value ? `${APP_NAME} — ${count || ''} notifications` : APP_NAME);
  });

  // Compartilhamento de tela
  ipcMain.handle('get-desktop-capture-sources', () => listCaptureSources());
  ipcMain.handle('set-desktop-capture-source-id', (_e, id) => {
    selectedCaptureSource = availableCaptureSources.find((s) => s.id === id) || null;
    return true;
  });

  // Recursos extras ---------------------------------------------------------
  ipcMain.handle('extra-is-wayland', () =>
    isWayland && getSetting('nativeScreenPicker', true)
  );
  ipcMain.handle('extra-get-setting', (_e, key, fallback) => getSetting(key, fallback));
  ipcMain.on('extra-set-setting', (_e, key, value) => setSetting(key, value));

  // Abre a página atual no navegador padrão (necessário para o challenge do
  // Cloudflare, que o Electron não consegue concluir).
  ipcMain.handle('extra-open-external', async (_e, rawUrl) => {
    try {
      const url = new URL(String(rawUrl));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      await shell.openExternal(url.href);
      return true;
    } catch (_) {
      return false;
    }
  });

  ipcMain.handle('extra-choose-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Audio folder for the call',
      properties: ['openDirectory'],
    });
    return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
  });

  ipcMain.handle('extra-list-audio-files', (_e, folder) => listAudioFiles(folder));

  ipcMain.handle('extra-read-audio-file', (_e, filePath) => {
    try {
      return `data:${audioMime(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
    } catch (error) {
      console.error('[soundboard] falha ao ler arquivo:', error);
      return '';
    }
  });

  ipcMain.handle('extra-open-soundux', (_e, folder) => openSoundux(folder));

  const runCmd = (cmd, args, timeout = 10000) => {
    try {
      const command = hostArgs([cmd, ...args]);
      const r = spawnSync(command[0], command.slice(1), { encoding: 'utf8', timeout });
      return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
    } catch (e) { return { ok: false, out: '', err: String(e.message || e), status: -1 }; }
  };

  ipcMain.handle('extra-open-qpwgraph', async () => {
    try {
      const command = hostArgs(['qpwgraph']);
      const p = spawn(command[0], command.slice(1), { detached: true, stdio: 'ignore' });
      p.unref();
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  });

  let pwIsolateTimer = null;
  const getNerimityOutputIds = () => {
    const dump = runCmd('pw-dump', []);
    if (!dump.ok) return [];
    try {
      const objs = JSON.parse(dump.out || '[]');
      return objs.filter(o => {
        const p = o?.info?.props || {};
        return p['media.class'] === 'Stream/Output/Audio' && /nerimity|electron/i.test((p['application.name'] || '') + ' ' + (p['node.name'] || ''));
      }).map(o => o.id);
    } catch (_) { return []; }
  };
  const ensureIsolatedSink = () => {
    const sinks = runCmd('pw-dump', []);
    const hasSink = sinks.ok && /nerimity_isolated/.test(sinks.out);
    if (!hasSink) {
      const cr = runCmd('pactl', ['load-module', 'module-null-sink', 'sink_name=nerimity_isolated', 'sink_properties=device.description=NerimityIsolated']);
      if (!cr.ok) console.log('[pipewire] load-module falhou:', cr.err);
    }
  };
  const moveNerimityOutputs = (target) => {
    const ids = getNerimityOutputIds();
    const moved = [];
    for (const id of ids) {
      const r = runCmd('wpctl', ['move', String(id), String(target)]);
      moved.push({ id, ok: r.ok, err: r.err });
    }
    return { moved, count: ids.length };
  };

  ipcMain.handle('extra-pipewire-isolate', async (_e, enable) => {
    try {
      if (enable) {
        ensureIsolatedSink();
        const res = moveNerimityOutputs('nerimity_isolated');
        if (pwIsolateTimer) clearInterval(pwIsolateTimer);
        pwIsolateTimer = setInterval(() => {
          try { ensureIsolatedSink(); moveNerimityOutputs('nerimity_isolated'); } catch (_) {}
        }, 3000);
        return { ok: true, enabled: true, ...res };
      } else {
        if (pwIsolateTimer) { clearInterval(pwIsolateTimer); pwIsolateTimer = null; }
        const res = moveNerimityOutputs('@DEFAULT_AUDIO_SINK@');
        return { ok: true, enabled: false, ...res };
      }
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('extra-venmic-list', async () => {
    try {
      const v = getVenmic();
      if (!v) return { ok: false, error: 'venmic unavailable', targets: [] };
      const targets = (v.list(['application.name', 'node.name', 'media.class', 'application.process.id']) || [])
        .filter((t) => String(t['application.process.id'] || '') !== String(process.pid))
        .filter((t) => !/nerimity/i.test(String(t['application.name'] || '')));
      return { ok: true, targets };
    } catch (e) { return { ok: false, error: String(e.message || e), targets: [] }; }
  });
  ipcMain.handle('extra-venmic-start', async (_e, include) => {
    try {
      const v = getVenmic();
      if (!v) return { ok: false, error: 'venmic unavailable' };
      const pid = String(process.pid);
      v.link({
        include: Array.isArray(include) ? include : [],
        exclude: [{ 'application.process.id': pid }, { 'media.class': 'Stream/Input/Audio' }],
        ignore_devices: true,
        only_speakers: true,
        only_default_speakers: false,
      });
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  });
  ipcMain.handle('extra-venmic-stop', async () => {
    try { const v = getVenmic(); if (v) v.unlink(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  });

  ipcMain.handle('extra-tts-speak', async (_e, payload) => {
    const opts = typeof payload === 'string' ? { text: payload } : (payload || {});
    const safe = String(opts.text || '').slice(0, 500).trim();
    if (!safe) return { ok: false, error: 'empty' };

    const rate = Math.max(0.7, Math.min(1.6, Number(opts.rate) || 1));
    const pct = Math.round((rate - 1) * 100);
    const rateStr = `${pct >= 0 ? '+' : ''}${pct}%`;
    const pitchValue = Number(opts.pitch);
    const pitchHz = Number.isFinite(pitchValue)
      ? Math.round((pitchValue - 50) / 5)
      : 0;
    const pitchStr = `${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz`;

    // Prioridade: voz escolhida no painel > idioma do Nerimity > idioma do sistema.
    const voiceOverride = String(
      opts.voice || getSetting('ttsVoice', '') || ''
    ).trim();
    const configuredLocale = String(getSetting('ttsLocale', '') || '').trim();
    const locale =
      opts.language ||
      (configuredLocale && configuredLocale !== 'auto' ? configuredLocale : '') ||
      app.getLocale() ||
      process.env.LANG ||
      '';
    const voice = voiceOverride || resolveVoiceForLocale(locale);

    try {
      const mp3 = await synthesizeEdgeTts({
        text: safe,
        voice,
        rate: rateStr,
        pitch: pitchStr,
        timeoutMs: 30000,
      });
      if (!mp3 || !mp3.length) {
        return { ok: false, error: 'service returned no audio' };
      }

      const played = await playAudioBuffer(mp3);
      if (!played.ok) {
        return {
          ok: false,
          error: `audio generated, but no player worked: ${played.error}`,
          backend: `edge-tts/${voice}`,
        };
      }
      return {
        ok: true,
        backend: `edge-tts/${voice}`,
        voice,
        locale: normalizeLocale(locale),
        player: played.player,
      };
    } catch (error) {
      return {
        ok: false,
        error: String(error?.message || error).slice(0, 300),
        voice,
      };
    }
  });

  // Atividade/RPC: recursos de terceiros, mantidos como no-op seguro no Linux
  ipcMain.handle('get-running-programs', async () => []);
  ipcMain.on('restart-activity-status', () => {});
  ipcMain.on('restart-rpc-server', () => {});

  // Áudio loopback: implementação oficial é Windows-only
  const loopbackNoop = () => {};
  ipcMain.on('app-loopback-start', loopbackNoop);
  ipcMain.on('app-loopback-start-v2', loopbackNoop);
  ipcMain.on('app-loopback-reset', loopbackNoop);

  // Atalhos globais (no-op: o site lida com teclado quando não há listener nativo)
  ipcMain.on('start-global-key-listener', () => {});
  ipcMain.on('stop-global-key-listener', () => {});

  ipcMain.on('relaunch-app', () => {
    isQuitting = true;
    app.relaunch();
    app.exit();
  });

  ipcMain.on('replace-misspelling', (_e, word) =>
    mainWindow?.webContents.replaceMisspelling(word)
  );
  ipcMain.on('clipboard-actions', (_e, action) => {
    const wc = mainWindow?.webContents;
    if (!wc) return;
    if (action === 'copy') wc.copy();
    if (action === 'cut') wc.cut();
    if (action === 'paste') wc.paste();
  });
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------
// No X11, uma janela que volta de hide() pode aparecer sem conteúdo até o
// próximo evento de input. Forçar um repaint imediato e outro logo após o
// mapeamento evita o "quadro preto" ao reabrir pelo tray.
function repaintMainWindow() {
  const win = mainWindow;
  const invalidate = () => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    try { win.webContents.invalidate(); } catch (_) {}
  };
  invalidate();
  setTimeout(invalidate, 150);
}

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  // No X11/KDE, focus() pode não trazer a janela à frente quando ela volta do
  // tray. moveTop() garante que ela fique visível acima das outras janelas.
  try { mainWindow.moveTop(); } catch (_) {}
  repaintMainWindow();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    revealMainWindow();
  }
}

function createTray() {
  const trayIcon = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 24, height: 24 });
  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);
  tray.setIgnoreDoubleClickEvents(true);

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar / Ocultar', click: toggleWindow },
      { type: 'separator' },
      {
        label: 'Recarregar',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload();
            revealMainWindow();
          } else {
            createWindow();
          }
        },
      },
      {
        label: 'Abrir no navegador',
        click: () => shell.openExternal(START_URL),
      },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );

  tray.on('click', toggleWindow);
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock() && acquireSharedLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    revealMainWindow();
  });

  app.whenReady().then(() => {
    // User-Agent sem o token "Electron" para compatibilidade com o site
    session.defaultSession.setUserAgent(
      session.defaultSession.getUserAgent().replace(/\sElectron\/[\d.]+/, '')
    );

    applyAutostart();
    createTray();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else toggleWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // Permanece na bandeja
});

app.on('before-quit', () => {
  isQuitting = true;
  releaseSharedLock();
});
