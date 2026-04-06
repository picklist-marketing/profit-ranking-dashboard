import { kv } from '@vercel/kv';

const ALLOWED = ['profit-ranking-kpi', 'profit-ranking-weeks'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key } = req.query;
  if (!ALLOWED.includes(key)) return res.status(400).json({ error: 'Invalid key' });

  if (req.method === 'GET') {
    const data = await kv.get(key);
    return res.json(data ?? null);
  }

  if (req.method === 'POST') {
    await kv.set(key, req.body);
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
