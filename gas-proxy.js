/**
 * ═══════════════════════════════════════════════════════════════
 * 粗利ランキング Dashboard - GAS プロキシサーバー
 * ═══════════════════════════════════════════════════════════════
 *
 * このスクリプトはGoogle Apps Scriptで動作し、
 * スプレッドシートからデータを取得してJSONP形式で返します。
 *
 * セットアップ手順:
 * 1. script.google.com で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. 「デプロイ」→「新しいデプロイ」→ウェブアプリとして公開
 *    - 実行ユーザー: 自分
 *    - アクセス: 全員
 * 4. デプロイURLをダッシュボードに設定
 */

function doGet(e) {
  const params = e.parameter || {};
  const callback = params.callback || 'callback';

  try {
    let result;

    // 単一シート取得（担当者追加時）
    if (params.sheetId && params.name) {
      result = fetchSingleSheet(params.sheetId, params.name);
    }
    // 複数シート一括取得
    else if (params.members) {
      const membersList = JSON.parse(params.members);
      result = fetchMultipleSheets(membersList);
    }
    else {
      throw new Error('パラメータが不正です');
    }

    // JSONP形式で返却
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(result)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);

  } catch (error) {
    const errorResult = {
      success: false,
      error: error.toString()
    };
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(errorResult)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

/**
 * 単一スプレッドシートからデータ取得
 */
function fetchSingleSheet(sheetId, name) {
  try {
    const ss = SpreadsheetApp.openById(sheetId);
    const projects = parseSpreadsheet(ss);

    return {
      success: true,
      data: [{
        name: name,
        projects: projects
      }]
    };
  } catch (error) {
    return {
      success: true,
      data: [{
        name: name,
        error: `読み取りエラー: ${error.message}`
      }]
    };
  }
}

/**
 * 複数スプレッドシートから一括取得
 */
function fetchMultipleSheets(membersList) {
  const results = membersList.map(member => {
    try {
      const ss = SpreadsheetApp.openById(member.sheetId);
      const projects = parseSpreadsheet(ss);

      return {
        name: member.name,
        projects: projects
      };
    } catch (error) {
      return {
        name: member.name,
        error: `読み取りエラー: ${error.message}`
      };
    }
  });

  return {
    success: true,
    data: results
  };
}

/**
 * スプレッドシートをパースしてプロジェクトデータを抽出
 *
 * 想定フォーマット:
 * - 各シートが1案件
 * - シート名: 案件名
 * - A列: 日付（MM/DD形式）
 * - B列以降: 各媒体の粗利
 * - 最終行: "合計"行（月間合計を計算）
 */
function parseSpreadsheet(ss) {
  const sheets = ss.getSheets();
  const projects = [];

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();

    // システムシートをスキップ
    if (sheetName.startsWith('_') || sheetName === 'テンプレート') {
      return;
    }

    try {
      const data = sheet.getDataRange().getValues();
      if (data.length < 2) return; // ヘッダーのみの場合スキップ

      // ヘッダー行から媒体名を取得（B列以降）
      const headers = data[0];
      const platforms = headers.slice(1).filter(h => h && h.toString().trim());

      if (platforms.length === 0) return;

      // 各媒体のデータを処理
      platforms.forEach((platform, platformIndex) => {
        const colIndex = platformIndex + 1; // A列が0なのでB列は1から
        const daily = {};
        let totalProfit = 0;

        // データ行を処理（ヘッダーを除く）
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const dateCell = row[0];
          const valueCell = row[colIndex];

          // "合計"行をスキップ
          if (dateCell && dateCell.toString().includes('合計')) {
            continue;
          }

          // 日付の処理
          let dateStr = '';
          if (dateCell instanceof Date) {
            dateStr = `${dateCell.getMonth() + 1}/${dateCell.getDate()}`;
          } else if (dateCell) {
            dateStr = dateCell.toString().trim();
          }

          // 値の処理
          if (dateStr && valueCell !== null && valueCell !== undefined && valueCell !== '') {
            const value = typeof valueCell === 'number' ? valueCell : parseFloat(valueCell);
            if (!isNaN(value)) {
              daily[dateStr] = value;
              totalProfit += value;
            }
          }
        }

        // データがある場合のみ追加
        if (Object.keys(daily).length > 0) {
          projects.push({
            name: sheetName,
            platform: platform.toString().trim(),
            daily: daily,
            totalProfit: totalProfit
          });
        }
      });

    } catch (error) {
      Logger.log(`シート ${sheetName} の処理エラー: ${error.message}`);
    }
  });

  return projects;
}

/**
 * テスト用関数（スクリプトエディタで実行可能）
 */
function testFetch() {
  // テスト用のスプレッドシートIDを設定
  const testSheetId = "YOUR_TEST_SHEET_ID_HERE";
  const result = fetchSingleSheet(testSheetId, "テスト");
  Logger.log(JSON.stringify(result, null, 2));
}
