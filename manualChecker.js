/**
 * 手動計測のロジックを管理します。
 */
import * as dom from './dom.js';
import { areas } from './config.js';
import { saveManualHistoryAPI } from './api.js';
import { setMeasuringState } from './ui.js';
import { fetchAndDisplayAutoHistory } from './history.js';

/**
 * 手動での順位計測を実行します。
 * @param {object} state - アプリケーションの状態オブジェクト
 */
export async function checkRank(state) {
    const salonName = dom.salonNameInput.value.trim();
    const activeSearchType = dom.searchTypeToggle.querySelector('.toggle-button.active').dataset.type;

    let serviceKeywords = [];
    let areaCodes = {};
    let areaName = '';

    if (activeSearchType === 'normal') {
        const largeArea = dom.largeAreaSelect.value;
        const middleArea = dom.middleAreaSelect.value;
        const smallArea = dom.smallAreaSelect.value;
        const keywordsRaw = dom.keywordInput.value.trim();

        if (!salonName) {
            alert('自店のサロン名を入力してください。');
            return;
        }
        if (!largeArea) {
            alert('通常検索では、エリアブロックを必ず入力してください。（キーワードは任意です）');
            return;
        }
        if (keywordsRaw) {
            serviceKeywords = keywordsRaw.split(/[\s,、]+/).filter(k => k);
        } else {
            serviceKeywords.push(''); // キーワードが空の場合は空文字列の配列にする
        }
        areaName = smallArea || middleArea || largeArea;
        if (largeArea) areaCodes.serviceAreaCd = areas[largeArea].code;
        if (middleArea) areaCodes.middleAreaCd = areas[largeArea].middleAreas[middleArea].code;
        if (smallArea) areaCodes.smallAreaCd = areas[largeArea].middleAreas[middleArea].smallAreas[smallArea].code;
    } else if (activeSearchType === 'special') {
        const featureUrl = dom.featurePageUrlInput.value.trim();
        if (!featureUrl || !salonName) {
            alert('特集ページ検索では、URLとサロン名を入力してください。');
            return;
        }
        serviceKeywords.push(featureUrl);
    } else if (activeSearchType === 'google') {
        const googleKeyword = document.getElementById('googleKeywordInput').value.trim();
        const searchLocation = document.getElementById('searchLocationInput').value.trim();
        if (!salonName || !googleKeyword || !searchLocation) {
            alert('MEO検索では、自店のサロン名、検索地点、検索キーワードを入力してください。');
            return;
        }
        serviceKeywords.push(googleKeyword);
    }

    setMeasuringState(true, state);
    dom.checkRankButton.textContent = '計測中...';
    dom.resultArea.innerHTML = '';

    const startTime = performance.now();
    let timerInterval = null;

    const overallStatusContainer = document.createElement('div');
    overallStatusContainer.id = 'overallStatus';
    overallStatusContainer.style.cssText = 'padding: 10px; margin-bottom: 15px; border-bottom: 1px solid #ddd; font-weight: 500;';
    dom.resultArea.appendChild(overallStatusContainer);

    timerInterval = setInterval(() => {
        const elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
        const currentText = overallStatusContainer.textContent;
        const baseText = currentText.replace(/\s*\([^)]*\)$/, '');
        if (baseText && !baseText.includes('完了')) {
            overallStatusContainer.textContent = `${baseText} (経過時間: ${durationString})`;
        }
    }, 1000);

    for (const [index, serviceKeyword] of serviceKeywords.entries()) {
        const keywordResultContainer = document.createElement('div');
        keywordResultContainer.style.cssText = 'border-bottom: 1px solid #e5e5e7; padding-bottom: 15px; margin-bottom: 15px;';
        dom.resultArea.appendChild(keywordResultContainer);

        let fullKeyword = '';
        let eventSourceUrl = '';

        if (activeSearchType === 'normal') {
            const displayArea = areaName || "エリア未指定";
            fullKeyword = (displayArea !== "全国" ? displayArea + ' ' : '') + serviceKeyword;
            eventSourceUrl = `/check-ranking?` + new URLSearchParams({
                serviceKeyword, salonName, areaCodes: JSON.stringify(areaCodes)
            });
        } else if (activeSearchType === 'google') {
            const searchLocation = document.getElementById('searchLocationInput').value.trim();
            fullKeyword = `[${searchLocation}] ${serviceKeyword}`;
            eventSourceUrl = `/check-meo-ranking?` + new URLSearchParams({
                keyword: serviceKeyword,
                location: searchLocation,
            });
        } else { // special
            fullKeyword = serviceKeyword;
            eventSourceUrl = `/check-feature-page-ranking?` + new URLSearchParams({
                featurePageUrl: serviceKeyword, salonName
            });
        }

        overallStatusContainer.textContent = `${index + 1} / ${serviceKeywords.length} 件目: 「${fullKeyword}」を計測中... `;
        keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${fullKeyword}」</h4><p>計測しています...</p>`;

        await new Promise((resolve, reject) => {
            const eventSource = new EventSource(eventSourceUrl, { withCredentials: true });

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.error) {
                    keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4><p style="color: red;">エラー: ${escapeHtml(data.error)}</p>`;
                    eventSource.close();
                    reject(new Error(data.error));
                    return;
                }

                if (data.status) {
                    keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4><p>${escapeHtml(data.status)}</p>`;
                }

                if (data.final_result) {
                    const result = data.final_result;
                    const resultTitle = (activeSearchType === 'special') ? (result.page_title || fullKeyword) : fullKeyword;
                    result.keyword = resultTitle;

                    let totalCountHtml = (result.total_count !== undefined) ? `<p style="font-size: 14px; color: #6c6c70; margin-bottom: 10px;">検索結果総数: <strong style="color: #1c1c1e;">${result.total_count}</strong> 件</p>` : '';
                    let resultMessageHtml = '';

                    if (activeSearchType === 'google') {
                        if (result.results && result.results.length > 0) {
                            let foundMySalon = false;
                            const resultsListHtml = result.results.map((item, index) => {
                                const isMySalon = salonName && item.foundSalonName.toLowerCase().includes(salonName.toLowerCase());
                                if (isMySalon) foundMySalon = true;
                                const itemStyle = isMySalon ? 'background-color: #eef7ff; border-left: 3px solid #007aff;' : '';
                                const rankColor = isMySalon ? '#007aff' : '#1c1c1e';
                                return `<div style="padding: 10px; ${index < result.results.length - 1 ? 'border-bottom: 1px solid #e5e5e7;' : ''} ${itemStyle}"><p style="margin: 0; font-size: 16px; font-weight: bold;"><span style="color: ${rankColor}; font-size: 1.2em; display: inline-block; width: 3em;">${item.rank}位</span> ${escapeHtml(item.foundSalonName)}</p></div>`;
                            }).join('');
                            
                            const summaryMessage = foundMySalon ? `<p style="font-weight: bold; color: #007aff; margin-bottom: 15px;">自店をリスト内に発見しました。</p>` : `<p style="font-weight: bold; color: #ff3b30; margin-bottom: 15px;">自店が見つかりませんでした。</p>`;
                            resultMessageHtml = `${summaryMessage}<div style="text-align: left; max-height: 400px; overflow-y: auto;">${resultsListHtml}</div>`;

                            const mySalonRankItem = result.results.find(item => salonName && item.foundSalonName.toLowerCase().includes(salonName.toLowerCase()));
                            const finalRank = mySalonRankItem ? mySalonRankItem.rank : '圏外';
                            const searchLocation = document.getElementById('searchLocationInput').value.trim();
                            const googleKeyword = document.getElementById('googleKeywordInput').value.trim();
                            if (result.rank === "エリア不一致") resultMessageHtml = `<p style="color: #ff9500;">検索地点と結果が一致しませんでした (エリア不一致)</p>`;
                            
                            const taskId = `[google]-${salonName}-${searchLocation}-${googleKeyword}`; 
                            const taskPayload = { id: taskId, type: 'google', salonName, searchLocation, keyword: googleKeyword };
                            saveManualHistoryAPI({ task: taskPayload, result: { rank: finalRank, screenshot_path: result.screenshot_path } });

                        } else {
                            resultMessageHtml = `<p>検索結果に店舗が見つかりませんでした。</p>`;
                        }
                    } else { // Normal and Special
                        if (result.results && result.results.length > 0) {
                            const resultsListHtml = result.results.map((item, index) => {
                                const isMySalon = salonName && item.foundSalonName.includes(salonName);
                                const itemStyle = isMySalon ? 'background-color: #eef7ff; border-left: 3px solid #007aff;' : '';
                                const rankColor = isMySalon ? '#007aff' : '#1c1c1e';
                                return `<div style="padding: 10px; ${index < result.results.length - 1 ? 'border-bottom: 1px solid #e5e5e7;' : ''} ${itemStyle}"><p style="margin: 0; font-size: 16px; font-weight: bold;"><span style="color: ${rankColor}; font-size: 1.2em; display: inline-block; width: 3em;">${item.rank}位</span> ${escapeHtml(item.foundSalonName)}</p></div>`;
                            }).join('');
                            resultMessageHtml = `<div style="text-align: left;">${resultsListHtml}</div>`;
                            
                            const finalRank = result.results[0].rank;
                            let taskPayload = createManualTaskPayload(activeSearchType, salonName, areaName, areaCodes, serviceKeyword, result.page_title);
                            if (taskPayload) saveManualHistoryAPI({ task: taskPayload, result: { rank: finalRank, screenshot_path: result.screenshot_path } });
                        } else {
                            resultMessageHtml = `<p>5ページ（100位）以内に見つかりませんでした (圏外)</p>`;
                            let taskPayload = createManualTaskPayload(activeSearchType, salonName, areaName, areaCodes, serviceKeyword, result.page_title);
                            if (taskPayload) saveManualHistoryAPI({ task: taskPayload, result: { rank: '圏外', screenshot_path: result.screenshot_path } });
                        }
                    }

                    keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4>${totalCountHtml}${resultMessageHtml}`;
                    keywordResultContainer.style.cursor = 'pointer';
                    keywordResultContainer.title = 'クリックして詳細（スクショとデバッグ情報）を表示';
                    keywordResultContainer.onclick = () => openResultInNewTab(result);
                    
                    eventSource.close();
                    resolve();
                }
            };

            eventSource.onerror = (err) => {
                keywordResultContainer.innerHTML = `<h4 style="margin-top:0; margin-bottom: 10px;">「${escapeHtml(fullKeyword)}」</h4><p style="color: red;">エラー: サーバーとの接続に失敗しました。</p>`;
                eventSource.close();
                reject(err);
            };
        }).catch(error => {
            console.error(`「${fullKeyword}」の計測中にエラーが発生しました:`, error);
        });
    }

    clearInterval(timerInterval);
    const endTime = performance.now();
    const elapsedTotalSeconds = Math.floor((endTime - startTime) / 1000);
    const minutes = Math.floor(elapsedTotalSeconds / 60);
    const seconds = elapsedTotalSeconds % 60;
    const durationString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

    overallStatusContainer.textContent = `すべての計測が完了しました。（${serviceKeywords.length}件 / 所要時間: ${durationString}）`;
    setMeasuringState(false, state);
    dom.checkRankButton.textContent = '順位を計測';
    fetchAndDisplayAutoHistory();
}

