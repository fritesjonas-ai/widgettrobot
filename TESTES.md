# Testes — widgettrobot 2.0.4

Princípio: **validar resultado observável e contratos externos, principalmente diante de falhas**. Não criar testes que apenas reproduzem o algoritmo, verificam nomes de funções ou confirmam mocks sem exercitar a aplicação.

`npm test` usa o serviço real, o adaptador real de Last.fm, o adaptador real de Telegram e os templates. HTTP, API Telegram e banco são fronteiras controladas; os testes não dependem de chaves ou acesso ao Telegram.

## Cenários relevantes

| Risco | Comportamento exigido |
|---|---|
| JSON Last.fm malformado | Mostrar erro em vez de “nenhuma música” |
| Última reprodução x agora | O indicador `nowplaying` muda o status correto |
| Usuário inexistente (erro 6) | Preservar perfil anterior e informar ao usuário |
| Chave inválida, suspensa ou rate limit (10/26/29) | Informar problema específico sem dados obsoletos |
| Erro de rede com chave na URL | Não expor a chave em mensagens nem logs |
| Histórico com conteúdo não confiável | Renderizar conteúdo escapado e até cinco faixas |
| Widget refresh | ACK antes de SQLite e Last.fm, atualização por `editMessageWidgetData`, limites UTF-8 respeitados |
| Last.fm indisponível no Widget | Estado `error`, não estado `empty` |
| Bot API 429 no Widget | `retry_after` registrado, falha propagada |
| Bot API rejeita ACK | Não consultar nem editar após rejeição |
| Polling em rate limit Last.fm | Pausar consultas automáticas até atualização manual confirmada |
| Atualização chega antes da resposta | Não gerar timeout falso após `chatDataChanged` |
| Evento malicioso ou não autorizado | Resposta explícita, sem consultar Last.fm |
| Callback Rich | ACK obrigatório, sem retentativa imediata diante de 429 |
| SQLite falha no vínculo/desvinculação | Estado anterior preservado e erro comunicado |
| Rich Message rejeitada | Falha propagada sem segundo envio disfarçado |
| Comando desconhecido | Instrução de ajuda em vez de fallback implícito |

## Executar

```bash
npm test
npm run check
```

`npm run check` valida sintaxe, importações locais, código JS do Widget, limites de HTML/zlib e ausência de acesso à rede / segredos no HTML.

**Limite:** os testes usam APIs simuladas nas fronteiras; precisam ser complementados por integração real após deploy no Telegram Serverless. O teste do Widget no cliente Telegram é manual.

A versão 2.0.4 adicionou contratos explícitos dos objetos passados a `api`, verificação de polling em prévia/grupo/invisível e resposta Rich para entrada sem texto. A distinção dos erros 10/26 é validada também por ausência da mensagem errada.
