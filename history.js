/**
 * 履歴の取得、グラフと表の描画を管理します。
 */
import { fetchHistoryAPI, fetchAutoTasksAPI, downloadExcelAPI } from './api.js';
import * as dom from './dom.js';
import { CHART_COLORS } from './config.js';

/**
 * 自動計測タスクを取得します。
 * @param {object} state - アプリケーションの状態オブジェクト
 */
export async function fetchAutoTasks(state) {
    try {
        state.autoTasks = await fetchAutoTasksAPI();
    } catch (error) {
        console.error('自動計測タスクの読み込みに失敗しました:', error);
    }
}

/**
 * 履歴データを取得し、グラフと表を描画します。
 */
export async function fetchAndDisplayAutoHistory() {
    try {
        let historyData = await fetchHistoryAPI();
        const autoHistoryGraphs = document.getElementById('autoHistoryGraphs');

        if (!historyData || historyData.length === 0) {
            dom.autoHistoryContainer.style.display = 'none';
            dom.noAutoHistoryMessage.style.display = 'block';
            if (autoHistoryGraphs) autoHistoryGraphs.innerHTML = '';
            return;
        }

        // データ統合: 古いサロン名 'ケイトステージラッシュ' を新しい 'KATEstageLASH' にマッピング
        historyData = historyData.map(item => {
            const task = item.task || {};
            const newItem = JSON.parse(JSON.stringify(item));

            // 福岡・香椎エリアのデータ統合
            if (
                (task.areaName === '箱崎・千早・香椎周辺' && (task.salonName === 'ケイトステージラッシュ' || task.salonName === 'KATE stage LASH')) ||
                (task.areaName === '福岡' && task.salonName === 'ケイトステージラッシュ') ||
                (task.type === 'special' && (task.featurePageName?.startsWith('福岡市東区で') || task.featurePageName?.startsWith('香椎駅で')) && (task.salonName === 'ケイトステージラッシュ' || task.salonName === 'KATE stage LASH'))
            )
            {
                newItem.task.salonName = 'KATEstageLASH';
                return newItem;
            }

            // 池袋エリアのデータ統合
            if (
                (task.areaName === '西口・北口・目白' && (task.salonName === 'ケイトステージラッシュ' || task.salonName === 'KATE stage LASH')) ||
                (task.type === 'special' && task.featurePageName?.startsWith('池袋駅で') && (task.salonName === 'ケイトステージラッシュ' || task.salonName === 'KATE stage LASH'))
            )
            {
                newItem.task.salonName = 'KATE stage LASH';
                return newItem;
            }

            return item;
        });

        // ログデータの統合
        const mergedHistory = {};
        historyData.forEach(item => {
            // 各アイテムのユニークなキーを生成（タスクIDから古いサロン名部分を除外）
            const task = item.task || {};
            const key = `${task.type || 'normal'}-${task.areaName || task.searchLocation || task.featurePageUrl}-${task.salonName}-${task.serviceKeyword || task.keyword || ''}`;

            if (!mergedHistory[key]) {
                // 新しいキーであれば、そのまま格納
                mergedHistory[key] = JSON.parse(JSON.stringify(item));
            } else {
                // 既存のキーであれば、ログデータを結合
                mergedHistory[key].log = mergedHistory[key].log.concat(item.log);
                // ログを日付でソートして重複を削除（念のため）
                const uniqueLogs = Array.from(new Map(mergedHistory[key].log.map(log => [log.date, log])).values());
                mergedHistory[key].log = uniqueLogs.sort((a, b) => new Date(a.date) - new Date(b.date));
            }
        });
        historyData = Object.values(mergedHistory);

        if (!historyData || historyData.length === 0) {
            if (autoHistoryGraphs) autoHistoryGraphs.innerHTML = '';
            return;
        }

        dom.autoHistoryContainer.style.display = 'block';
        dom.noAutoHistoryMessage.style.display = 'none';
        autoHistoryGraphs.innerHTML = '';

        const activeSearchType = dom.searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
        const filteredHistory = historyData.filter(item => (item.task.type || 'normal') === activeSearchType);

        if (filteredHistory.length === 0) {
            dom.autoHistoryContainer.style.display = 'none';
            dom.noAutoHistoryMessage.style.display = 'block';
            dom.noAutoHistoryMessage.textContent = 'この検索タイプの履歴はありません。';
            return;
        }

        const groupedHistory = groupHistory(filteredHistory, activeSearchType);
        const sortedGroupedHistory = sortHistory(groupedHistory, activeSearchType);

        updateToggleAllTablesButton(sortedGroupedHistory);

        const hiddenTablesState = getHiddenTablesState();

        sortedGroupedHistory.forEach(([groupKey, groupData]) => {
            renderGroup(groupKey, groupData, activeSearchType, hiddenTablesState);
        });

    } catch (error) {
        console.error('自動計測履歴の読み込みに失敗しました:', error);
    }
}

