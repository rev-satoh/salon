/**
 * UIの初期化、イベントリスナーの設定、DOM操作を管理します。
 */
import { areas } from './config.js';
import * as dom from './dom.js';
import { saveAutoTasksAPI, saveScheduleAPI, fetchScheduleAPI } from './api.js';
import { checkRank } from './manualChecker.js'; // この行を追加
import { fetchAndDisplayAutoHistory } from './history.js';

/**
 * UI要素の初期化とイベントリスナーの設定を行います。
 * @param {object} state - アプリケーションの状態オブジェクト
 */
export function initializeUI(state) {
    populateAreaSelectors();
    setupEventListeners(state);
    initializeTaskListVisibility();
    fetchSchedule();
}

/**
 * エリア選択のプルダウンを生成します。
 */
function populateAreaSelectors() {
    // 大エリア
    for (const blockName in areas) {
        const option = document.createElement('option');
        option.value = blockName;
        option.textContent = `${blockName} (${areas[blockName].code})`;
        dom.largeAreaSelect.appendChild(option);
    }

    // 大エリアが選択されたら中エリアを更新
    dom.largeAreaSelect.addEventListener('change', () => {
        const selectedLargeArea = dom.largeAreaSelect.value;
        dom.middleAreaSelect.innerHTML = '<option value="">ブロック全域</option>';
        dom.smallAreaSelect.innerHTML = '<option value="">エリア全域</option>';
        dom.middleAreaGroup.style.visibility = 'hidden';
        dom.smallAreaGroup.style.visibility = 'hidden';

        if (selectedLargeArea && areas[selectedLargeArea]) {
            for (const middleAreaName in areas[selectedLargeArea].middleAreas) {
                const option = document.createElement('option');
                option.value = middleAreaName;
                const middleAreaCode = areas[selectedLargeArea].middleAreas[middleAreaName].code;
                option.textContent = `${middleAreaName} (${middleAreaCode})`;
                dom.middleAreaSelect.appendChild(option);
            }
            dom.middleAreaGroup.style.visibility = 'visible';
        }
    });

    // 中エリアが選択されたら小エリアを更新
    dom.middleAreaSelect.addEventListener('change', () => {
        const selectedLargeArea = dom.largeAreaSelect.value;
        const selectedMiddleArea = dom.middleAreaSelect.value;
        dom.smallAreaSelect.innerHTML = '<option value="">エリア全域</option>';
        dom.smallAreaGroup.style.visibility = 'hidden';

        const smallAreaDefs = areas[selectedLargeArea]?.middleAreas[selectedMiddleArea]?.smallAreas;
        if (smallAreaDefs && Object.keys(smallAreaDefs).length > 0) {
            for (const smallAreaName in smallAreaDefs) {
                const option = document.createElement('option');
                option.value = smallAreaName;
                const smallAreaCode = smallAreaDefs[smallAreaName].code;
                option.textContent = `${smallAreaName} (${smallAreaCode})`;
                dom.smallAreaSelect.appendChild(option);
            }
            dom.smallAreaGroup.style.visibility = 'visible';
        }
    });
}

/**
 * 主要なイベントリスナーを設定します。
 * @param {object} state - アプリケーションの状態オブジェクト
 */
