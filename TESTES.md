# Testes — widgettrobot 2.3.1

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
| Widget refresh (legado) | Fluxo mantido por compatibilidade, não coberto por um teste de cliente Telegram |
| Last.fm indisponível no Widget | Estado `error`, não estado `empty` |
| Bot API 429 no Widget | `retry_after` registrado, falha propagada |
| Bot API rejeita ACK | Não consultar nem editar após rejeição |
| Polling em rate limit Last.fm (legado) | Sem cobertura automatizada do cliente/widget nesta suíte |
| Atualização chega antes da resposta (legado) | Requer validação no cliente Telegram; não é exercitada por testes Rich |
| Evento malicioso ou não autorizado | Resposta explícita, sem consultar Last.fm |
| Callback Rich | ACK obrigatório, sem retentativa imediata diante de 429 |
| SQLite falha no vínculo/desvinculação | Estado anterior preservado e erro comunicado |
| Rich Message rejeitada | Falha propagada sem segundo envio disfarçado |
| Comando desconhecido | Instrução de ajuda em vez de fallback implícito |

## Integração pós-deploy

`deploy.yml` primeiro executa a suíte com HTTP, SQLite e Telegram simulados; em seguida publica a revisão e executa `diagnoseSetuser` (Last.fm, Deezer e SQLite) e `diagnoseFeatures` (busca real de faixas/artistas, metadados reais e modelo Rich) no Serverless publicado. As duas verificações são somente leitura quanto a perfis e chats; o primeiro diagnóstico usa um registro SQLite sentinela e o remove. Ainda não comprovam a renderização visual das mensagens no cliente Telegram.

## Executar

```bash
npm test
npm run check
```

`npm run check` valida sintaxe, importações locais e o limite de 32.768 bytes de exemplos de Rich HTML; não executa o Widget no Telegram, não calcula tamanho zlib e não fornece uma análise de segurança completa.

**Limite:** os testes usam APIs simuladas nas fronteiras; precisam ser complementados por integração real após deploy no Telegram Serverless. O teste do Widget no cliente Telegram é manual.

A versão 2.3.1 acrescentou cenários com álbuns ausentes, capas verificadas pelo título e artista, dois tipos de pesquisa e botões Rich sem argumento. Não há cobertura automatizada de execução visual do cliente Telegram.