function groupHistory(history, activeSearchType) {
    return history.reduce((acc, historyItem) => {
        let groupKey;
        if (activeSearchType === 'normal') {
            groupKey = `${historyItem.task.areaName} - ${historyItem.task.salonName}`;
        } else if (activeSearchType === 'special') {
            groupKey = historyItem.task.featurePageName || historyItem.task.featurePageUrl;
        } else if (activeSearchType === 'google') {
            groupKey = `${historyItem.task.searchLocation} - ${historyItem.task.salonName}`;
        }
        if (!acc[groupKey]) acc[groupKey] = [];
        acc[groupKey].push(historyItem);
        return acc;
    }, {});
}

function sortHistory(groupedHistory, activeSearchType) {
    const savedOrder = JSON.parse(localStorage.getItem(`graphOrder_${activeSearchType}`) || '[]');
    return Object.entries(groupedHistory).sort((a, b) => {
        const indexA = savedOrder.indexOf(a[0]);
        const indexB = savedOrder.indexOf(b[0]);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a[0].localeCompare(b[0], 'ja');
    });
}

function renderGroup(groupKey, groupData, activeSearchType, hiddenTablesState) {
    const exclusionList = { "広島市中区でまつげパーマが人気のまつげサロン": ["elua 横川店", "elua 緑井店"] };
    if (exclusionList[groupKey]) {
        groupData = groupData.filter(taskData => !exclusionList[groupKey].includes(taskData.task.salonName));
    }

    const graphWrapper = document.createElement('div');
    graphWrapper.className = 'graph-wrapper';
    graphWrapper.dataset.groupKey = groupKey;
    graphWrapper.style.cssText = 'position: relative; height: auto; margin-bottom: 40px;';

    const headerContainer = createGroupHeader(groupKey, groupData, activeSearchType);
    graphWrapper.appendChild(headerContainer);

    const canvasContainer = document.createElement('div');
    canvasContainer.style.height = '220px';
    const canvas = document.createElement('canvas');
    canvasContainer.appendChild(canvas);
    graphWrapper.appendChild(canvasContainer);
    document.getElementById('autoHistoryGraphs').appendChild(graphWrapper);

    const { labels, datasets } = prepareChartData(groupData, activeSearchType);
    createChart(canvas, labels, datasets);

    if (['normal', 'special', 'google'].includes(activeSearchType)) {
        const tableContainer = createHistoryTable(groupData, labels, activeSearchType, hiddenTablesState[groupKey]);
        graphWrapper.appendChild(tableContainer);
    }
}

function createGroupHeader(groupKey, groupData, activeSearchType) {
    const headerContainer = document.createElement('div');
    headerContainer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e5e7; padding-bottom: 8px; margin-bottom: 15px;';
    
    const header = document.createElement('h5');
    header.textContent = groupKey;
    header.style.cssText = 'font-size: 16px; font-weight: 600; margin: 0;';
    headerContainer.appendChild(header);

    const controls = document.createElement('div');
    controls.className = 'graph-controls';
    
    const upButton = document.createElement('button');
    upButton.textContent = '↑';
    upButton.onclick = () => moveGraph(headerContainer.parentElement, 'up');
    
    const downButton = document.createElement('button');
    downButton.textContent = '↓';
    downButton.onclick = () => moveGraph(headerContainer.parentElement, 'down');

    const excelButton = document.createElement('button');
    excelButton.textContent = 'Excel出力';
    excelButton.className = 'excel-button';
    excelButton.onclick = (e) => exportToExcel(e.target, groupKey, groupData, activeSearchType);

    controls.append(upButton, downButton, excelButton);
    headerContainer.appendChild(controls);
    return headerContainer;
}

function prepareChartData(groupData, activeSearchType) {
    const allDates = new Set();
    groupData.forEach(task => task.log.forEach(entry => allDates.add(entry.date)));
    const sortedLabels = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

    // --- 修正: キーワードなしを一番上にソート ---
    groupData.sort((a, b) => {
        const getLabel = (task) => task.serviceKeyword ?? task.keyword ?? task.salonName ?? '';
        const labelA = getLabel(a.task);
        const labelB = getLabel(b.task);

        // キーワードなし（空文字）を最優先
        if (labelA === '' && labelB !== '') return -1;
        if (labelA !== '' && labelB === '') return 1;

        // それ以外は通常の文字列比較
        return labelA.localeCompare(labelB, 'ja');
    });

    const datasets = groupData.map((taskData, index) => {
        const dataMap = new Map(taskData.log.map(entry => [entry.date, { rank: entry.rank, screenshot: entry.screenshot }]));
        const dataForChart = sortedLabels.map(date => {
            const entry = dataMap.get(date);
            return entry ? { x: date, y: convertRankToY(entry.rank), originalRank: entry.rank, screenshot: entry.screenshot } : { x: date, y: NaN };
        });

        let labelText = taskData.task.salonName;
        if (activeSearchType === 'normal') {
            labelText = taskData.task.serviceKeyword || '';
        } else if (activeSearchType === 'google') {
            labelText = taskData.task.keyword || '';
        } // 'special' の場合はサロン名がそのまま使われる

        return {
            label: labelText,
            data: dataForChart,
            borderColor: CHART_COLORS[index % CHART_COLORS.length],
            tension: 0.1,
            spanGaps: true
        };
    });

    return { labels: sortedLabels, datasets };
}

