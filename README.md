# widgettrobot — card musical em Rich Message

O bot exibe música atual e histórico do Last.fm usando Rich Messages nativas do Telegram, sem depender da permissão para HTML Widgets. O GitHub Actions publica o código no Telegram Serverless.

## Comandos

- `/start` — mostra o card se o perfil estiver conectado; caso contrário, explica como configurar
- `/setuser usuario` — valida a conta no Last.fm, salva no SQLite e envia o card
- `/widget`, `/painel` ou `/card` — aliases para o card Rich
- `/now` e `/tocando` — card da música atual ou última reprodução
- `/recentes` — últimas cinco faixas em Rich Message
- `/perfil`, `/ajuda` e `/remover confirmar` — gerenciamento e instruções

O card mostra status, capa, título, artista, álbum, reproduções anteriores e os botões próprios de Rich Messages, como `<tg-button type="callback_data">`. **Não usa `inline_keyboard`.** Quando a resposta `user.getRecentTracks` não fornece arte válida, o bot consulta `album.getInfo` e depois `track.getInfo`. Se não houver imagem, consulta primeiro a API pública do Deezer (`search/album`) para recuperar `cover_big`, aceitando apenas artista e álbum exatamente correspondentes, sem necessidade de outra chave. Caso não encontre, também busca no MusicBrainz com o filtro de tipo Album e confere a capa frontal no Cover Art Archive. A correspondência precisa ser exata; não exibe capas de outras músicas. O provedor alternativo não requer chave. O uso de cache temporário (até 128 pares por instância) e throttling por instância reduz as requisições à API MusicBrainz (limite recomendado: uma consulta por segundo por IP). Referências: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting e https://musicbrainz.org/doc/Cover_Art_Archive/API . A capa aparece no bloco `<figure><img>` do Rich HTML (conforme a Bot API oficial). Se nenhuma imagem real existir no catálogo, o card explica a ausência sem inventar uma capa. O botão Atualizar consulta novamente o Last.fm e envia um novo card Rich. Não há polling automático.

A API documenta `sendRichMessage` e o Rich HTML em https://core.telegram.org/bots/api.

## Compatibilidade

Bots comuns podem receber `INPUT_MEDIA_WIDGET_NOT_ALLOWED` ao tentar enviar HTML Widgets. O bot não envia Widgets novos. O handler `widget_query` permanece apenas para atender mensagens legadas eventualmente existentes.

## Configuração e deploy

Configure os Secrets `TGCLOUD_TOKEN` (CLI Access do Telegram Serverless) e `LASTFM_API_KEY` (API pública do Last.fm) no repositório. Faça push para a branch `main` ou execute o workflow manualmente. A chave é gerada no módulo do backend durante o deploy; nunca é incluída na Rich Message.

```sh
npm test
npm run check
```

O estado de reprodução depende do scrobbling do Last.fm, não de streaming em tempo real. As informações de músicas são escapadas antes de entrarem no HTML. A migração SQLite é aditiva; nenhum dado do perfil é removido durante o deploy.
