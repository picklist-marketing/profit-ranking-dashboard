// Chatwork自動通知 - 全員の月粗利・月達成率・今週粗利・今週達成率
// 平日10:00 JSTに実行 (UTC 01:00)

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const CHATWORK_TOKEN = process.env.CHATWORK_TOKEN;
  const ROOM_ID = process.env.CHATWORK_ROOM_ID;

  if (!CHATWORK_TOKEN || !ROOM_ID) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  try {
    // KVからデータ取得
    const [membersRaw, kpiRaw, weeksRaw] = await Promise.all([
      kv.get('profit-ranking-members'),
      kv.get('profit-ranking-kpi'),
      kv.get('profit-ranking-weeks'),
    ]);

    const members = membersRaw || [];
    const kpiTargets = kpiRaw || {};
    const weekRanges = weeksRaw || [];

    if (members.length === 0) {
      return res.status(500).json({ error: 'No members configured' });
    }

    // 今月
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 前日
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getMonth() + 1}/${yesterday.getDate()}`;

    // 今週の区間を特定
    const todayStr = `${now.getMonth() + 1}/${now.getDate()}`;
    const currentWeek = weekRanges.find(w => dateInRange(todayStr, w.start, w.end));
    const currentWeekKey = currentWeek ? `${currentWeek.start}~${currentWeek.end}` : null;

    // 各メンバーのデータ取得
    const results = await Promise.all(
      members.map(async member => {
        const url = member.sheets?.[currentMonth];
        if (!url) return { name: member.name, monthTotal: 0, weekTotal: 0, dayTotal: 0 };

        try {
          const rows = await fetchCSV(url);
          const { monthTotal, weekTotal, dayTotal } = parseSheetData(rows, currentWeek, yesterdayStr);
          return { name: member.name, monthTotal, weekTotal, dayTotal };
        } catch (e) {
          console.error(`Error fetching ${member.name}:`, e);
          return { name: member.name, monthTotal: 0, weekTotal: 0, dayTotal: 0 };
        }
      })
    );

    // 達成率計算してメッセージ生成
    const message = formatMessage(results, kpiTargets, currentWeekKey, yesterdayStr);

    // Chatwork送信
    const chatworkRes = await fetch(`https://api.chatwork.com/v2/rooms/${ROOM_ID}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': CHATWORK_TOKEN,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `body=${encodeURIComponent(message)}`,
    });

    if (!chatworkRes.ok) {
      const errorText = await chatworkRes.text();
      throw new Error(`Chatwork API error: ${chatworkRes.status} ${errorText}`);
    }

    const result = await chatworkRes.json();
    return res.status(200).json({ success: true, messageId: result.message_id });

  } catch (error) {
    console.error('Error in send-ranking:', error);
    return res.status(500).json({ error: error.message });
  }
}

// CSV取得
async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  return parseCSV(await res.text());
}

function parseCSV(text) {
  const lines = [];
  let current = [], inQuotes = false, cell = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      current.push(cell); cell = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      current.push(cell);
      if (current.some(x => x.trim())) lines.push(current);
      current = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || current.length > 0) { current.push(cell); if (current.some(x => x.trim())) lines.push(current); }
  return lines;
}