function createChart(canvas, labels, datasets) {
    new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            layout: { padding: { top: 0 } },
            maintainAspectRatio: false,
            parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            scales: {
                x: { ticks: { callback: (value) => { const d = new Date(labels[value]); return `${d.getMonth() + 1}/${d.getDate()}`; } } },
                y: {
                    type: 'linear', reverse: false, min: 1.4, max: 6.1,
                    ticks: { callback: (value) => ({ 6: '1位', 5: '5位', 4: '20位', 3: '50位', 2: '100位', 1.5: '圏外' }[value] || null) },
                    afterBuildTicks: (axis) => { axis.ticks = [{ value: 6 }, { value: 5 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 1.5 }]; },
                    grid: { drawBorder: false, color: (context) => context.tick.value === 1.5 ? 'transparent' : Chart.defaults.borderColor }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'start' },
                tooltip: {
                    callbacks: {
                        title: (items) => { const d = new Date(items[0].label); return `${d.getMonth() + 1}/${d.getDate()}`; },
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.originalRank === '圏外' ? '圏外' : ctx.raw.originalRank + '位'}`
                    }
                }
            }
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const chartData = event.chart.data.datasets[elements[0].datasetIndex].data[elements[0].index];
                if (chartData.screenshot) window.open(chartData.screenshot, '_blank');
                else alert('この計測データにはスクリーンショットがありません。');
            }
        }
    });
}

function createHistoryTable(groupData, labels, activeSearchType, isHidden) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'sticky-table-container';
    tableContainer.style.marginTop = '20px';
    if (isHidden) tableContainer.style.display = 'none';

    const table = document.createElement('table');
    table.className = 'sticky-table';
    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thKeyword = document.createElement('th');
    thKeyword.textContent = (activeSearchType === 'special') ? 'サロン名' : 'キーワード';
    thKeyword.style.cssText = 'padding: 8px; border: 1px solid #ddd; background-color: #f8f8f8; text-align: left; min-width: 100px;';
    headerRow.appendChild(thKeyword);

    labels.forEach(date => {
        const th = document.createElement('th');
        const d = new Date(date);
        th.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
        th.style.cssText = 'padding: 8px; border: 1px solid #ddd; background-color: #f8f8f8; min-width: 50px;';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    groupData.forEach((taskData, rowIndex) => {
        const dataMap = new Map(taskData.log.map(entry => [entry.date, { rank: entry.rank, screenshot: entry.screenshot }]));
        const row = document.createElement('tr');
        if (rowIndex % 2 === 1) row.style.backgroundColor = '#f0f0f5';

        const tdKeyword = document.createElement('td');
        if (activeSearchType === 'special') tdKeyword.textContent = taskData.task.salonName;
        else tdKeyword.textContent = taskData.task.serviceKeyword || taskData.task.keyword;
        tdKeyword.style.cssText = 'padding: 8px; border: 1px solid #ddd; font-weight: 500;';
        if (rowIndex % 2 === 1) tdKeyword.style.backgroundColor = '#f0f0f5';
        row.appendChild(tdKeyword);

        labels.forEach((date, index) => {
            const td = document.createElement('td');
            const currentEntry = dataMap.get(date);
            const currentRank = currentEntry ? currentEntry.rank : null;
            let rankHtml = currentRank !== null ? String(currentRank) : '-';

            if (index > 0 && currentRank !== null) {
                const prevEntry = dataMap.get(labels[index - 1]);
                const prevRank = prevEntry ? prevEntry.rank : null;
                const numericCurrent = getNumericRank(currentRank);
                const numericPrev = getNumericRank(prevRank);

                if (numericPrev !== Infinity) {
                    const diff = numericPrev - numericCurrent;
                    const { color, fontWeight, arrow } = getRankChangeStyle(diff);
                    if (arrow) {
                        rankHtml = `<span style="color: ${color}; font-weight: ${fontWeight};"><span style="display: inline-block; width: 1.2em; text-align: right; margin-right: 2px;">${arrow}</span>${currentRank}</span>`;
                    }
                }
            }

            td.innerHTML = rankHtml;
            td.style.cssText = 'padding: 8px; border: 1px solid #ddd; text-align: center;';
            if (currentEntry?.screenshot) {
                td.style.cursor = 'pointer';
                td.style.textDecoration = 'underline';
                td.onclick = () => window.open(currentEntry.screenshot, '_blank');
            }
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    return tableContainer;
}

function getNumericRank(rank) {
    if (rank === null || rank === '-') return Infinity; // Handle non-rank values
    const numRank = Number(rank); // Convert to number
    if (rank === '圏外' || !isFinite(numRank)) return 101; // Check if it's a valid number
    return numRank;
}

function getRankChangeStyle(diff) {
    if (diff >= 5) return { color: '#34c759', fontWeight: 'bold', arrow: '↑' };
    if (diff > 0) return { color: '#007aff', fontWeight: 'normal', arrow: '↗' };
    if (diff === 0) return { color: '#8e8e93', fontWeight: 'normal', arrow: '→' };
    if (diff > -5) return { color: '#ff9500', fontWeight: 'normal', arrow: '↘' };
    return { color: '#ff3b30', fontWeight: 'bold', arrow: '↓' };
}

function convertRankToY(rank) {
    const rankNum = Number(rank);
    if (!isFinite(rankNum)) {
        return rank === '圏外' ? 1.5 : NaN;
    }
    const points = [{ rank: 1, y: 6 }, { rank: 5, y: 5 }, { rank: 20, y: 4 }, { rank: 50, y: 3 }, { rank: 100, y: 2 }];
    for (let i = 0; i < points.length - 1; i++) {
        if (rankNum >= points[i].rank && rankNum <= points[i + 1].rank) {
            return points[i].y - ((rankNum - points[i].rank) / (points[i + 1].rank - points[i].rank || 1)) * (points[i].y - points[i + 1].y);
        }
    }
    return (rankNum < 1) ? 6 : 1.5;
}

async function exportToExcel(button, groupKey, groupData, activeSearchType) {
    const originalText = button.textContent;
    button.textContent = '作成中...';
    button.disabled = true;
    try {
        const blob = await downloadExcelAPI({ groupKey, groupData, activeSearchType });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        const safeGroupKey = groupKey.replace(/[\\/:*?"<>|]/g, '_');
        link.download = `${safeGroupKey}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        alert(`エラー: ${error.message}`);
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

function moveGraph(wrapper, direction) {
    const parent = wrapper.parentNode;
    if (direction === 'up' && wrapper.previousElementSibling) {
        parent.insertBefore(wrapper, wrapper.previousElementSibling);
    } else if (direction === 'down' && wrapper.nextElementSibling) {
        parent.insertBefore(wrapper.nextElementSibling, wrapper);
    }
    saveGraphOrder();
}

function saveGraphOrder() {
    const activeSearchType = dom.searchTypeToggle.querySelector('.toggle-button.active').dataset.type;
    const wrappers = document.querySelectorAll('#autoHistoryGraphs .graph-wrapper');
    const newOrder = Array.from(wrappers).map(w => w.dataset.groupKey);
    localStorage.setItem(`graphOrder_${activeSearchType}`, JSON.stringify(newOrder));
}

const HIDDEN_TABLES_STORAGE_KEY = 'hiddenTablesState';
function getHiddenTablesState() {
    try {
        return JSON.parse(localStorage.getItem(HIDDEN_TABLES_STORAGE_KEY) || '{}');
    } catch (e) { return {}; }
}
function saveHiddenTablesState(state) {
    localStorage.setItem(HIDDEN_TABLES_STORAGE_KEY, JSON.stringify(state));
}
function updateToggleAllTablesButton(sortedHistory) {
    const isAnyTableVisible = sortedHistory.some(([groupKey]) => !getHiddenTablesState()[groupKey]);
    if (sortedHistory.length > 0) {
        dom.toggleAllTablesButton.style.display = 'inline-flex';
        dom.toggleAllTablesButton.textContent = isAnyTableVisible ? 'すべての表を隠す' : 'すべての表を表示';
    } else {
        dom.toggleAllTablesButton.style.display = 'none';
    }
}
dom.toggleAllTablesButton.addEventListener('click', () => {
    const shouldHide = dom.toggleAllTablesButton.textContent === 'すべての表を隠す';
    const currentState = getHiddenTablesState();
    document.querySelectorAll('.graph-wrapper').forEach(wrapper => {
        const tableContainer = wrapper.querySelector('.sticky-table-container');
        if (tableContainer) tableContainer.style.display = shouldHide ? 'none' : '';
        currentState[wrapper.dataset.groupKey] = shouldHide;
    });
    saveHiddenTablesState(currentState);
    dom.toggleAllTablesButton.textContent = shouldHide ? 'すべての表を表示' : 'すべての表を隠す';
});