// Chatwork自動通知 - 前日・月間ランキングTOP3
// 平日10:00 JSTに実行

export default async function handler(req, res) {
  // Cron jobからの呼び出しを検証
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const CHATWORK_TOKEN = process.env.CHATWORK_TOKEN;
  const ROOM_ID = process.env.CHATWORK_ROOM_ID;

  if (!CHATWORK_TOKEN || !ROOM_ID) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  try {
    // メンバー設定をVercel環境変数から取得
    const membersData = JSON.parse(process.env.MEMBERS_CSV_CONFIG || '[]');

    if (!membersData || membersData.length === 0) {
      return res.status(500).json({ error: 'No members configured' });
    }

    // 全メンバーのデータを取得・集計
    const allData = await fetchAllMemberData(membersData);

    // 日付計算
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getMonth() + 1}/${yesterday.getDate()}`;

    // ランキング計算
    const yesterdayRanking = calculateRanking(allData, yesterdayStr, false);
    const monthlyRanking = calculateRanking(allData, null, true);

    // Chatworkメッセージ作成
    const message = formatChatworkMessage(yesterdayRanking, monthlyRanking, yesterdayStr);

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

    return res.status(200).json({
      success: true,
      messageId: result.message_id,
      timestamp: new Date().toISOString(),
      yesterdayDate: yesterdayStr,
      memberCount: allData.length
    });

  } catch (error) {
    console.error('Error in send-ranking:', error);
    return res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// CSV取得・パース関数
async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = [];
  let current = [];
  let inQuotes = false;
  let cell = '';

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      current.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (cell || current.length > 0) {
        current.push(cell);
        if (current.some(x => x.trim())) lines.push(current);
        current = [];
        cell = '';
      }
      if (c === '\r' && next === '\n') i++;
    } else {
      cell += c;
    }
  }

  if (cell || current.length > 0) {
    current.push(cell);
    if (current.some(x => x.trim())) lines.push(current);
  }

  return lines;
}

// 全メンバーデータ取得
async function fetchAllMemberData(membersConfig) {
  const results = [];

  for (const member of membersConfig) {
    const memberData = {
      name: member.name,
      projects: []
    };

    for (const [sheetName, url] of Object.entries(member.sheets || {})) {
      if (!url) continue;

      try {
        const rows = await fetchCSV(url);
        if (rows.length < 2) continue;

        const header = rows[0];
        const dateColsStart = header.findIndex(h => /^\d{1,2}\/\d{1,2}$/.test(h.trim()));
        if (dateColsStart === -1) continue;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const projName = row[0]?.trim();
          if (!projName) continue;

          const totalProfit = parseFloat(row[1]) || 0;

          // Platform detection
          let platform = "Other";
          const sn = (sheetName + projName).toLowerCase();
          if (sn.includes("tik") || sn.includes("pangle")) platform = "TikTok";
          else if (sn.includes("meta") || sn.includes("mete")) platform = "Meta";
          else if (sn.includes("google")) platform = "Google";
          else if (sn.includes("line") || sn.includes("lap")) platform = "LINE";

          const daily = {};
          for (let j = dateColsStart; j < header.length; j++) {
            const dateKey = header[j].trim();
            if (/^\d{1,2}\/\d{1,2}$/.test(dateKey)) {
              const val = parseFloat(row[j]) || 0;
              daily[dateKey] = val;
            }
          }

          memberData.projects.push({
            name: projName,
            platform,
            totalProfit,
            daily,
            sheet: sheetName
          });
        }
      } catch (err) {
        console.error(`Error fetching ${member.name}/${sheetName}:`, err);
      }
    }

    results.push(memberData);
  }

  return results;
}

// ランキング計算
function calculateRanking(allData, dateKey, isMonthly) {
  const rankings = [];

  for (const member of allData) {
    let total = 0;

    for (const proj of member.projects) {
      if (isMonthly) {
        total += proj.totalProfit || 0;
      } else if (dateKey) {
        total += proj.daily[dateKey] || 0;
      }
    }

    if (total !== 0) {
      rankings.push({
        name: member.name,
        profit: total
      });
    }
  }

  rankings.sort((a, b) => b.profit - a.profit);
  return rankings.slice(0, 3); // TOP3のみ
}

// Chatworkメッセージフォーマット
function formatChatworkMessage(yesterdayTop3, monthlyTop3, yesterdayDate) {
  const formatProfit = (val) => {
    if (val === 0) return "¥0";
    const abs = Math.abs(val);
    const formatted = abs >= 10000
      ? `¥${(abs / 10000).toFixed(1)}万`
      : `¥${abs.toLocaleString()}`;
    return val < 0 ? `-${formatted}` : formatted;
  };

  const medals = ["🥇", "🥈", "🥉"];

  let msg = `[info][title]📊 粗利ランキング（自動配信）[/title]`;

  // 前日ランキング
  msg += `\n\n【前日ランキング】${yesterdayDate}\n`;
  yesterdayTop3.forEach((item, idx) => {
    msg += `${medals[idx]} ${item.name}: ${formatProfit(item.profit)}\n`;
  });

  // 月間ランキング
  msg += `\n【月間ランキング】\n`;
  monthlyTop3.forEach((item, idx) => {
    msg += `${medals[idx]} ${item.name}: ${formatProfit(item.profit)}\n`;
  });

  msg += `[/info]`;

  return msg;
}
