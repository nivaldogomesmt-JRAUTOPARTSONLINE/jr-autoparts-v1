const ACCENT_FROM = 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ';
const ACCENT_TO = 'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY';

function parseSearchTokens(search) {
  return String(search || '')
    .trim()
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeSearchToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizedSqlExpr(columnRef) {
  return `translate(lower(coalesce(${columnRef}, '')), '${ACCENT_FROM}', '${ACCENT_TO}')`;
}

module.exports = {
  ACCENT_FROM,
  ACCENT_TO,
  parseSearchTokens,
  normalizeSearchToken,
  normalizedSqlExpr,
};
