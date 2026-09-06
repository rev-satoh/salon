/**
 * UIの初期化、イベントリスナーの設定、DOM操作を管理します。
 */
import { areas } from './config.js';
import * as dom from './dom.js';
import { saveAutoTasksAPI, saveScheduleAPI, fetchScheduleAPI, fetchHistoryAPI } from './api.js';
import { buildUberModel, uberSeries, uberLatest, uberSummary, uberStatusLabel, uberRawStatusLabel, formatUberDate, UBER_BASE_LABEL } from './uberData.js';
import { checkRank } from './manualChecker.js'; // この行を追加
import { fetchAndDisplayAutoHistory } from './history.js';

let activeTaskStreamAbortController = null;

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

    // 手動計測中断ボタン
    dom.stopMeasurementButton.addEventListener('click', () => {
        state.cancelMeasurement = true;
        dom.stopMeasurementButton.textContent = '中断中...';
        dom.stopMeasurementButton.disabled = true;
        window.dispatchEvent(new CustomEvent('manual-measurement-stop'));
        fetch('/api/cancel-measurement', { method: 'POST' }).catch(() => {});
        if (activeTaskStreamAbortController) {
            activeTaskStreamAbortController.abort();
        }
    });

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

    // 自動計測ON/OFFスイッチ
    dom.isAutoScheduleEnabled.addEventListener('change', (e) => {
        updateScheduleControlsState(e.target.checked);
        markScheduleAsModified();
    });

    // スケジュール時間変更
    dom.scheduleHourSelect.addEventListener('change', () => {
        markScheduleAsModified();
    });

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

    const saveScreenshot = document.getElementById('autoTaskScreenshotCheckbox')?.checked ?? true;

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
        await processStream(Array.from(selectedTaskIds), saveScreenshot);
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

// --- ストリーム自動再接続の設定 ---
// 離席・ディスプレイスリープ・省電力でブラウザの接続が切れても計測を落とさないための共通設定。
// 無限リトライはしない（上限を超えたら通常のエラーとして扱う）。
const STREAM_RECONNECT_MAX_ATTEMPTS = 8;
const STREAM_RECONNECT_BASE_DELAY_MS = 2000;
const STREAM_RECONNECT_MAX_DELAY_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 接続断・再接続中のメッセージを結果エリアの先頭に1行だけ表示する */
function showReconnectNotice(message) {
    let notice = document.getElementById('streamReconnectNotice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'streamReconnectNotice';
        notice.style.cssText = 'padding: 8px 10px; margin-bottom: 10px; border-radius: 6px; background: #fff4e5; color: #8a5300; font-size: 14px;';
        dom.resultArea.insertBefore(notice, dom.resultArea.firstChild);
    }
    notice.textContent = message;
}

function clearReconnectNotice() {
    document.getElementById('streamReconnectNotice')?.remove();
}

/**
 * サーバに「本日ぶんの計測が既に記録されているタスク」を問い合わせ、未計測のタスクIDだけを返す。
 * 通信できなければ null（＝判定不能。再接続を待つ）を返す。
 */
async function fetchRemainingTaskIds(taskIds) {
    try {
        const response = await fetch('/api/measured-today', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_ids: taskIds }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return Array.isArray(data.remaining) ? data.remaining : null;
    } catch (error) {
        return null;
    }
}

/**
 * ストリームを1回だけ接続して読み切る。
 * 戻り値: { outcome: 'completed' | 'cancelled' | 'disconnected' | 'busy', receivedEvents: number }
 * サーバから業務エラー（busy以外）が来た場合のみ例外を投げる。
 */
