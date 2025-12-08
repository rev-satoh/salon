/**
 * サーバーとのAPI通信を管理します。
 */

/**
 * サーバーからJSONデータを取得する汎用関数
 * @param {string} url - 取得先のURL
 * @returns {Promise<any>} - JSONデータ
 */
async function fetchJSON(url) {
    const response = await fetch(`${url}?_=${new Date().getTime()}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}`);
    }
    return response.json();
}

/**
 * サーバーにJSONデータをPOSTする汎用関数
 * @param {string} url - POST先のURL
 * @param {object} data - 送信するデータ
 * @returns {Promise<any>} - サーバーからのレスポンスJSON
 */
async function postJSON(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Request failed');
    }
    return result;
}

/**
 * 自動計測タスクを取得します。
 * @returns {Promise<Array>}
 */
export function fetchAutoTasksAPI() {
    return fetchJSON('/api/auto-tasks');
}

/**
 * 自動計測タスクを保存します。
 * @param {Array} tasks - 保存するタスクの配列
 * @returns {Promise<void>}
 */
export async function saveAutoTasksAPI(tasks) {
    await postJSON('/api/auto-tasks', tasks);
}

/**
 * スケジュール設定を取得します。
 * @returns {Promise<object>}
 */
export function fetchScheduleAPI() {
    return fetchJSON('/api/schedule');
}

/**
 * スケジュール設定を保存します。
 * @param {object} schedule - { hour, minute }
 * @returns {Promise<object>}
 */
export function saveScheduleAPI(schedule) {
    return postJSON('/api/schedule', schedule);
}

/**
 * 自動計測の履歴を取得します。
 * @returns {Promise<Array>}
 */
export function fetchHistoryAPI() {
    return fetchJSON('/api/auto-history');
}

/**
 * 手動計測の履歴を保存します。
 * @param {object} payload - 保存する履歴データ
 * @returns {Promise<void>}
 */
export async function saveManualHistoryAPI(payload) {
    await postJSON('/api/save-auto-history-entry', payload);
}

/**
 * Excelファイルをダウンロードします。
 * @param {object} data - { groupKey, groupData, activeSearchType }
 * @returns {Promise<Blob>}
 */
export async function downloadExcelAPI(data) {
    const response = await fetch('/download_excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Excelファイルの生成に失敗しました。');
    }
    return response.blob();
}