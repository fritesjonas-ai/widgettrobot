# widgettrobot 2.0.4 — tratamento explícito das APIs

Bot **Telegram 10.4 + Rich Messages + HTML Widgets + Telegram Serverless** para mostrar a música atual, as últimas reproduções e o perfil público do Last.fm. O projeto é publicado pelo GitHub Actions.

## Auditoria da API (versão 2.0.4)

A auditoria de código executável, payloads e comentários está em [`AUDITORIA_API_OFICIAL.md`](./AUDITORIA_API_OFICIAL.md). Corrige distinção de erros Last.fm 10 e 26, impede polling do Widget fora do contexto privado original e visível, retorna resposta Rich a mensagens privadas sem texto e não confunde ACK com entrega de Rich. **Validado localmente, sem deploy.**

## O que mudou nesta versão

- A consulta `user.getRecentTracks` distingue **lista vazia válida** de **resposta ausente ou malformada**; `nowplaying="true"` determina o status da reprodução.
- Erros Last.fm seguem os códigos [oficiais](https://www.last.fm/api/errorcodes): 6 (parâmetros/usuário quando identificado), 10 e 26 (chaves), 29 (limite), 8/11/16 (instabilidade).
- Erros do SDK do Telegram são registrados por `code`, `method` e `parameters.retry_after`, sem depender de mensagens de texto instáveis ou repetir chamadas automaticamente.
- Ao receber Last.fm 29 ou problema persistente de chave, o Widget **suspende a atualização automática** e mantém a atualização manual disponível. Falhas de confirmação também pausam polling até nova tentativa manual.
- O Widget responde à solicitação com `answerWidgetQuery` **antes de consultar SQLite e Last.fm**. Essa resposta informa apenas **aceitação**. Uma atualização só é exibida como concluída após o evento `chatDataChanged`, gerado por `editMessageWidgetData`.
- Se o backend não confirmar a atualização, o Widget mostra uma mensagem de não confirmação; não anuncia êxito.
- Não existe mais um fallback genérico que reenviava qualquer Rich Message sem a imagem, mascarando falhas da Bot API.
- Persistência SQLite e envio de mensagens reportam falhas; uma falha de gravação jamais é anunciada como vínculo/desvinculação concluída.
- Logs de falhas Last.fm não incluem URL da requisição, evitando vazamento de `api_key`.
- Ações não permitidas e comandos desconhecidos recebem respostas explícitas. Consultas em grupos não são atendidas: Widgets enviados por bots estão limitados a chats privados na produção.

**O bot consulta informações de escuta; não toca áudio nem promete tempo real absoluto.** O status depende do scrobbling e da atualização do Last.fm.

## Comandos

`/start`, `/ajuda`, `/setuser usuario`, `/now`, `/recentes`, `/widget`, `/perfil` e `/remover confirmar`.

Todas as respostas de conteúdo usam **Rich Messages**. O painel com três abas **Tocando**, **Recentes** e **Perfil** é um **HTML Widget**, que realiza consultas ao bot por `TelegramWidget.request()` enquanto estiver visível em conversa privada.

## Executar validações

```bash
npm test
npm run check
```

Os testes exercitam comportamento real com falhas controladas somente nas fronteiras externas. A suíte cobre status e erros Last.fm, autorização, callbacks, ordem de ACK do Widget, erros de edição, falha de banco e não vazamento de chave. `npm run check` verifica sintaxe, integridade dos imports locais, JavaScript embutido e limites de 32 KiB HTML e 4 KiB zlib.

## Implantar por GitHub Actions

1. Crie o scaffold oficial: `npm create @tgcloud/bot widgettrobot`.
2. Copie os arquivos deste repositório para o projeto (ou use este repositório diretamente).
3. Habilite o **Telegram Serverless** no @BotFather e obtenha o token em **Serverless → CLI Access**.
4. Obtenha uma chave em https://www.last.fm/api/account/create.
5. Configure os Secrets `TGCLOUD_TOKEN` e `LASTFM_API_KEY` em **GitHub → Settings → Secrets and variables → Actions**.
6. Faça push para a branch `main` ou execute o workflow manualmente.

Na primeira implantação, o workflow usa push direcionado aos módulos do bot para não excluir módulos remotos não versionados. Mudanças futuras que removam um handler devem ser sincronizadas explicitamente.

O workflow valida, gera `tgcloud/lib/lastfm-key.js` **somente durante o deploy**, publica os módulos, aplica migrações seguras e sincroniza o webhook. A chave gerada é ignorada pelo Git e nunca entra no HTML do Widget.

Para uso local, obtenha os mesmos Secrets e siga o fluxo no workflow `.github/workflows/deploy.yml`.

## Estrutura e contratos

- `tgcloud/lib/domain/` — validação, estado compacto e classificação de erros.
- `tgcloud/lib/application/bot-service.js` — regras e fluxo dos comandos, callback e Widget.
- `tgcloud/lib/infrastructure/` — adaptadores Last.fm, SQLite e SDK Telegram.
- `tgcloud/lib/presentation/` — Rich Message e HTML Widget.
- `tgcloud/handlers/` — pontos de entrada desacoplados.
- `tgcloud/lib/bootstrap.js` — única composição dos adaptadores reais.
- `tests/` — comportamentos observáveis, incluindo falhas.

Veja [`AUDITORIA_API_OFICIAL.md`](./AUDITORIA_API_OFICIAL.md), [`API_E_ERROS.md`](./API_E_ERROS.md), [`ARQUITETURA.md`](./ARQUITETURA.md) e [`TESTES.md`](./TESTES.md).

**Importante:** verificações locais não comprovam implantação e entrega reais. É necessário validar com um bot que tenha Telegram Serverless/Widgets habilitados. Não foi feito deploy na conta do usuário.