function setupEventListeners(state) {
    // 計測タイプ切り替え
    dom.searchTypeToggle.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.toggle-button');
        if (!clickedButton) return;

        dom.searchTypeToggle.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
        clickedButton.classList.add('active');
        
        fetchAndDisplayAutoHistory();
        const activeType = clickedButton.dataset.type;
        updateUIForSearchType(activeType, state.autoTasks);
        renderAutoTasks(state);
    });

    // モード説明
    dom.modeHelpButton.addEventListener('click', showModeHelp);

    // 手動計測へスクロール
    dom.scrollToManualCheckButton.addEventListener('click', () => {
        dom.manualCheckSection.scrollIntoView({ behavior: 'smooth' });
    });

    // 手動計測ボタン
    dom.checkRankButton.addEventListener('click', () => checkRank(state));

    // 自動計測タスク追加ボタン
    dom.addAutoTaskButton.addEventListener('click', () => addAutoTask(state));

    // タスクリストの削除ボタン（イベント委譲）
    dom.autoTaskList.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-task-button');
        if (!deleteButton) return;

        const taskId = deleteButton.dataset.taskId;
        const taskText = deleteButton.dataset.taskText;

        if (confirm(`「${taskText}」を削除しますか？`)) {
            state.autoTasks = state.autoTasks.filter(t => t.id !== taskId);
            saveAutoTasksAPI(state.autoTasks);
            renderAutoTasks(state);
            fetchAndDisplayAutoHistory();
        }
    });

    // 全選択チェックボックス
    dom.selectAllCheckbox.addEventListener('change', (e) => {
        dom.autoTaskList.querySelectorAll('.auto-task-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        dom.autoTaskList.querySelectorAll('input[type="checkbox"][data-group-key]').forEach(groupCb => {
            if (groupCb.checked !== e.target.checked) {
                groupCb.checked = e.target.checked;
            }
        });
    });

    // スケジュール保存
    dom.saveScheduleButton.addEventListener('click', saveSchedule);

    // タスクリスト開閉
    dom.autoTaskListToggle.addEventListener('click', toggleTaskList);

    // 印刷ボタン
    dom.printButton.addEventListener('click', () => window.print());

    // コピー機能
    setupCopyFunctions(state);
}

// --- 「選択したタスクを実行」ボタンのロジック ---
dom.manualTriggerButton.addEventListener('click', async () => {
    const selectedCheckboxes = dom.autoTaskList.querySelectorAll('.auto-task-checkbox:checked');
    const selectedTaskIds = new Set(Array.from(selectedCheckboxes).map(cb => cb.value));

    if (selectedTaskIds.size === 0) {
        alert('実行するタスクを少なくとも1つ選択してください。');
        return;
    }

    if (!confirm(`選択した ${selectedTaskIds.size} 件のタスクを今すぐ実行しますか？`)) {
        return;
    }

    setMeasuringState(true, { isMeasuring: true }); // 計測状態を開始に設定
    dom.manualTriggerButton.textContent = '実行中...';

    dom.resultArea.innerHTML = ''; // 結果エリアをクリア
    const overallStatusContainer = document.createElement('div');
    overallStatusContainer.id = 'overallStatus';
    overallStatusContainer.style.cssText = 'padding: 10px; margin-bottom: 15px; font-weight: 500;';
    dom.resultArea.appendChild(overallStatusContainer);
    overallStatusContainer.textContent = `選択された ${selectedTaskIds.size} 件のタスクを実行します...`;

    const startTime = performance.now();
    const timerInterval = setInterval(() => {
        const elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
        const baseText = overallStatusContainer.textContent.replace(/\s*\([^)]*\)$/, '');
        if (baseText && !baseText.includes('完了')) {
            overallStatusContainer.textContent = `${baseText} (経過時間: ${durationString})`;
        }
    }, 1000);

    try {
        await processStream(Array.from(selectedTaskIds));
        const durationString = getDurationString(startTime);
        overallStatusContainer.textContent = `すべての計測が完了しました。（${selectedTaskIds.size}件 / 所要時間: ${durationString}）`;
    } catch (error) {
        console.error('手動実行中にエラーが発生しました:', error);
        const durationString = getDurationString(startTime);
        overallStatusContainer.textContent = `計測中にエラーが発生しました。（所要時間: ${durationString}）詳細はコンソールを確認してください。`;
    } finally {
        clearInterval(timerInterval);
        setMeasuringState(false, { isMeasuring: false });
        dom.manualTriggerButton.textContent = '選択したタスクを実行';
        fetchAndDisplayAutoHistory();
    }
});

function getDurationString(startTime) {
    const elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

async function processStream(taskIds) {
    if (taskIds.length === 0) return;

    const response = await fetch('/api/run-tasks-manually', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_ids: taskIds })
    });

    if (!response.body) throw new Error('Response body is missing');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonData = line.substring(6);
                if (!jsonData) continue;

                const data = JSON.parse(jsonData);
                handleStreamData(data);
            }
        }
    }
}