// シートデータをパース（合算シート形式）
function parseSheetData(data, currentWeek, yesterdayStr) {
  // 日付ヘッダー行を見つける
  let dateRowIdx = -1, dateMap = {};
  for (let i = 0; i < Math.min(data.length, 12); i++) {
    const hits = {};
    data[i].forEach((cell, ci) => {
      const s = String(cell || '').trim();
      if (/^\d{1,2}\/\d{1,2}$/.test(s)) hits[ci] = s;
    });
    if (Object.keys(hits).length >= 5) { dateRowIdx = i; dateMap = hits; break; }
  }
  if (dateRowIdx < 0) return { monthTotal: 0, weekTotal: 0 };

  // 合計列
  let totalCol = -1;
  data[dateRowIdx].forEach((cell, ci) => { if (String(cell).trim() === '合計') totalCol = ci; });

  let monthTotal = 0, weekTotal = 0, dayTotal = 0;

  for (let i = dateRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    let isProfitRow = false, profitColIdx = -1;
    row.forEach((cell, ci) => {
      if (String(cell).trim() === '粗利') { isProfitRow = true; profitColIdx = ci; }
    });
    if (!isProfitRow) continue;

    // シート名チェック（テンプレート行スキップ）
    const sheetName = String(row[1] || '').trim();
    if (sheetName === 'シート名') continue;

    // 月合計
    let rowTotal = 0;
    if (totalCol >= 0) {
      const val = row[totalCol];
      rowTotal = typeof val === 'number' ? val : parseFloat(String(val).replace(/[¥￥,]/g, '')) || 0;
    } else {
      Object.entries(dateMap).forEach(([ci, _]) => {
        const val = row[parseInt(ci)];
        rowTotal += typeof val === 'number' ? val : parseFloat(String(val).replace(/[¥￥,]/g, '')) || 0;
      });
    }
    if (rowTotal === 0 && Object.values(dateMap).every((_, ci) => !row[ci])) continue;
    monthTotal += rowTotal;

    // 今週合計
    if (currentWeek) {
      Object.entries(dateMap).forEach(([ci, date]) => {
        if (dateInRange(date, currentWeek.start, currentWeek.end)) {
          const val = row[parseInt(ci)];
          weekTotal += typeof val === 'number' ? val : parseFloat(String(val).replace(/[¥￥,]/g, '')) || 0;
        }
      });
    }

    // 前日合計
    if (yesterdayStr) {
      Object.entries(dateMap).forEach(([ci, date]) => {
        if (date === yesterdayStr) {
          const val = row[parseInt(ci)];
          dayTotal += typeof val === 'number' ? val : parseFloat(String(val).replace(/[¥￥,]/g, '')) || 0;
        }
      });
    }
  }

  return { monthTotal, weekTotal, dayTotal };
}

function dateInRange(date, start, end) {
  if (!start || !end) return false;
  const [dm, dd] = date.split('/').map(Number);
  const [sm, sd] = start.split('/').map(Number);
  const [em, ed] = end.split('/').map(Number);
  const d = dm * 100 + dd, s = sm * 100 + sd, e = em * 100 + ed;
  return d >= s && d <= e;
}

function fY(v) {
  if (v === 0) return '¥0';
  const a = Math.abs(v);
  const s = a >= 10000 ? `¥${(a / 10000).toFixed(1)}万` : `¥${a.toLocaleString()}`;
  return v < 0 ? `-${s}` : s;
}

function rate(actual, target) {
  if (!target || target === 0) return null;
  return Math.round((actual / target) * 100);
}

function formatMessage(results, kpiTargets, currentWeekKey, yesterdayStr) {
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}/${now.getDate()}`;

  let msg = `[info][title]粗利ランキング ${dateLabel}[/title]`;

  // 前日
  const daySorted = [...results].sort((a, b) => b.dayTotal - a.dayTotal).filter(m => m.dayTotal !== 0);
  if (daySorted.length > 0) {
    msg += `\n■前日粗利（${yesterdayStr}）\n`;
    daySorted.forEach((m, i) => {
      msg += `${i + 1}. ${m.name}: ${fY(m.dayTotal)}\n`;
    });
  }

  // 月間
  const sorted = [...results].sort((a, b) => b.monthTotal - a.monthTotal);
  msg += `\n■月間粗利\n`;
  sorted.forEach((m, i) => {
    const kpi = kpiTargets[m.name];
    const monthTarget = kpi?.monthly || null;
    const r = rate(m.monthTotal, monthTarget);
    const rateStr = r !== null ? ` (${r}%)` : '';
    const targetStr = monthTarget ? `/${fY(monthTarget)}` : '';
    msg += `${i + 1}. ${m.name}: ${fY(m.monthTotal)}${targetStr}${rateStr}\n`;
  });

  // 今週
  if (currentWeekKey) {
    const weekSorted = [...results].sort((a, b) => b.weekTotal - a.weekTotal);
    msg += `\n■今週粗利（${currentWeekKey}）\n`;
    weekSorted.forEach((m, i) => {
      const kpi = kpiTargets[m.name];
      const weekTarget = kpi?.weeks?.[currentWeekKey] || null;
      const r = rate(m.weekTotal, weekTarget);
      const rateStr = r !== null ? ` (${r}%)` : '';
      const targetStr = weekTarget ? `/${fY(weekTarget)}` : '';
      msg += `${i + 1}. ${m.name}: ${fY(m.weekTotal)}${targetStr}${rateStr}\n`;
    });
  }

  msg += `[/info]`;
  return msg;
}
