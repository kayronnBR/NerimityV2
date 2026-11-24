# Nerimity V2 — Android + Desktop

Versões modificadas do Nerimity mantendo o site oficial `https://nerimity.com` carregado:

- **Android (React Native):** chamadas com WebRTC nativo, vídeo recebido, compartilhamento de tela e controles de áudio.
- **Desktop (Electron/Linux):** correção de compartilhamento de tela no Wayland, TTS da chamada e system tray.

## Download

Baixe os arquivos da **[Release v2](https://github.com/kayronnBR/NerimityV2/releases/tag/v2)**:

[![Baixar APK Android](https://img.shields.io/badge/Android%20APK-Baixar-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/kayronnBR/NerimityV2/releases/download/v2/NerimityV2.apk)
[![Baixar Flatpak](https://img.shields.io/badge/Flatpak-Baixar-4A90D9?style=for-the-badge&logo=flatpak&logoColor=white)](https://github.com/kayronnBR/NerimityV2/releases/download/v2/NerimityV2.flatpak)
[![Baixar AppImage](https://img.shields.io/badge/AppImage-Baixar-F9B12C?style=for-the-badge&logo=appimage&logoColor=1A1A1A)](https://github.com/kayronnBR/NerimityV2/releases/download/v2/NerimityV2.AppImage)

### Checksums dos instaladores (Desktop)

| Artefato | SHA-256 |
| --- | --- |
| `NerimityV2.AppImage` | `e93fd9bb73bf37b74b326dc8c8a0b89fb18bdfc9247b2767c5ccdf7dd49f2006` |
| `NerimityV2.flatpak` | `d36f5b8a30e5f09d6d660fb57ccaf85367efce256a9d6d845ef93ecd6562f230` |

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

## Correções adicionais (Android)

### Áudio da chamada ao assistir vídeos

Ao abrir um vídeo enviado no próprio Nerimity durante uma chamada, o som passava
para o alto-falante do celular mesmo com fone com fio ou Bluetooth conectado.
A causa estava no `react-native-video`: ao montar o player, ele chama
internamente `AudioManager.setMode(MODE_NORMAL)` e `setSpeakerphoneOn(true)`,
derrubando o `MODE_IN_COMMUNICATION` usado pelo `react-native-incall-manager`,
que mantém a rota do fone/Bluetooth.

Solução aplicada:

- módulo compartilhado `callAudio.ts` guarda a rota ativa da chamada e reaplica a
  rota quando o vídeo abre e fecha;
- o player usa `disableFocus` (não rouba o foco de áudio da chamada) e
  `audioOutput="earpiece"` durante chamadas, preservando o modo de comunicação;
- `CallProvider`, `CustomWebView` e `App.tsx` mantêm o estado da rota e disparam
  a restauração nos momentos certos.

### Botão Close em tela cheia

O botão **Close** não respondia porque a barra de controles, com fundo preto
translúcido, ficava posicionada sobre a barra superior. O overlay usava
`justifyContent: space-between` com a barra superior em `position: absolute`,
deixando os controles como único item no fluxo — portanto, no topo.

Correções:

- controles movidos para a parte inferior, com fundo transparente e botões em
  pílulas pequenas;
- barra superior com `zIndex: 2` e `elevation`, sempre acima dos controles;
- overlay com `pointerEvents="box-none"`, preservando os toques no vídeo.

### Rotação da tela

Foi adicionado um botão no lado esquerdo da barra superior da tela cheia:

- primeiro toque: modo horizontal;
- segundo toque: volta ao vertical;
- ao fechar (botão, botão de voltar ou fim da chamada): retorna ao vertical,
  que é o padrão do aplicativo.

A implementação usa um módulo nativo pequeno (`NerimityOrientation`), sem novas
dependências npm, registrado em `MainApplication.kt`.

## Instalar no Android

1. Baixe `NerimityV2.apk` da [Release v2](https://github.com/kayronnBR/NerimityV2/releases/download/v2/NerimityV2.apk).
2. **Desinstale o app atual** antes de instalar: este APK usa assinatura de debug, diferente do release do GitHub.
3. Instale o APK e ative os dois experimentos nativos nas configurações do app.
4. Entre no canal de voz. Na chamada use os botões `Mic`, `Output`, `Share Screen`, `Sound`, `Fullscreen` e `End Call`.

### Checksum (SHA-256)

- `Nerimity-video-release.apk`: `6c38b839fd57291e40fe1651658844ab8004e50622f120768ea36140de1e3a89`
- `NerimityV2.apk` da Release v2 (`dist/NerimityV2.apk`): `553b8c8edc6183961fe3f055008fb576315dedcd64e87c5c1282f0e19eaaaeee`

Build validado com JDK 17; o módulo nativo `NerimityOrientation` foi confirmado
no `classes3.dex` e as novas strings no bundle JavaScript.

---

# Versão Desktop

Modificação do app Electron do Nerimity para corrigir compartilhamento de tela no Wayland, implementar TTS para ler o chat da chamada, melhorar o system tray em distros onde ele não aparecia corretamente e adicionar captura de áudio de aplicativos abertos durante a transmissão de tela. Ao compartilhar com áudio, você pode escolher quais aplicativos terão o som transmitido, evitando vazar o áudio do próprio Nerimity; se o app não aparecer na lista, basta clicar em **Scan for audio apps** e, se nenhum app for selecionado, a transmissão usa o áudio padrão do sistema.

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

## Detalhes das mudanças (Desktop)

### TTS totalmente embutida

A implementação anterior dependia de `edge-tts` ou de `python3 -m edge_tts`
instalados no sistema, o que falhava tanto no AppImage quanto no Flatpak porque
o executável não encontrava o módulo Python no ambiente isolado.

Foi criado um cliente Edge TTS em JavaScript puro (`tts.js`), sem novas
dependências npm e sem Python. Ele reproduz o protocolo usado pelo `edge-tts`
7.3.x:

- geração do token `Sec-MS-GEC` versão 2, validada contra vetores de referência;
- headers de handshake compatíveis com o cliente Edge;
- montagem do SSML e leitura dos frames de áudio MP3 recebidos pelo WebSocket;
- retry automático com o skew de data/hora do servidor quando o relógio local está
  fora da janela aceita.

O áudio não é mais gravado em arquivo temporário: os bytes do MP3 são enviados
diretamente pela stdin do player (`pw-play` → `ffplay` → `mpv` → `paplay` →
`aplay`). Isso resolveu o problema do `/tmp` isolado do Flatpak. Quando o app
roda dentro do Flatpak, os comandos passam por `flatpak-spawn --host`.

### Correção do erro "TTS WebSocket error"

O botão de teste de voz falhava com `TTS failed: TTS WebSocket error`. A causa
era um header `Sec-WebSocket-Version: 13` enviado manualmente: o WebSocket nativo
do Node/Electron já envia esse header, e a duplicação quebrava o handshake. O
header foi removido e o tratamento de erro passou a extrair a mensagem real do
evento, em vez de exibir um texto genérico.

A síntese foi validada de ponta a ponta: MP3 gerado com sucesso no Node, no
runtime do Electron (Node 24.22.3) e diretamente a partir do `app.asar` final.

### Idioma e voz automáticos

A prioridade de seleção de voz ficou:

1. voz personalizada digitada pelo usuário;
2. idioma definido explicitamente no painel de TTS;
3. idioma detectado da interface do Nerimity;
4. locale do aplicativo / do sistema.

O mapa interno cobre cerca de 30 idiomas. O painel mostra uma linha de
diagnóstico com o idioma e a voz efetivamente usados.

### Interface e popup de captura de áudio

Todas as mensagens, botões, tooltips e erros implementados foram padronizados em
inglês. Nenhuma string antiga em português permaneceu no pacote final.

O popup de captura de áudio foi redesenhado:

- remoção do botão "Áudio padrão";
- inclusão de um botão visível **Scan for audio apps**, com ícone de atualização,
  ao lado de **Share selected**;
- estados de feedback: "Scanning for audio apps..." e
  "Scan complete — N audio app(s) found...";
- o fechamento da janela continua usando o áudio padrão do sistema.

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