function handleStreamData(data) {
    if (data.error) {
        const errorContainer = document.createElement('div');
        errorContainer.innerHTML = `<p style="color: red;">エラー: ${data.error}</p>`;
        dom.resultArea.appendChild(errorContainer);
        throw new Error(data.error);
    }

    if (data.progress) {
        const { current, total, task } = data.progress;
        const taskName = task.featurePageName || task.featurePageUrl || `[${task.areaName}] ${task.serviceKeyword}` || `[${task.searchLocation}] ${task.keyword}`;
        document.getElementById('overallStatus').textContent = `${current} / ${total} 件目: 「${taskName}」を計測中... `;
        
        const taskContainer = document.createElement('div');
        taskContainer.id = `task-container-${task.id}`;
        taskContainer.style.cssText = 'border-bottom: 1px solid #e5e5e7; padding-bottom: 15px; margin-bottom: 15px;';
        taskContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${taskName}」</h4><p>計測を開始します...</p>`;
        dom.resultArea.appendChild(taskContainer);
    }

    if (data.status) {
        const lastContainer = dom.resultArea.querySelector('div:last-of-type');
        if (lastContainer) {
            lastContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${data.task_name}」</h4><p>${data.status}</p>`;
        }
    }

    if (data.result) {
        const { rank, total_count, task_name, task_id } = data.result;
        let taskContainer = document.getElementById(`task-container-${task_id}`);
        if (!taskContainer) {
            taskContainer = document.createElement('div');
            taskContainer.id = `task-container-${task_id}`;
            dom.resultArea.appendChild(taskContainer);
        }
        const totalCountHtml = total_count !== undefined ? `<p style="font-size: 14px; color: #6c6c70;">検索結果総数: <strong>${total_count}</strong> 件</p>` : '';
        const resultMessageHtml = `<p style="margin: 0; font-size: 18px; font-weight: bold;"><span style="color: #007aff; font-size: 1.3em;">${rank}</span> 位</p>`;
        taskContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${task_name}」</h4>${totalCountHtml}${resultMessageHtml}`;
    }
}

/**
 * 検索タイプに応じてUIの表示を更新します。
 * @param {string} activeType - 'normal', 'special', 'google'
 * @param {Array} autoTasks - 現在の自動計測タスクリスト
 */
export function updateUIForSearchType(activeType, autoTasks) {
    dom.normalSearchInputs.style.display = 'none';
    dom.specialSearchInputs.style.display = 'none';
    dom.googleMapSearchInputs.style.display = 'none';

    if (activeType === 'normal') {
        dom.normalSearchInputs.style.display = 'block';
    } else if (activeType === 'special') {
        dom.specialSearchInputs.style.display = 'block';
    } else if (activeType === 'google') {
        dom.googleMapSearchInputs.style.display = 'block';
    }

    // コピー機能セクション
    dom.meoCopySection.style.display = 'none';
    dom.hpbNormalTaskCopySection.style.display = 'none';
    dom.hpbSpecialTaskCopySection.style.display = 'none';

    if (activeType === 'google') {
        dom.meoCopySection.style.display = 'block';
        updateCopySourceLocations(autoTasks);
    } else if (activeType === 'normal') {
        dom.hpbNormalTaskCopySection.style.display = 'block';
        updateHpbNormalCopySources(autoTasks);
    } else if (activeType === 'special') {
        dom.hpbSpecialTaskCopySection.style.display = 'block';
        updateHpbSpecialCopySources(autoTasks);
    }
}

/**
 * 計測状態に応じてUIの有効/無効を切り替えます。
 * @param {boolean} measuring - 計測中かどうか
 */
export function setMeasuringState(measuring, state) {
    state.isMeasuring = measuring;
    dom.checkRankButton.disabled = measuring;
    dom.manualTriggerButton.disabled = measuring;
    dom.searchTypeToggle.querySelectorAll('button').forEach(btn => btn.disabled = measuring);
    dom.addAutoTaskButton.disabled = measuring;
    document.getElementById('executeCopyButton').disabled = measuring;
    document.getElementById('executeHpbNormalCopyButton').disabled = measuring;
    document.getElementById('executeHpbSpecialCopyButton').disabled = measuring;
}

/**
 * モード説明のヘルプテキストを表示します。
 */
function showModeHelp() {
    const activeMode = dom.searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
    let helpText = '';
    if (activeMode === 'normal') {
        helpText = `■ HPB通常検索モードについて\n\nこのモードは、ホットペッパービューティーの通常の検索結果ページでの掲載順位を計測します。\n\n【計測方法】\nユーザーがフリーワード（例：「まつげパーマ」）とエリア（例：「福山・尾道」）を指定して検索した際の結果をシミュレートします。\n\n【用途】\n特定のキーワードとエリアの組み合わせにおける、自店のオーガニックな検索順位を確認したい場合に使用します。`;
    } else if (activeMode === 'special') {
        helpText = `■ HPB特集検索モードについて\n\nこのモードは、「〇〇駅で人気のサロン特集」のような、ホットペッパービューティーが独自に編集した「特集ページ」での掲載順位を計測します。\n\n【計測方法】\n指定された特集ページのURLに直接アクセスし、そのページ内でのサロンの掲載順位を確認します。\n\n【用途】\nHPBの特集企画に掲載されている場合の順位を確認したい場合に使用します。代理店様などが「LP（ランディングページ）」と呼ぶページも、多くはこの特集ページに該当します。`;
    } else if (activeMode === 'google') {
        helpText = `■ MEO検索モードについて\n\nこのモードは、Googleマップでの検索結果（MEO）における掲載順位を計測します。\n\n【パーソナライズの排除】\nGoogleマップの検索結果は、検索場所や履歴によって変動しますが、このシステムでは以下の方法で客観的な順位を計測しています。\n\n1. クリーンな環境: 履歴のないブラウザで計測します。\n2. 検索場所の固定: あなたのPCの場所ではなく、指定された検索地点（例：「福山駅」）の座標を仮想的に設定して検索します。\n\nこれにより、誰がどこで計測しても、常に「指定した地点の周辺での検索結果」という同じ条件下での順位を確認できます。`;
    }
    alert(helpText);
}

/**
 * スケジュール設定を取得して表示します。
 */
async function fetchSchedule() {
    try {
        const data = await fetchScheduleAPI();
        dom.scheduleHourSelect.value = data.hour;
        dom.scheduleStatus.textContent = `現在の設定: 毎日 ${String(data.hour).padStart(2, '0')}:${String(data.minute).padStart(2, '0')} に実行されます。`;
    } catch (error) {
        console.error('スケジュールの取得に失敗しました:', error);
        dom.scheduleStatus.textContent = '現在の設定時間を取得できませんでした。';
    }
}

/**
 * スケジュール設定を保存します。
 */
async function saveSchedule() {
    const newHour = parseInt(dom.scheduleHourSelect.value, 10);
    if (isNaN(newHour)) {
        alert('有効な時間を選択してください。');
        return;
    }

    dom.saveScheduleButton.disabled = true;
    dom.saveScheduleButton.textContent = '保存中...';

    try {
        const result = await saveScheduleAPI({ hour: newHour, minute: 0 });
        alert(result.message);
        fetchSchedule();
    } catch (error) {
        alert(`エラー: ${error.message}`);
    } finally {
        dom.saveScheduleButton.disabled = false;
        dom.saveScheduleButton.textContent = '設定を保存';
    }
}

/**
 * タスクリストの表示/非表示を切り替えます。
 */
function toggleTaskList() {
    const isVisible = dom.autoTaskListContent.style.display === 'block';
    if (isVisible) {
        localStorage.setItem('taskListVisible', 'false');
        dom.autoTaskListContent.style.display = 'none';
        dom.taskListToggleIcon.style.transform = 'rotate(0deg)';
    } else {
        localStorage.setItem('taskListVisible', 'true');
        dom.autoTaskListContent.style.display = 'block';
        dom.taskListToggleIcon.style.transform = 'rotate(180deg)';
    }
}

/**
 * ページ読み込み時にタスクリストの表示状態を復元します。
 */
function initializeTaskListVisibility() {
    for (let i = 0; i < 24; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i}`.padStart(2, '0');
        dom.scheduleHourSelect.appendChild(option);
    }

    const taskListVisible = localStorage.getItem('taskListVisible');
    if (taskListVisible === 'false') {
        dom.autoTaskListContent.style.display = 'none';
        dom.taskListToggleIcon.style.transform = 'rotate(0deg)';
    } else {
        dom.autoTaskListContent.style.display = 'block';
        dom.taskListToggleIcon.style.transform = 'rotate(180deg)';
    }
}

