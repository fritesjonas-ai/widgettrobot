# Auditoria de execução × intenção — widgettrobot 2.0.4

**Data:** 19-11-2026  
**Base auditada:** widgettrobot 2.0.3 (arquivos JavaScript, templates, workflow, testes e documentação).  
**Escopo:** validar o que é executado, sem aceitar comentários como evidência, e confrontar parâmetros/métodos com a Bot API 10.4 e a API Last.fm.

## Resultado

**Compatibilidade de formato dos payloads:** conforme a documentação consultada, para os métodos usados e verificados localmente. **Execução em produção:** NÃO confirmada. Não houve autenticação, acesso a bot real, publicação no Telegram Serverless ou chamadas live à API do Last.fm.

### Contratos e evidências

| Contrato/documentação | Código executado | Constatação |
|---|---|---|
| `sendRichMessage` recebe `chat_id` e `{rich_message:{html}}` | `tgcloud/lib/infrastructure/telegram-messenger.js` | Conforme, testado inspecionando o objeto enviado ao adaptador `api` |
| `sendWidget` recebe `html`, `chat_data`, `allow_queries`, dimensão, legenda | mesmo adaptador; HTML em `presentation/widget.js` | Conforme; HTML 10834 B / 3809 B zlib (limites 32768 / 4096) |
| `answerWidgetQuery` usa `widget_query_id` e `data` UTF-8 <= 1024 B, responde em até 15 s | `bot-service.js` chama `widgetAnswer` **antes** de DB/HTTP; `telegram-messenger.js` usa nome correto | Ordem confirmada por teste; cumprimento temporal sob falhas reais NÃO comprovado |
| `editMessageWidgetData` edita `chat_data` mediante `chat_id` + `message_id` | `bot-service.js:updateWidget`, `telegram-messenger.js:widgetUpdate` | Parâmetros corretos; cliente espera `chatDataChanged` |
| `answerCallbackQuery` usa `callback_query_id` mesmo em recusa | `bot-service.js:onCallback` e adaptador | Conforme; confirmação antecede I/O lento |
| `TelegramWidget.request` aceita 1–64 B, permite background apenas no chat privado original enquanto visível | `presentation/widget.js` | Corrigida chamada inicial antes feita sem verificar contexto. Agora verifica `chatType`, `isActive`, `isPreview`, `isForward` e `document.hidden` no inicial e no timer |
| `user.getRecentTracks` usa `method`, `user`, `api_key`, `format`, `limit` e marca reprodução atual por `@attr.nowplaying` | `infrastructure/lastfm-client.js`, `domain/lastfm-parser.js` | Conforme em HTTP simulado; URLs/chave não entram no Widget nem nos logs de erro |
| Códigos Last.fm 10 e 26 têm significados distintos | `domain/errors.js` | **Divergência corrigida:** antes ambos geravam a mesma mensagem; agora 10 = inválida e 26 = suspensa |
| Entrada privada que não é comando de texto | `bot-service.js:onMessage` | **Divergência corrigida:** antes ignorava silenciosamente stickers/fotos; agora responde Rich com instruções |
| `answerWidgetQuery` é apenas ACK, não confirmação de entrega de Rich | `presentation/widget.js` | **Divergência corrigida:** antes dizia para conferir uma nova mensagem após ACK; agora não afirma entrega concluída |
| `tgcloud fetch/push/migrate --safe/webhook sync` | `.github/workflows/deploy.yml` | Comandos e estratégia compatíveis com documentação pública do CLI; workflow não executado no GitHub |

## Decisões não garantidas pela documentação

- `setInterval(..., 30000)` é **política do projeto**, não atualização garantida pelo Telegram: depende de visibilidade, rede, limites, estado do Last.fm e Bot API.
- A confirmação por `chatDataChanged` indica que o estado editado foi observado pelo cliente, não garante que uma mensagem Rich separada chegou. O Widget não deve alegar essa entrega.
- O limite local de 12 s para aguardar atualização é arbitrário e não se confunde com o prazo de 15 s para `answerWidgetQuery`.
- O projeto registra `retry_after` do Telegram, mas **não implementa retry automático**: isso é decisão defensiva.
- O token `LASTFM_API_KEY` é injetado como módulo de backend no CI; não entra no HTML do Widget, mas quem tiver acesso ao código publicado no backend poderá inspecioná-lo. Tratar esse módulo como código confidencial.
- O Last.fm não garante a presença contínua de `nowplaying=true`. Uma ausência significa última reprodução, não necessariamente música interrompida.

## Limitações e risco residual

1. Os testes locais usam adaptadores reais de Last.fm e Telegram em torno de fronteiras simuladas. **Não há validação de compatibilidade binária do SDK instalado em produção** nem execução com o runtime QuickJS do Telegram. O mock DOM não emula todos os limites da engine.
2. O handler envia `answerWidgetQuery` antes de buscar dados: isso evita estourar o prazo de ACK, mas, se a edição falhar depois, não há resposta adicional garantida pelo protocolo. O cliente mostra ausência de confirmação.
3. O workflow faz `tgcloud push` completo, que espelha a pasta local e pode apagar módulos remotos não presentes nela. Conferir o `tgcloud diff` e proteger o repositório antes de executar contra um projeto compartilhado.
4. Não foram executados testes de produção do BotFather, webhook real, migrações reais, acesso à API Last.fm nem testes visuais em iOS/Android/Desktop.

## Testes executados

```bash
npm test       # 29 testes aprovados, zero falhas
npm run check  # sintaxe, imports, JS inline e limites HTML/zlib aprovados
```

Novos testes verificam payloads efetivamente enviados a `api`, limite UTF-8, contextos em que polling é proibido, erros 10 versus 26 e resposta Rich a mensagens sem texto. A suíte permanece orientada a contratos observáveis, não aos nomes de funções.

## Fontes consultadas

**Oficiais Telegram:**
- https://core.telegram.org/bots/api — sendRichMessage, sendWidget, answerWidgetQuery, editMessageWidgetData, answerCallbackQuery, WidgetQuery.
- https://core.telegram.org/bots/widgets — TelegramWidget, restrições de sandbox, background requests, eventos e limites.

**Oficiais Last.fm:**
- https://www.last.fm/api/show/user.getRecentTracks
- https://www.last.fm/api/errorcodes

**Documentação do runtime/CLI (GramCode, não é a referência normativa da Bot API Telegram):**
- https://gramcode.si/docs/reference/sdk-bot-api
- https://gramcode.si/docs/reference/sdk-database
- https://gramcode.si/docs/reference/tgcloud-cli

**Veredito:** contratos HTTP coerentes com a Bot API 10.4 e Last.fm após correções. Conformidade de execução real **pendente de testes de integração no Telegram Serverless**.
