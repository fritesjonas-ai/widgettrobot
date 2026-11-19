import { parseRecentTracks } from '../domain/lastfm-parser.js';
import { ExternalServiceError, classifyLastfmError } from '../domain/errors.js';

/** Adapter for Last.fm's documented user.getRecentTracks response and error codes. */
export function createLastfmClient({ request, apiKey }) {
  if (typeof request !== 'function') throw new TypeError('Last.fm: request ausente.');
  return {
    async recent(username, limit = 5) {
      if (!apiKey) throw new ExternalServiceError('invalid_key', 'API key não configurada');
      const n = Math.max(1, Math.min(10, Number(limit) || 5));
      const params = new URLSearchParams({
        method: 'user.getRecentTracks', user: username,
        api_key: apiKey, format: 'json', limit: String(n),
      });
      let response;
      try {
        response = await request('https://ws.audioscrobbler.com/2.0/?' + params);
      } catch {
        // Never forward the original error: SDK fetch errors can contain a URL with the API key.
        throw new ExternalServiceError('network', 'Falha de rede no Last.fm');
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        const status = response?.status ?? null;
        const kind = !response?.ok ? (status === 429 ? 'rate_limited' : 'unavailable') : 'bad_response';
        throw new ExternalServiceError(kind, 'Last.fm retornou JSON inválido', { status });
      }
      // Last.fm may use JSON { error: 29, message: ... } independently of the HTTP status.
      if (payload && Object.hasOwn(payload, 'error')) {
        const apiCode = Number(payload.error);
        throw new ExternalServiceError(classifyLastfmError(apiCode, payload.message),
          `Last.fm error ${apiCode}`, { apiCode, status: response.status });
      }
      if (!response?.ok) {
        const status = response?.status ?? null;
        const kind = status === 429 ? 'rate_limited' : status === 400 ? 'invalid_request' : 'unavailable';
        throw new ExternalServiceError(kind, `Last.fm HTTP ${status}`, { status });
      }
      try {
        return parseRecentTracks(payload);
      } catch {
        throw new ExternalServiceError('bad_response', 'Estrutura de faixas inválida no Last.fm', { status: response.status });
      }
    },
  };
}