/**
 * 自動計測タスクリストを描画します。
 * @param {object} state - アプリケーションの状態オブジェクト
 */
export function renderAutoTasks(state) {
    dom.autoTaskList.innerHTML = '';
    const activeButton = dom.searchTypeToggle.querySelector('.toggle-button.active');
    if (!activeButton) return;

    const activeSearchType = activeButton.dataset.type;
    const filteredTasks = state.autoTasks.filter(task => (task.type || 'normal') === activeSearchType);

    if (filteredTasks.length === 0) {
        dom.autoTaskList.innerHTML = `<li style="padding: 8px 0; color: #6c6c70;">この検索タイプの自動計測タスクはありません。</li>`;
        dom.selectAllContainer.style.display = 'none';
        return;
    }
    dom.selectAllContainer.style.display = 'flex';

    // グループ化ロジック
    let groupedTasks;
    if (activeSearchType === 'google') {
        groupedTasks = groupTasks(filteredTasks, 'searchLocation', '地点未設定');
    } else if (activeSearchType === 'normal') {
        groupedTasks = groupTasks(filteredTasks, 'areaName', 'エリア未設定');
    } else if (activeSearchType === 'special') {
        groupedTasks = groupTasks(filteredTasks, 'featurePageUrl', 'URL未設定', 'featurePageName');
    } else {
        // グループ化しない場合
        filteredTasks.forEach(task => renderTaskItem(task, dom.autoTaskList));
        return;
    }

    const sortedGroups = Object.entries(groupedTasks).sort((a, b) => a[1].displayName.localeCompare(b[1].displayName, 'ja'));

    sortedGroups.forEach(([groupKey, groupData]) => {
        const { displayName, tasks } = groupData;
        const groupHeader = createGroupHeader(groupKey, displayName);
        dom.autoTaskList.appendChild(groupHeader);

        const taskUl = document.createElement('ul');
        taskUl.style.listStyle = 'none';
        taskUl.style.paddingLeft = '0';
        dom.autoTaskList.appendChild(taskUl);

        tasks.sort((a, b) => (a.serviceKeyword || a.keyword || a.salonName || '').localeCompare(b.serviceKeyword || b.keyword || b.salonName || '', 'ja'));
        tasks.forEach(task => renderTaskItem(task, taskUl, groupKey));

        groupHeader.querySelector('input').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            taskUl.querySelectorAll(`.auto-task-checkbox[data-group-key="${groupKey}"]`).forEach(cb => { cb.checked = isChecked; });
        });
    });
}

