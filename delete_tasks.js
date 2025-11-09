const fs = require('fs');
const path = require('path');

const AUTO_TASKS_FILE = path.join(__dirname, 'auto_tasks.json');
const TARGET_LOCATIONS = ['香椎駅', '岐阜駅', '岐阜市', '広島　八丁堀駅'];
const SALON_NAMES_TO_DELETE = ['ケイトステージラッシュ', 'KATE stage LASH'];

/**
 * auto_tasks.jsonから対象のMEOタスクを削除するスクリプト
 */
function deleteAutoTasks() {
  console.log('自動計測タスクの削除処理を開始します...');

  try {
    if (!fs.existsSync(AUTO_TASKS_FILE)) {
      console.log(`${AUTO_TASKS_FILE} が見つからないため、処理をスキップします。`);
      return;
    }

    const tasksRaw = fs.readFileSync(AUTO_TASKS_FILE, 'utf-8');
    const tasks = JSON.parse(tasksRaw);

    const originalCount = tasks.length;
    const filteredTasks = tasks.filter(task => 
      !(task.type === 'google' && TARGET_LOCATIONS.includes(task.searchLocation) && SALON_NAMES_TO_DELETE.includes(task.salonName))
    );
    const deletedCount = originalCount - filteredTasks.length;

    fs.writeFileSync(AUTO_TASKS_FILE, JSON.stringify(filteredTasks, null, 2), 'utf-8');
    console.log(`✅ 処理が完了しました。${deletedCount}件の対象MEO自動計測タスクを削除しました。`);

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
  }
}

deleteAutoTasks();