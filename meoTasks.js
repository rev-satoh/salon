/**
 * Googleマップ（MEO）計測タスクの組み立て（純粋関数・DOM非依存＝Nodeから検証できる）。
 *
 * 検索地点・キーワードの欄にカンマ（, 、 ，）区切りで複数書かれていたら、
 * 「1地点×1語＝1タスク」の組合せへ展開する。カンマ文字列を丸ごと1回の検索に
 * 使うと意味のない検索になるため（2026-10-06 YOGIの3地点×4語が1本で計測されていた不具合）。
 * 空白は区切りにしない（「岡山 カフェ」のような語を壊さないため）。
 * Python側の同じ処理＝utils.py の split_meo_list / expand_meo_task。
 */

const MEO_LIST_SEPARATOR = /[,、，]/;

/** カンマ区切りの入力を、前後の空白を除いた重複なしの配列にする */
export function splitMeoList(raw) {
    const seen = new Set();
    return String(raw || '')
        .split(MEO_LIST_SEPARATOR)
        .map(s => s.trim())
        .filter(s => s && !seen.has(s) && seen.add(s));
}

/**
 * キーワードの先頭に地点名（「駅」「市」を除いた部分）が付いていたら外す（従来の登録時の処理）。
 * ただし地名の直後に空白（半角/全角）がある＝「岡山　カフェ」のように意図して地名を付けた検索語は外さない
 * （検索語はそのままGoogleマップに渡るため、地名の有無で別の計測になる・2026-10-06）。
 */
export function cleanMeoKeyword(searchLocation, keyword) {
    const locationBaseName = searchLocation.replace(/駅|市$/, '').trim();
    if (locationBaseName && keyword.startsWith(locationBaseName)) {
        const rest = keyword.substring(locationBaseName.length);
        if (/^[\s\u3000]/.test(rest)) return keyword;
        return rest.trim();
    }
    return keyword;
}

export function meoTaskId(salonName, searchLocation, keyword) {
    return `[google]-${salonName}-${searchLocation}-${keyword}`;
}

/**
 * 地点欄・キーワード欄の入力から、地点×キーワードの組合せを返す。
 * @returns {{searchLocation: string, keyword: string}[]}
 */
export function expandMeoPairs(locationRaw, keywordRaw, { cleanKeyword = false } = {}) {
    const locations = splitMeoList(locationRaw);
    const keywords = splitMeoList(keywordRaw);
    const pairs = [];
    const seen = new Set();
    for (const searchLocation of locations) {
        for (const kw of keywords) {
            const keyword = cleanKeyword ? cleanMeoKeyword(searchLocation, kw) : kw;
            if (!keyword) continue;
            const key = `${searchLocation}\u0000${keyword}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push({ searchLocation, keyword });
        }
    }
    return pairs;
}