async function runTaskStreamOnce(taskIds, saveScreenshot) {
    activeTaskStreamAbortController = new AbortController();
    let receivedEvents = 0;
    let sawFinalStatus = false;

    try {
        const response = await fetch('/api/run-tasks-manually', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_ids: taskIds, save_screenshot: saveScreenshot }),
            signal: activeTaskStreamAbortController.signal,
        });

        if (!response.body) throw new Error('Response body is missing');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            let chunkResult;
            try {
                chunkResult = await reader.read();
            } catch (error) {
                if (error?.name === 'AbortError') return { outcome: 'cancelled', receivedEvents };
                // ネットワーク断（TypeError: network error / ERR_NETWORK_IO_SUSPENDED など）
                return { outcome: 'disconnected', receivedEvents };
            }

            const { done, value } = chunkResult;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            // イベント境界（\n\n）で切り出し、途中で切れた分は次のチャンクへ持ち越す
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const event of events) {
                const line = event.trim();
                if (!line.startsWith('data: ')) continue;
                const jsonData = line.substring(6);
                if (!jsonData) continue;

                let data;
                try {
                    data = JSON.parse(jsonData);
                } catch (error) {
                    continue;
                }

                receivedEvents++;
                if (data.cancelled) return { outcome: 'cancelled', receivedEvents };
                if (data.busy) return { outcome: 'busy', receivedEvents };
                if (data.final_status) {
                    sawFinalStatus = true;
                    continue;
                }
                handleStreamData(data);
            }
        }

        // final_status を受け取らずにストリームが閉じた＝途中で切れている
        return { outcome: sawFinalStatus ? 'completed' : 'disconnected', receivedEvents };
    } catch (error) {
        if (error?.name === 'AbortError') return { outcome: 'cancelled', receivedEvents };
        if (error instanceof TypeError) return { outcome: 'disconnected', receivedEvents };
        throw error;
    } finally {
        activeTaskStreamAbortController = null;
    }
}

/**
 * 計測ストリームを実行する。回線断で切れた場合は指数バックオフで自動再接続し、
 * サーバの履歴に未記録のタスク（＝未計測ぶん）だけを再開する（二重計測しない）。
 * ユーザーの明示中断（中断ボタン＝AbortController）は再接続しない。
 */
