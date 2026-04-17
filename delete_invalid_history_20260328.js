const fs = require('fs');
const path = require('path');

// 履歴ファイルのパス
// HPB通常、MEO、HPB特集の履歴ファイルを対象とします
const HISTORY_FILES = [
  path.join(__dirname, 'history_normal.json'),
  path.join(__dirname, 'history_meo.json'),
  path.join(__dirname, 'history_special.json')
];
const TARGET_DATE = '2026/03/28';

/**
 * 指定された履歴ファイルから、対象日のログを削除します。
 * @param {string} historyFile 処理対象のファイルパス
 */
function deleteInvalidHistoryForFile(historyFile) {
  console.log(`\n処理中のファイル: ${historyFile}`);

  try {
    if (!fs.existsSync(historyFile)) {
      console.error(`エラー: ${historyFile} が見つからないため、このファイルの処理をスキップします。`);
      return;
    }

    // 安全のため、ファイルのバックアップを作成
    const backupFile = `${historyFile}.backup_${Date.now()}`;
    fs.copyFileSync(historyFile, backupFile);
    console.log(`バックアップを作成しました: ${backupFile}`);

    const historyRaw = fs.readFileSync(historyFile, 'utf-8');
    let historyData = JSON.parse(historyRaw);
    let deletedCount = 0;

    // データを加工
    historyData = historyData.map(item => {
      if (item.task && Array.isArray(item.log)) {
        const originalLogLength = item.log.length;

        // 指定日のログを除外（日付文字列の前方一致で判定）
        item.log = item.log.filter(entry => !entry.date.startsWith(TARGET_DATE));

        const diff = originalLogLength - item.log.length;
        if (diff > 0) {
            deletedCount += diff;
        }
      }
      return item;
    });

    // 保存
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2), 'utf-8');
    console.log(`✅ 処理が完了しました。このファイルから、${TARGET_DATE} のログを合計 ${deletedCount} 件削除しました。`);

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
  }
}

console.log(`履歴削除処理を開始します... 対象日: ${TARGET_DATE}`);
HISTORY_FILES.forEach(file => {
    deleteInvalidHistoryForFile(file);
});
console.log('\nすべてのファイルの処理が完了しました。');