function groupTasks(tasks, groupByKey, defaultKey, displayKey) {
    return tasks.reduce((acc, task) => {
        const key = task[groupByKey] || defaultKey;
        const dispName = (displayKey && task[displayKey]) || key;
        if (!acc[key]) {
            acc[key] = { displayName: dispName, tasks: [] };
        }
        acc[key].tasks.push(task);
        if (displayKey && task[displayKey]) {
            acc[key].displayName = task[displayKey];
        }
        return acc;
    }, {});
}

function createGroupHeader(groupKey, displayName) {
    const groupHeader = document.createElement('li');
    groupHeader.style.cssText = 'padding: 10px 8px; background-color: #f0f0f5; font-weight: 600; margin-top: 10px; border-radius: 6px; display: flex; align-items: center;';
    
    const groupCheckbox = document.createElement('input');
    groupCheckbox.type = 'checkbox';
    groupCheckbox.style.marginRight = '10px';
    groupCheckbox.dataset.groupKey = groupKey;
    groupHeader.appendChild(groupCheckbox);

    const groupLabel = document.createElement('label');
    groupLabel.textContent = displayName;
    groupLabel.style.cssText = 'cursor: pointer; flex-grow: 1;';
    groupLabel.onclick = () => groupCheckbox.click();
    groupHeader.appendChild(groupLabel);

    return groupHeader;
}

