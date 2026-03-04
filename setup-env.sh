#!/bin/bash

# Chatwork通知設定のための環境変数生成スクリプト

echo "==================================="
echo "Chatwork通知 環境変数セットアップ"
echo "==================================="
echo ""

# CRON_SECRET生成
echo "1. CRON_SECRET（自動生成）:"
CRON_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "PLEASE_GENERATE_MANUALLY")
echo "CRON_SECRET=$CRON_SECRET"
echo ""

# 固定値
echo "2. Chatwork設定（固定値）:"
echo "CHATWORK_TOKEN=527eb3dcc9d7a8b2f9b3e5373f673236"
echo "CHATWORK_ROOM_ID=299927922"
echo ""

# MEMBERS_CSV_CONFIG
echo "3. MEMBERS_CSV_CONFIG（LocalStorageから取得）:"
echo "ダッシュボード（https://profit-ranking-dashboard.vercel.app）を開き、"
echo "ブラウザの開発者ツール→Consoleで以下を実行："
echo ""
echo "  JSON.stringify(JSON.parse(localStorage.getItem('profit-ranking-members-csv')))"
echo ""
echo "出力されたJSON文字列をコピーして、Vercel環境変数に設定してください。"
echo ""

# Vercel設定方法
echo "==================================="
echo "Vercel環境変数設定方法"
echo "==================================="
echo "1. https://vercel.com/dashboard にアクセス"
echo "2. profit-ranking-dashboard プロジェクトを選択"
echo "3. Settings → Environment Variables"
echo "4. 上記の4つの環境変数を追加"
echo "5. Deployments → Redeploy で再デプロイ"
echo ""
echo "完了後、Cron Jobsタブでスケジュールを確認できます。"
echo ""
