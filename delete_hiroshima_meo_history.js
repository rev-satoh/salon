const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'history_meo.json');
const TARGET_LOCATION = '広島市';
const SALON_NAMES_TO_DELETE = ['ケイトステージラッシュ', 'KATE stage LASH'];

/**
 * history_meo.jsonから広島市のMEO履歴を削除するスクリプト
 */
function deleteHiroshimaMeoHistory() {
  console.log('MEO履歴の削除処理を開始します...');

  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      console.error(`エラー: ${HISTORY_FILE} が見つからないため、処理をスキップします。`);
      return;
    }
    const historyRaw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const historyData = JSON.parse(historyRaw);

    const originalCount = historyData.length;
    const filteredHistory = historyData.filter(item => 
      !(item.task.type === 'google' && item.task.searchLocation === TARGET_LOCATION && SALON_NAMES_TO_DELETE.includes(item.task.salonName))
    );
    const deletedCount = originalCount - filteredHistory.length;

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(filteredHistory, null, 2), 'utf-8');
    console.log(`✅ 処理が完了しました。${deletedCount}件の広島市のMEO履歴を削除しました。`);

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
  }
}

deleteHiroshimaMeoHistory();