function renderTaskItem(task, parentElement, groupKey = null) {
    const taskType = task.type || 'normal';
    const li = document.createElement('li');
    li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; word-break: break-all;';
    if (groupKey) li.style.paddingLeft = '20px';

    const taskLabel = document.createElement('label');
    taskLabel.style.cssText = 'display: flex; align-items: center; flex-grow: 1; cursor: pointer; margin-right: 10px;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'auto-task-checkbox';
    checkbox.value = task.id;
    if (groupKey) checkbox.dataset.groupKey = groupKey;
    checkbox.style.marginRight = '10px';
    taskLabel.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') checkbox.click(); });

    const taskTextSpan = document.createElement('span');
    let taskText = '';
    if (taskType === 'normal') taskText = `${task.serviceKeyword} - ${task.salonName}`;
    else if (taskType === 'special') taskText = task.salonName;
    else if (taskType === 'google') taskText = `${task.keyword} - ${task.salonName}`;
    taskTextSpan.textContent = taskText;

    taskLabel.append(checkbox, taskTextSpan);
    li.appendChild(taskLabel);

    const deleteButton = document.createElement('button');
    deleteButton.textContent = '削除';
    deleteButton.className = 'button-secondary delete-task-button';
    deleteButton.dataset.taskId = task.id;
    deleteButton.dataset.taskText = taskText;
    deleteButton.style.cssText = 'padding: 4px 8px; font-size: 12px; flex-shrink: 0;';
    li.appendChild(deleteButton);

    parentElement.appendChild(li);
}

function addAutoTask(state) {
    const activeSearchType = dom.searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
    const salonName = dom.salonNameInput.value.trim();
    let addedTasks = [], existingTasks = [];

    if (!salonName) {
        alert('サロン名を入力してください。');
        return;
    }

    if (activeSearchType === 'normal') {
        const largeArea = dom.largeAreaSelect.value;
        const keywordsRaw = dom.keywordInput.value.trim();
        let keywords = [];
        if (keywordsRaw) {
            keywords = keywordsRaw.split(/[\s,、]+/).filter(k => k);
        }
        if (!largeArea) {
            alert('エリアブロックを入力してください。');
            return;
        }
        const middleArea = dom.middleAreaSelect.value;
        const smallArea = dom.smallAreaSelect.value;
        const areaName = smallArea || middleArea || largeArea;
        const areaCodes = {
            serviceAreaCd: areas[largeArea]?.code,
            middleAreaCd: areas[largeArea]?.middleAreas[middleArea]?.code,
            smallAreaCd: areas[largeArea]?.middleAreas[middleArea]?.smallAreas[smallArea]?.code
        };
        (keywords.length > 0 ? keywords : ['']).forEach(keyword => {
            const taskId = `${salonName}-${areaName}-${keyword}`;
            if (state.autoTasks.some(t => t.id === taskId)) existingTasks.push(keyword);
            else {
                state.autoTasks.push({ id: taskId, type: 'normal', salonName, areaName, areaCodes, serviceKeyword: keyword });
                addedTasks.push(keyword);
            }
        });
    } else if (activeSearchType === 'special') {
        const featureUrl = dom.featurePageUrlInput.value.trim();
        if (!featureUrl) { alert('特集ページのURLを入力してください。'); return; }
        const taskId = `${salonName}-${featureUrl}`;
        if (state.autoTasks.some(t => t.id === taskId)) existingTasks.push(featureUrl);
        else {
            state.autoTasks.push({ id: taskId, type: 'special', salonName, featurePageUrl: featureUrl });
            addedTasks.push(featureUrl);
        }
    } else if (activeSearchType === 'google') {
        const searchLocation = document.getElementById('searchLocationInput').value.trim();
        const googleKeyword = document.getElementById('googleKeywordInput').value.trim();
        if (!searchLocation || !googleKeyword) { alert('検索地点と検索キーワードを入力してください。'); return; }
        
        const locationBaseName = searchLocation.replace(/駅|市$/, '').trim();
        let cleanedKeyword = googleKeyword;
        if (locationBaseName && cleanedKeyword.startsWith(locationBaseName)) {
            cleanedKeyword = googleKeyword.substring(locationBaseName.length).trim();
        }
        const taskId = `[google]-${salonName}-${searchLocation}-${cleanedKeyword}`;
        if (state.autoTasks.some(t => t.id === taskId)) existingTasks.push(`[${searchLocation}] ${cleanedKeyword}`);
        else {
            state.autoTasks.push({ id: taskId, type: 'google', salonName, searchLocation, keyword: cleanedKeyword });
            addedTasks.push(`[${searchLocation}] ${cleanedKeyword}`);
        }
    }

    if (addedTasks.length > 0) {
        saveAutoTasksAPI(state.autoTasks);
        renderAutoTasks(state);
        alert(`以下のタスクを自動計測に追加しました:\n- ${addedTasks.join('\n- ')}`);
    }
    if (existingTasks.length > 0) {
        alert(`以下のタスクは既に追加されています:\n- ${existingTasks.join('\n- ')}`);
    }
}

