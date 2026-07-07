/* api/_redis.js — Upstash Redis wrapper
   Works on Vercel (serverless) AND cPanel (Node.js process).

   If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set → uses Redis.
   Otherwise → falls back to in-memory (cPanel single-process is fine).

   Usage:
     const { redisGet, redisSet, redisDel } = require('./_redis');
     await redisSet('key', { any: 'object' }, 3600);   // TTL = 1 hour
     const val = await redisGet('key');                 // null if missing
*/

const { Redis } = require('@upstash/redis');

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
    console.log('[Redis] Upstash connected');
  } else {
    console.log('[Redis] No Upstash config — using in-memory fallback');
  }
  return _redis;
}

/* In-memory fallback (for cPanel without Redis or local dev) */
const _mem = {};

async function redisGet(key) {
  const r = getRedis();
  if (r) {
    try {
      const val = await r.get(key);
      // @upstash/redis auto-parses JSON
      return val;
    } catch (e) {
      console.error('[Redis] GET error:', e.message);
      return _mem[key] ?? null;
    }
  }
  return _mem[key] ?? null;
}

/* set(key, value, ttlSeconds?)
   ttlSeconds = 0 means no expiry */
async function redisSet(key, value, ttlSeconds) {
  const r = getRedis();
  if (r) {
    try {
      if (ttlSeconds) {
        await r.set(key, value, { ex: ttlSeconds });
      } else {
        await r.set(key, value);
      }
    } catch (e) {
      console.error('[Redis] SET error:', e.message);
      _mem[key] = value;
    }
  } else {
    _mem[key] = value;
  }
}

async function redisDel(key) {
  const r = getRedis();
  if (r) {
    try { await r.del(key); } catch(e) { console.error('[Redis] DEL:', e.message); }
  }
  delete _mem[key];
}

module.exports = { redisGet, redisSet, redisDel };
