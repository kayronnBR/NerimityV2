# Nerimity V2 — Melhorias e Implementação (Desktop e Android)

Este documento resume o trabalho feito nas duas versões do Nerimity V2: o wrapper
Desktop (AppImage/Flatpak) e o aplicativo Android (React Native). O foco foi
eliminar dependências externas, corrigir falhas de áudio e tornar a interação com
chamadas e transmissões mais previsível para o usuário.

---

## 1. Versão Desktop

### 1.1 Leitura de chat (TTS) totalmente embutida

A implementação anterior dependia de `edge-tts` ou de `python3 -m edge_tts`
instalados no sistema. Isso falhava tanto no AppImage quanto no Flatpak, porque
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

### 1.2 Correção do erro "TTS WebSocket error"

Após a primeira entrega, o botão de teste de voz falhava com
`TTS failed: TTS WebSocket error`. A causa era um header `Sec-WebSocket-Version:
13` enviado manualmente: o WebSocket nativo do Node/Electron já envia esse
header, e a duplicação quebrava o handshake. O header foi removido e o
tratamento de erro passou a extrair a mensagem real do evento, em vez de exibir
um texto genérico.

A síntese foi validada de ponta a ponta: MP3 gerado com sucesso no Node, no
runtime do Electron (Node 24.22.3) e diretamente a partir do `app.asar` final.

### 1.3 Idioma e voz automáticos

A prioridade de seleção de voz ficou:

1. voz personalizada digitada pelo usuário;
2. idioma definido explicitamente no painel de TTS;
3. idioma detectado da interface do Nerimity;
4. locale do aplicativo / do sistema.

O mapa interno cobre cerca de 30 idiomas. O painel mostra uma linha de
diagnóstico com o idioma e a voz efetivamente usados.

### 1.4 Interface e popup de captura de áudio

Todas as mensagens, botões, tooltips e erros implementados foram padronizados em
inglês. Nenhuma string antiga em português permaneceu no pacote final.

O popup de captura de áudio foi redesenhado:

- remoção do botão "Áudio padrão";
- inclusão de um botão visível **Scan for audio apps**, com ícone de atualização,
  ao lado de **Share selected**;
- estados de feedback: "Scanning for audio apps..." e
  "Scan complete — N audio app(s) found...";
- o fechamento da janela continua usando o áudio padrão do sistema.

### 1.5 Artefatos

| Artefato | SHA-256 |
| --- | --- |
| `NerimityV2.AppImage` | `e93fd9bb73bf37b74b326dc8c8a0b89fb18bdfc9247b2767c5ccdf7dd49f2006` |
| `NerimityV2.flatpak` | `d36f5b8a30e5f09d6d660fb57ccaf85367efce256a9d6d845ef93ecd6562f230` |

---

## 2. Versão Android

### 2.1 Áudio da chamada ao assistir vídeos

Ao abrir um vídeo enviado no próprio Nerimity durante uma chamada, o som passava
para o alto-falante do celular mesmo com fone com fio ou Bluetooth conectado.

A causa foi identificada no `react-native-video`: ao montar o player, ele chama
internamente `AudioManager.setMode(MODE_NORMAL)` e `setSpeakerphoneOn(true)`.
Isso derruba o `MODE_IN_COMMUNICATION` usado pelo `react-native-incall-manager`,
que é quem mantém a rota do fone/Bluetooth.

Solução aplicada:

- módulo compartilhado `callAudio.ts` guarda a rota ativa da chamada e reaplica a
  rota quando o vídeo abre e fecha;
- o player usa `disableFocus` (não rouba o foco de áudio da chamada) e
  `audioOutput="earpiece"` durante chamadas, preservando o modo de comunicação;
- `CallProvider`, `CustomWebView` e `App.tsx` mantêm o estado da rota e disparam
  a restauração nos momentos certos.

### 2.2 Botão de fechar a transmissão em tela cheia

O botão **Close** não respondia porque a barra de controles, com fundo preto
translúcido, ficava posicionada sobre a barra superior. O overlay usava
`justifyContent: space-between` com a barra superior em `position: absolute`,
deixando os controles como único item no fluxo — portanto, no topo.

Correções:

- controles movidos para a parte inferior, com fundo transparente e botões em
  pílulas pequenas;
- barra superior com `zIndex: 2` e `elevation`, sempre acima dos controles;
- overlay com `pointerEvents="box-none"`, preservando os toques no vídeo.

### 2.3 Rotação da tela

Foi adicionado um botão no lado esquerdo da barra superior da tela cheia:

- primeiro toque: modo horizontal;
- segundo toque: volta ao vertical;
- ao fechar (botão, botão de voltar ou fim da chamada): retorna ao vertical,
  que é o padrão do aplicativo.

A implementação usa um módulo nativo pequeno (`NerimityOrientation`), sem novas
dependências npm, registrado em `MainApplication.kt`.

### 2.4 Artefato

- APK: `dist/NerimityV2.apk` (cópia em `~/Downloads/NerimityV2-fixed.apk`)
- SHA-256: `553b8c8edc6183961fe3f055008fb576315dedcd64e87c5c1282f0e19eaaaeee`
- Build validado com JDK 17; o módulo nativo foi confirmado no `classes3.dex` e
  as novas strings no bundle JavaScript.

---

## 3. Resultado geral

As duas versões agora são autocontidas no que foi implementado: o Desktop não
depende mais de Python nem de `edge-tts` no host, e o Android mantém a rota de
áudio da chamada intacta ao reproduzir mídia, com controles de tela cheia
confiáveis e rotação ajustável. O código-fonte Android trabalhado está em
`~/Documentos/Projeto Padrão/nerimityAndroidV2` (cópia do projeto que estava na
lixeira), e o desktop em `~/Documentos/Projeto Padrão/nerimityV2`.