// --- コピー機能関連 ---
function setupCopyFunctions(state) {
    // MEO
    const meoCopyButton = document.getElementById('executeCopyButton');
    meoCopyButton.addEventListener('click', () => {
        const sourceLocation = document.getElementById('copySourceLocation').value;
        const destLocation = document.getElementById('copyDestLocation').value.trim();
        const destSalonName = document.getElementById('copyDestSalonName').value.trim();
        if (!sourceLocation || !destLocation) { alert('コピー元とコピー先の両方を指定してください。'); return; }
        if (sourceLocation === destLocation && !destSalonName) { alert('コピー元とコピー先が同じです。'); return; }

        const tasksToCopy = state.autoTasks.filter(task => task.type === 'google' && task.searchLocation === sourceLocation);
        if (!confirm(`「${sourceLocation}」の${tasksToCopy.length}個のキーワードを「${destLocation}」にコピーしますか？`)) return;

        tasksToCopy.forEach(task => {
            const salonName = destSalonName || task.salonName;
            const sourceLocationBase = sourceLocation.replace(/駅|市$/, '').trim();
            const destLocationBase = destLocation.replace(/駅|市$/, '').trim();
            let newKeyword = task.keyword;
            if (sourceLocationBase && task.keyword.startsWith(sourceLocationBase)) {
                newKeyword = destLocationBase + task.keyword.substring(sourceLocationBase.length);
            }
            const newTaskId = `[google]-${salonName}-${destLocation}-${newKeyword}`;
            if (!state.autoTasks.some(t => t.id === newTaskId)) {
                state.autoTasks.push({ id: newTaskId, type: 'google', salonName, searchLocation: destLocation, keyword: newKeyword });
            }
        });
        saveAutoTasksAPI(state.autoTasks).then(() => {
            renderAutoTasks(state);
            alert('タスクのコピーが完了しました。');
        });
    });

    // HPB Normal
    const hpbNormalCopyButton = document.getElementById('executeHpbNormalCopyButton');
    hpbNormalCopyButton.addEventListener('click', () => {
        const sourceAreaName = document.getElementById('copySourceArea').value;
        const destAreaSelect = document.getElementById('copyDestArea');
        if (!destAreaSelect.value) { alert('コピー先のエリアを選択してください。'); return; }
        const { areaName: destAreaName, areaCodes: destAreaCodes } = JSON.parse(destAreaSelect.value);
        const destSalonName = document.getElementById('copyDestSalonNameHpbNormal').value.trim();
        if (!sourceAreaName || !destAreaName) { alert('コピー元とコピー先の両方のエリアを指定してください。'); return; }
        if (sourceAreaName === destAreaName && !destSalonName) { alert('コピー元とコピー先が同じエリアです。'); return; }

        const tasksToCopy = state.autoTasks.filter(task => (task.type || 'normal') === 'normal' && task.areaName === sourceAreaName);
        if (!confirm(`「${sourceAreaName}」の${tasksToCopy.length}個のキーワードを「${destAreaName}」にコピーしますか？`)) return;

        tasksToCopy.forEach(task => {
            const salonName = destSalonName || task.salonName;
            const newTaskId = `${salonName}-${destAreaName}-${task.serviceKeyword}`;
            if (!state.autoTasks.some(t => t.id === newTaskId)) {
                state.autoTasks.push({ id: newTaskId, type: 'normal', salonName, areaName: destAreaName, areaCodes: destAreaCodes, serviceKeyword: task.serviceKeyword });
            }
        });
        saveAutoTasksAPI(state.autoTasks).then(() => {
            renderAutoTasks(state);
            alert('タスクのコピーが完了しました。');
        });
    });

    // HPB Special
    const hpbSpecialCopyButton = document.getElementById('executeHpbSpecialCopyButton');
    hpbSpecialCopyButton.addEventListener('click', () => {
        const sourceUrl = document.getElementById('copySourceSpecialPage').value;
        const destUrl = document.getElementById('copyDestSpecialPageUrl').value.trim();
        const destSalonName = document.getElementById('copyDestSalonNameHpbSpecial').value.trim();
        if (!sourceUrl || !destUrl) { alert('コピー元とコピー先の両方を指定してください。'); return; }
        if (sourceUrl === destUrl && !destSalonName) { alert('コピー元とコピー先が同じURLです。'); return; }

        const tasksToCopy = state.autoTasks.filter(task => task.type === 'special' && task.featurePageUrl === sourceUrl);
        if (!confirm(`「${sourceUrl}」の${tasksToCopy.length}個のサロンを新しいURLにコピーしますか？`)) return;

        tasksToCopy.forEach(task => {
            const salonName = destSalonName || task.salonName;
            const newTaskId = `${salonName}-${destUrl}`;
            if (!state.autoTasks.some(t => t.id === newTaskId)) {
                state.autoTasks.push({ id: newTaskId, type: 'special', salonName, featurePageUrl: destUrl });
            }
        });
        saveAutoTasksAPI(state.autoTasks).then(() => {
            renderAutoTasks(state);
            alert('タスクのコピーが完了しました。');
        });
    });
}

