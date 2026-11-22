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

- **Compartilhamento de tela no Wayland**: usa `desktopCapturer` + `setDisplayMediaRequestHandler`, detecta Wayland/X11 automaticamente e prioriza o seletor nativo do portal no Wayland para permitir escolher uma janela/tela nova a cada transmissão.
- **TTS na chamada**: botão nativo na barra da call para ler mensagens do chat em voz alta (Edge TTS `pt-BR-FranciscaNeural`), com opção de ler todas as mensagens ou apenas usuários selecionados, ignorando links/mídias.
- **System tray corrigido**: ícone de bandeja com mostrar/ocultar, recarregar, abrir no navegador e sair; fechar janela mantém o app na bandeja. Inclui lock compartilhado entre AppImage e Flatpak para evitar duas instâncias do wrapper.
- **Cache leve de metadados**: cache HTTP curto para metadados de canais/servidores/usuários/CDN, sem cachear conteúdo de mensagens.
- **Compatibilidade/estabilidade**: `WindowAPI` completo no preload, correção CORS para Google Drive, flag anti-automação para Turnstile e ajustes para evitar problemas de áudio no compartilhamento Linux.

## Recursos injetados

### Leitor de chat (TTS)

Botão na barra nativa da chamada. Lê novas mensagens enquanto você está em chamada. Configurações: todas as mensagens ou usuários selecionados, velocidade e teste de voz.



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
cd nerimity-appimage
npm install
node node_modules/electron/install.js   # se o binário do Electron não baixar
npm run build          # AppImage
npm run build:flatpak  # Flatpak
```

## Checksums (SHA-256)

- `NerimityV2.AppImage`: `dc7e5aa83813db41fc073029e9f79aca88e42c49190f5f11c7e6bec581c45b35`
- `NerimityV2.flatpak`: `38be2cabde04672bd29239f75acb1183316f34ca3c5826d475d831ed203a2df2`

## Código-fonte para GitHub

O código-fonte deste projeto está na pasta:

```text
/home/kayronn/Documentos/Projeto Padrão/nerimity-appimage
```

Para gerar um `.tar.gz` para enviar ao GitHub (excluindo `node_modules`, `dist` e artefatos locais grandes), rode:

```bash
cd "/home/kayronn/Documentos/Projeto Padrão"
tar --exclude='nerimity-appimage/node_modules' \
    --exclude='nerimity-appimage/dist' \
    --exclude='nerimity-appimage/.flatpak-builder' \
    -czf nerimity-v2-source.tar.gz nerimity-appimage
```

O arquivo ficará em `/home/kayronn/Documentos/Projeto Padrão/nerimity-v2-source.tar.gz`.
