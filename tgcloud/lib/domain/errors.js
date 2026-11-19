/** Stable application error categories; no HTTP URLs or secrets in public messages. */
export class ExternalServiceError extends Error {
  constructor(kind, message, { provider = 'Last.fm', status = null, apiCode = null } = {}) {
    super(message);
    this.name = 'ExternalServiceError';
    this.kind = kind;
    this.provider = provider;
    this.status = status;
    this.apiCode = apiCode;
  }
}

export function lastfmErrorDetail(error) {
  if (!(error instanceof ExternalServiceError)) return 'Falha inesperada ao consultar o Last.fm. Tente novamente mais tarde.';
  switch (error.kind) {
    case 'invalid_user': return 'Usuário do Last.fm inválido ou inexistente. Confira o nome e tente novamente.';
    case 'invalid_request': return 'O Last.fm rejeitou os parâmetros da consulta. Avise o administrador do bot.';
    case 'invalid_key': return 'A chave da API Last.fm é inválida (código 10). Avise o administrador do bot.';
    case 'suspended_key': return 'A chave da API Last.fm foi suspensa (código 26). Avise o administrador do bot.';
    case 'rate_limited': return 'O Last.fm limitou as consultas (erro 29). Aguarde antes de tentar novamente.';
    case 'unavailable': return 'O serviço Last.fm está temporariamente indisponível. Tente novamente mais tarde.';
    case 'bad_response': return 'O Last.fm retornou dados inesperados. Tente novamente mais tarde.';
    case 'network': return 'Não foi possível conectar ao Last.fm. Verifique a conexão e tente novamente.';
    default: return 'Erro ao consultar o Last.fm. Tente novamente mais tarde.';
  }
}

export class StorageError extends Error {
  constructor(operation, cause) {
    super(`Falha de persistência: ${operation}`, { cause });
    this.name = 'StorageError';
    this.operation = operation;
    this.dbCode = typeof cause?.code === 'string' ? cause.code.slice(0, 40) : null;
  }
}

/** Official Last.fm error codes: https://www.last.fm/api/errorcodes */
export function classifyLastfmError(code, message = '') {
  const n = Number(code);
  if (n === 10) return 'invalid_key';
  if (n === 26) return 'suspended_key';
  if (n === 29) return 'rate_limited';
  if (n === 11 || n === 16 || n === 8) return 'unavailable';
  if (n === 6 && /user.*(not found|does not exist|invalid|unknown)/i.test(message)) return 'invalid_user';
  if (n === 6 || n === 2 || n === 3 || n === 5 || n === 7 || n === 13) return 'invalid_request';
  return 'unavailable';
}

/** The SDK's BotApiError has code, description, method and parameters. */
export function telegramFailure(error) {
  const code = Number(error?.code);
  const retryAfter = Number(error?.parameters?.retry_after);
  return {
    kind: code === 429 ? 'rate_limited' : code === 400 ? 'bad_request' : 'transport',
    code: Number.isInteger(code) ? code : null,
    retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null,
    method: typeof error?.method === 'string' ? error.method : 'unknown',
  };
}
