/**
 * 共通のCSSファイルを動的に読み込みます。
 * @param {string} url CSSファイルのURL
 */
function loadCSS(url) {
    // 既に同じCSSが読み込まれていないかチェック
    if (!document.querySelector(`link[href="${url}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
        console.log(`Dynamically loaded CSS: ${url}`);
    }
}


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

/**
 * 現在のページに基づいてナビゲーションリンクに 'active' クラスを設定します。
 */
function setActiveNavigation() {
    console.log('Attempting to set active navigation');
    const currentPageFilename = window.location.pathname.split("/").pop();

    // すべてのナビゲーションリンクから 'active' クラスを削除
    document.querySelectorAll('#header-nav a').forEach(link => {
        link.classList.remove('active');
    });

    let activeLinkId = '';
    switch (currentPageFilename) {
        case 'index.html':
        case '': // ルートパスの場合
            activeLinkId = 'nav-home';
            break;
        case 'ranking_checker.html':
            activeLinkId = 'nav-ranking';
            break;
        case 'customer_search.html':
            activeLinkId = 'nav-search';
            break;
        case 'customer_detail.html':
            activeLinkId = 'nav-search'; // 詳細ページでは検索をアクティブにする例
            break;
        // 他のページも同様に追加
        // case 'review_generator.html':
        //     activeLinkId = 'nav-review';
        //     break;
        // case 'new_carte.html':
        //     activeLinkId = 'nav-new-carte';
        //     break;
        // case 'new_carte.html':
        //     activeLinkId = 'nav-new-carte';
        //     break;
    }

    if (activeLinkId) {
        const activeLink = document.getElementById(activeLinkId);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }
}

// DOMの読み込みが完了したら共通部品をロード
document.addEventListener('DOMContentLoaded', async () => {
    // 最初に共通CSSを読み込む
    loadCSS('style.css');

    // headerは各HTMLに直接記述するため、JSでの読み込みは不要に。
    // ナビゲーションのアクティブ状態設定は、DOM読み込み完了後すぐに実行する。
    setActiveNavigation();

    // footerのプレースホルダーが存在する場合のみ読み込む
    if (document.getElementById('footer-placeholder')) {
        await loadHTML('footer.html', 'footer-placeholder');
    }
});
