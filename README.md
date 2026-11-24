# Nerimity V2

Modificação do app Electron do Nerimity para corrigir **compartilhamento de tela no Wayland**, implementar **TTS para ler o chat da chamada** e melhorar o **system tray** em distros onde ele não aparecia corretamente.

Baseado no wrapper desktop do Nerimity, mantendo o site oficial `https://nerimity.com` carregado no app.

## Executar

### AppImage

```bash
chmod +x NerimityV2.AppImage
./NerimityV2.AppImage
```

Se o sistema não montar AppImages:

```bash
./NerimityV2.AppImage --appimage-extract-and-run
```

Para iniciar escondido na bandeja:

```bash
./NerimityV2.AppImage --hidden
```

### Flatpak

```bash
flatpak install --user ./NerimityV2.flatpak
flatpak run com.nerimity.desktop
```

Para desinstalar:

```bash
flatpak uninstall --user com.nerimity.desktop
```

## Principais mudanças (V2)

- **Compartilhamento de tela no Wayland**: detecta Wayland/X11 automaticamente. No Wayland o seletor interno do Nerimity é ignorado e o portal da sessão (xdg-desktop-portal) abre diretamente. Depois da escolha da janela/tela aparece o popup para selecionar os apps de áudio; se nada for marcado e você confirmar, a transmissão segue sem som e sem nova pergunta.
- **TTS na chamada**: botão nativo na barra da call para ler mensagens do chat em voz alta. Usa um cliente Edge TTS **embutido** (sem Python, sem `edge-tts` externo), com voz automática baseada no idioma do Nerimity/sistema ou voz/idioma escolhidos no painel. Lê todas as mensagens ou apenas usuários selecionados, ignorando links/mídias. Funciona no AppImage e no Flatpak (áudio enviado ao player do host via `flatpak-spawn`).
- **System tray corrigido**: ícone de bandeja com mostrar/ocultar, recarregar, abrir no navegador e sair; fechar janela mantém o app na bandeja. Inclui lock compartilhado entre AppImage e Flatpak para evitar duas instâncias do wrapper.
- **Cache leve de metadados**: cache HTTP curto para metadados de canais/servidores/usuários/CDN, sem cachear conteúdo de mensagens.
- **Compatibilidade/estabilidade**: `WindowAPI` completo no preload, correção CORS para Google Drive, flag anti-automação para Turnstile e ajustes para evitar problemas de áudio no compartilhamento Linux.

## Recursos injetados

### Leitor de chat (TTS)

Botão na barra nativa da chamada. Lê novas mensagens enquanto você está em chamada. Configurações: todas as mensagens ou usuários selecionados, velocidade, idioma da voz (`Automático` usa o idioma do Nerimity ou do sistema) e voz personalizada (ex.: `pt-BR-FranciscaNeural`). O áudio é gerado localmente pelo cliente embutido e tocado com `pw-play`, `ffplay`, `mpv`, `paplay` ou `aplay` disponível no host.



## System tray

- Clique: mostra/oculta a janela
- Menu: *Mostrar/Ocultar*, *Recarregar*, *Abrir no navegador*, *Sair*
- Fechar a janela (`X`) esconde na bandeja; use **Sair** para encerrar

## Permissões Flatpak

Incluídas: Wayland, X11, IPC, DRI (GPU), PulseAudio, rede, home e `org.kde.StatusNotifierWatcher`. O compartilhamento de tela usa o portal ScreenCast do xdg-desktop-portal. Se necessário:

```bash
flatpak permission-set screencast screencast com.nerimity.desktop yes
```

### Reconstruir o Flatpak

O `electron-builder` gera o bundle. Precisa de `flatpak`, `flatpak-builder`
(>= 1.2.2) e `fuse3`, além dos refs `org.freedesktop.Platform//26.08`,
`org.freedesktop.Sdk//26.08` e `org.electronjs.Electron2.BaseApp//26.08`
(installados automaticamente do Flathub).

Nesta máquina o sudo exige senha, então instalei o builder como Flatpak e criei
um wrapper em `~/.local/bin/flatpak-builder`:

```bash
flatpak install --user flathub org.flatpak.Builder
# ~/.local/bin/flatpak-builder:
#   #!/bin/bash
#   exec flatpak run --filesystem=home --filesystem=/tmp --share=network \
#     org.flatpak.Builder "$@"
export PATH="$HOME/.local/bin:$PATH"
npm run build:flatpak
```

## Reconstruir

```bash
cd nerimityV2
npm install
node node_modules/electron/install.js   # se o binário do Electron não baixar
npm run build          # AppImage
npm run build:flatpak  # Flatpak
```

## Checksums (SHA-256)

- `NerimityV2.AppImage`: `c036c25aaff13ccc94dc3af5758df3f4c0af2fb69d99c7a26b8bf4798dc8d936`
- `NerimityV2.flatpak`: `107c7d9324031c6cb631131cb3cbdfbd8b4996062a58a0f0933c6e8bc2cddbc8`

## Código-fonte para GitHub

O código-fonte deste projeto está na pasta:

```text
/home/kayronn/Documentos/Projeto Padrão/nerimityV2
```

Para gerar um `.tar.gz` para enviar ao GitHub (excluindo `node_modules`, `dist` e artefatos locais grandes), rode:

```bash
cd "/home/kayronn/Documentos/Projeto Padrão"
tar --exclude='nerimityV2/node_modules' \
    --exclude='nerimityV2/dist' \
    --exclude='nerimityV2/.flatpak-builder' \
    -czf nerimity-v2-source.tar.gz nerimityV2
```

O arquivo ficará em `/home/kayronn/Documentos/Projeto Padrão/nerimity-v2-source.tar.gz`.
