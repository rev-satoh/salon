const fs = require('fs');
const path = require('path');

const inputFile = '/Users/satoudaisuke/anaconda/salon/history_meo.json';
const outputFile = '/Users/satoudaisuke/anaconda/salon/history_meo_merged.json';

try {
    // JSONファイルを読み込む
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const data = JSON.parse(rawData);

    const mergedData = [];
    const fukuyamaStationEntries = new Map();
    const otherEntries = [];

    // データを「福山駅」のエントリとそれ以外に分類
    for (const entry of data) {
        if (entry.task && entry.task.searchLocation === '福山駅') {
            if (fukuyamaStationEntries.has(entry.id)) {
                // 既存のエントリにlogをマージ
                const existingEntry = fukuyamaStationEntries.get(entry.id);
                existingEntry.log.push(...entry.log);
            } else {
                // 新しいエントリとしてMapに追加
                fukuyamaStationEntries.set(entry.id, entry);
            }
        } else {
            otherEntries.push(entry);
        }
    }

    // Mapから福山駅の統合済みエントリを取得
    const mergedFukuyamaEntries = Array.from(fukuyamaStationEntries.values());

    // ログエントリを日付でソート
    for (const entry of mergedFukuyamaEntries) {
        entry.log.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // 最終的なデータを作成
    const finalData = [...mergedFukuyamaEntries, ...otherEntries];

    // 新しいJSONファイルに書き出す
    fs.writeFileSync(outputFile, JSON.stringify(finalData, null, 2), 'utf8');

    console.log(`処理が完了しました。統合されたファイルが ${outputFile} に保存されました。`);

} catch (error) {
    console.error('エラーが発生しました:', error);
}
