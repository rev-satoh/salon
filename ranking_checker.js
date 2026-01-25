import { initializeUI, updateUIForSearchType } from './ui.js';
import { fetchAutoTasks, fetchAndDisplayAutoHistory } from './history.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 状態管理オブジェクト
    const state = {
        isMeasuring: false,
        autoTasks: []
    };

    // UI関連の初期化
    initializeUI(state);

    // 初期データの取得と表示
    await fetchAutoTasks(state);
    await fetchAndDisplayAutoHistory();

    // 初期表示時のUI更新
    const initialActiveButton = document.querySelector('#searchTypeToggle .toggle-button.active');
    if (initialActiveButton) {
        const initialActiveType = initialActiveButton.dataset.type;
        updateUIForSearchType(initialActiveType, state.autoTasks);
    }

    // 自店（広島・福山）選択チェックボックスのイベントリスナー
    const selectMyStoreCheckbox = document.getElementById('selectMyStore');
    if (selectMyStoreCheckbox) {
        selectMyStoreCheckbox.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            // 現在表示されているタスクリストのチェックボックスを取得
            const taskCheckboxes = document.querySelectorAll('#autoTaskList input[type="checkbox"]');
            
            taskCheckboxes.forEach(checkbox => {
                const taskId = checkbox.value;
                const task = state.autoTasks.find(t => t.id === taskId);
                
                if (task && isMyStore(task)) {
                    checkbox.checked = isChecked;
                }
            });
        });
    }

    // 他店選択チェックボックスのイベントリスナー
    const selectOtherStoresCheckbox = document.getElementById('selectOtherStores');
    if (selectOtherStoresCheckbox) {
        selectOtherStoresCheckbox.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            // 現在表示されているタスクリストのチェックボックスを取得
            const taskCheckboxes = document.querySelectorAll('#autoTaskList input[type="checkbox"]');
            
            taskCheckboxes.forEach(checkbox => {
                const taskId = checkbox.value;
                const task = state.autoTasks.find(t => t.id === taskId);
                
                if (task && isOtherStore(task)) {
                    checkbox.checked = isChecked;
                }
            });
        });
    }

    // スクショ保存設定の読み込みと保存（手動計測）
    const manualScreenshotCheckbox = document.getElementById('manualScreenshotCheckbox');
    if (manualScreenshotCheckbox) {
        const saved = localStorage.getItem('manualScreenshotEnabled');
        if (saved !== null) manualScreenshotCheckbox.checked = saved === 'true';
        manualScreenshotCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('manualScreenshotEnabled', e.target.checked);
        });
    }

    // スクショ保存設定の読み込みと保存（自動計測タスク手動実行）
    const autoTaskScreenshotCheckbox = document.getElementById('autoTaskScreenshotCheckbox');
    if (autoTaskScreenshotCheckbox) {
        const saved = localStorage.getItem('autoTaskScreenshotEnabled');
        if (saved !== null) autoTaskScreenshotCheckbox.checked = saved === 'true';
        autoTaskScreenshotCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('autoTaskScreenshotEnabled', e.target.checked);
        });
    }
});

/**
 * タスクが「自店（広島・福山）」かどうかを判定する関数
 * @param {Object} task - タスクオブジェクト
 * @returns {boolean}
 */
function isMyStore(task) {
    const targetSalons = ['ケイトステージラッシュ', 'KATE stage LASH'];
    
    // サロン名チェック
    if (!targetSalons.includes(task.salonName)) {
        return false;
    }

    // エリア・キーワードチェック
    const targetKeywords = ['広島', '福山', '八丁堀'];
    const checkString = (str) => str && targetKeywords.some(kw => str.includes(kw));

    // 1. エリア名 / 2. 検索地点 / 3. 特集ページ名 のいずれかにキーワードが含まれるか
    if (checkString(task.areaName) || checkString(task.searchLocation) || checkString(task.featurePageName)) {
        return true;
    }
    
    // 4. エリアコードでの判定 (FA: 広島, FC: 福山)
    if (task.areaCodes && (task.areaCodes.middleAreaCd === 'FA' || task.areaCodes.middleAreaCd === 'FC')) {
        return true;
    }

    return false;
}

/**
 * タスクが「他店」かどうかを判定する関数
 * @param {Object} task - タスクオブジェクト
 * @returns {boolean}
 */
function isOtherStore(task) {
    // 自店（広島・福山）以外はすべて「他店」とみなす
    // これには競合店および、広島・福山以外の自社グループ店が含まれる
    return !isMyStore(task);
}