async function processStream(taskIds, saveScreenshot = true) {
    if (taskIds.length === 0) return;

    let remaining = taskIds.slice();
    let attempt = 0;

    while (true) {
        const { outcome, receivedEvents } = await runTaskStreamOnce(remaining, saveScreenshot);

        if (outcome === 'completed' || outcome === 'cancelled') {
            clearReconnectNotice();
            return;
        }

        // 進捗が取れていた回は再試行回数をリセットする（長時間計測で上限に当たらないように）
        if (receivedEvents > 0 && outcome === 'disconnected') attempt = 0;

        attempt++;
        if (attempt > STREAM_RECONNECT_MAX_ATTEMPTS) {
            clearReconnectNotice();
            throw new Error(`接続が復旧しないため中止しました（再接続 ${STREAM_RECONNECT_MAX_ATTEMPTS} 回失敗）。未計測ぶんは再実行してください。`);
        }

        const delay = Math.min(STREAM_RECONNECT_BASE_DELAY_MS * (2 ** (attempt - 1)), STREAM_RECONNECT_MAX_DELAY_MS);
        const reason = outcome === 'busy' ? '前回の計測がサーバ側で終了処理中' : '接続が切れたため';
        showReconnectNotice(`${reason}再接続中…（${attempt}/${STREAM_RECONNECT_MAX_ATTEMPTS}回目・${Math.round(delay / 1000)}秒後）`);
        await sleep(delay);

        const nextRemaining = await fetchRemainingTaskIds(remaining);
        if (nextRemaining === null) continue; // サーバに届かない＝まだ復旧していない。バックオフを続ける
        remaining = nextRemaining;
        if (remaining.length === 0) {
            clearReconnectNotice();
            return;
        }
        showReconnectNotice(`接続を復旧しました。未計測の ${remaining.length} 件から再開します。`);
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
        const taskName = getTaskDisplayName(task);
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

function getTaskDisplayName(task) {
    if (task.featurePageName) return task.featurePageName;
    if (task.featurePageUrl) return task.featurePageUrl;
    if (task.type === 'google') return `[${task.searchLocation}] ${task.keyword}`;
    if (task.type === 'ubereats') return `[${task.addressLabel || task.address}] ${task.keyword}`;
    return `[${task.areaName}] ${task.serviceKeyword}`;
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
    dom.uberEatsSearchInputs.style.display = 'none';
    dom.salonNameFormGroup.style.display = 'block';

    if (activeType === 'normal') {
        dom.normalSearchInputs.style.display = 'block';
    } else if (activeType === 'special') {
        dom.specialSearchInputs.style.display = 'block';
    } else if (activeType === 'google') {
        dom.googleMapSearchInputs.style.display = 'block';
    } else if (activeType === 'ubereats') {
        dom.uberEatsSearchInputs.style.display = 'block';
        dom.salonNameFormGroup.style.display = 'none';
        renderUberEatsPanel();
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

let uberHistoryCache = null;

/**
 * Uber Eatsモードの結果欄を実データ（/api/auto-history）で描画します。
 * @param {string|null} selectedKeyword - 表示するキーワード（未指定なら先頭）
 */
async function renderUberEatsPanel(selectedKeyword = null) {
    dom.resultArea.innerHTML = `<p style="color:#6c6c70;">Uber Eatsの計測履歴を読み込んでいます...</p>`;
    let model = null;
    try {
        if (!uberHistoryCache) uberHistoryCache = await fetchHistoryAPI();
        model = buildUberModel(uberHistoryCache);
    } catch (error) {
        console.error('Uber Eats履歴の取得に失敗しました:', error);
        dom.resultArea.innerHTML = `<p style="color:#ff3b30;">Uber Eatsの計測履歴を取得できませんでした。</p>`;
        return;
    }
    if (!model) {
        dom.resultArea.innerHTML = `<p style="color:#6c6c70;">Uber Eatsの計測履歴がまだありません。手動計測または自動計測を実行してください。</p>`;
        return;
    }
    drawUberEatsPanel(model, selectedKeyword);
}

function drawUberEatsPanel(model, selectedKeyword) {
    const keyword = model.keywords.includes(selectedKeyword) ? selectedKeyword : model.keywords[0];
    const summary = uberSummary(model, keyword);
    const latestNormalized = Object.fromEntries(
        model.points.map(point => [point.label, uberLatest(model, keyword, point.label)])
    );
    // 生順位のみ（色分け・タイル見出し用）。実質順位は uberFoodLabel で併記する。
    const latestLabels = Object.fromEntries(
        model.points.map(point => [point.label, uberRawStatusLabel(latestNormalized[point.label])])
    );
    const columns = Math.min(Math.max(Math.ceil(model.points.length / 2), 3), 6);

    dom.resultArea.innerHTML = `
        <div style="border: 1px solid #e5e5e7; border-radius: 10px; overflow: hidden; background: #fff;">
            <div style="padding: 16px 18px; border-bottom: 1px solid #e5e5e7; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;">
                <div>
                    <p style="margin: 0 0 4px; color: #6c6c70; font-size: 13px;">Uber Eats モード / 計測履歴</p>
                    <h4 style="margin: 0; font-size: 20px;">住所セット - ${model.storeName}</h4>
                    <p style="margin: 6px 0 0; color: #6c6c70; font-size: 13px;">登録済みの配達先住所ごとに、Uber Eats検索での自店順位を比較します。</p>
                </div>
                <div style="text-align: right; font-size: 13px; color: #6c6c70;">
                    <div>最終計測 ${model.latestDate || '-'}</div>
                    <strong style="display: block; margin-top: 4px; color: #111;">${model.labels.length}住所 × ${model.keywords.length}キーワード</strong>
                </div>
            </div>
            <div style="padding: 16px 18px;">
                <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 14px; margin-bottom: 16px;">
                    <div style="border: 1px solid #ececf0; border-radius: 8px; padding: 14px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <strong style="font-size: 14px;">観測住所セット</strong>
                            <span style="font-size: 12px; color: #6c6c70;">${keyword}の最新順位</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: 8px;">
                            ${model.points.map(point => uberPointTile(point.label, latestLabels[point.label], uberRankColor(latestLabels[point.label]), uberFoodLabel(latestNormalized[point.label]))).join('')}
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
                        ${uberMetric('最良地点', summary.best ? summary.best.label : '-', summary.best ? `${keyword} ${summary.best.value}位` : '順位取得なし', '#007aff')}
                        ${uberMetric('圏外の観測点', `${summary.outCount}件`, `計測できた${summary.measuredCount}件中`, '#ff3b30')}
                        ${uberMetric('観測住所', `${model.labels.length}件`, `キーワード${model.keywords.length}語`, '#111')}
                        ${uberMetric('観測タスク', `${model.taskCount}件`, `計測日 ${model.dates.length}日分`, '#111')}
                    </div>
                </div>
                <div style="border: 1px solid #ececf0; border-radius: 8px; padding: 16px; background: linear-gradient(#fff, #fbfbfd); margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
                        <div>
                            <strong style="font-size: 15px;">順位推移（${keyword}）</strong>
                            <div style="font-size: 12px; color: #6c6c70; margin-top: 3px;">薄線=観測点別 / 太線=${UBER_BASE_LABEL}。上に行くほど上位。</div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                            <div style="display: inline-flex; border: 1px solid #d7d7dc; border-radius: 8px; overflow: hidden; background: #fff; flex-wrap: wrap;">
                                ${model.keywords.map(item => uberKeywordButton(item, item === keyword)).join('')}
                            </div>
                            <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 390px;">
                                ${model.points.map(point => uberLegend(point.label, point.color, point.opacity)).join('')}
                            </div>
                        </div>
                    </div>
                    ${renderUberTrendChart(model, keyword)}
                </div>
                <div style="border: 1px solid #ececf0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <strong style="font-size: 14px;">最新順位ヒートマップ</strong>
                        <span style="font-size: 12px; color: #6c6c70;">行=住所 / 列=キーワード</span>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">観測点</th>
                                ${model.keywords.map(item => `<th style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${item}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${model.labels.map(label => uberHeatRow(label, model.keywords.map(item => uberLatest(model, item, label)))).join('')}
                        </tbody>
                    </table>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">観測点</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">配達先住所</th>
                            <th style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${keyword}</th>
                            <th style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">全キーワード順位</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${model.points.map(point => uberPointRow(
                            point.label,
                            point.address,
                            uberStatusLabel(latestNormalized[point.label]),
                            model.keywords.map(item => uberStatusLabel(uberLatest(model, item, point.label))).join(' / ')
                        )).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    dom.resultArea.querySelectorAll('.uber-keyword-button').forEach(button => {
        button.addEventListener('click', () => drawUberEatsPanel(model, button.dataset.keyword));
    });
}

function uberKeywordButton(keyword, active) {
    return `
        <button type="button" class="uber-keyword-button" data-keyword="${keyword}" style="border: 0; border-right: 1px solid #d7d7dc; padding: 7px 10px; background: ${active ? '#111' : '#fff'}; color: ${active ? '#fff' : '#333'}; font-size: 12px; cursor: pointer; white-space: nowrap;">
            ${keyword}
        </button>
    `;
}

function renderUberTrendChart(model, keyword) {
    const dates = model.dates;
    const left = 60;
    const right = 720;
    const dateX = dates.length === 1
        ? [(left + right) / 2]
        : dates.map((_, index) => left + ((right - left) * index) / (dates.length - 1));
    return `
        <svg viewBox="0 0 760 220" style="width: 100%; height: 250px; display: block;">
            <line x1="48" y1="28" x2="735" y2="28" stroke="#ececf0"/>
            <line x1="48" y1="68" x2="735" y2="68" stroke="#ececf0"/>
            <line x1="48" y1="108" x2="735" y2="108" stroke="#ececf0"/>
            <line x1="48" y1="148" x2="735" y2="148" stroke="#ececf0"/>
            <line x1="48" y1="188" x2="735" y2="188" stroke="#ececf0"/>
            <text x="8" y="32" font-size="11" fill="#6c6c70">1位</text>
            <text x="8" y="72" font-size="11" fill="#6c6c70">5位</text>
            <text x="8" y="112" font-size="11" fill="#6c6c70">10位</text>
            <text x="8" y="152" font-size="11" fill="#6c6c70">20位</text>
            <text x="8" y="192" font-size="11" fill="#6c6c70">圏外</text>
            ${model.points.map(point => uberPolyline(dateX, uberSeries(model, keyword, point.label), point)).join('')}
            ${dates.map((date, index) => `<text x="${Math.max(dateX[index] - 14, 2)}" y="214" font-size="11" fill="#6c6c70">${formatUberDate(date)}</text>`).join('')}
        </svg>
    `;
}

/**
 * 観測点1つ分の折れ線を描画します。
 * 欠測（未計測）は線を切り、圏外は最下段に置きます。
 */
function uberPolyline(dateX, series, point) {
    const segments = [];
    let current = [];
    series.forEach((normalized, index) => {
        if (!normalized) {
            if (current.length) segments.push(current);
            current = [];
            return;
        }
        current.push(`${dateX[index]},${uberRankY(normalized)}`);
    });
    if (current.length) segments.push(current);

    const lastIndex = series.map(item => !!item).lastIndexOf(true);
    const circleRadius = point.width > 2 ? 4 : 3;
    const marker = lastIndex < 0 ? '' : `
        <circle cx="${dateX[lastIndex]}" cy="${uberRankY(series[lastIndex])}" r="${circleRadius}" fill="${point.color}" opacity="${Math.min(point.opacity + 0.28, 1)}"/>
    `;
    const lines = segments.map(segment => segment.length === 1
        ? `<circle cx="${segment[0].split(',')[0]}" cy="${segment[0].split(',')[1]}" r="${circleRadius}" fill="${point.color}" opacity="${point.opacity}"/>`
        : `<polyline points="${segment.join(' ')}" fill="none" stroke="${point.color}" stroke-width="${point.width}" opacity="${point.opacity}"/>`
    ).join('');
    return `${lines}${marker}`;
}

function uberRankY(normalized) {
    if (!normalized || normalized.status !== 'rank' || normalized.value > 20) return 188;
    return 28 + ((normalized.value - 1) / 19) * 120;
}

function uberPointTile(label, rank, color, foodLabel) {
    return `
        <div style="min-height: 48px; padding: 4px 2px; border: 1px solid #e5e5e7; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff;">
            <span style="font-size: 12px; color: #333; line-height: 1.1;">${label}</span>
            <strong style="font-size: 13px; color: ${color}; line-height: 1.2;">${rank}</strong>
            ${foodLabel ? `<span style="font-size: 11px; color: #6c6c70; line-height: 1.1;">飲食のみ ${foodLabel}</span>` : ''}
        </div>
    `;
}

/** 実質順位（小売店を除いた飲食店内の順位）のラベル。未計測なら空文字。 */
function uberFoodLabel(normalized) {
    const food = normalized?.food;
    if (!food || food.status === 'none') return '';
    return food.status === 'out' ? '圏外' : `${food.value}位`;
}

function uberMetric(label, rank, sub, color) {
    return `
        <div style="border: 1px solid #e5e5e7; border-radius: 8px; padding: 12px; min-height: 78px;">
            <div style="font-size: 13px; color: #6c6c70; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${label}</div>
            <div style="font-size: 24px; font-weight: 700; color: ${color}; margin-top: 4px;">${rank}</div>
            <div style="font-size: 12px; color: #6c6c70; margin-top: 2px;">${sub}</div>
        </div>
    `;
}

function uberLegend(label, color, opacity) {
    return `
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #333;">
            <i style="display: inline-block; width: 18px; height: 3px; border-radius: 999px; background: ${color}; opacity: ${opacity};"></i>${label}
        </span>
    `;
}

function uberHeatRow(label, normalizedList) {
    return `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${label}</td>
            ${normalizedList.map(normalized => `<td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${uberRankBadge(uberRawStatusLabel(normalized))}${uberFoodLabel(normalized) ? `<div style="font-size: 11px; color: #6c6c70; margin-top: 2px;">飲食のみ ${uberFoodLabel(normalized)}</div>` : ''}</td>`).join('')}
        </tr>
    `;
}

function uberRankBadge(rank) {
    const color = uberRankColor(rank);
    return `<span style="display:inline-block; min-width: 46px; padding: 3px 6px; border-radius: 999px; color: ${color}; background: #f5f5f7; font-weight: 700;">${rank}</span>`;
}

function uberRankColor(rank) {
    if (rank === '圏外' || rank === '未計測') return '#8e8e93';
    const rankNumber = Number.parseInt(rank, 10);
    if (rankNumber <= 8) return '#007aff';
    if (rankNumber <= 15) return '#ff9500';
    return '#ff3b30';
}

function uberPointRow(point, address, selectedRank, allRanks) {
    return `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600;">${point}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #6c6c70;">${address || '-'}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; font-weight: 700;">${selectedRank}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center; color: #6c6c70;">${allRanks}</td>
        </tr>
    `;
}

/**
 * 計測状態に応じてUIの有効/無効を切り替えます。
 * @param {boolean} measuring - 計測中かどうか
 */
export function setMeasuringState(measuring, state) {
    state.isMeasuring = measuring;
    dom.checkRankButton.disabled = measuring;
    dom.manualTriggerButton.disabled = measuring;
    dom.stopMeasurementButton.style.display = measuring ? 'inline-block' : 'none';
    dom.stopMeasurementButton.disabled = !measuring;
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
    } else if (activeMode === 'ubereats') {
        helpText = `■ Uber Eats検索モードについて\n\nこのモードは、指定した配達先住所と検索キーワードでUber Eats上の表示順位を追跡するためのモードです。\n\n【想定する計測条件】\n1. 配達先住所を固定します。\n2. 検索キーワードを固定します。\n3. 店舗名の一部一致で自店順位を判定します。\n\n飲食店では時間帯・配達先・営業状態で順位が変わるため、同条件での露出傾向を見る用途に向いています。`;
    }
    alert(helpText);
}

/**
 * 自動計測スケジュールの設定UIの有効/無効を切り替えます。
 * @param {boolean} enabled - 有効にするかどうか
 */
function updateScheduleControlsState(enabled) {
    dom.scheduleHourSelect.disabled = !enabled;
    dom.saveScheduleButton.disabled = !enabled;
    const labels = dom.saveScheduleButton.parentElement.querySelectorAll('label[for="scheduleHourSelect"]');
    labels.forEach(label => {
        label.style.opacity = enabled ? '1' : '0.5';
    });
}

/**
 * スケジュール設定を取得して表示します。
 */
async function fetchSchedule() {
    try {
        const data = await fetchScheduleAPI();
        dom.isAutoScheduleEnabled.checked = data.enabled;
        dom.scheduleHourSelect.value = data.hour;
        updateScheduleControlsState(data.enabled);
        const statusText = data.enabled
            ? `現在の設定: 毎日 ${String(data.hour).padStart(2, '0')}:${String(data.minute).padStart(2, '0')} に実行されます。`
            : '現在の設定: 自動計測はOFFです。';
        resetScheduleButton();
        dom.scheduleStatus.textContent = statusText;
    } catch (error) {
        console.error('スケジュールの取得に失敗しました:', error);
        dom.isAutoScheduleEnabled.checked = false;
        updateScheduleControlsState(false);
        dom.scheduleStatus.textContent = '現在の設定時間を取得できませんでした。';
    }
}

/**
 * スケジュール設定が変更されたことを示すためにボタンのスタイルを変更します。
 */
function markScheduleAsModified() {
    dom.saveScheduleButton.textContent = '設定を保存';
    dom.saveScheduleButton.classList.remove('button-secondary');
    dom.saveScheduleButton.classList.add('button-primary');
}

/**
 * スケジュール設定ボタンをデフォルトの状態に戻します。
 */
function resetScheduleButton() {
    dom.saveScheduleButton.textContent = '設定';
    dom.saveScheduleButton.classList.remove('button-primary');
    dom.saveScheduleButton.classList.add('button-secondary');
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

    dom.saveScheduleButton.textContent = '設定中...';
    dom.saveScheduleButton.disabled = true; 

    try {
        const enabled = dom.isAutoScheduleEnabled.checked;
        const result = await saveScheduleAPI({ hour: newHour, minute: 0, enabled });
        alert(result.message);
        await fetchSchedule();
    } catch (error) {
        alert(`エラー: ${error.message}`);
        // エラーが発生した場合は、ボタンを「保存」状態に戻す
        markScheduleAsModified();
        updateScheduleControlsState(dom.isAutoScheduleEnabled.checked);
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
    } else if (activeSearchType === 'ubereats') {
        groupedTasks = groupTasks(filteredTasks, 'addressLabel', '住所未設定');
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
    else if (taskType === 'ubereats') taskText = `${task.keyword} - ${task.storeName}`;
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

    if (activeSearchType !== 'ubereats' && !salonName) {
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
    } else if (activeSearchType === 'ubereats') {
        const storeName = dom.uberStoreNameInput.value.trim();
        const addresses = parseUberAddressSet(dom.uberAddressInput.value);
        const keywordsRaw = dom.uberKeywordInput.value.trim();
        const keywords = keywordsRaw ? keywordsRaw.split(/[\s,、]+/).filter(k => k) : [];
        if (!storeName || addresses.length === 0 || keywords.length === 0) {
            alert('Uber Eats検索では、店舗名・住所セット・検索キーワードを入力してください。');
            return;
        }
        addresses.forEach(({ label, address }) => {
            keywords.forEach(keyword => {
                const taskId = `[ubereats]-${storeName}-${label}-${address}-${keyword}`;
                if (state.autoTasks.some(t => t.id === taskId)) existingTasks.push(`[${label}] ${keyword}`);
                else {
                    state.autoTasks.push({ id: taskId, type: 'ubereats', storeName, addressLabel: label, address, keyword });
                    addedTasks.push(`[${label}] ${keyword}`);
                }
            });
        });
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

function parseUberAddressSet(rawText) {
    return rawText
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const [labelPart, ...addressParts] = line.split(/[:：]/);
            const hasExplicitLabel = addressParts.length > 0;
            const label = hasExplicitLabel ? labelPart.trim() : `観測点${index + 1}`;
            const address = hasExplicitLabel ? addressParts.join(':').trim() : line;
            return { label, address };
        })
        .filter(item => item.label && item.address);
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
