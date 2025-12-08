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
});