function createManualTaskPayload(type, salonName, areaName, areaCodes, keyword, pageTitle) {
    let taskId, taskPayload;
    if (type === 'normal') {
        taskId = `${salonName}-${areaName}-${keyword}`;
        taskPayload = { id: taskId, type: 'normal', salonName, areaName, areaCodes, serviceKeyword: keyword };
    } else if (type === 'special') {
        taskId = `${salonName}-${keyword}`;
        taskPayload = { id: taskId, type: 'special', salonName, featurePageUrl: keyword, featurePageName: pageTitle };
    }
    return taskPayload;
}

function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function openResultInNewTab(resultData) {
    const newTab = window.open('', '_blank');
    if (!newTab) {
        alert('ポップアップブロックが有効になっている可能性があります。');
        return;
    }
    const screenshotHtml = resultData.screenshot_path ? `<h2>スクリーンショット</h2><a href="${resultData.screenshot_path}" target="_blank"><img src="${resultData.screenshot_path}" style="max-width: 100%; border: 1px solid #ddd;" alt="Screenshot"></a>` : '<h2>スクリーンショットはありません</h2>';
    const debugHtmlContent = resultData.html ? escapeHtml(resultData.html) : 'HTMLコンテンツはありませんでした。';
    const debugInfoHtml = `<h2>デバッグ情報</h2><p><strong>最終アクセスURL:</strong> <a href="${resultData.url || '#'}" target="_blank">${resultData.url || 'N/A'}</a></p><p><strong>取得したページのHTMLソース:</strong></p><textarea style="width: 98%; height: 400px; font-family: monospace; border: 1px solid #ccc; padding: 5px;" readonly>${debugHtmlContent}</textarea>`;
    newTab.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>計測詳細 - ${resultData.keyword || ''}</title><style>body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; line-height: 1.6; } h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }</style></head><body><h1>計測詳細</h1>${screenshotHtml}<hr style="margin: 20px 0;">${debugInfoHtml}</body></html>`);
    newTab.document.close();
}