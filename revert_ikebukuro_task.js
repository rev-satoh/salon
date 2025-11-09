const fs = require('fs');
const path = require('path');

const AUTO_TASKS_FILE = path.join(__dirname, 'auto_tasks.json');
const TARGET_LOCATION = '池袋駅';
const CORRECT_NAME = 'ケイトステージラッシュ';
const WRONG_NAME = 'KATE stage LASH';

/**
 * auto_tasks.json内の池袋駅のサロン名を「ケイトステージラッシュ」に戻すスクリプト
 */
function revertIkebukuroTask() {
  console.log('池袋駅の自動計測タスク名を修正します...');

  try {
    if (!fs.existsSync(AUTO_TASKS_FILE)) {
      console.log(`${AUTO_TASKS_FILE} が見つからないため、処理をスキップします。`);
      return;
    }

    const tasksRaw = fs.readFileSync(AUTO_TASKS_FILE, 'utf-8');
    const tasks = JSON.parse(tasksRaw);

    tasks.forEach(task => {
      if (task.searchLocation === TARGET_LOCATION && task.salonName === WRONG_NAME) {
        task.salonName = CORRECT_NAME;
      }
    });

    fs.writeFileSync(AUTO_TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    console.log(`✅ 処理が完了しました。${AUTO_TASKS_FILE} の池袋駅のサロン名を「${CORRECT_NAME}」に戻しました。`);

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
  }
}

revertIkebukuroTask();