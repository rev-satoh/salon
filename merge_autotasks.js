const fs = require('fs');
const path = require('path');

const AUTO_TASKS_FILE = path.join(__dirname, 'auto_tasks.json');
const OLD_NAME = 'ケイトステージラッシュ';
const NEW_NAME = 'KATE stage LASH';

/**
 * auto_tasks.json内の古いサロン名を新しいサロン名に統一するスクリプト
 */
function unifyAutoTasks() {
  console.log('自動計測タスクのサロン名統一処理を開始します...');

  try {
    if (!fs.existsSync(AUTO_TASKS_FILE)) {
      console.log(`${AUTO_TASKS_FILE} が見つからないため、処理をスキップします。`);
      return;
    }

    const tasksRaw = fs.readFileSync(AUTO_TASKS_FILE, 'utf-8');
    const tasks = JSON.parse(tasksRaw);

    tasks.forEach(task => {
      if (task.salonName === OLD_NAME) {
        task.salonName = NEW_NAME;
      }
    });

    fs.writeFileSync(AUTO_TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
    console.log(`✅ 処理が完了しました。${AUTO_TASKS_FILE} のサロン名を統一しました。`);

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
  }
}

unifyAutoTasks();