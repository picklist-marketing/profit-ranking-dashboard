// 環境変数確認用（デバッグ用）
export default async function handler(req, res) {
  const envCheck = {
    CHATWORK_TOKEN: process.env.CHATWORK_TOKEN ? '✅ Set' : '❌ Missing',
    CHATWORK_ROOM_ID: process.env.CHATWORK_ROOM_ID ? '✅ Set' : '❌ Missing',
    CRON_SECRET: process.env.CRON_SECRET ? '✅ Set' : '❌ Missing',
    MEMBERS_CSV_CONFIG: process.env.MEMBERS_CSV_CONFIG ? '✅ Set' : '❌ Missing',
  };

  return res.status(200).json({
    message: 'Environment Variables Status',
    env: envCheck,
    nodeEnv: process.env.NODE_ENV,
  });
}
