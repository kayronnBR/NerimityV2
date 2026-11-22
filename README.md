# Nerimity V2 — Android + Desktop

Versões modificadas do Nerimity mantendo o site oficial `https://nerimity.com` carregado:

- **Android (React Native):** chamadas com WebRTC nativo, vídeo recebido, compartilhamento de tela e controles de áudio.
- **Desktop (Electron/Linux):** correção de compartilhamento de tela no Wayland, TTS da chamada e system tray.

## Download

Baixe o **AppImage**, o **Flatpak** ou o **APK Android** aqui:  
👉 **[MediaFire](https://www.mediafire.com/folder/8wpb3pesbp1jz/nerimity)**

## Créditos

- **Versão Android:** [NerimityReactNative](https://github.com/Nerimity/NerimityReactNative)
- **Versão Desktop:** [nerimity-desktop](https://github.com/Nerimity/nerimity-desktop)

Todas as modificações descritas abaixo foram feitas sobre esses projetos originais.

---

# Versão Android

Baseada no Nerimity React Native 2.2.0. Para usar vídeo, tela e compartilhamento, ative os dois experimentos no app:

- **React Native Native WebSocket**
- **React Native Native WebRTC**

Sem eles, o app continua funcionando no modo WebView original, mas os recursos nativos de chamada não aparecem.

## Principais mudanças (Android)

- **Vídeo/tela recebida:** renderização com `RTCView` do `react-native-webrtc`. Corrigido o bug em que a stream chegava e era apagada quando a conexão do peer completava.
- **Troca entre transmissões:** visualização grande por vez, com setas, contador (`1/3`) e botões com o nome de cada pessoa. Transmissões antigas do mesmo usuário são substituídas, sem duplicatas com o mesmo nome.
- **Som da transmissão:** botão `Sound: On / Sound: Off` controla o áudio da transmissão selecionada, sem afetar o áudio da chamada.
- **Tela cheia:** botão `Fullscreen`; os controles aparecem ao abrir e somem após 4 segundos. Tocando no vídeo eles voltam. Botão `Close` com texto branco e fundo translúcido.
- **Mensagem de voz:** o microfone ao lado de GIF/emoji virou clique para gravar e clique para parar (não precisa segurar).
- **Compartilhar tela pelo celular:** botão `Share Screen / Stop Sharing` usa `MediaProjection` do Android e envia a tela para todos os participantes. Quem entrar depois também recebe. Ao parar ou sair da chamada, a captura é encerrada. Requer os dois experimentos nativos ativos; no modo WebView o botão não aparece.
- **Microfone:** botão `Mic: On / Mic: Off` silencia no sistema e desliga a faixa de áudio WebRTC enviada aos outros.
- **Saída de áudio:** botão `Output: ...` mostra e alterna entre as saídas disponíveis — `Bluetooth`, `Wired Headset`, `Speaker` e `Earpiece`. Permissões Bluetooth declaradas e solicitadas no Android 12+; roteamento automático restaurado para que o fone tenha prioridade.
- **Sensor de proximidade:** ativo apenas no modo ouvido (sem fone e sem viva-voz). Fica desligado com fone Bluetooth, fone com fio ou viva-voz, para a tela não apagar sem motivo.
- **Tela acesa:** `KEEP_SCREEN_ON` mantido durante toda a chamada.
- **Controles:** botões em scroll horizontal, para não ficarem apertados em telas pequenas.

> O Android captura apenas o vídeo da tela. Áudio do sistema não é enviado (isso só existe na versão desktop).

## Instalar no Android

1. Baixe `Nerimity-video-release.apk` da pasta do MediaFire.
2. **Desinstale o app atual** antes de instalar: este APK usa assinatura de debug, diferente do release do GitHub.
3. Instale o APK e ative os dois experimentos nativos nas configurações do app.
4. Entre no canal de voz. Na chamada use os botões `Mic`, `Output`, `Share Screen`, `Sound`, `Fullscreen` e `End Call`.

### Checksum (SHA-256)

- `Nerimity-video-release.apk`: `6c38b839fd57291e40fe1651658844ab8004e50622f120768ea36140de1e3a89`

---

# Versão Desktop

Modificação do app Electron do Nerimity para corrigir compartilhamento de tela no Wayland, implementar TTS para ler o chat da chamada, melhorar o system tray em distros onde ele não aparecia corretamente e adicionar captura de áudio de aplicativos abertos durante a transmissão de tela. Ao compartilhar com áudio, você pode escolher quais aplicativos terão o som transmitido, evitando vazar o áudio do próprio Nerimity; se o app não aparecer na lista, basta clicar em “Verificar novamente” e, se nenhum app for selecionado, a transmissão usa o áudio padrão do sistema.

Baseado no wrapper desktop do Nerimity, mantendo o site oficial `https://nerimity.com` carregado no app.

## Como instalar (fácil)

### AppImage (recomendado para iniciantes)

1. Baixe o arquivo `NerimityV2.AppImage`.
2. Instale o **[Gear Lever](https://flathub.org/apps/it.mijorus.gearlever)** (pela loja de aplicativos do seu Linux/Flathub).
3. Abra o Gear Lever e clique em **Adicionar/abrir arquivo** (ou arraste o `NerimityV2.AppImage` para ele).
4. Pronto! Depois disso você pode abrir o Nerimity V2 pelo menu de aplicativos.

> Se preferir sem Gear Lever: clique com o botão direito no arquivo > Propriedades > permita executar como programa, depois dê dois cliques.

### Flatpak

1. Baixe o arquivo `NerimityV2.flatpak`.
2. Abra o **Terminal**.
3. Digite este comando, **deixe um espaço no final**, arraste o arquivo `NerimityV2.flatpak` para dentro do terminal e aperte **Enter**:

   ```bash
   flatpak install --user 
   ```

   (Depois de arrastar, vai ficar algo como: `flatpak install --user '/home/seuusuario/Downloads/NerimityV2.flatpak'`)
4. Se pedir confirmação, digite `y` e Enter.
5. Para abrir, procure **Nerimity** no menu de aplicativos, ou rode:

   ```bash
   flatpak run com.nerimity.desktop
   ```

Para desinstalar o Flatpak:

```bash
flatpak uninstall --user com.nerimity.desktop
```

## Principais mudanças (Desktop V2)

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
(instalados automaticamente do Flathub).

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

## Reconstruir (Desktop)

```bash
cd nerimity-appimage
npm install
node node_modules/electron/install.js   # se o binário do Electron não baixar
npm run build          # AppImage
npm run build:flatpak  # Flatpak
```

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