function updateCopySourceLocations(autoTasks) {
    const select = document.getElementById('copySourceLocation');
    const button = document.getElementById('executeCopyButton');
    const meoTasks = autoTasks.filter(task => task.type === 'google');
    const locations = [...new Set(meoTasks.map(task => task.searchLocation))];
    updateSourceSelect(select, button, locations, 'コピー元の地点がありません');
}

function updateHpbNormalCopySources(autoTasks) {
    const select = document.getElementById('copySourceArea');
    const button = document.getElementById('executeHpbNormalCopyButton');
    const normalTasks = (autoTasks || []).filter(task => (task.type || 'normal') === 'normal');
    const sourceAreas = [...new Set(normalTasks.map(task => task.areaName))];
    updateSourceSelect(select, button, sourceAreas, 'コピー元のエリアがありません');

    const destSelect = document.getElementById('copyDestArea');
    destSelect.innerHTML = '<option value="" disabled selected>コピー先のエリアを選択</option>';
    Object.entries(areas).sort((a, b) => a[0].localeCompare(b[0], 'ja')).forEach(([largeAreaName, largeArea]) => {
        destSelect.appendChild(new Option(`${largeAreaName} (全域)`, JSON.stringify({ areaName: largeAreaName, areaCodes: { serviceAreaCd: largeArea.code } })));
        Object.entries(largeArea.middleAreas).sort((a, b) => a[0].localeCompare(b[0], 'ja')).forEach(([middleAreaName, middleArea]) => {
            destSelect.appendChild(new Option(`${largeAreaName} > ${middleAreaName}`, JSON.stringify({ areaName: middleAreaName, areaCodes: { serviceAreaCd: largeArea.code, middleAreaCd: middleArea.code } })));
            if (middleArea.smallAreas && Object.keys(middleArea.smallAreas).length > 0) {
                Object.entries(middleArea.smallAreas).sort((a, b) => a[0].localeCompare(b[0], 'ja')).forEach(([smallAreaName, smallArea]) => {
                    destSelect.appendChild(new Option(`${largeAreaName} > ${middleAreaName} > ${smallAreaName}`, JSON.stringify({ areaName: smallAreaName, areaCodes: { serviceAreaCd: largeArea.code, middleAreaCd: middleArea.code, smallAreaCd: smallArea.code } })));
                });
            }
        });
    });
}

function updateHpbSpecialCopySources(autoTasks) {
    const select = document.getElementById('copySourceSpecialPage');
    const button = document.getElementById('executeHpbSpecialCopyButton');
    const specialTasks = autoTasks.filter(task => task.type === 'special');
    const sourcePages = [...new Map(specialTasks.map(task => [task.featurePageUrl, task.featurePageName || task.featurePageUrl])).entries()];
    
    select.innerHTML = '';
    if (sourcePages.length === 0) {
        select.appendChild(new Option('コピー元の特集ページがありません', '', true, true));
        button.disabled = true;
    } else {
        sourcePages.forEach(([url, name]) => select.appendChild(new Option(name, url)));
        button.disabled = false;
    }
}

function updateSourceSelect(select, button, items, emptyText) {
    select.innerHTML = '';
    if (items.length === 0) {
        select.appendChild(new Option(emptyText, '', true, true));
        button.disabled = true;
    } else {
        items.sort((a, b) => a.localeCompare(b, 'ja'));
        items.forEach(item => select.appendChild(new Option(item, item)));
        button.disabled = false;
    }
}