# Tratamento dos erros documentados — widgettrobot 2.0.4

Este documento separa explicitamente **contrato oficial** de **decisão de projeto**.

## 1. Last.fm — contrato oficial

Documentação:
- https://www.last.fm/api/show/user.getRecentTracks
- https://www.last.fm/api/errorcodes

A rota GET `https://ws.audioscrobbler.com/2.0/` usa `method=user.getRecentTracks`, `user`, `api_key`, `format=json`, `limit`. O atributo `@attr.nowplaying` igual a `true` indica a faixa tocando agora. Sem ele, o primeiro resultado é uma reprodução anterior. `recenttracks.track: []` é ausência válida de registros; payload sem `recenttracks.track` é estrutura inesperada e não é apresentado como sucesso.

| Código da API | Significado oficial | Decisão do bot |
|---|---|---|
| 6 | Parâmetros inválidos | Não salvar perfil; só rotular usuário inexistente quando a mensagem da API indicar isso explicitamente |
| 10 | API key inválida | Mensagem específica “inválida”; pausa atualização automática |
| 26 | API key suspensa | Mensagem específica “suspensa”; pausa atualização automática |
| 29 | Rate limit excedido | Solicitar que o usuário aguarde; suspender polling automático e permitir tentativa manual |
| 8, 11, 16 | Falhas temporárias/serviço indisponível | Sinalizar indisponibilidade |
| Outros | Podem representar recusa ou falha de requisição | Não mostrar lista vazia; sinalizar erro para investigação |

Falhas de rede não incluem o texto original do erro nos logs: `fetch` pode incluir a URL com `api_key`. JSON inválido ou campos obrigatórios ausentes geram erro de resposta, não estado vazio.

## 2. Telegram Bot API — contrato oficial

Documentação:
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/widgets

- `answerCallbackQuery` é obrigatório para cada callback, mesmo quando o botão é rejeitado.
- `answerWidgetQuery` precisa responder em até **15 segundos**. Sua `data` (até 1.024 bytes) é resposta à chamada, **não altera** `chat_data`.
- `editMessageWidgetData` é quem altera os dados da mensagem e dispara `chatDataChanged` no Widget. O backend nunca declara atualização concluída antes dessa etapa, e o Widget só apresenta confirmação quando recebe os novos dados.
- Requisições Widget em background só são permitidas no original enviado ao chat privado do bot, visível. O cronômetro de 30 segundos só dispara nesse contexto.
- Widget HTML aceita até 32.768 bytes não comprimidos, 4.096 bytes após zlib; dados do Widget e resposta têm limite de 1.024 bytes. `npm run check` verifica limites do HTML; o estado compacto é validado no código e nos testes.
- O SDK Telegram Serverless fornece `BotApiError.code`, `.method`, `.description` e `.parameters` (referência do SDK: https://gramcode.si/docs/reference/sdk-bot-api). Ao receber `429`, registramos `parameters.retry_after` **sem retry imediato**: não há fila de agendamento confiável implementada neste projeto. O usuário precisa repetir mais tarde. Implementar tentativas automáticas corretamente exigiria persistência de jobs e um scheduler.

## 3. Decisões defensivas (não garantias da API)

- O Widget pausa polling quando o Last.fm informa rate limit (29) ou chave inválida ou suspensa; não inventa `retry_after` para uma API que não o fornece. Retoma após tentativa manual com estado válido. Depois de erro de requisição Telegram ou de confirmação expirada, também pausa até tentativa manual.
- A resposta `{"ok":true,"status":"accepted"}` confirma somente que o bot aceitou a consulta Widget. **Não** significa que a música foi atualizada ou que uma Rich Message foi enviada.
- `chatDataChanged` determina quando o Widget considera o conteúdo atualizado. Se não houver confirmação, após 12 segundos a interface informa que não foi possível confirmar a atualização; isso é uma política local, não um timeout do protocolo Telegram.
- Falhas do Last.fm recebem um estado `mode: 'error'` visível no Widget. Perfil inexistente ou falha de leitura SQLite também recebe estado de erro, sem assumir perfil válido.
- Problemas do Telegram são registrados e lançados novamente para diagnóstico pelo runtime. Se a Bot API já recusou um envio, não existe canal alternativo confiável para garantir um aviso ao usuário; o código **não finge sucesso**.
- Mensagens com imagem externa podem ser recusadas pela Bot API; **não** repetimos automaticamente como mensagem sem capa para qualquer erro.
- Erros de escrita SQLite não são confundidos com sucesso, e a confirmação é enviada somente após a escrita ser concluída.

## 4. Como verificar no bot real

1. Execute `/setuser usuario_existente`, `/now` e `/widget` em conversa privada.
2. Desative ou invalide temporariamente a chave Last.fm em um ambiente de testes: veja mensagem explicativa em Rich, e modo de erro no Widget.
3. Verifique logs de atualização e erros via ferramentas do Telegram Serverless. A presença do ACK não é prova de sucesso do `editMessageWidgetData`.
4. Verifique o cenário de bloqueio da Bot API / rate limit no ambiente de testes sem realizar chamadas em excesso em produção.

Esta suíte local não emula a API oficial integralmente nem substitui esses testes de integração reais.
