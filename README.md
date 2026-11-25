# Nerimity V2 — Android + Desktop

Versões modificadas do Nerimity mantendo o site oficial `https://nerimity.com` carregado:

- **Android (React Native):** chamadas com WebRTC nativo, vídeo recebido, compartilhamento de tela e controles de áudio.
- **Desktop (Electron para Linux e Windows):** compartilhamento de tela pelo portal Wayland, leitura do chat em voz alta (TTS), câmera dentro da tela compartilhada, player de tela cheia e system tray corrigido.

## Download

Baixe os arquivos da **[Release v4](https://github.com/kayronnBR/NerimityV2/releases/tag/v4)**:

[![Baixar APK Android](https://img.shields.io/badge/Android%20APK-Baixar-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/kayronnBR/NerimityV2/releases/download/v4/NerimityV2.apk)
[![Baixar para Windows](https://img.shields.io/badge/Windows-Baixar-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/kayronnBR/NerimityV2/releases/download/v4/NerimityV2.exe)
[![Baixar Flatpak](https://img.shields.io/badge/Flatpak-Baixar-4A90D9?style=for-the-badge&logo=flatpak&logoColor=white)](https://github.com/kayronnBR/NerimityV2/releases/download/v4/NerimityV2.flatpak)
[![Baixar AppImage](https://img.shields.io/badge/AppImage-Baixar-F9B12C?style=for-the-badge&logo=appimage&logoColor=1A1A1A)](https://github.com/kayronnBR/NerimityV2/releases/download/v4/NerimityV2.AppImage)

> O `.exe` de Windows é **portátil**: baixe e execute, sem instalação.

## Instalar (fácil)

### Android

1. Baixe o `NerimityV2.apk` pelo botão acima.
2. **Desinstale o app atual** antes de instalar: este APK usa assinatura de debug, diferente do release original.
3. Instale o APK e ative os dois experimentos nativos nas configurações do app:
   - **React Native Native WebSocket**
   - **React Native Native WebRTC**
4. Entre no canal de voz e use os botões `Mic`, `Output`, `Share Screen`, `Sound`, `Fullscreen` e `End Call`.

> Com os dois experimentos ativados, os painéis da chamada que aparecem dentro da página web são escondidos enquanto a chamada nativa está ativa. Quando você sai da chamada, eles voltam a aparecer.

### AppImage (recomendado para iniciantes)

1. Baixe o `NerimityV2.AppImage` pelo botão acima.
2. Instale o **[Gear Lever](https://flathub.org/apps/it.mijorus.gearlever)** pela loja de aplicativos do seu Linux ou pelo Flathub.
3. Abra o Gear Lever e clique em **Adicionar/abrir arquivo** (ou arraste o `NerimityV2.AppImage` para a janela dele).
4. Pronto: o Nerimity V2 aparece no menu de aplicativos e pode ser aberto normalmente.

> Sem Gear Lever: clique com o botão direito no arquivo → Propriedades → permita executar como programa → dê dois cliques.

### Windows

1. Baixe o `NerimityV2.exe` pelo botão acima.
2. Execute o arquivo. Não precisa instalar nem ter permissão de administrador.
3. O app abre normalmente; o ícone fica disponível enquanto o executável estiver aberto.

### Flatpak (arraste para o terminal)


1. Baixe o `NerimityV2.flatpak` pelo botão acima.
2. Abra o **Terminal**.
3. Digite este comando, **deixe um espaço depois de `--user`**, arraste o arquivo `NerimityV2.flatpak` para dentro do terminal e aperte **Enter**:

   ```bash
   flatpak install --user 
   ```

   Depois de arrastar, vai ficar mais ou menos assim:

   ```bash
   flatpak install --user '/home/seuusuario/Downloads/NerimityV2.flatpak'
   ```

4. Se pedir confirmação, digite `y` e Enter.
5. Para abrir, procure **Nerimity** no menu de aplicativos ou rode:

   ```bash
   flatpak run com.nerimity.desktop
   ```

Para desinstalar:

```bash
flatpak uninstall --user com.nerimity.desktop
```

## Checksums (SHA-256)

| Artefato | SHA-256 |
| --- | --- |
| `NerimityV2.apk` | `00ca0ce3444a7d4109a6224b779ca2aecc26234247a80024b7769b8824d68fc1` |
| `NerimityV2.exe` (Windows) | `69f13a89a33fe106a495bb240c4544921557fce5bf56913d40a333c941a4daca` |
| `NerimityV2.AppImage` | `29323b779c55fc5fd86ff8bf0f5e0aa65430a39b69283a636a47b0aa1e7983f4` |
| `NerimityV2.flatpak` | `1f2e2688b99a7b972c61054f97d81f836d7117b8aa0db0bcef89707b348d5ac2` |

---

# Versão Android

Baseada no Nerimity React Native 2.2.0. Para usar vídeo, tela e compartilhamento, ative os dois experimentos no app:

- **React Native Native WebSocket**
- **React Native Native WebRTC**

Sem eles, o app continua funcionando no modo WebView original, mas os recursos nativos de chamada não aparecem.

## Principais mudanças (Android)

- **Vídeo/tela recebida:** renderização com `RTCView` do `react-native-webrtc`. Corrigido o bug em que a stream chegava e era apagada quando a conexão do peer completava.
- **Troca entre transmissões:** visualização grande por vez, com setas, contador (`1/3`) e botões com o nome de cada pessoa. Transmissões antigas do mesmo usuário são substituídas, sem duplicatas.
- **Som da transmissão:** botão `Sound: On / Sound: Off` controla o áudio da transmissão selecionada, sem afetar o áudio da chamada.
- **Tela cheia:** botão `Fullscreen`; os controles aparecem ao abrir e somem após 4 segundos. Tocando no vídeo eles voltam. Botão `Close` corrigido.
- **Mensagem de voz:** o microfone ao lado de GIF/emoji virou clique para gravar e clique para parar (não precisa segurar).
- **Compartilhar tela pelo celular:** botão `Share Screen / Stop Sharing` usa `MediaProjection` do Android e envia a tela para todos os participantes.
- **Microfone:** botão `Mic: On / Mic: Off` silencia no sistema e desliga a faixa de áudio WebRTC enviada aos outros.
- **Saída de áudio:** botão `Output: ...` mostra e alterna entre `Bluetooth`, `Wired Headset`, `Speaker` e `Earpiece`.
- **Sensor de proximidade:** ativo apenas no modo ouvido; desligado com fone Bluetooth, fone com fio ou viva-voz.
- **Tela acesa:** `KEEP_SCREEN_ON` mantido durante toda a chamada.
- **Chamada web oculta:** com os dois experimentos ativados, os painéis da chamada renderizados pelo site são escondidos durante a chamada nativa e restaurados ao sair dela.

> O Android captura apenas o vídeo da tela. Áudio do sistema não é enviado (isso só existe na versão desktop).

## Correções adicionais (Android)

### Áudio da chamada ao assistir vídeos

Ao abrir um vídeo enviado no próprio Nerimity durante uma chamada, o som passava para o alto-falante mesmo com fone com fio ou Bluetooth conectado. O `react-native-video` trocava o modo de áudio do `react-native-incall-manager`.

Solução: módulo `callAudio.ts` reaplica a rota da chamada ao abrir e fechar o vídeo; o player usa `disableFocus` e `audioOutput="earpiece"` durante chamadas.

### Botão Close e rotação em tela cheia

Os controles foram movidos para a parte inferior, com fundo transparente, e o botão `Close` voltou a funcionar. Foi adicionado um botão para girar a tela: primeiro toque vai para horizontal, segundo volta ao vertical, e ao fechar a tela cheia o app retorna ao vertical. Implementação sem novas dependências, via módulo nativo `NerimityOrientation`.

---

# Versão Desktop

Modificação do app Electron do Nerimity para corrigir compartilhamento de tela no Wayland, implementar TTS para ler o chat da chamada, melhorar o system tray e permitir escolher quais aplicativos terão o áudio transmitido.

## Principais mudanças (Desktop V2)

- **Compartilhamento de tela no Wayland:** detecta Wayland/X11 automaticamente. No Wayland, o seletor interno do Nerimity (lista de janelas do app) é ignorado: ao clicar em compartilhar, abre diretamente o seletor nativo da sessão (`xdg-desktop-portal`). No X11, o seletor normal do Nerimity continua aparecendo.
- **Áudio da transmissão:** depois de escolher a janela/tela no portal, aparece o popup para selecionar os apps de áudio. Se nada for marcado e você confirmar, a transmissão segue sem som e sem nova pergunta — isso vale também para X11 (não cai para o áudio do sistema). Use **Scan for audio apps** se o app desejado não aparecer.
- **TTS na chamada:** botão nativo na barra da call para ler mensagens do chat em voz alta. Cliente Edge TTS **embutido**, sem Python e sem `edge-tts` externo. Voz automática pelo idioma do Nerimity/sistema ou voz escolhida no painel.
- **System tray corrigido:** mostrar/ocultar, recarregar, abrir no navegador e sair; fechar a janela mantém o app na bandeja.
- **Compatibilidade/estabilidade:** `WindowAPI` completo no preload, cache leve de metadados, correção CORS para Google Drive e flag anti-automação para Turnstile.
- **Câmera dentro da transmissão:** a tela começa sem câmera; use o botão na chamada para ligá-la. Escolha a posição na grade 3×3 e a transparência no painel — as duas ficam salvas no PC. Um único stream composto de tela + câmera.
- **Player de tela cheia:** abre em F11 com controles próprios (volume, mute e sair). A barra some ao clicar no vídeo, ao mover o mouse para fora ou sozinha após inatividade. Sem pause ao clicar na imagem.
- **Várias transmissões ao mesmo tempo:** quando alguém compartilha tela, o espaço preto do lado direito passa a mostrar a prévia de todas as transmissões ativas, incluindo a sua, todas sem som. Clicar numa prévia foca aquela transmissão do jeito de sempre (uma por pessoa, com áudio); clicar no vídeo ou apertar `Esc` volta às prévias e corta o som novamente.
- **Windows:** release com executável portátil x64.


## Permissões Flatpak

Incluídas: Wayland, X11, IPC, DRI (GPU), PulseAudio, rede, home e `org.kde.StatusNotifierWatcher`. Se o compartilhamento de tela não funcionar:

```bash
flatpak permission-set screencast screencast com.nerimity.desktop yes
```

## Créditos

- **Versão Android:** [NerimityReactNative](https://github.com/Nerimity/NerimityReactNative)
- **Versão Desktop:** [nerimity-desktop](https://github.com/Nerimity/nerimity-desktop)

Todas as modificações descritas foram feitas sobre esses projetos originais.
