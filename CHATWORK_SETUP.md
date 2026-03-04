# Chatwork自動通知セットアップガイド

## 概要
平日の毎日10:00（JST）に、前日ランキングと月間ランキングのTOP3をChatworkに自動送信します。

## 必要な情報
- ✅ Chatwork APIトークン: `527eb3dcc9d7a8b2f9b3e5373f673236`
- ✅ Chatwork Room ID: `299927922`
- ✅ スケジュール: 平日10:00 JST（Cron: `0 1 * * 1-5` UTC）

## セットアップ手順

### 1. Vercel環境変数の設定

Vercelダッシュボードで以下の環境変数を設定：

```
CHATWORK_TOKEN=527eb3dcc9d7a8b2f9b3e5373f673236
CHATWORK_ROOM_ID=299927922
CRON_SECRET=<ランダムな文字列を生成>
MEMBERS_CSV_CONFIG=<LocalStorageから取得したJSON>
```

#### CRON_SECRETの生成方法
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### MEMBERS_CSV_CONFIGの取得方法
ダッシュボード（https://profit-ranking-dashboard.vercel.app）のブラウザコンソールで実行：

```javascript
JSON.stringify(JSON.parse(localStorage.getItem('profit-ranking-members-csv')))
```

出力されたJSON文字列をそのまま環境変数に設定してください。

### 2. デプロイ

```bash
cd /Users/muraseatsuki/profit-ranking-dashboard
git add .
git commit -m "Add Chatwork notification cron job"
git push
```

Vercelが自動でデプロイし、Cron Jobが有効化されます。

### 3. 動作確認

#### 手動テスト実行
```bash
curl -X POST https://profit-ranking-dashboard.vercel.app/api/send-ranking \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json"
```

成功すると、Chatworkにメッセージが送信されます。

#### Vercelダッシュボードで確認
- Project → Crons タブでスケジュールと実行履歴を確認
- Logs タブでエラーログを確認

## メッセージフォーマット

```
[info][title]📊 粗利ランキング（自動配信）[/title]

【前日ランキング】3/3
🥇 加藤: ¥15.2万
🥈 今井: ¥12.8万
🥉 佐藤: ¥9.5万

【月間ランキング】
🥇 加藤: ¥125.3万
🥈 今井: ¥98.7万
🥉 佐藤: ¥87.2万
[/info]
```

## トラブルシューティング

### メッセージが送信されない
1. Vercel Logsでエラー確認
2. 環境変数が正しく設定されているか確認
3. Chatwork APIトークンの有効性確認
4. Room IDが正しいか確認

### データが取得できない
- `MEMBERS_CSV_CONFIG`のJSON形式が正しいか確認
- 各メンバーのスプレッドシートURLが「ウェブに公開」されているか確認
- CSV形式で公開されているか確認（`/export?format=csv&gid=...`）

### Cronが実行されない
- Vercel Pro プランの場合、Cron Jobsが有効か確認
- `vercel.json`の設定が正しいか確認

## ファイル構成

```
profit-ranking-dashboard/
├── api/
│   └── send-ranking.js    # Serverless function（Chatwork送信）
├── vercel.json             # Cron設定
├── .env.example            # 環境変数テンプレート
└── CHATWORK_SETUP.md       # このファイル
```
