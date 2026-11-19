export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function shorten(value, max = 85) {
  const chars = Array.from(String(value ?? ''));
  if (max <= 0) return '';
  return chars.length > max ? (max === 1 ? '…' : chars.slice(0, max - 1).join('') + '…') : chars.join('');
}

export function validateUsername(value) {
  return /^[A-Za-z0-9_-]{2,32}$/.test(value);
}

export function profileUrl(user) {
  return 'https://www.last.fm/user/' + encodeURIComponent(user);
}
