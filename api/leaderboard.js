const SCORE_KEY = 'lisa-invaders:leaderboard:v1';
const DETAIL_KEY = 'lisa-invaders:leaderboard:details:v1';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function hash(value) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function validateEntry(input) {
  const allowed = new Set(['easy', 'normal', 'arcade', 'daily']);
  const id = String(input.id || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
  const name = String(input.name || '').toUpperCase().replace(/[^A-Z0-9_À-Ü -]/g, '').trim().slice(0, 12);
  const score = Math.round(Number(input.score));
  const level = Math.round(Number(input.level));
  const difficulty = String(input.difficulty || 'normal').toLowerCase();
  if (id.length < 6 || !name || !Number.isFinite(score) || score < 0 || score > 10000000) return null;
  if (!Number.isFinite(level) || level < 1 || level > 500 || !allowed.has(difficulty)) return null;
  return { id, name, score, level, difficulty, daily: Boolean(input.daily), date: new Date().toISOString() };
}

module.exports = async function leaderboard(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (!['GET', 'POST'].includes(req.method)) {
    json(res, 405, { error: 'Metodo non consentito' });
    return;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    json(res, 503, { online: false, error: 'Classifica online non configurata' });
    return;
  }

  async function command(args) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Errore Redis');
    return data.result;
  }

  try {
    if (req.method === 'GET') {
      const ids = await command(['ZREVRANGE', SCORE_KEY, '0', '9']);
      if (!Array.isArray(ids) || !ids.length) {
        json(res, 200, { online: true, entries: [] });
        return;
      }
      const details = await command(['HMGET', DETAIL_KEY, ...ids]);
      const entries = (Array.isArray(details) ? details : []).map(value => {
        try { return JSON.parse(value); } catch { return null; }
      }).filter(Boolean);
      json(res, 200, { online: true, entries });
      return;
    }

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const rateKey = 'lisa-invaders:rate:' + hash(ip) + ':' + new Date().toISOString().slice(0, 13);
    const requests = Number(await command(['INCR', rateKey]));
    if (requests === 1) await command(['EXPIRE', rateKey, '3600']);
    if (requests > 40) {
      json(res, 429, { error: 'Troppi invii, riprova più tardi' });
      return;
    }

    const entry = validateEntry(parseBody(req));
    if (!entry) {
      json(res, 400, { error: 'Punteggio non valido' });
      return;
    }
    await command(['HSET', DETAIL_KEY, entry.id, JSON.stringify(entry)]);
    await command(['ZADD', SCORE_KEY, String(entry.score), entry.id]);
    await command(['ZREMRANGEBYRANK', SCORE_KEY, '0', '-101']);
    json(res, 200, { online: true, saved: true });
  } catch (error) {
    json(res, 500, { error: 'Classifica temporaneamente non disponibile' });
  }
};
