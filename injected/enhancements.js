/* Recursos adicionais injetados no site do Nerimity (roda no contexto da página). */
(() => {
  if (window.__neriExtrasLoaded) return;
  window.__neriExtrasLoaded = true;

  const API = window.NeriExtras;
  if (!API) {
    console.warn('[NeriExtras] preload API unavailable');
    return;
  }

  const state = {
    folder: '',
    files: [],
    mode: 'clean',
    cleanCtx: null,
    cleanDest: null,
    invertGain: null,
    cleanSources: new WeakMap(),
    portalSource: null,
    iconCache: new Map(),
    // TTS
    ttsEnabled: false,
    ttsMode: 'all', // 'all' | 'selected'
    ttsUsers: [], // usernames selecionados (lowercase)
    ttsVoice: '',
    ttsLocale: 'auto',
    ttsRate: 1,
    ttsEngine: 'system',
    ttsSeen: new Set(),
    ttsQueue: [],
    ttsSpeaking: false,
    ttsLastSpoken: '',
    ttsWasInCall: false,
    pwIsolated: false,
    venmicInclude: [],
    venmicEnabled: false,
    // Wayland
    isWayland: false,
    waylandPickerHandled: false,
    // Tela + câmera
    screenStream: null,
    shareVideoTrack: null,
    screenSharing: false,
    cameraOn: false,
    cameraStream: null,
    cameraTrack: null,
    cameraOverlay: false,
    composedVideoTrack: null,
    endingShare: false,
    pendingCameraOverlay: false,
    videoSenders: new Set(),
    iconSignatureCache: new Map(),
    overlaySettings: { position: 'bottom-right', opacity: 100 },
    // Volume escolhido pelo usuário nos vídeos do chat. Aplicado a todos os
    // vídeos novos e restaurado depois que um termina.
    chatVideoVolume: 1,
    chatVideoMuted: false,
    // Várias transmissões visíveis ao mesmo tempo no espaço do player nativo.
    gallery: {
      active: false,
      collecting: false,
      container: null,
      streams: new Map(),
      collectAttempts: new Map(),
      // Nomes dos participantes: o painel de voz mostra só o avatar, então
      // o nome é resolvido pelo ID do perfil e guardado em cache local.
      userNames: new Map(),
      nameRequests: new Map(),
      renderedSignature: '',
      idsSignature: '',
      // Participante que estava sendo visto em modo focado. Serve para
      // detectar o fim da transmissão e voltar sozinho para a grade.
      focusedId: '',
      // Volume/mudo da transmissão focada, salvo entre sessões.
      volume: 1,
      muted: false,
      // Depois que uma prévia é focada, o Nerimity pode reaplicar muted=true
      // ao trocar de participante. Esse estado mantém o som escolhido.
      forceAudio: false,
      nativeMuted: null,
      nativeVideo: null,
      volumeControl: null,
    },
  };

  const log = (...args) => console.log('[NeriExtras]', ...args);
  window.__neriState = state;

  function toast(message, kind = '') {
    let host = document.getElementById('neri-extras-toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'neri-extras-toasts';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'neri-extras-toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // -------------------------------------------------------------------------
  // Cloudflare: o desktop não passa na verificação. Avisa em inglês e abre a
  // mesma página no navegador do usuário para ele concluir o challenge.
  // -------------------------------------------------------------------------
  const CLOUDFLARE_NOTICE_ID = 'neri-cloudflare-notice';

  function isCloudflareChallenge() {
    try {
      if (/cdn-cgi\/challenge-platform|__cf_chl|cf_challenge/i.test(location.href)) return true;
      const title = String(document.title || '');
      const text = String(document.body?.innerText || document.body?.textContent || '').slice(0, 6000);
      const haystack = `${title} ${text}`;
      if (/just a moment|checking your browser|verify you are human|enable javascript and cookies|cloudflare ray id|attention required|cf-challenge|cf-browser-verification/i.test(haystack)) {
        return true;
      }
      const html = String(document.documentElement?.innerHTML || '').slice(0, 120000);
      return /cf-challenge|cf-browser-verification|cdn-cgi\/challenge-platform/i.test(html);
    } catch (_) {
      return false;
    }
  }

  function showCloudflareNotice() {
    if (document.getElementById(CLOUDFLARE_NOTICE_ID)) return;
    const box = document.createElement('div');
    box.id = CLOUDFLARE_NOTICE_ID;
    box.setAttribute('data-neri-extra', '1');

    const message = document.createElement('div');
    message.className = 'neri-cloudflare-message';
    const title = document.createElement('strong');
    title.textContent = 'Verification required';
    const detail = document.createElement('span');
    detail.textContent =
      'This desktop app could not pass the Cloudflare check. Please complete the verification in your browser and then return to the app.';
    message.appendChild(title);
    message.appendChild(detail);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'neri-cloudflare-open';
    button.textContent = 'Open in browser';
    button.addEventListener('click', async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      // Em uma página de erro/challenge a URL atual pode não ser http(s).
      // Nesse caso abrimos a página principal do Nerimity no navegador.
      let url = window.location.href;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          url = 'https://nerimity.com/register';
        }
      } catch (_) {
        url = 'https://nerimity.com/register';
      }

      const failed = async () => {
        try {
          await navigator.clipboard?.writeText?.(url);
          toast('Could not open your browser. Link copied — paste it in the address bar.');
        } catch (_) {
          toast(`Could not open your browser. Open this link: ${url}`);
        }
      };

      toast('Opening in your browser…');
      try {
        if (typeof API.openExternal !== 'function') {
          await failed();
          return;
        }
        const ok = await Promise.resolve(API.openExternal(url));
        if (ok === false) await failed();
        else toast('Opened in your browser.');
      } catch (_) {
        await failed();
      }
    });

    box.appendChild(message);
    box.appendChild(button);
    (document.body || document.documentElement).appendChild(box);
  }

  function checkCloudflareChallenge() {
    if (isCloudflareChallenge()) showCloudflareNotice();
  }

  // -------------------------------------------------------------------------
  // Modo "clean": cancela o áudio do próprio Nerimity na transmissão de tela.
  // -------------------------------------------------------------------------
  function ensureCleanGraph() {
    if (state.cleanCtx) return state.cleanCtx;
    state.cleanCtx = new AudioContext();
    state.cleanDest = state.cleanCtx.createMediaStreamDestination();
    state.invertGain = state.cleanCtx.createGain();
    state.invertGain.gain.value = -1;
    state.invertGain.connect(state.cleanDest);
    state.cleanCtx.resume().catch(() => {});
    return state.cleanCtx;
  }

  function registerOwnAudio(el) {
    try {
      const ctx = ensureCleanGraph();
      if (state.cleanSources.has(el)) return;
      const source = ctx.createMediaElementSource(el);
      source.connect(ctx.destination);
      source.connect(state.invertGain);
      state.cleanSources.set(el, source);
    } catch (_) {}
  }

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    registerOwnAudio(this);
    return originalPlay.apply(this, args);
  };

  function fallbackWindowFullscreen() {
    try {
      if (window.WindowAPI?.toggleFullscreen) {
        window.WindowAPI.toggleFullscreen();
        return Promise.resolve();
      }
    } catch (_) {}
    return Promise.reject();
  }

  let fullscreenToggleAt = 0;
  function triggerWindowFullscreen() {
    const now = Date.now();
    if (now - fullscreenToggleAt < 400) return;
    fullscreenToggleAt = now;
    fallbackWindowFullscreen();
  }

  // Fullscreen da janela, equivalente ao F11. Usa um IPC explícito para
  // entrar/sair sem depender de um toggle (evita duplo toggle).
  function setWindowFullscreen(value) {
    try { window.WindowAPI?.setFullscreen?.(!!value); } catch (_) {}
  }

  // Encontra o vídeo relacionado a um botão. Também aceita o próprio <video>,
  // que é o que os controles nativos dos vídeos do chat usam.
  function videoFromFullscreenTarget(target) {
    if (target?.tagName === 'VIDEO') return target;
    const container = target?.closest?.('[class*="videoContainer"]') || target?.parentElement;
    return (
      container?.querySelector?.('video') ||
      container?.parentElement?.querySelector?.('video') ||
      null
    );
  }

  // Tenta colocar o vídeo em tela cheia. Só cai para o fullscreen da janela
  // se o navegador/Electron recusar o elemento.
  async function fullscreenVideoFromButton(btn) {
    const video = videoFromFullscreenTarget(btn);
    if (!video?.requestFullscreen) return false;
    try {
      await video.requestFullscreen();
      return true;
    } catch (_) {
      return false;
    }
  }

  // Reprodutor em tela cheia, igual ao da versão original: o próprio vídeo
  // da transmissão é movido para um overlay HTML que ocupa a tela toda.
  let videoPlayer = null;

  function onVideoPlayerKey(e) {
    if (e?.key === 'Escape') closeVideoPlayer();
  }

  function closeVideoPlayer() {
    const player = videoPlayer;
    if (!player) return;
    videoPlayer = null;
    clearTimeout(player.hideTimer);
    setWindowFullscreen(false);
    document.removeEventListener?.('keydown', onVideoPlayerKey);
    try { player.video.removeEventListener?.('click', onVideoClick, true); } catch (_) {}
    try { player.controls?.destroy?.(); } catch (_) {}
    try { player.video.controls = player.originalControls; } catch (_) {}
    try {
      player.originalParent?.insertBefore?.(player.video, player.originalNext);
    } catch (_) {}
    try { player.overlay.remove(); } catch (_) {}
  }

  function onVideoClick(e) {
    const player = videoPlayer;
    if (!player) return;
    e?.preventDefault?.();
    try { player.video.play?.()?.catch?.(() => {}); } catch (_) {}
    // Clique na imagem esconde barra e volume imediatamente.
    try {
      clearTimeout(player.hideTimer);
      player.setControlsVisible?.(false);
    } catch (_) {}
  }

  const PLAYER_ICONS = {
    volumeOn: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
    volumeOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    exit: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  };

  function formatPlayerTime(value) {
    if (!Number.isFinite(value) || value < 0) return '0:00';
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  }

  // Controles próprios, usados no player inline dos vídeos do chat e no
  // player de tela cheia das transmissões.
  function createVideoControls(video, options = {}) {
    const fullscreen = !!options.fullscreen;
    // Transmissões ao vivo usam MediaStream: não têm duração nem posição,
    // então não faz sentido mostrar tempo/barra de progresso nelas.
    const live = !!options.live || !!video?.srcObject;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const signal = controller?.signal;
    const on = (el, type, fn) => {
      if (!el?.addEventListener) return;
      try { el.addEventListener(type, fn, signal ? { signal } : undefined); }
      catch (_) { el.addEventListener(type, fn); }
    };
    const stop = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    };

    // Vídeos do chat lembram o volume escolhido. O valor é aplicado ao criar
    // os controles e salvo sempre que o usuário muda volume ou mudo.
    const persist = !!options.persist;
    const persistVolume = () => {
      if (!persist) return;
      const raw = Number(video.volume);
      const value = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
      state.chatVideoVolume = value;
      state.chatVideoMuted = !!video.muted;
      saveSetting('chatVideoVolume', value);
      saveSetting('chatVideoMuted', state.chatVideoMuted);
    };
    if (persist) {
      try {
        const saved = Number(state.chatVideoVolume);
        if (Number.isFinite(saved)) video.volume = Math.min(1, Math.max(0, saved));
        video.muted = !!state.chatVideoMuted;
      } catch (_) {}
    }

    const controls = document.createElement('div');
    controls.className = 'neri-player-controls';
    if (fullscreen) controls.id = 'neri-player-controls';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'neri-player-btn';
    if (fullscreen) playBtn.id = 'neri-player-play';
    playBtn.title = 'Play';
    playBtn.innerHTML = PLAYER_ICONS.play;
    controls.appendChild(playBtn);

    let current = null;
    let seek = null;
    let duration = null;
    if (!live) {
      current = document.createElement('span');
      current.className = 'neri-player-time';
      if (fullscreen) current.id = 'neri-player-current';
      current.textContent = '0:00';
      controls.appendChild(current);

      seek = document.createElement('input');
      seek.type = 'range';
      seek.className = 'neri-player-seek';
      if (fullscreen) seek.id = 'neri-player-seek';
      seek.min = '0';
      seek.max = '0';
      seek.step = '0.1';
      seek.value = '0';
      seek.title = 'Seek';
      controls.appendChild(seek);

      duration = document.createElement('span');
      duration.className = 'neri-player-time';
      if (fullscreen) duration.id = 'neri-player-duration';
      duration.textContent = '0:00';
      controls.appendChild(duration);
    }

    const spacer = document.createElement('span');
    spacer.className = 'neri-player-spacer';
    controls.appendChild(spacer);

    // Volume fica separado, no canto superior esquerdo, para a barra inferior
    // não estreitar e cortar o botão de tela cheia em vídeos pequenos.
    const volumeBox = document.createElement('div');
    volumeBox.className = 'neri-volume-control';
    volumeBox.setAttribute('data-neri-extra', '1');

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'neri-player-btn';
    if (fullscreen) muteBtn.id = 'neri-player-mute';
    muteBtn.title = 'Mute';
    muteBtn.innerHTML = PLAYER_ICONS.volumeOn;
    volumeBox.appendChild(muteBtn);

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.className = 'neri-player-volume';
    if (fullscreen) volume.id = 'neri-player-volume';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.01';
    volume.value = String(video.muted ? 0 : (video.volume ?? 1));
    volume.title = 'Volume';
    volumeBox.appendChild(volume);

    try { (options.volumeHost || controls).appendChild(volumeBox); }
    catch (_) { controls.appendChild(volumeBox); }

    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'neri-player-btn neri-chat-fullscreen';
    fullBtn.setAttribute('data-neri-chat-fullscreen', '1');
    fullBtn.setAttribute('data-neri-extra', '1');
    if (fullscreen) fullBtn.id = 'neri-player-exit';
    fullBtn.title = fullscreen ? 'Exit fullscreen' : 'Fullscreen';
    fullBtn.setAttribute('aria-label', fullBtn.title);
    fullBtn.innerHTML = fullscreen ? PLAYER_ICONS.exit : PLAYER_ICONS.expand;
    controls.appendChild(fullBtn);

    let playing = false;
    const syncPlay = () => {
      try { playing = !video.paused; } catch (_) {}
      playBtn.innerHTML = playing ? PLAYER_ICONS.pause : PLAYER_ICONS.play;
      playBtn.title = playing ? 'Pause' : 'Play';
    };
    const syncMute = () => {
      muteBtn.innerHTML = video.muted ? PLAYER_ICONS.volumeOff : PLAYER_ICONS.volumeOn;
      muteBtn.title = video.muted ? 'Unmute' : 'Mute';
      volume.value = String(video.muted ? 0 : (video.volume ?? 1));
    };
    const syncTime = () => {
      if (live || !seek || !current || !duration) return;
      const raw = Number(video.duration);
      const total = Number.isFinite(raw) && raw > 0 ? raw : 0;
      const at = Number(video.currentTime) || 0;
      seek.max = String(total);
      seek.value = String(Math.min(at, total));
      current.textContent = formatPlayerTime(at);
      duration.textContent = formatPlayerTime(total);
    };

    on(playBtn, 'click', (event) => {
      stop(event);
      if (playing) { try { video.pause?.(); } catch (_) {} }
      else { try { video.play?.()?.catch?.(() => {}); } catch (_) {} }
      syncPlay();
    });
    if (!live) {
      on(seek, 'input', (event) => {
        stop(event);
        try { video.currentTime = Number(seek.value); } catch (_) {}
        syncTime();
      });
    }
    on(muteBtn, 'click', (event) => {
      stop(event);
      try { video.muted = !video.muted; } catch (_) {}
      syncMute();
      persistVolume();
    });
    on(volume, 'input', (event) => {
      stop(event);
      const value = Number(volume.value);
      try { video.volume = value; video.muted = value === 0; } catch (_) {}
      syncMute();
      persistVolume();
    });
    on(fullBtn, 'click', (event) => {
      stop(event);
      if (fullscreen) closeVideoPlayer();
      else openVideoPlayer(video);
    });

    on(video, 'play', syncPlay);
    on(video, 'playing', syncPlay);
    on(video, 'pause', syncPlay);
    on(video, 'ended', syncPlay);
    if (!live) {
      on(video, 'timeupdate', syncTime);
      on(video, 'durationchange', syncTime);
      on(video, 'loadedmetadata', syncTime);
      on(video, 'progress', syncTime);
    }
    on(video, 'volumechange', () => {
      syncMute();
      persistVolume();
    });

    syncPlay();
    syncMute();
    if (!live) syncTime();
    controls.destroy = () => { try { controller?.abort(); } catch (_) {} };
    return controls;
  }

  function openVideoPlayer(btn) {
    if (videoPlayer) { closeVideoPlayer(); return true; }
    const video = videoFromFullscreenTarget(btn);
    if (!video) return false;

    const originalParent = video.parentElement;
    const originalNext = video.nextSibling;
    const originalControls = video.controls;
    const originalPause = video.pause;

    const overlay = document.createElement('div');
    overlay.id = 'neri-video-fullscreen';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;align-items:center;justify-content:center';

    const holder = document.createElement('div');
    holder.style.cssText = 'position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center';
    overlay.appendChild(holder);

    try { document.body.appendChild(overlay); } catch (_) { return false; }

    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'contain';
    try { holder.appendChild(video); } catch (_) { overlay.appendChild(video); }

    // Player próprio: sem controles nativos (sem pause) e sem depender do
    // fullscreen do navegador, que o Electron não fecha corretamente.
    try { video.controls = false; } catch (_) {}

    const isCallVideo = !!originalParent?.closest?.(
      '[class*="videoContainer"], [class*="voiceActions"]'
    );
    const controls = createVideoControls(video, {
      fullscreen: true,
      persist: !isCallVideo,
      volumeHost: holder,
    });
    holder.appendChild(controls);

    const volumeBox = holder.querySelector('.neri-volume-control');
    const player = {
      overlay, holder, controls, volumeBox, video, originalParent, originalNext,
      originalControls, originalPause, hideTimer: 0,
      setControlsVisible: (visible) => {
        for (const el of [controls, volumeBox]) {
          if (!el) continue;
          el.style.opacity = visible ? '1' : '0';
          el.style.pointerEvents = visible ? 'auto' : 'none';
        }
      },
      // Vídeos do chat podem entrar em fullscreen fora de uma chamada; só o
      // player de transmissão deve fechar se a barra da chamada sumir.
      callVideo: isCallVideo,
    };
    videoPlayer = player;

    // Controles e volume desaparecem sozinhos e voltam ao mover o mouse.
    let hideTimer = 0;
    const showControls = () => {
      player.setControlsVisible(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => player.setControlsVisible(false), 2500);
      player.hideTimer = hideTimer;
    };
    overlay.addEventListener('mousemove', showControls);
    showControls();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === holder) closeVideoPlayer();
    });
    document.addEventListener?.('keydown', onVideoPlayerKey);
    try { video.addEventListener?.('click', onVideoClick, true); } catch (_) {}

    try { video.play?.()?.catch?.(() => {}); } catch (_) {}
    setWindowFullscreen(true);
    return true;
  }

  // Vídeos enviados no chat: removemos os controles nativos e usamos o mesmo
  // player das transmissões, com play/pause, tempo, volume e tela cheia.
  let lastChatVideo = null;
  function decorateChatVideo(video) {
    if (!video || video.tagName !== 'VIDEO' || !video.hasAttribute?.('controls')) return;
    if (video.closest?.('#neri-video-fullscreen, #neri-share-gallery')) return;
    if (video.closest?.('[class*="videoContainer"], [class*="voiceActions"]')) return;
    if (video.dataset?.neriChatPlayer) return;
    const parent = video.parentElement;
    if (!parent) return;

    // O vídeo continua no fluxo original do embed. Se ele for movido para um
    // wrapper absoluto, o container perde a largura intrínseca e encolhe
    // (de ~500px para 200px) quando a miniatura é trocada pelo vídeo.
    const host = parent;
    try {
      if (window.getComputedStyle?.(host).position === 'static') {
        host.style.position = 'relative';
      }
    } catch (_) {}
    try {
      host.classList.add('neri-chat-player');
      host.setAttribute('data-neri-chat-player', '1');
    } catch (_) {}
    try { video.dataset.neriChatPlayer = '1'; } catch (_) {}
    lastChatVideo = video;
    try {
      video.controls = false;
      video.addEventListener('pointerdown', () => { lastChatVideo = video; }, true);
      video.addEventListener('focus', () => { lastChatVideo = video; }, true);
    } catch (_) {}

    const controls = createVideoControls(video, { persist: true, volumeHost: host });
    try { host.appendChild(controls); } catch (_) {}
    host.neriControls = controls;

    // Barra e volume se adaptam ao tamanho real do vídeo no chat, para que o
    // botão de tela cheia nunca fique cortado em embeds estreitos.
    const resizeControls = () => {
      const width = host.getBoundingClientRect?.().width || 0;
      controls.classList.toggle('neri-player-compact', width > 0 && width < 360);
      controls.classList.toggle('neri-player-tiny', width > 0 && width < 240);
      const volumeControl = host.querySelector('.neri-volume-control');
      if (volumeControl) {
        volumeControl.classList.toggle('neri-volume-compact', width > 0 && width < 360);
        volumeControl.classList.toggle('neri-volume-tiny', width > 0 && width < 240);
      }
    };
    resizeControls();
    try { requestAnimationFrame(resizeControls); } catch (_) { resizeControls(); }
    try {
      if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(resizeControls);
        observer.observe(host);
        host.neriResizeObserver = observer;
      }
    } catch (_) {}
    window.addEventListener('resize', resizeControls);

    const volumeBox = host.querySelector('.neri-volume-control');
    const setInlineVisible = (visible) => {
      for (const el of [controls, volumeBox]) {
        if (!el) continue;
        el.style.opacity = visible ? '1' : '0';
        el.style.pointerEvents = visible ? 'auto' : 'none';
      }
    };
    let hideTimer = 0;
    const showInlineControls = () => {
      setInlineVisible(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (video.paused || video.closest('#neri-video-fullscreen')) return;
        setInlineVisible(false);
      }, 2500);
    };
    host.addEventListener('mousemove', showInlineControls);
    host.addEventListener('mouseleave', () => {
      if (!video.paused) setInlineVisible(false);
    });
    video.addEventListener('play', showInlineControls);
    video.addEventListener('click', (event) => {
      if (event.target !== video || video.closest('#neri-video-fullscreen')) return;
      if (video.paused) { try { video.play?.()?.catch?.(() => {}); } catch (_) {} }
      else { try { video.pause?.(); } catch (_) {} }
      showInlineControls();
    });
    // O vídeo do site já pode ter iniciado antes de decorarmos; nesse caso
    // mostramos a barra e agendamos a ocultação para não ficar presa na tela.
    if (!video.paused) showInlineControls();
  }

  function decorateChatVideos() {
    document.querySelectorAll('video[controls]').forEach(decorateChatVideo);
  }

  // O botão de sair dos controles nativos chama document.exitFullscreen().
  // Aproveita para fechar o player e tirar a janela do fullscreen também.
  let originalExitFullscreen = null;
  try {
    if (document?.exitFullscreen) {
      originalExitFullscreen = document.exitFullscreen.bind(document);
      document.exitFullscreen = function (...args) {
        closeVideoPlayer();
        return originalExitFullscreen(...args);
      };
    }
  } catch (_) {}

  // Se o fullscreen nativo do vídeo funcionou, deixamos o Electron controlar
  // a janela. O player próprio é último caso (ver patch de requestFullscreen).
  function onNativeVideoFullscreen() {
    const element = document.fullscreenElement || document.webkitFullscreenElement;
    if (!element) {
      // Saída do fullscreen nativo: a janela volta também, salvo se o player
      // próprio estiver aberto (ele controla o fullscreen por IPC).
      if (!videoPlayer) setWindowFullscreen(false);
      return;
    }
    if (element.tagName !== 'VIDEO') return;
    if (element.closest?.('#neri-video-fullscreen')) return;
    // Só garante que a janela acompanhe o fullscreen do elemento.
    setWindowFullscreen(true);
  }
  document.addEventListener?.('fullscreenchange', onNativeVideoFullscreen, true);
  document.addEventListener?.('webkitfullscreenchange', onNativeVideoFullscreen, true);

  let fullscreenClickAt = 0;
  async function handleFullscreenClick(btn) {
    const now = Date.now();
    if (now - fullscreenClickAt < 400) return;
    fullscreenClickAt = now;
    // O player próprio continua com o áudio da transmissão em foco: sai da
    // grade antes de abrir, sem depender do slider nativo para não ficar mudo.
    if (galleryState.active) {
      const selected = document.querySelector(
        '[class*="voiceParticipantItem"][class*="selected"]'
      );
      const selectedId = selected ? userIdFromItem(selected) : '';
      if (selectedId && galleryState.streams.has(selectedId)) {
        galleryState.focusedId = selectedId;
      }
      setGalleryMode(false, { showVolume: false });
      hideShareVolumeControl();
    }
    if (openVideoPlayer(btn)) return;
    const videoFullscreen = await fullscreenVideoFromButton(btn);
    if (!videoFullscreen) triggerWindowFullscreen();
  }

  // Electron rejeita requestFullscreen({ navigationUI: 'hide' }) usado pelo
  // Nerimity. Mantém o gesto do usuário e chama sem essa opção.
  // Para vídeos do chat, o fullscreen nativo vem primeiro; o player próprio
  // (das transmissões) fica só como último caso, se o Electron recusar.
  const fullscreenProto = typeof Element !== 'undefined' ? Element.prototype : null;
  if (fullscreenProto?.requestFullscreen) {
    const originalRequestFullscreen = fullscreenProto.requestFullscreen;
    fullscreenProto.requestFullscreen = function (options) {
      const target = this;
      const safeOptions = options && 'navigationUI' in options ? undefined : options;
      const usePlayerAsLastResort = () => {
        if (target?.tagName !== 'VIDEO' || target.closest?.('#neri-video-fullscreen')) return false;
        if (videoPlayer?.video === target) return true;
        try { return openVideoPlayer(target); } catch (_) { return false; }
      };
      let result;
      try {
        result = originalRequestFullscreen.call(target, safeOptions);
      } catch (error) {
        if (usePlayerAsLastResort()) return Promise.resolve();
        return Promise.reject(error);
      }
      // O Electron pode deixar a promise pendente sem nunca entrar em
      // fullscreen. Nesse caso, o player próprio entra como último caso.
      let settled = false;
      Promise.resolve(result).then(
        () => { settled = true; },
        () => { settled = true; }
      );
      setTimeout(() => {
        if (settled) return;
        if (document.fullscreenElement === target || document.webkitFullscreenElement === target) return;
        usePlayerAsLastResort();
      }, 500);
      return Promise.resolve(result).catch((error) => {
        if (usePlayerAsLastResort()) return;
        // Outros elementos (botões da chamada) mantêm o comportamento antigo.
        try { return originalRequestFullscreen.call(document.documentElement); }
        catch (_) { triggerWindowFullscreen(); }
      });
    };
  }

  // -------------------------------------------------------------------------
  // Galeria de transmissões: aproveita o espaço preto do player nativo para
  // mostrar todas as telas compartilhadas ao mesmo tempo. Todas as prévias
  // ficam sem som; só a transmissão focada (uma por pessoa) tem áudio.
  // -------------------------------------------------------------------------
  const galleryState = state.gallery;

  function isSelectedParticipant(el) {
    return [...(el?.classList || [])].some((c) => /selected/i.test(c));
  }

  function shareHeader() {
    return document.querySelector('[class*="headerVoiceParticipants"]');
  }

  function nativeShareContainer() {
    return shareHeader()?.querySelector('[class*="videoContainer"]') || null;
  }

  // Impede que o vídeo nativo toque som enquanto a galeria está aberta e,
  // depois que uma prévia é focada, impede que o site volte a mudar o mudo
  // sem querer. applyingNativeMute é usado para as nossas próprias mudanças.
  let applyingNativeMute = false;

  function setNativeMuted(video, value) {
    if (!video) return;
    applyingNativeMute = true;
    try { video.muted = !!value; }
    finally { applyingNativeMute = false; }
  }

  function watchNativeVideoMuted(video) {
    if (!video || video.__neriGalleryMutedWatched) return;
    video.__neriGalleryMutedWatched = true;
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (!desc?.get || !desc?.set) return;
    try {
      Object.defineProperty(video, 'muted', {
        configurable: true,
        get() { return desc.get.call(this); },
        set(value) {
          if (applyingNativeMute) {
            desc.set.call(this, value);
            return;
          }
          if (galleryState.active && value !== true) {
            galleryState.nativeMuted = !!value;
            value = true;
          } else if (
            galleryState.forceAudio &&
            this === galleryState.nativeVideo &&
            value === true &&
            !galleryState.muted
          ) {
            // O Nerimity reaplica muted ao trocar de participante. A prévia
            // focada precisa continuar com o som que o usuário escolheu.
            value = false;
          }
          desc.set.call(this, value);
        },
      });
    } catch (_) {}

    try {
      video.addEventListener('volumechange', () => {
        if (!galleryState.forceAudio || galleryState.active) return;
        if (video !== galleryState.nativeVideo) return;
        const raw = Number(video.volume);
        if (Number.isFinite(raw)) galleryState.volume = clampShareVolume(raw);
        galleryState.muted = !!video.muted;
        syncShareVolumeControl();
      });
    } catch (_) {}
  }

  function nativeShareVideo() {
    const container = nativeShareContainer();
    if (!container) return null;
    const video = [...container.children].find(
      (n) => n.tagName === 'VIDEO' && n.id !== 'neri-share-gallery'
    ) || null;
    if (video && video !== galleryState.nativeVideo) {
      watchNativeVideoMuted(video);
      galleryState.nativeVideo = video;
    }
    return video;
  }

  function clampShareVolume(value) {
    const raw = Number(value);
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
  }

  function persistShareVolume() {
    saveSetting('galleryVolume', galleryState.volume);
    saveSetting('galleryMuted', galleryState.muted);
  }

  function syncShareVolumeControl() {
    const control = galleryState.volumeControl;
    if (!control?.isConnected) return;
    const muteBtn = control.querySelector('button');
    const slider = control.querySelector('input');
    if (muteBtn) {
      muteBtn.innerHTML = galleryState.muted ? PLAYER_ICONS.volumeOff : PLAYER_ICONS.volumeOn;
      muteBtn.title = galleryState.muted ? 'Unmute' : 'Mute';
    }
    if (slider) slider.value = String(galleryState.muted ? 0 : galleryState.volume);
  }

  // Aplica à transmissão focada o volume escolhido no controle próprio, sem
  // depender de o Nerimity mostrar ou não o slider nativo.
  function applyShareAudio() {
    const video = nativeShareVideo();
    if (!video) return;
    try { video.volume = galleryState.volume; } catch (_) {}
    setNativeMuted(video, galleryState.muted);
    syncShareVolumeControl();
  }

  function ensureShareVolumeControl() {
    const container = nativeShareContainer();
    if (!container) return null;
    let control = container.querySelector('#neri-share-volume');
    if (!control) {
      control = document.createElement('div');
      control.id = 'neri-share-volume';
      control.className = 'neri-volume-control neri-share-volume';
      control.setAttribute('data-neri-extra', '1');

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'neri-player-btn';
      muteBtn.title = 'Mute';
      muteBtn.innerHTML = PLAYER_ICONS.volumeOn;
      control.appendChild(muteBtn);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'neri-player-volume';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.title = 'Volume';
      control.appendChild(slider);

      muteBtn.addEventListener('click', (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        galleryState.muted = !galleryState.muted;
        applyShareAudio();
        persistShareVolume();
      });
      slider.addEventListener('input', (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const value = clampShareVolume(event?.target?.value);
        galleryState.volume = value;
        galleryState.muted = value === 0;
        applyShareAudio();
        persistShareVolume();
      });

      try { container.appendChild(control); } catch (_) { return null; }
    }
    galleryState.volumeControl = control;
    syncShareVolumeControl();
    return control;
  }

  function showShareVolumeControl() {
    const control = ensureShareVolumeControl();
    if (!control) return;
    control.classList.add('neri-share-volume-visible');
    syncShareVolumeControl();
  }

  function hideShareVolumeControl() {
    galleryState.volumeControl?.classList.remove('neri-share-volume-visible');
  }

  function sharerItems() {
    return [...document.querySelectorAll('[class*="voiceParticipantItem"]')]
      .filter((el) => el.querySelector('[class*="videoStreamIcon"]'));
  }

  function userIdFromItem(item) {
    let id = item?.getAttribute?.('data-neri-user-id') || '';
    if (!id) {
      const href =
        item?.getAttribute?.('href') ||
        item?.querySelector?.('[href]')?.getAttribute?.('href') ||
        '';
      const match = href.match(/\/([^/?#]+)\/?(?:[?#]|$)/);
      id = match ? match[1] : '';
      if (id) {
        try { item.setAttribute('data-neri-user-id', id); } catch (_) {}
      }
    }
    return id;
  }

  function shareNameFromItem(item) {
    const clone = item?.cloneNode?.(true);
    if (!clone) return '';
    clone.querySelectorAll?.('svg, img, [class*="icon"], [class*="Icon"]')
      .forEach((node) => node.remove());
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    if (text && !/^user avatar$/i.test(text)) return text.slice(0, 48);
    for (const attr of ['title', 'aria-label', 'data-neri-username']) {
      const value = String(item?.getAttribute?.(attr) || '').trim();
      if (value && !/^user avatar$/i.test(value)) return value.slice(0, 48);
    }
    return '';
  }

  function visibleShareName(id, entry) {
    return (
      entry?.name ||
      galleryState.userNames.get(id) ||
      `User ${String(id).slice(-6)}`
    );
  }

  function updateShareNameLabel(id, rawName, cache = false) {
    const name = String(rawName || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    if (!name) return;
    if (cache) galleryState.userNames.set(id, name);
    const entry = galleryState.streams.get(id);
    if (entry) entry.name = name;
    const tile = [...(galleryState.container?.querySelectorAll('.neri-share-tile') || [])]
      .find((node) => node.getAttribute('data-user-id') === id);
    if (!tile) return;
    tile.title = name;
    const label = tile.querySelector('.neri-share-name');
    if (label) label.textContent = name;
  }

  function usernameFromApiResponse(data) {
    const user = data?.user || data?.data?.user || data;
    return String(user?.username || user?.name || '').trim().slice(0, 48);
  }

  // O painel de voz do Nerimity mostra só o avatar. Quando não há nome no
  // DOM, resolve o nome pelo ID do perfil usando a mesma API do site.
  function loadShareName(id, item) {
    if (!id || galleryState.userNames.has(id)) return Promise.resolve();
    const previous = galleryState.nameRequests.get(id);
    if (previous) return previous;

    const provisional = shareNameFromItem(item);
    if (provisional) updateShareNameLabel(id, provisional);

    const request = (async () => {
      try {
        let token = '';
        try { token = window.localStorage?.getItem?.('userToken') || ''; } catch (_) {}
        const headers = { Accept: 'application/json' };
        if (token) headers.Authorization = token;
        const url = new URL(`/api/users/${encodeURIComponent(id)}`, window.location.href).href;
        const response = await window.fetch(url, { method: 'GET', headers });
        if (!response?.ok) return '';
        const name = usernameFromApiResponse(await response.json());
        if (name) updateShareNameLabel(id, name, true);
        return name;
      } catch (_) {
        return '';
      } finally {
        galleryState.nameRequests.delete(id);
      }
    })();
    galleryState.nameRequests.set(id, request);
    return request;
  }

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      } else {
        setTimeout(resolve, 30);
      }
    });
  }

  // Clique feito por nós para ler um stream não deve ser confundido com a
  // escolha de uma transmissão pelo usuário.
  async function clickParticipantForCollection(item) {
    if (!item) return;
    try { item.setAttribute('data-neri-gallery-collect', '1'); } catch (_) {}
    try { item.click(); } catch (_) {}
    await nextFrame();
    try { item.removeAttribute('data-neri-gallery-collect'); } catch (_) {}
  }

  // O Nerimity guarda o stream de cada usuário no store interno. Para pegar
  // todos sem mexer nesse store, selecionamos cada participante que está
  // compartilhando e lemos o srcObject do vídeo nativo.
  async function collectShareStreams() {
    if (galleryState.collecting) return;
    const now = Date.now();
    const pending = sharerItems().filter((item) => {
      const id = userIdFromItem(item);
      if (!id || galleryState.streams.has(id)) return false;
      return now - (galleryState.collectAttempts.get(id) || 0) > 1500;
    });
    if (!pending.length) return;

    galleryState.collecting = true;
    const previous = document.querySelector(
      '[class*="voiceParticipantItem"][class*="selected"]'
    );
    try {
      for (const item of pending) {
        if (!item.isConnected) continue;
        const id = userIdFromItem(item);
        galleryState.collectAttempts.set(id, Date.now());
        if (!isSelectedParticipant(item)) {
          await clickParticipantForCollection(item);
        }
        const stream = nativeShareVideo()?.srcObject;
        if (stream) {
          const cachedName = galleryState.userNames.get(id) || '';
          galleryState.streams.set(id, {
            stream,
            name: cachedName || shareNameFromItem(item),
          });
          loadShareName(id, item);
        }
      }
    } finally {
      galleryState.collecting = false;
      if (previous?.isConnected && !isSelectedParticipant(previous) && !videoPlayer) {
        await clickParticipantForCollection(previous);
      }
    }
    // Pode não haver mutação de DOM depois da leitura dos streams: força
    // uma sincronização para montar as prévias.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => syncShareGallery());
    } else {
      setTimeout(() => syncShareGallery(), 0);
    }
  }

  function renderShareGallery() {
    const container = nativeShareContainer();
    if (!container) return;
    let gallery = container.querySelector('#neri-share-gallery');
    if (!gallery) {
      gallery = document.createElement('div');
      gallery.id = 'neri-share-gallery';
      container.appendChild(gallery);
    }
    galleryState.container = gallery;
    gallery.innerHTML = '';

    for (const [id, entry] of galleryState.streams) {
      const tile = document.createElement('div');
      tile.className = 'neri-share-tile';
      tile.setAttribute('data-user-id', id);
      tile.title = visibleShareName(id, entry);

      const video = document.createElement('video');
      video.className = 'neri-share-preview';
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      try {
        video.srcObject = entry.stream;
        video.play?.()?.catch?.(() => {});
      } catch (_) {}

      const label = document.createElement('span');
      label.className = 'neri-share-name';
      label.textContent = visibleShareName(id, entry);

      tile.appendChild(video);
      tile.appendChild(label);
      tile.addEventListener('click', (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        focusShare(id);
      });
      gallery.appendChild(tile);
    }
  }

  function setGalleryMode(active, options = {}) {
    galleryState.active = !!active;
    const container = nativeShareContainer();
    container?.classList.toggle('neri-gallery-open', !!active);
    const video = nativeShareVideo();

    if (active) {
      if (video && galleryState.nativeMuted === null) {
        galleryState.nativeMuted = !!video.muted;
      }
      galleryState.forceAudio = false;
      if (video) setNativeMuted(video, true);
      hideShareVolumeControl();
      return;
    }

    if (galleryState.focusedId) {
      // Uma prévia foi focada: aquela transmissão passa a ter o som principal,
      // com o volume escolhido pelo usuário e controle próprio no vídeo.
      galleryState.forceAudio = true;
      applyShareAudio();
      if (options.showVolume === false) hideShareVolumeControl();
      else showShareVolumeControl();
    } else if (video) {
      // Sem prévia focada (por exemplo, saindo da grade para o fullscreen),
      // mantém o comportamento anterior para não ecoar a própria transmissão.
      const hasVolume = !!container?.querySelector('[class*="volumeSlider"]');
      setNativeMuted(video, hasVolume ? galleryState.nativeMuted === true : true);
      hideShareVolumeControl();
    }
    galleryState.forceAudio = !!galleryState.focusedId;
    galleryState.nativeMuted = null;
  }

  async function focusShare(id, alreadySelected = false) {
    if (videoPlayer) return;
    galleryState.focusedId = id;
    const item = sharerItems().find((el) => userIdFromItem(el) === id);
    if (item && !alreadySelected && !isSelectedParticipant(item)) {
      try { item.click(); } catch (_) {}
      await nextFrame();
    }
    setGalleryMode(false);
    const video = nativeShareVideo();
    try { video?.play?.()?.catch?.(() => {}); } catch (_) {}
    // A troca de participante pode reaplicar muted um quadro depois.
    applyShareAudio();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (!galleryState.active && !videoPlayer && galleryState.focusedId === id) {
          applyShareAudio();
        }
      });
    }
  }

  function showShareGallery() {
    if (videoPlayer || galleryState.collecting) return;
    galleryState.focusedId = '';
    setGalleryMode(true);
  }

  function syncShareGallery() {
    const g = galleryState;
    const header = shareHeader();
    const container = nativeShareContainer();
    const items = sharerItems();
    const ids = [...new Set(items.map(userIdFromItem).filter(Boolean))].sort();
    const idsSignature = ids.join('|');

    if (!header || !container || (!ids.length && !g.streams.size)) {
      if (g.container) {
        try { g.container.remove(); } catch (_) {}
        g.container = null;
      }
      container?.classList.remove('neri-gallery-open');
      g.renderedSignature = '';
      g.idsSignature = '';
      g.collectAttempts.clear();
      g.nativeMuted = null;
      g.active = false;
      g.forceAudio = false;
      hideShareVolumeControl();
      return;
    }

    for (const [id, entry] of g.streams) {
      const track = entry.stream?.getVideoTracks?.()?.[0];
      if (!ids.includes(id) || !track || track.readyState === 'ended') {
        g.streams.delete(id);
        g.collectAttempts.delete(id);
      }
    }

    const activeSignature = [...g.streams.keys()].sort().join('|');
    if (activeSignature !== g.renderedSignature) {
      g.renderedSignature = activeSignature;
      renderShareGallery();
    }

    // Reconhece qual transmissão o Nerimity está mostrando no vídeo nativo.
    // Não faz isso durante a coleta, que seleciona participantes só para ler
    // os streams e depois restaura a seleção anterior.
    if (!g.collecting && !g.active) {
      const selected = document.querySelector(
        '[class*="voiceParticipantItem"][class*="selected"]'
      );
      const selectedId = selected ? userIdFromItem(selected) : '';
      if (selectedId && g.streams.has(selectedId)) g.focusedId = selectedId;
    }

    if (idsSignature !== g.idsSignature) {
      const anteriores = new Set(g.idsSignature.split('|').filter(Boolean));
      g.idsSignature = idsSignature;
      if (ids.some((id) => !anteriores.has(id))) {
        g.active = true;
        g.focusedId = '';
      }
    }

    // Se a transmissão que estava focada acabou, volta automaticamente para
    // a grade com as demais telas, sem exigir clique manual.
    if (g.focusedId && !g.active) {
      const focusedStream = g.streams.get(g.focusedId);
      const focusedTrack = focusedStream?.getVideoTracks?.()?.[0];
      const focusedEnded =
        !ids.includes(g.focusedId) ||
        !focusedStream ||
        focusedTrack?.readyState === 'ended';
      if (focusedEnded) {
        g.focusedId = '';
        if (ids.length) g.active = true;
      }
    }

    if (ids.some((id) => !g.streams.has(id))) collectShareStreams();

    if (g.active) {
      setGalleryMode(true);
    } else if (!g.focusedId) {
      container.classList.remove('neri-gallery-open');
      hideShareVolumeControl();
    }
  }

  // Clique num participante que está transmitindo: foca aquela transmissão.
  document.addEventListener('click', (event) => {
    if (videoPlayer || galleryState.collecting || !galleryState.active) return;
    const item = event.target?.closest?.('[class*="voiceParticipantItem"]');
    if (!item || item.getAttribute?.('data-neri-gallery-collect') === '1') return;
    const id = userIdFromItem(item);
    if (!id || !galleryState.streams.has(id)) return;
    setTimeout(() => {
      if (galleryState.active) focusShare(id, true);
    }, 0);
  }, true);

  // Clique no vídeo já focado volta para a grade de transmissões.
  document.addEventListener('click', (event) => {
    if (videoPlayer || galleryState.active || galleryState.collecting) return;
    const video = event.target?.closest?.('video');
    if (!video || video.closest('#neri-share-gallery')) return;
    const container = nativeShareContainer();
    if (!container || !container.contains(video)) return;
    event.preventDefault?.();
    showShareGallery();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event?.key !== 'Escape') return;
    if (videoPlayer || galleryState.active || galleryState.collecting) return;
    if (document.querySelector('#neri-camera-overlay-modal, #neri-venmic-modal, #neri-tts-modal, #neri-extras-modal')) return;
    const container = nativeShareContainer();
    if (!container?.querySelector('video')) return;
    event.preventDefault?.();
    showShareGallery();
  });

  const originalGetDisplayMedia =
    navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  const originalGetUserMedia =
    navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async function (constraints = {}) {
    const stream = await originalGetUserMedia(constraints);
    if (constraints.video) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        state.cameraStream = stream;
        state.cameraTrack = track;
        state.cameraOn = true;
        const clear = () => {
          if (state.cameraTrack !== track) return;
          state.cameraOn = false;
          state.cameraStream = null;
          state.cameraTrack = null;
          if (activeComposition && activeComposition.cameraTrack === track) {
            applyCameraOverlay(false);
          }
          updateButtons();
        };
        const originalStop = track.stop.bind(track);
        track.stop = () => { clear(); originalStop(); };
        track.addEventListener?.('ended', clear, { once: true });
        updateButtons();
      }
    }
    return stream;
  };

  async function waitForVenmicDevice(timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const ven = devs.find((d) => d.kind === 'audioinput' && /vencord-screen-share/i.test(d.label || ''));
      if (ven) return ven;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  function stripAudioTracks(stream) {
    stream.getAudioTracks().forEach((track) => {
      stream.removeTrack(track);
      try { track.stop(); } catch (_) {}
    });
  }

  // -------------------------------------------------------------------------
  // Tela + câmera em um único stream de vídeo. A transmissão começa sem câmera;
  // ela entra somente depois que o usuário clica no botão.
  // -------------------------------------------------------------------------
  let activeComposition = null;

  function saveSetting(key, value) {
    try { return API.setSetting(key, value); } catch (_) { return undefined; }
  }

  function waitForVideoReady(video, timeoutMs = 3000) {
    const ready = () => (video.readyState || 0) >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
    if (ready()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ready());
      };
      video.addEventListener?.('loadeddata', finish, { once: true });
      video.addEventListener?.('canplay', finish, { once: true });
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  function repaintComposition() {
    const c = activeComposition;
    try { c?.paint?.(); } catch (_) {}
  }

  function overlayPosition() {
    const p = state.overlaySettings?.position || 'bottom-right';
    return /^(top|middle|bottom)-(left|center|right)$/.test(p) ? p : 'bottom-right';
  }

  function cameraRect(sw, sh, pipW, pipH, margin) {
    const [vertical, horizontal] = overlayPosition().split('-');
    const x = horizontal === 'left' ? margin
      : horizontal === 'center' ? Math.round((sw - pipW) / 2)
      : sw - pipW - margin;
    const y = vertical === 'top' ? margin
      : vertical === 'middle' ? Math.round((sh - pipH) / 2)
      : sh - pipH - margin;
    return { x, y };
  }

  async function replaceVideoTrack(track) {
    if (!track) return;
    for (const sender of state.videoSenders) {
      try {
        if (sender.track?.kind === 'video' && sender.replaceTrack) {
          await sender.replaceTrack(track);
        }
      } catch (_) {}
    }
  }

  if (typeof RTCPeerConnection !== 'undefined' && RTCPeerConnection.prototype?.addTrack) {
    const originalAddTrack = RTCPeerConnection.prototype.addTrack;
    RTCPeerConnection.prototype.addTrack = function (track, ...streams) {
      let finalTrack = track;
      if (state.screenSharing && state.cameraOverlay && activeComposition &&
          track === state.cameraTrack) {
        finalTrack = activeComposition.composedTrack;
      }
      const sender = originalAddTrack.call(this, finalTrack, ...streams);
      if (streams.some((s) => s === state.screenStream) ||
          finalTrack === state.shareVideoTrack ||
          (activeComposition && finalTrack === activeComposition.composedTrack)) {
        state.videoSenders.add(sender);
      }
      return sender;
    };
  }

  function closeCameraPanel() {
    document.getElementById('neri-camera-overlay-modal')?.remove();
  }

  async function handleScreenShareEnded() {
    if (state.endingShare) return;
    if (!state.screenSharing && !activeComposition) return;
    state.endingShare = true;
    try {
      cleanupComposition({ keepScreen: false });
      state.screenSharing = false;
      state.cameraOverlay = false;
      state.screenStream = null;
      state.shareVideoTrack = null;
      state.composedVideoTrack = null;
      state.pendingCameraOverlay = false;
      closeCameraPanel();
      if (state.isWayland) {
        document.dispatchEvent(new Event('neri-wayland-share-ended'));
      }
      updateButtons();
    } finally {
      state.endingShare = false;
    }
  }

  function registerScreenShare(stream) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    cleanupComposition({ keepScreen: true });
    state.screenStream = stream;
    state.shareVideoTrack = track;
    state.screenSharing = true;
    state.cameraOverlay = false;
    state.composedVideoTrack = null;
    const originalStop = track.stop.bind(track);
    if (!track.__neriShareStopWrapped) {
      track.__neriShareStopWrapped = true;
      track.stop = () => {
        if (!state.endingShare) handleScreenShareEnded();
        originalStop();
      };
      track.addEventListener?.('ended', handleScreenShareEnded, { once: true });
    }
    if (state.pendingCameraOverlay) {
      state.pendingCameraOverlay = false;
      setTimeout(() => { applyCameraOverlay(true); }, 0);
    }
    updateButtons();
  }

  function cleanupComposition({ keepScreen = true } = {}) {
    const c = activeComposition;
    if (!c) return;
    activeComposition = null;
    if (c.stopped) return;
    c.stopped = true;
    if (c.raf) cancelAnimationFrame(c.raf);
    try { c.composedTrack?.removeEventListener?.('ended', c.onEnded); } catch (_) {}
    for (const v of [c.screenVideo, c.camVideo]) {
      try { v.pause?.(); v.srcObject = null; v.remove?.(); } catch (_) {}
    }
    try { c.host?.remove?.(); } catch (_) {}
    try { c.canvas.width = 0; c.canvas.height = 0; } catch (_) {}
    try { c.originalComposedStop?.(); } catch (_) {}
    if (!c.borrowedCamera) {
      try { c.cameraTrack?.stop(); } catch (_) {}
    }
    try { c.stream?.removeTrack?.(c.composedTrack); } catch (_) {}
    if (c.screenTrack && c.stream && !c.stream.getVideoTracks().includes(c.screenTrack)) {
      try { c.stream.addTrack(c.screenTrack); } catch (_) {}
    }
    for (const sender of state.videoSenders) {
      try {
        if (sender.track === c.composedTrack && sender.replaceTrack) {
          sender.replaceTrack(c.screenTrack).catch?.(() => {});
        }
      } catch (_) {}
    }
    state.composedVideoTrack = null;
    if (!keepScreen) {
      try { c.screenTrack?.stop?.(); } catch (_) {}
      c.stream?.getAudioTracks?.().forEach((t) => { try { t.stop(); } catch (_) {} });
    }
  }

  async function startComposition() {
    if (activeComposition) return true;
    const screenTrack = state.shareVideoTrack || state.screenStream?.getVideoTracks?.()[0];
    if (!screenTrack || screenTrack.readyState === 'ended') return false;

    const borrowed = !!(state.cameraOn && state.cameraTrack && state.cameraTrack.readyState !== 'ended');
    let cameraStream = null;
    if (borrowed) {
      cameraStream = state.cameraStream || new MediaStream([state.cameraTrack]);
    } else {
      try {
        cameraStream = await originalGetUserMedia({
          audio: false,
          video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 } },
        });
      } catch (e) {
        log('câmera indisponível; compartilhando só a tela', e);
        return false;
      }
    }
    const cameraTrack = cameraStream?.getVideoTracks?.()[0];
    if (!cameraTrack) {
      if (!borrowed) cameraStream?.getTracks?.().forEach((t) => { try { t.stop(); } catch (_) {} });
      return false;
    }

    const host = document.createElement('div');
    host.id = 'neri-camera-composite';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);pointer-events:none;z-index:-1';

    const screenVideo = document.createElement('video');
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    screenVideo.autoplay = true;
    try {
      screenVideo.srcObject = typeof MediaStream === 'function'
        ? new MediaStream([screenTrack])
        : state.screenStream;
    } catch (_) {
      try { screenVideo.srcObject = state.screenStream; } catch (_) {}
    }

    const camVideo = document.createElement('video');
    camVideo.muted = true;
    camVideo.playsInline = true;
    camVideo.autoplay = true;
    try { camVideo.srcObject = cameraStream; } catch (_) {}

    try {
      host.appendChild(screenVideo);
      host.appendChild(camVideo);
      document.body.appendChild(host);
    } catch (_) {}

    const fail = () => {
      if (!borrowed) { try { cameraTrack.stop(); } catch (_) {} }
      try { host.remove?.(); } catch (_) {}
      return false;
    };

    try { await Promise.all([screenVideo.play(), camVideo.play()]); } catch (_) {}
    const [screenReady, camReady] = await Promise.all([
      waitForVideoReady(screenVideo),
      waitForVideoReady(camVideo),
    ]);
    if (!screenReady || !camReady) {
      log('sem frames de vídeo; compartilhando só a tela', { screenReady, camReady });
      return fail();
    }

    const settings = screenTrack.getSettings?.() || {};
    const sw = screenVideo.videoWidth || settings.width || 1280;
    const sh = screenVideo.videoHeight || settings.height || 720;
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    try { canvas.style.cssText = 'width:1px;height:1px;pointer-events:none'; } catch (_) {}
    try { host.appendChild(canvas); } catch (_) {}
    const ctx = canvas.getContext('2d');

    const c = {
      stopped: false,
      raf: 0,
      stream: state.screenStream,
      host,
      screenTrack,
      cameraTrack,
      borrowedCamera: borrowed,
      screenVideo,
      camVideo,
      canvas,
      composedTrack: null,
      paint: null,
      originalComposedStop: null,
      onEnded: null,
    };
    activeComposition = c;

    const paint = () => {
      if (c.stopped) return;
      if ((screenVideo.readyState || 0) < 2 || !screenVideo.videoWidth) return;
      try {
        ctx.drawImage(screenVideo, 0, 0, sw, sh);
        const pipW = Math.max(48, Math.round(sw * 0.22));
        const ratio = (camVideo.videoHeight || 360) / (camVideo.videoWidth || 640);
        const pipH = Math.max(36, Math.round(pipW * ratio));
        const margin = Math.max(6, Math.round(sw * 0.02));
        const { x, y } = cameraRect(sw, sh, pipW, pipH, margin);
        const opacity = Math.max(0.2, Math.min(1,
          (state.overlaySettings?.opacity ?? 100) / 100));
        ctx.save();
        ctx.globalAlpha = opacity;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, pipW, pipH, 8);
          ctx.clip();
        }
        ctx.drawImage(camVideo, 0, 0, camVideo.videoWidth || 640, camVideo.videoHeight || 360, x, y, pipW, pipH);
        ctx.restore();
      } catch (_) {}
      try { c.composedTrack?.requestFrame?.(); } catch (_) {}
    };

    c.paint = paint;

    const draw = () => {
      if (c.stopped) return;
      paint();
      c.raf = requestAnimationFrame(draw);
    };
    draw();

    let composed;
    try {
      composed = canvas.captureStream(30).getVideoTracks()[0];
    } catch (e) {
      log('canvas.captureStream falhou', e);
      cleanupComposition({ keepScreen: true });
      return fail();
    }
    if (!composed) {
      cleanupComposition({ keepScreen: true });
      return fail();
    }

    c.composedTrack = composed;
    c.originalComposedStop = composed.stop.bind(composed);
    composed.stop = () => {
      if (!state.endingShare) handleScreenShareEnded();
      c.originalComposedStop();
    };
    c.onEnded = () => { handleScreenShareEnded(); };
    composed.addEventListener?.('ended', c.onEnded, { once: true });

    c.stream?.removeTrack?.(screenTrack);
    c.stream?.addTrack?.(composed);
    state.composedVideoTrack = composed;
    await replaceVideoTrack(composed);
    paint();
    log('tela + câmera ativas no mesmo stream');
    return true;
  }

  async function applyCameraOverlay(enabled) {
    if (!state.screenSharing) return false;
    if (enabled) {
      const ok = activeComposition ? true : await startComposition();
      if (activeComposition) repaintComposition();
      state.cameraOverlay = ok;
      if (!ok) toast('Could not start the camera for this share', 'error');
      updateButtons();
      return ok;
    }
    cleanupComposition({ keepScreen: true });
    state.cameraOverlay = false;
    await replaceVideoTrack(state.shareVideoTrack);
    updateButtons();
    return true;
  }

  async function applyVenmicAudio(stream, include) {
    await API.venmicStart(include);
    const dev = await waitForVenmicDevice();
    if (!dev) return false;
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: dev.deviceId }, autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: 2, sampleRate: 48000 },
    }).catch(() => null);
    if (!mic) return false;
    stripAudioTracks(stream);
    mic.getAudioTracks().forEach((t) => stream.addTrack(t));
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      API.venmicStop().catch(() => {});
      mic.getTracks().forEach((t) => t.stop());
    }, { once: true });
    log('venmic audio aplicado');
    return true;
  }

  navigator.mediaDevices.getDisplayMedia = async function (constraints = {}) {
    const wantAudio = !!constraints.audio;
    let venmicInclude = [];
    let noAudioChosen = false;

    // No Wayland o portal do dono da sessão abre primeiro. O popup de áudio
    // aparece depois da seleção da janela/tela.
    if (wantAudio && !state.isWayland) {
      try {
        venmicInclude = await openVenmicPicker();
      } catch (e) { log('venmic picker erro', e); }
      // Nada marcado no popup = transmissão sem som. Não cair para o áudio
      // do sistema (screenShareAudioMode), igual ao comportamento do Wayland.
      if (!venmicInclude.length) noAudioChosen = true;
    }

    // No Wayland o portal fornece apenas vídeo; o áudio vem do popup venmic
    // depois da seleção. Pedir audio:true pode fazer o portal falhar e
    // reiniciar o seletor em loop.
    const callConstraints = state.isWayland
      ? { ...constraints, audio: false }
      : constraints;
    let stream;
    try {
      stream = await originalGetDisplayMedia(callConstraints);
      registerScreenShare(stream);
    } catch (error) {
      if (state.isWayland) {
        document.dispatchEvent(new Event('neri-wayland-share-failed'));
      }
      throw error;
    }
    try {
      if (state.isWayland) {
        try {
          venmicInclude = await openVenmicPicker();
        } catch (e) { log('venmic picker erro', e); }
        if (venmicInclude && venmicInclude.length) {
          const applied = await applyVenmicAudio(stream, venmicInclude);
          if (!applied) {
            toast("Couldn't use the selected audio; sharing without sound", 'error');
            await API.venmicStop().catch(() => {});
            stripAudioTracks(stream);
          }
        } else {
          // Nada selecionado: transmite sem som e não pergunta novamente.
          stripAudioTracks(stream);
          log('sharing without audio (no app selected)');
        }
        return stream;
      }

      if (noAudioChosen) {
        await API.venmicStop().catch(() => {});
        stripAudioTracks(stream);
        log('sharing without audio (no app selected on X11)');
        return stream;
      }

      if (wantAudio && venmicInclude && venmicInclude.length) {
        const applied = await applyVenmicAudio(stream, venmicInclude);
        if (applied) return stream;
        toast("Couldn't use the selected audio; falling back to default audio", 'error');
        await API.venmicStop().catch(() => {});
      }

      const mode = (await API.getSetting('screenShareAudioMode', 'clean')) || 'clean';
      state.mode = mode;
      if (constraints.audio && mode === 'clean') {
        const ownTrack = stream.getAudioTracks()[0];
        if (ownTrack) {
          const ctx = ensureCleanGraph();
          if (state.portalSource) {
            try { state.portalSource.disconnect(); } catch (_) {}
          }
          state.portalSource = ctx.createMediaStreamSource(new MediaStream([ownTrack]));
          state.portalSource.connect(state.cleanDest);
          stream.removeTrack(ownTrack);
          stream.addTrack(state.cleanDest.stream.getAudioTracks()[0]);
          log('clean mode applied to screen share');
        }
      } else if (constraints.audio && mode !== 'full') {
        stream.getAudioTracks().forEach((track) => {
          stream.removeTrack(track);
          try { track.stop(); } catch (_) {}
        });
        if (mode === 'silent') {
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          const silentTrack = dest.stream.getAudioTracks()[0];
          stream.addTrack(silentTrack);
          silentTrack.addEventListener('ended', () => ctx.close().catch(() => {}));
        }
      }
    } catch (error) {
      log('failed to filter screen audio:', error);
    }
    return stream;
  };

  // -------------------------------------------------------------------------
  // Wayland: o seletor do Nerimity é ignorado e o portal da sessão abre
  // diretamente depois que o usuário clica em "Share screen".
  // -------------------------------------------------------------------------
  const WAYLAND_PICKER_LABEL = 'Wayland screen/window picker';
  let waylandPickerModal = null;

  function findWaylandPickerLabel() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.nodeValue || '';
      if (text.includes(WAYLAND_PICKER_LABEL)) return walker.currentNode.parentElement;
    }
    return null;
  }

  function findModalRoot(el) {
    let node = el;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (style.position === 'fixed' || Number(style.zIndex) > 1000) return node;
      node = node.parentElement;
    }
    return el;
  }

  function setupWaylandPickerBypass() {
    if (!state.isWayland) return;

    const restore = () => {
      // No Wayland o seletor interno do Nerimity nunca deve voltar a aparecer.
      // Apenas libera o estado para um próximo clique em compartilhar.
      if (waylandPickerModal) {
        delete waylandPickerModal.dataset.neriWaylandPicker;
        waylandPickerModal = null;
      }
      state.waylandPickerHandled = false;
    };
    document.addEventListener('neri-wayland-share-failed', restore);
    // Libera o bypass quando a transmissão termina normalmente, para que o
    // próximo clique em compartilhar abra o portal novamente.
    document.addEventListener('neri-wayland-share-ended', restore);

    const autoPick = () => {
      const label = findWaylandPickerLabel();
      if (!label) return;

      const modal = findModalRoot(label);
      if (!modal) return;

      // track.stop() não dispara "ended", então o flag global pode ficar
      // marcado após a primeira transmissão. Usa a marca do próprio modal:
      // se ele estiver visível de novo, é um novo clique em compartilhar.
      if (modal.dataset.neriWaylandPicker === '1') {
        if (getComputedStyle(modal).display === 'none') return;
        delete modal.dataset.neriWaylandPicker;
      }

      state.waylandPickerHandled = true;
      waylandPickerModal = modal;
      modal.dataset.neriWaylandPicker = '1';
      modal.style.display = 'none';

      // O nome da fonte é renderizado como <span> por Text; o elemento
      // clicável é o <div> pai imediato (SourceItemContainer), não o avô.
      const item =
        label.closest('[class*="SourceItem"]') ||
        label.closest('div') ||
        label.parentElement;
      try { item?.click(); } catch (_) {}

      setTimeout(() => {
        const root = waylandPickerModal || modal;
        const buttons = [...(root?.querySelectorAll('button') || [])];
        const localized = /choose window|selecionar janela|escolher janela|choose screen|selecionar tela|selecionar ecra|sélectionner|auswählen/i;
        const choose =
          buttons.find((b) => localized.test(b.textContent || '')) ||
          buttons.filter((b) => {
            const text = (b.textContent || '').trim();
            return text && !/^(480p|720p|1080p|1fps|10fps|30fps|60fps)$/i.test(text) &&
              !/back|voltar|backbutton/i.test(text);
          }).pop();
        try { choose?.click(); } catch (_) {}
      }, 150);
    };

    new MutationObserver(autoPick).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
    autoPick();
  }

  async function openVenmicPicker() {
    async function fetchApps() {
      const res = await API.venmicList().catch(() => ({ ok: false, targets: [], error: 'failed to list' }));
      const targets = (res?.targets || []).filter((t) => t['media.class'] !== 'Stream/Input/Audio');
      return {
        ok: !!res?.ok,
        apps: [...new Set(targets.map((t) => t['application.name']).filter(Boolean))].sort(),
        error: res?.error || '',
      };
    }
    let { apps, error } = await fetchApps();
    return new Promise((resolve) => {
      const old = document.getElementById('neri-venmic-modal'); if (old) old.remove();
      const modal = document.createElement('div');
      modal.id = 'neri-venmic-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px)';
      modal.innerHTML = `<div class="neri-extras-popover" style="width:min(380px,calc(100vw - 24px))"><div class="neri-extras-card"><div class="neri-extras-head neri-extras-drag"><span><span class="material-symbols-rounded">graphic_eq</span> Broadcast audio</span><button class="neri-extras-close" data-act="close" title="Close">&times;</button></div>
        <p>Select which apps to include in the stream. Close this window to use the system default audio.</p>
        <div id="neri-venmic-list" style="max-height:220px;overflow:auto;display:flex;flex-direction:column;gap:6px;margin:8px 0"></div>
        <div class="neri-extras-row" style="gap:8px">
          <button data-act="refresh" class="scan-btn" title="Scan again for audio apps" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px"><span class="material-symbols-rounded" style="font-size:18px">refresh</span> Scan for audio apps</button>
          <button data-act="ok" class="primary" style="flex:1">Share selected</button>
        </div>
        <div id="neri-venmic-status" style="font-size:12px;color:#aaa;margin-top:8px;min-height:16px"></div></div></div>`;
      document.body.appendChild(modal);
      makePopoverDraggable(modal.querySelector('.neri-extras-popover'));
      const list = modal.querySelector('#neri-venmic-list');
      const status = modal.querySelector('#neri-venmic-status');
      const renderList = () => {
        list.innerHTML = '';
        if (!apps.length) {
          list.innerHTML = `<div style="opacity:.7;font-size:13px">No audio apps detected.${error ? ` <span style="opacity:.7">(${String(error)})</span>` : ''}</div>`;
          return;
        }
        apps.forEach((name) => {
          const label = document.createElement('label');
          label.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:13px';
          const checked = state.venmicInclude.some((i) => i['application.name'] === name) ? 'checked' : '';
          label.innerHTML = `<input type="checkbox" value="${name.replace(/"/g,'&quot;')}" ${checked}> <span>${name}</span>`;
          list.appendChild(label);
        });
      };
      renderList();
      let done = false;
      const finish = (val) => { if (done) return; done = true; modal.remove(); resolve(val); };
      modal.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        const act = btn?.getAttribute('data-act');
        if (act === 'close') return finish([]);
        if (act === 'refresh') {
          e.preventDefault();
          btn.disabled = true;
          status.textContent = 'Scanning for audio apps...';
          const r = await fetchApps();
          apps = r.apps; error = r.error;
          renderList();
          status.textContent = `Scan complete — ${apps.length} audio app(s) found. Start playback in an app if it is missing.`;
          btn.disabled = false;
          return;
        }
        if (act === 'ok') {
          const selected = [...list.querySelectorAll('input:checked')].map((i) => ({ 'application.name': i.value }));
          state.venmicInclude = selected;
          finish(selected);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Botão/painel da câmera dentro da tela: só aparece durante a transmissão.
  // -------------------------------------------------------------------------
  function openCameraOverlaySettings() {
    const old = document.getElementById('neri-camera-overlay-modal');
    if (old) { old.remove(); return; }

    const modal = document.createElement('div');
    modal.id = 'neri-camera-overlay-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,0.45)';
    modal.innerHTML = `<div class="neri-extras-popover" style="width:min(360px,calc(100vw - 24px))"><div class="neri-extras-card">
      <div class="neri-extras-head neri-extras-drag"><span><span class="material-symbols-rounded">videocam</span> Camera on screen share</span><button type="button" class="neri-extras-close" data-act="close" title="Close">&times;</button></div>
      <label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:13px"><input type="checkbox" id="neri-cam-enabled" ${state.cameraOverlay ? 'checked' : ''}> Show camera inside the screen share</label>
      <div style="font-size:12px;opacity:.75;margin-bottom:6px">Camera position</div>
      <div id="neri-cam-positions" style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px"></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:10px"><span>Camera transparency</span><span id="neri-cam-opacity-label">${state.overlaySettings?.opacity ?? 100}%</span></div>
      <input type="range" id="neri-cam-opacity" min="20" max="100" value="${state.overlaySettings?.opacity ?? 100}" style="width:100%">
      <div style="font-size:11px;opacity:.7;margin-top:10px">Saved on this computer. Each new share starts without the camera.</div>
      <div class="neri-extras-row" style="gap:8px;margin-top:12px">
        <button type="button" data-act="close" style="flex:1">Cancel</button>
        <button type="button" data-act="save" class="primary" style="flex:1">Save</button>
      </div>
    </div></div>`;
    document.body.appendChild(modal);
    makePopoverDraggable(modal.querySelector('.neri-extras-popover'));

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      try { document.removeEventListener?.('keydown', onKey); } catch (_) {}
      modal.remove();
    };
    const onKey = (e) => { if (e?.key === 'Escape') close(); };
    document.addEventListener?.('keydown', onKey);

    const bind = (selector, handler) => {
      modal.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          handler(btn);
        });
      });
    };

    const positions = [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'middle-center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ];
    let draftPosition = overlayPosition();
    const opacityInput = modal.querySelector('#neri-cam-opacity');
    const opacityLabel = modal.querySelector('#neri-cam-opacity-label');
    const onOpacityInput = () => {
      if (opacityLabel) opacityLabel.textContent = opacityInput.value + '%';
      const value = Math.max(20, Math.min(100, Number(opacityInput?.value) || 100));
      state.overlaySettings = { ...state.overlaySettings, opacity: value };
      repaintComposition();
    };
    opacityInput?.addEventListener?.('input', onOpacityInput);
    onOpacityInput();
    const grid = modal.querySelector('#neri-cam-positions');
    const renderPositions = () => {
      grid.innerHTML = positions.map((p) => {
        const active = p === draftPosition;
        const bg = active ? 'var(--primary-color, #5865f2)' : 'rgba(255,255,255,0.06)';
        const fg = active ? '#fff' : 'rgba(255,255,255,0.72)';
        const border = active ? 'var(--primary-color, #5865f2)' : 'rgba(255,255,255,0.12)';
        return `<button type="button" data-act="pos" data-pos="${p}" class="${active ? 'primary' : ''}" style="font-size:11px;padding:5px;background:${bg};color:${fg};border:1px solid ${border};font-weight:${active ? 600 : 400}">${p.replace('-', ' ')}</button>`;
      }).join('');
      grid.querySelectorAll('[data-act="pos"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          draftPosition = btn.getAttribute('data-pos');
          renderPositions();
        });
      });
    };
    renderPositions();

    bind('[data-act="close"]', close);
    bind('[data-act="save"]', async (btn) => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const enabled = !!modal.querySelector('#neri-cam-enabled')?.checked;
        const opacity = Math.max(20, Math.min(100, Number(opacityInput?.value) || 100));
        state.overlaySettings = { ...state.overlaySettings, position: draftPosition, opacity };
        await saveSetting('cameraOverlayPosition', draftPosition);
        await saveSetting('cameraOverlayOpacity', opacity);
        await saveSetting('cameraOverlay', enabled);
        if (enabled && !state.screenSharing) {
          state.pendingCameraOverlay = true;
          await startNativeScreenShare();
          toast('Escolha a tela para compartilhar');
        } else {
          await applyCameraOverlay(enabled);
          toast('Camera settings saved');
        }
        updateButtons();
      } catch (error) {
        log('camera panel save failed', error);
        toast('Could not save camera settings', 'error');
      } finally {
        close();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  // Patch de mensagem de voz por clique removido: comportamento nativo do Nerimity mantido.

  // -------------------------------------------------------------------------
  // 2) TTS: lê mensagens do chat onde a pessoa está em call.
  // -------------------------------------------------------------------------
  function isInCall() {
    return Boolean(
      document.querySelector('[class*="headerVoiceParticipants"]') ||
      document.querySelector('[class*="InVoiceActions"]') ||
      document.querySelector('[class*="inVoiceActions"]') ||
      document.querySelector('[class*="voiceActions"]') ||
      document.querySelector('[class*="callParticipants"]') ||
      document.querySelector('[class*="VoiceHeader"]') ||
      document.querySelector('[class*="voiceHeader"]') ||
      document.querySelector('[class*="InCall"]') ||
      document.querySelector('#neri-extras-buttons')
    );
  }

  function cleanTextForTTS(raw) {
    if (!raw) return '';
    let text = raw;
    // Remove URLs
    text = text.replace(/https?:\/\/\S+/gi, ' ');
    // Remove markdown de links [texto](url)
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Remove menções/markup comuns
    text = text.replace(/<@!?\d+>/g, ' ');
    text = text.replace(/:[a-zA-Z0-9_+-]+:/g, ' '); // emojis :nome:
    text = text.replace(/```[\s\S]*?```/g, ' code block ');
    text = text.replace(/`[^`]+`/g, ' ');
    text = text.replace(/[*_~>|#]/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  function messageText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
      'img, video, audio, canvas, iframe, [class*="embed"], [class*="Embed"], ' +
      '[class*="attachment"], [class*="Attachment"], [class*="reactions"], ' +
      '[class*="Reactions"], [class*="floatOptions"], [class*="reply"], ' +
      'button, [class*="audio"], [class*="Audio"], [class*="translation"], ' +
      '[class*="username"], [class*="Username"], [class*="details"], [class*="Details"], ' +
      '[class*="timestamp"], [class*="Timestamp"], [class*="time"], [class*="badge"], ' +
      '[class*="Badge"], [class*="role"], [class*="Role"], [class*="avatar"], [class*="Avatar"], ' +
      '[class*="presence"], [class*="status"], [class*="replyContent"]'
    ).forEach((n) => n.remove());
    return cleanTextForTTS(clone.textContent || '');
  }

  function messageAuthor(el) {
    // Pega apenas o texto direto do username, evitando badges/ícones duplicados.
    const node = el.querySelector('[class*="username"]');
    if (!node) return '';
    // Clona e remove ícones/badges/roles que podem poluir o texto.
    const c = node.cloneNode(true);
    c.querySelectorAll('svg, img, [class*="badge"], [class*="Badge"], [class*="role"], [class*="Role"], [class*="bot"]').forEach(n => n.remove());
    const text = (c.textContent || '').replace(/\s+/g, ' ').trim();
    // Evita "nome nome" duplicado simples
    const parts = text.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const half = Math.floor(parts.length / 2);
      const a = parts.slice(0, half).join(' ').toLowerCase();
      const b = parts.slice(half).join(' ').toLowerCase();
      if (a && a === b) return parts.slice(0, half).join(' ');
    }
    return text;
  }

  function messageId(el) {
    return el.id || el.getAttribute('data-message-id') || '';
  }

  function shouldRead(author) {
    if (state.ttsMode === 'all') return true;
    const a = author.toLowerCase();
    return state.ttsUsers.some((u) => a.includes(u) || u.includes(a));
  }

  function pickVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (!voices.length) return null;
    if (state.ttsVoice) {
      const exact = voices.find((v) => v.name === state.ttsVoice);
      if (exact) return exact;
    }
    return (
      voices.find((v) => /pt[-_]?BR/i.test(v.lang)) ||
      voices.find((v) => /^pt/i.test(v.lang)) ||
      voices.find((v) => v.default) ||
      voices[0]
    );
  }

  try {
    window.speechSynthesis?.getVoices?.();
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
      const vs = window.speechSynthesis.getVoices();
      log('TTS vozes carregadas:', vs.length);
    });
  } catch (_) {}
  document.addEventListener('click', () => { try { window.speechSynthesis?.resume?.(); } catch (_) {} }, true);

  const LOCALE_BY_NAME = {
    português: 'pt-BR', portugues: 'pt-BR', 'português (brasil)': 'pt-BR',
    'portuguese (brazil)': 'pt-BR', 'pt-br': 'pt-BR',
    english: 'en-US', 'english (us)': 'en-US', 'inglês': 'en-US',
    español: 'es-ES', espanhol: 'es-ES', spanish: 'es-ES',
    français: 'fr-FR', francês: 'fr-FR', french: 'fr-FR',
    deutsch: 'de-DE', alemão: 'de-DE', german: 'de-DE',
    italiano: 'it-IT', italian: 'it-IT',
    русский: 'ru-RU', russian: 'ru-RU',
    日本語: 'ja-JP', japanese: 'ja-JP',
    한국어: 'ko-KR', korean: 'ko-KR',
    '简体中文': 'zh-CN', chinese: 'zh-CN',
  };

  function localeFromValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(raw)) {
      return raw.replace(/_/g, '-');
    }
    const named = LOCALE_BY_NAME[raw.toLowerCase().replace(/\s+/g, ' ')];
    if (named) return named;
    const match = raw.match(
      /["']?(?:locale|language|lang|idioma)["']?\s*[:=]\s*["']?([a-z]{2,3}(?:[-_][a-z]{2,4})?)["']?/i
    );
    return match ? match[1].replace(/_/g, '-') : '';
  }

  // Idioma configurado no Nerimity/site, com fallback para o navegador/sistema.
  function detectPageLocale() {
    const candidates = [];
    if (document.documentElement?.lang) candidates.push(document.documentElement.lang);
    try {
      for (const key of Object.keys(localStorage)) {
        if (!/lang|locale|idioma|i18n/i.test(key)) continue;
        const found = localeFromValue(localStorage.getItem(key));
        if (found) candidates.push(found);
      }
    } catch (_) {}
    if (navigator.language) candidates.push(navigator.language);
    return candidates.find(Boolean) || '';
  }

  function ttsPayload(text) {
    return {
      text,
      rate: state.ttsRate || 1,
      pitch: 50,
      language:
        state.ttsLocale && state.ttsLocale !== 'auto'
          ? state.ttsLocale
          : detectPageLocale(),
      voice: state.ttsVoice || '',
      engine: 'edge',
    };
  }

  async function speakNext() {
    if (state.ttsSpeaking || !state.ttsQueue.length || !state.ttsEnabled) return;
    const item = state.ttsQueue.shift();
    state.ttsSpeaking = true;
    try {
      const r = await API.ttsSpeak(ttsPayload(item.text));
      if (!r?.ok) log('TTS falhou:', r?.error);
    } catch (e) {
      log('TTS erro:', e);
    }
    state.ttsSpeaking = false;
    speakNext();
  }

  function enqueueTTS(author, text) {
    if (!state.ttsEnabled || !text) return;
    if (!shouldRead(author)) return;
    const cleanAuthor = (author || '').replace(/\s+/g, ' ').trim();
    const cleanMsg = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanMsg) return;
    const key = (cleanAuthor + '|' + cleanMsg).toLowerCase();
    if (state.ttsLastSpoken === key) return; // evita repetir a mesma mensagem
    state.ttsLastSpoken = key;
    const prefix = cleanAuthor ? cleanAuthor + ' disse: ' : '';
    const full = (prefix + cleanMsg).slice(0, 500);
    state.ttsQueue.push({ author: cleanAuthor, text: full });
    speakNext();
  }

  function scanMessages() {
    if (!state.ttsEnabled || !isInCall()) return;
    const items = document.querySelectorAll('.messageItem, [class*="messageItem"], [class*="MessageItem"]');
    items.forEach((el) => {
      if (el.dataset.neriTtsSeen === '1') return;
      // Ignora itens aninhados: lê só o container de mensagem mais externo.
      if (el.parentElement?.closest('.messageItem, [class*="messageItem"], [class*="MessageItem"]')) return;
      el.dataset.neriTtsSeen = '1';
      if (!state.ttsReady) return;
      const author = messageAuthor(el);
      const text = messageText(el);
      if (!text || text.length < 2) return;
      if (/^(gif|enviar|send|edit|reply|edited)$/i.test(text)) return;
      enqueueTTS(author, text);
    });
  }

  function startTTS() {
    document.querySelectorAll('.messageItem, [class*="messageItem"], [class*="MessageItem"]').forEach((el) => {
      el.dataset.neriTtsSeen = '1';
    });
    state.ttsLastSpoken = '';
    state.ttsReady = true;
    state.ttsEnabled = true;
    if (!isInCall()) {
      toast('TTS enabled — join a voice call to start reading', 'error');
    } else {
      toast('TTS enabled — reading new messages in the call');
    }
    updateButtons();
  }

  function stopTTS() {
    state.ttsEnabled = false;
    state.ttsQueue = [];
    state.ttsSpeaking = false;
    try { speechSynthesis.cancel(); } catch (_) {}
    toast('TTS disabled');
    updateButtons();
  }

  // -------------------------------------------------------------------------
  // Soundboard / Soundux
  // -------------------------------------------------------------------------
  async function playSound(file) {
    try {
      const dataUrl = await API.readAudioFile(file.path);
      if (!dataUrl) throw new Error('empty or unreadable file');
      const audio = new Audio();
      audio.src = dataUrl;
      audio.volume = 1;
      audio.preload = 'auto';
      await audio.play();
      toast('Playing: ' + file.name);
    } catch (error) {
      log('playSound error', error);
      toast('Error playing ' + file.name + ': ' + (error?.message || error), 'error');
    }
  }

  function renderSoundList(container) {
    container.innerHTML = '';
    if (!state.files.length) {
      container.textContent = 'No .mp3, .wav or .flac files found.';
      return;
    }
    state.files.forEach((file) => {
      const button = document.createElement('button');
      button.className = 'neri-extras-sound';
      const mark = document.createElement('span');
      mark.className = 'material-symbols-rounded';
      mark.textContent = 'play_arrow';
      button.appendChild(mark);
      const label = document.createElement('span');
      label.textContent = file.name;
      button.appendChild(label);
      button.addEventListener('click', () => playSound(file));
      container.appendChild(button);
    });
  }

  async function openSoundModal() {
    const existing = document.getElementById('neri-extras-modal');
    if (existing) { existing.remove(); return; }
    state.folder = state.folder || (await API.getSetting('soundFolder', ''));

    const panel = document.createElement('div');
    panel.id = 'neri-extras-modal';
    panel.className = 'neri-extras-popover';
    panel.innerHTML = `
      <div class="neri-extras-card">
        <div class="neri-extras-head neri-extras-drag" title="Drag to move">
          <span><span class="material-symbols-rounded">graphic_eq</span> Soundboard</span>
          <button class="neri-extras-close" data-act="close" title="Close">&times;</button>
        </div>
        <p>Where is the folder with audio files to play in the Nerimity call?</p>
        <div class="neri-extras-row">
          <input id="neri-extras-folder" type="text" placeholder="/path/to/audio/folder" />
          <button data-act="browse">Browse</button>
        </div>
        <div class="neri-extras-row">
          <button data-act="save" class="primary">Save and use soundboard</button>
          <button data-act="soundux">Open Soundux</button>
        </div>
        <div id="neri-extras-sounds" class="neri-extras-sounds"></div>
      </div>`;

    panel.style.position = 'fixed';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.zIndex = '2147483002';
    document.body.appendChild(panel);
    makePopoverDraggable(panel);

    const input = panel.querySelector('#neri-extras-folder');
    input.value = state.folder;
    const list = panel.querySelector('#neri-extras-sounds');
    if (state.folder) {
      state.files = await API.listAudioFiles(state.folder);
      renderSoundList(list);
    }

    panel.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.getAttribute('data-act');
      if (!action) return;
      if (action === 'close') panel.remove();
      if (action === 'browse') {
        const picked = await API.chooseAudioFolder();
        if (picked) input.value = picked;
      }
      if (action === 'save') {
        state.folder = input.value.trim();
        if (!state.folder) return toast('Choose a folder first', 'error');
        await API.setSetting('soundFolder', state.folder);
        state.files = await API.listAudioFiles(state.folder);
        renderSoundList(list);
        toast(state.files.length + ' audio file(s) loaded');
      }
      if (action === 'soundux') {
        const folder = input.value.trim() || state.folder;
        if (!folder) return toast('Choose a folder first', 'error');
        await API.setSetting('soundFolder', folder);
        toast('Opening Soundux...');
        const result = await API.openSoundux(folder);
        if (!result.ok) toast('Failed to open Soundux: ' + (result.error || ''), 'error');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Modal TTS
  // -------------------------------------------------------------------------
  function makePopoverDraggable(popover) {
    const handle = popover.querySelector('.neri-extras-drag');
    if (!handle) return;
    handle.style.cursor = 'grab';
    let dragging = false;
    let sx = 0, sy = 0, sl = 0, st = 0;
    const onMove = (e) => {
      if (!dragging) return;
      popover.style.left = (sl + (e.clientX - sx)) + 'px';
      popover.style.top = (st + (e.clientY - sy)) + 'px';
      popover.style.right = 'auto';
      popover.style.bottom = 'auto';
      popover.style.transform = 'none';
    };
    const onUp = () => { dragging = false; handle.style.cursor = 'grab'; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,input,select,textarea')) return;
      dragging = true;
      handle.style.cursor = 'grabbing';
      const r = popover.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      popover.style.position = 'fixed';
      popover.style.left = sl + 'px'; popover.style.top = st + 'px';
      popover.style.right = 'auto'; popover.style.bottom = 'auto'; popover.style.transform = 'none';
      document.body.appendChild(popover);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      e.preventDefault();
    });
  }

  function openTTSModal() {
    const existing = document.getElementById('neri-tts-modal');
    if (existing) { existing.remove(); return; }
    const overlay = document.createElement('div');
    overlay.id = 'neri-tts-modal';
    overlay.className = 'neri-extras-popover';
    overlay.innerHTML = `
      <div class="neri-extras-card">
        <div class="neri-extras-head neri-extras-drag" title="Drag to move">
          <span><span class="material-symbols-rounded">record_voice_over</span> Chat reader (TTS)</span>
          <button class="neri-extras-close" data-act="close" title="Close">&times;</button>
        </div>
        <p>Reads new chat messages aloud while you are in a voice call. Links and media are ignored.</p>
        <div class="neri-extras-row" style="flex-direction:column;align-items:stretch;gap:10px">
          <label style="display:flex;gap:8px;align-items:center"><input type="radio" name="tts-mode" value="all"> Read all messages</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="radio" name="tts-mode" value="selected"> Read only from selected users</label>
          <input id="neri-tts-users" type="text" placeholder="usernames separated by commas" />
          <label style="font-size:13px;color:#aaa">Speed: <span id="neri-tts-rate-val"></span></label>
          <input id="neri-tts-rate" type="range" min="0.7" max="1.6" step="0.1" />
          <label style="font-size:13px;color:#aaa">Voice language</label>
          <select id="neri-tts-locale">
            <option value="auto">Automatic (Nerimity / system)</option>
            <option value="pt-BR">Portuguese (Brazil)</option>
            <option value="pt-PT">Portuguese (Portugal)</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Spanish (Spain)</option>
            <option value="es-MX">Spanish (Mexico)</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="it-IT">Italian</option>
            <option value="ru-RU">Russian</option>
            <option value="ja-JP">Japanese</option>
            <option value="ko-KR">Korean</option>
            <option value="zh-CN">Chinese</option>
            <option value="ar-SA">Arabic</option>
            <option value="hi-IN">Hindi</option>
          </select>
          <input id="neri-tts-voice" type="text" placeholder="Custom voice (e.g. pt-BR-FranciscaNeural)" />
          <div id="neri-tts-detected" style="font-size:12px;color:#888"></div>
          <div id="neri-tts-diag" style="font-size:12px;color:#888"></div>
        </div>
        <div class="neri-extras-row">
          <button data-act="toggle" class="primary"></button>
          <button data-act="test">Test voice</button>
        </div>
      </div>`;
    overlay.style.position = 'fixed';
    overlay.style.left = '50%';
    overlay.style.top = '50%';
    overlay.style.transform = 'translate(-50%, -50%)';
    overlay.style.zIndex = '2147483002';
    document.body.appendChild(overlay);
    makePopoverDraggable(overlay);

    const modeAll = overlay.querySelector('input[value="all"]');
    const modeSel = overlay.querySelector('input[value="selected"]');
    const usersInput = overlay.querySelector('#neri-tts-users');
    const rate = overlay.querySelector('#neri-tts-rate');
    const rateVal = overlay.querySelector('#neri-tts-rate-val');
    const localeSel = overlay.querySelector('#neri-tts-locale');
    const voiceInput = overlay.querySelector('#neri-tts-voice');
    const detected = overlay.querySelector('#neri-tts-detected');
    const toggleBtn = overlay.querySelector('[data-act="toggle"]');
    const diag = overlay.querySelector('#neri-tts-diag');
    modeAll.checked = state.ttsMode === 'all';
    modeSel.checked = state.ttsMode === 'selected';
    usersInput.value = state.ttsUsers.join(', ');
    rate.value = String(state.ttsRate || 1);
    rateVal.textContent = rate.value + 'x';
    localeSel.value = state.ttsLocale || 'auto';
    voiceInput.value = state.ttsVoice || '';
    const autoLocale = detectPageLocale();
    detected.textContent = `Detected language: ${autoLocale || 'not detected (using pt-BR default)'}`;
    toggleBtn.textContent = state.ttsEnabled ? 'Disable TTS' : 'Enable TTS';
    const updateDiag = () => {
      const inCall = isInCall();
      const lang =
        state.ttsLocale && state.ttsLocale !== 'auto'
          ? state.ttsLocale
          : autoLocale || 'automatic';
      diag.textContent = `Engine: embedded edge-tts | Language: ${lang} | Voice: ${state.ttsVoice || 'automatic'} | In call: ${inCall ? 'yes' : 'no'} | Queue: ${state.ttsQueue.length}`;
    };
    updateDiag();

    const applySettings = async () => {
      state.ttsMode = modeSel.checked ? 'selected' : 'all';
      state.ttsUsers = usersInput.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      state.ttsRate = parseFloat(rate.value) || 1;
      state.ttsLocale = localeSel.value || 'auto';
      state.ttsVoice = voiceInput.value.trim();
      state.ttsEngine = 'edge';
      await API.setSetting('ttsMode', state.ttsMode);
      await API.setSetting('ttsUsers', state.ttsUsers);
      await API.setSetting('ttsRate', state.ttsRate);
      await API.setSetting('ttsLocale', state.ttsLocale);
      await API.setSetting('ttsVoice', state.ttsVoice);
      await API.setSetting('ttsEngine', 'edge');
      updateDiag();
    };
    rate.addEventListener('input', () => { rateVal.textContent = rate.value + 'x'; applySettings(); });
    modeAll.addEventListener('change', applySettings);
    modeSel.addEventListener('change', applySettings);
    usersInput.addEventListener('change', applySettings);
    localeSel.addEventListener('change', applySettings);
    voiceInput.addEventListener('change', applySettings);

    overlay.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.getAttribute('data-act');
      if (!action) return;
      if (action === 'close') overlay.remove();
      if (action === 'toggle') {
        await applySettings();
        if (state.ttsEnabled) stopTTS(); else startTTS();
        toggleBtn.textContent = state.ttsEnabled ? 'Disable TTS' : 'Enable TTS';
        updateDiag();
      }
      if (action === 'test') {
        await applySettings();
        const text = 'Nerimity chat read-aloud test';
        toast('Testing voice...');
        const r = await API.ttsSpeak(ttsPayload(text));
        toast(r?.ok ? `TTS test OK (${r.backend})` : 'TTS failed: ' + (r?.error || 'unknown error'), r?.ok ? '' : 'error');
        updateDiag();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Botões injetados na barra nativa da chamada
  // -------------------------------------------------------------------------
  function findCallBar() {
    return document.querySelector('[class*="voiceActions"]');
  }

  async function iconMarkup(name) {
    if (state.iconCache.has(name)) return state.iconCache.get(name);
    let svg = '';
    try {
      const res = await fetch('https://nerimity.com/msr/' + name + '-fill.svg');
      if (res.ok) {
        svg = await res.text();
        svg = svg.replace(/width="48"/, 'width="24"').replace(/height="48"/, 'height="24"').replace(/fill="[^"]*"/, 'fill="currentColor"');
      }
    } catch (_) {}
    state.iconCache.set(name, svg);
    const path = svg.match(/<path[^>]+d="([^"]+)"/i);
    if (path?.[1]) state.iconSignatureCache.set(name, path[1]);
    return svg;
  }

  const NATIVE_ICONS = ['monitor', 'videocam', 'desktop_access_disabled', 'call_end', 'fullscreen'];

  function labelNativeIcons() {
    for (const name of NATIVE_ICONS) {
      const signature = state.iconSignatureCache.get(name);
      if (!signature) continue;
      document.querySelectorAll('span.icon').forEach((span) => {
        if (span.getAttribute('data-neri-icon')) return;
        if ((span.innerHTML || '').includes(signature)) {
          span.setAttribute('data-neri-icon', name);
        }
      });
    }
    patchNativeCallEnd();
    patchNativeFullscreen();
  }

  function patchNativeCallEnd() {
    const bar = findCallBar();
    if (!bar) return;
    bar.querySelectorAll('button').forEach((btn) => {
      if (btn.__neriCallEndPatched) return;
      if (!btn.querySelector('span.icon[data-neri-icon="call_end"]')) return;
      btn.__neriCallEndPatched = true;
      btn.addEventListener('click', () => {
        setTimeout(() => { handleScreenShareEnded(); }, 0);
      }, true);
    });
  }

  async function startNativeScreenShare() {
    const bar = findCallBar();
    if (!bar) return false;
    const buttons = () => [...bar.querySelectorAll('button')];
    const stop = buttons().find((b) => b.querySelector('span.icon[data-neri-icon="desktop_access_disabled"]'));
    if (stop) {
      stop.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    const monitor = buttons().find((b) => b.querySelector('span.icon[data-neri-icon="monitor"]'));
    if (!monitor) return false;
    monitor.click();
    return true;
  }

  function patchNativeFullscreen() {
    // O botão fica no container do vídeo, fora da barra voiceActions.
    document.querySelectorAll('button').forEach((btn) => {
      if (btn.__neriFullscreenPatched || btn.getAttribute('data-neri-extra')) return;
      if (btn.closest?.('#neri-video-fullscreen')) return;
      const icon = btn.querySelector('span.icon[data-neri-icon="fullscreen"]');
      const title = (btn.getAttribute('title') || '').toLowerCase();
      if (!icon && !/fullscreen|tela cheia|pantalla completa|plein écran/i.test(title)) return;
      btn.__neriFullscreenPatched = true;
      btn.addEventListener('click', (e) => {
        e?.preventDefault?.();
        e?.stopImmediatePropagation?.();
        handleFullscreenClick(btn);
      }, true);
    });
  }

  // Captura global: cobre botões criados depois do patch e os dois vídeos
  // (próprio e de outras pessoas) sem depender da barra da chamada.
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button');
    if (!btn || btn.getAttribute('data-neri-extra')) return;
    // Os controles do player próprio não são botões do Nerimity; o botão de
    // sair, por exemplo, tem "fullscreen" no título e não deve reabrir nada.
    if (btn.closest?.('#neri-video-fullscreen')) return;
    const icon = btn.querySelector('span.icon[data-neri-icon="fullscreen"]');
    const title = (btn.getAttribute('title') || '').toLowerCase();
    if (!icon && !/fullscreen|tela cheia|pantalla completa|plein écran/i.test(title)) return;
    e?.preventDefault?.();
    handleFullscreenClick(btn);
  }, true);

  function makeButton(template, name, color, act, title) {
    const button = template.cloneNode(true);
    button.removeAttribute('data-type');
    button.setAttribute('data-neri-extra', '1');
    button.setAttribute('data-act', act);
    button.setAttribute('title', title);
    button.innerHTML = '';
    const iconTemplate = template.querySelector('span.icon');
    const span = iconTemplate ? iconTemplate.cloneNode(false) : document.createElement('span');
    if (!iconTemplate) span.className = 'icon';
    span.style.setProperty('--icon-color', color);
    span.style.width = '24px';
    span.style.height = '24px';
    span.setAttribute('data-neri-icon', name);
    button.appendChild(span);
    iconMarkup(name).then((svg) => { if (span.isConnected && svg) span.innerHTML = svg; });
    return button;
  }

  function audioIconName() {
    return state.mode === 'full' || state.mode === 'isolate' ? 'volume_up' : state.mode === 'clean' ? 'volume_down' : 'volume_off';
  }

  function updateButtons() {
    const host = document.getElementById('neri-extras-buttons');
    if (!host) return;

    const cam = host.querySelector('[data-act="camera-overlay"]');
    if (cam) {
      const visible = !!(state.screenSharing || state.cameraOn);
      cam.style.display = visible ? '' : 'none';
      cam.classList.toggle('active', !!state.cameraOverlay);
      cam.setAttribute('title', state.cameraOverlay
        ? 'Camera on screen share (click to configure)'
        : 'Show camera on screen share (click to activate)');
      const span = cam.querySelector('span.icon');
      if (span) span.setAttribute('data-neri-icon', state.cameraOverlay ? 'monitor' : 'videocam');
    }

    const tts = host.querySelector('[data-act="tts"]');
    if (tts) {
      tts.classList.toggle('active', state.ttsEnabled);
      const span = tts.querySelector('span.icon');
      tts.setAttribute('title', state.ttsEnabled ? 'TTS: enabled (click to configure/disable)' : 'Chat reader (TTS)');
      if (span) span.style.setProperty('--icon-color', state.ttsEnabled ? 'var(--success-color)' : 'rgba(255,255,255,0.6)');
    }
  }

  function ensureNativeButtons() {
    const bar = findCallBar();
    if (!bar || bar.querySelector('#neri-extras-buttons')) return;
    let template =
      [...bar.querySelectorAll('button')].find((b) => !b.querySelector('.label')) ||
      bar.querySelector('button');
    if (!template) {
      template = document.createElement('button');
      template.className = 'button';
      template.innerHTML = '<span class="icon" style="--icon-color:#fff;width:24px;height:24px"></span>';
    }

    const host = document.createElement('div');
    host.id = 'neri-extras-buttons';
    host.style.display = 'flex';
    host.style.flexShrink = '0';
    host.style.alignItems = 'center';

    host.appendChild(makeButton(template, 'videocam', 'rgba(255,255,255,0.6)', 'camera-overlay', 'Show camera on screen share'));
    host.appendChild(makeButton(template, 'record_voice_over', 'rgba(255,255,255,0.6)', 'tts', 'Chat reader (TTS)'));

    host.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-act]')?.getAttribute('data-act');
      if (action === 'tts') openTTSModal();
      if (action === 'camera-overlay') {
        // Webcam já ligada sem compartilhar: inicia o seletor de tela e,
        // depois da escolha, compõe a câmera no stream como de costume.
        if (!state.screenSharing && state.cameraOn) {
          state.pendingCameraOverlay = true;
          const started = await startNativeScreenShare();
          if (started) {
            toast('Escolha a tela para compartilhar');
          } else {
            state.pendingCameraOverlay = false;
            openCameraOverlaySettings();
          }
        } else {
          openCameraOverlaySettings();
        }
      }
    });

    const leave = [...bar.querySelectorAll('button.button')].find((b) => b.querySelector('.label'));
    if (leave) bar.insertBefore(host, leave); else bar.appendChild(host);
    updateButtons();
    log('native buttons injected into the call bar');
  }

  async function init() {
    state.isWayland = !!(await API.isWayland?.().catch(() => false));
    const savedVolume = Number(await API.getSetting('chatVideoVolume', 1));
    state.chatVideoVolume = Number.isFinite(savedVolume)
      ? Math.min(1, Math.max(0, savedVolume))
      : 1;
    state.chatVideoMuted = !!(await API.getSetting('chatVideoMuted', false));
    const savedGalleryVolume = Number(await API.getSetting('galleryVolume', 1));
    state.gallery.volume = Number.isFinite(savedGalleryVolume)
      ? Math.min(1, Math.max(0, savedGalleryVolume))
      : 1;
    state.gallery.muted = !!(await API.getSetting('galleryMuted', false));
    state.mode = (await API.getSetting('screenShareAudioMode', 'clean')) || 'clean';
    state.ttsMode = (await API.getSetting('ttsMode', 'all')) || 'all';
    state.ttsUsers = (await API.getSetting('ttsUsers', [])) || [];
    state.ttsRate = (await API.getSetting('ttsRate', 1)) || 1;
    state.ttsLocale = (await API.getSetting('ttsLocale', 'auto')) || 'auto';
    state.ttsVoice = (await API.getSetting('ttsVoice', '')) || '';
    state.ttsEngine = 'edge';
    state.overlaySettings = {
      position: (await API.getSetting('cameraOverlayPosition', 'bottom-right')) || 'bottom-right',
      opacity: (await API.getSetting('cameraOverlayOpacity', 100)) || 100,
    };
    if (!(await API.getSetting('cameraOverlayDefaultOffV3', false))) {
      await saveSetting('cameraOverlay', false);
      await saveSetting('cameraOverlayDefaultOffV3', true);
    }
    state.cameraOverlay = false;
    if (!(await API.getSetting('audioModeMigratedV2', false))) {
      state.mode = 'clean';
      await API.setSetting('screenShareAudioMode', 'clean');
      await API.setSetting('audioModeMigratedV2', true);
    }
    state.folder = (await API.getSetting('soundFolder', '')) || '';
    if (state.folder) state.files = await API.listAudioFiles(state.folder).catch(() => []);

    let scheduled = false;
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        ensureNativeButtons();
        labelNativeIcons();
        updateButtons();
        decorateChatVideos();
        checkCloudflareChallenge();
        syncShareGallery();
        if (!findCallBar()) {
          // Não fecha o player de um vídeo do chat só porque não há chamada.
          if (videoPlayer?.callVideo) closeVideoPlayer();
          if (state.screenSharing || state.cameraOverlay || activeComposition) {
            handleScreenShareEnded();
          }
        }
        const inCall = isInCall();
        if (state.ttsEnabled && inCall && !state.ttsWasInCall) {
          // Reentrou na call: marca mensagens atuais como vistas para não ler backlog antigo.
          document.querySelectorAll('.messageItem, [class*="messageItem"], [class*="MessageItem"]').forEach((el) => {
            el.dataset.neriTtsSeen = '1';
          });
          state.ttsQueue = [];
          state.ttsSpeaking = false;
          state.ttsLastSpoken = '';
        }
        state.ttsWasInCall = inCall;
        scanMessages();
      });
    };
    new MutationObserver(refresh).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    Promise.all(NATIVE_ICONS.map((name) => iconMarkup(name).catch(() => '')))
      .then(() => labelNativeIcons());
    setupWaylandPickerBypass();
    checkCloudflareChallenge();
    refresh();
    log('injetado com sucesso');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
