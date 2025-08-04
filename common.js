console.log('common.js script loaded'); // スクリプトが読み込まれたことを確認

/**
 * 指定されたURLのHTMLコンテンツを読み込み、指定されたIDの要素に挿入します。
 * @param {string} url 読み込むHTMLファイルのURL
 * @param {string} elementId 挿入先の要素のID
 */
async function loadHTML(url, elementId) {
    try {
        console.log(`Attempting to load ${url} into #${elementId}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.statusText}`);
        }
        const text = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = text;
            console.log(`Successfully loaded ${url} into #${elementId}`);
        } else {
            console.error(`Element with id '${elementId}' not found.`);
        }
    } catch (error) { // ← catchブロックの開始 '{' を追加
        console.error('Error loading HTML:', error);
        // エラーが発生した場合でも、後続の処理に影響を与えないように、ここではエラーを再スローしない
    } // ← loadHTML 関数の閉じ '}' はここ
}

// DOMの読み込みが完了したら共通部品をロード
document.addEventListener('DOMContentLoaded', async () => {
    // header, nav, footerのプレースホルダーが存在する場合のみ読み込む
    if (document.getElementById('header-placeholder')) {
        await loadHTML('header.html', 'header-placeholder');
    }
    if (document.getElementById('footer-placeholder')) {
        await loadHTML('footer.html', 'footer-placeholder');
        // フッターが読み込まれた後に年を更新
        const yearSpan = document.getElementById('copyright-year');
        if (yearSpan) {
            yearSpan.textContent = new Date().getFullYear();
        }
    }
});
