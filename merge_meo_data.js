const fs = require('fs');
const path = require('path');
 
const HISTORY_FILE = path.join(__dirname, 'history_meo.json');
const OLD_NAME = 'ケイトステージラッシュ';
const NEW_NAME = 'KATE stage LASH';
const TARGET_LOCATIONS = ['福山駅', '福山市'];

/**
 * MEO履歴データを読み込み、店名を統合して上書き保存するスクリプト
 */
async function mergeMeoData() {
  console.log('MEO履歴データの統合処理を開始します...');

  try {
    // 1. history_meo.json を読み込む
    if (!fs.existsSync(HISTORY_FILE)) {
      console.error(`エラー: ${HISTORY_FILE} が見つかりません。`);
      return;
    }
    const historyRaw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const historyData = JSON.parse(historyRaw);

    console.log(`読み込み完了。合計 ${historyData.length} 件の履歴があります。`);

    // 2. 統合対象を特定
    const oldNameEntries = historyData.filter(item =>
      item.task.salonName === OLD_NAME && TARGET_LOCATIONS.includes(item.task.searchLocation)
    );

    const newNameEntries = historyData.filter(item =>
      item.task.salonName === NEW_NAME && TARGET_LOCATIONS.includes(item.task.searchLocation)
    );

    // 3. データをマージ
    let mergedCount = 0;
    const mergedHistory = historyData.filter(item => !oldNameEntries.includes(item)); // 古い名前のデータを一旦除外

    oldNameEntries.forEach(oldEntry => {
      const correspondingNewEntry = mergedHistory.find(newEntry =>
        newEntry.task.salonName === NEW_NAME &&
        newEntry.task.searchLocation === oldEntry.task.searchLocation &&
        newEntry.task.keyword === oldEntry.task.keyword
      );

      if (correspondingNewEntry) {
        // 新しいデータに古いデータのログを統合
        correspondingNewEntry.log.push(...oldEntry.log);
        // 日付順にソート
        correspondingNewEntry.log.sort((a, b) => new Date(a.date) - new Date(b.date));
        mergedCount++;
      } else {
        // 対応する新しいデータがない場合（＝11/9以降の計測がまだない）は、店名とIDを書き換えて戻す
        oldEntry.task.salonName = NEW_NAME;
        oldEntry.id = oldEntry.id.replace(OLD_NAME, NEW_NAME);
        mergedHistory.push(oldEntry);
      }
    });
    
    if (oldNameEntries.length > 0) {
        console.log(`古い店名「${OLD_NAME}」の対象データが ${oldNameEntries.length} 件見つかりました。`);
        console.log(`${mergedCount} 件のデータを '${NEW_NAME}' に統合しました。`);
    } else {
        console.log('古い店名のデータは見つかりませんでした。日付のクリーンアップのみ実行します。');
    }

    // --- 追加: ログ内の日付重複をクリーンアップ ---
    console.log('ログ内の日付重複をクリーンアップします...');
    mergedHistory.forEach(entry => {
      if (entry.log && entry.log.length > 1) {
        const uniqueLogs = new Map();
        entry.log.forEach(logEntry => {
          const existingLog = uniqueLogs.get(logEntry.date);
          if (existingLog) {
            // 既存ログと新しいログを比較し、より良いランク（数値が小さい方）を残す
            const existingRankIsNumber = typeof existingLog.rank === 'number';
            const newRankIsNumber = typeof logEntry.rank === 'number';
            if ((newRankIsNumber && !existingRankIsNumber) || (newRankIsNumber && existingRankIsNumber && logEntry.rank < existingLog.rank)) {
              uniqueLogs.set(logEntry.date, logEntry); // 新しいログの方が良いので上書き
            }
          } else {
            uniqueLogs.set(logEntry.date, logEntry); // 新しい日付なので追加
          }
        });
        entry.log = Array.from(uniqueLogs.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
      }
    });

    // 4. ファイルに書き戻す
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(mergedHistory, null, 2), 'utf-8');

    console.log(`✅ 統合処理が完了しました。${HISTORY_FILE} を確認してください。`);

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
  }
}

mergeMeoData();