/**
 * Uber Eats順位履歴（/api/auto-history のうち type==='ubereats'）を
 * 画面描画用のモデルへ集計する純粋関数群。
 * DOM・fetchに依存しないため、Nodeからそのまま検証できます。
 */

// 観測点の線色パレット（先頭＝店と同じ住所の基準色）
const UBER_POINT_COLORS = [
    '#007aff', '#00a66c', '#bf5af2', '#34c759', '#5856d6',
    '#ff9500', '#5ac8fa', '#af52de', '#ff3b30', '#8e8e93',
    '#0a84ff', '#30b0c7', '#c77700', '#6d6df6', '#d15f96',
    '#2d9d78', '#a2845e',
];

// 基準となる観測点（太線で描画する）
export const UBER_BASE_LABEL = '店と同じ住所';

/**
 * 履歴の rank 値を正規化します。
 * 数値 → 順位、'圏外' → 圏外、それ以外（'モック'・'要確認'等）→ 未計測(null)。
 * @param {number|string|null} rank
 * @returns {{ value: number|null, status: 'rank'|'out'|'none' }}
 */
export function normalizeUberRank(rank) {
    if (typeof rank === 'number' && Number.isFinite(rank)) return { value: rank, status: 'rank' };
    if (typeof rank === 'string') {
        const trimmed = rank.trim();
        if (trimmed === '圏外') return { value: null, status: 'out' };
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isNaN(parsed) && String(parsed) === trimmed) return { value: parsed, status: 'rank' };
    }
    return { value: null, status: 'none' };
}

/**
 * 正規化済みの順位を表示ラベルにします。
 * 実質順位（小売店を除いた飲食店内の順位）があれば括弧で併記します。
 * @param {{ value: number|null, status: string, food?: object }} normalized
 * @returns {string} '9位（飲食のみ 2位）' / '圏外' / '未計測'
 */
export function uberStatusLabel(normalized) {
    if (!normalized || normalized.status === 'none') return '未計測';
    const base = normalized.status === 'out' ? '圏外' : `${normalized.value}位`;
    const food = normalized.food;
    if (!food || food.status === 'none') return base;
    const foodLabel = food.status === 'out' ? '圏外' : `${food.value}位`;
    return `${base}（飲食のみ ${foodLabel}）`;
}

/**
 * 生順位のみのラベル（グラフ軸・比較用）。
 */
export function uberRawStatusLabel(normalized) {
    if (!normalized || normalized.status === 'none') return '未計測';
    if (normalized.status === 'out') return '圏外';
    return `${normalized.value}位`;
}

/** 'YYYY/MM/DD' → 'M/D' */
export function formatUberDate(date) {
    const parts = String(date).split('/');
    if (parts.length !== 3) return String(date);
    return `${Number.parseInt(parts[1], 10)}/${Number.parseInt(parts[2], 10)}`;
}

/**
 * 履歴配列（全タイプ）からUber Eats分の描画モデルを組み立てます。
 * @param {Array} history - /api/auto-history のレスポンス
 * @returns {object|null} 集計モデル（Uber Eats履歴が無ければ null）
 */
export function buildUberModel(history) {
    const entries = (Array.isArray(history) ? history : []).filter(entry => entry?.task?.type === 'ubereats');
    if (entries.length === 0) return null;

    const labels = [];
    const keywords = [];
    const dates = new Set();
    const addressByLabel = {};
    // ranks[keyword][label][date] = normalized
    const ranks = {};

    entries.forEach(entry => {
        const { addressLabel, keyword, address } = entry.task;
        if (!labels.includes(addressLabel)) labels.push(addressLabel);
        if (!keywords.includes(keyword)) keywords.push(keyword);
        if (address && !addressByLabel[addressLabel]) addressByLabel[addressLabel] = address;
        ranks[keyword] = ranks[keyword] || {};
        ranks[keyword][addressLabel] = ranks[keyword][addressLabel] || {};
        (entry.log || []).forEach(log => {
            if (!log?.date) return;
            const normalized = normalizeUberRank(log.rank);
            // 未計測（モック等）は日付軸にも載せない
            if (normalized.status === 'none') return;
            // 実質順位（小売店を除いた飲食店内の順位）。古い履歴には無いので未計測扱い。
            normalized.food = normalizeUberRank(log.food_rank);
            dates.add(log.date);
            ranks[keyword][addressLabel][log.date] = normalized;
        });
    });

    // 基準点を先頭に、それ以外は出現順
    const orderedLabels = [
        ...labels.filter(label => label === UBER_BASE_LABEL),
        ...labels.filter(label => label !== UBER_BASE_LABEL),
    ];
    const sortedDates = [...dates].sort();
    const points = orderedLabels.map((label, index) => ({
        label,
        address: addressByLabel[label] || '',
        color: UBER_POINT_COLORS[index % UBER_POINT_COLORS.length],
        width: label === UBER_BASE_LABEL ? 4 : 2,
        opacity: label === UBER_BASE_LABEL ? 1 : 0.42,
    }));

    return {
        storeName: entries[0].task.storeName || '',
        points,
        labels: orderedLabels,
        keywords,
        dates: sortedDates,
        latestDate: sortedDates.at(-1) || null,
        taskCount: entries.length,
        ranks,
    };
}

/**
 * 指定キーワード・観測点の、日付順に並べた順位系列を返します（欠測はnull）。
 * @returns {Array<{value:number|null,status:string}|null>}
 */
export function uberSeries(model, keyword, label) {
    const byDate = model.ranks?.[keyword]?.[label] || {};
    return model.dates.map(date => byDate[date] || null);
}

/**
 * 指定キーワード・観測点の最新（最も新しい日付の）順位を返します。
 */
export function uberLatest(model, keyword, label) {
    const byDate = model.ranks?.[keyword]?.[label] || {};
    for (let i = model.dates.length - 1; i >= 0; i -= 1) {
        const found = byDate[model.dates[i]];
        if (found) return found;
    }
    return null;
}

/**
 * キーワード単位のサマリー（最良地点・圏外数・観測点数）を算出します。
 */
export function uberSummary(model, keyword) {
    let best = null;
    let outCount = 0;
    let measuredCount = 0;
    model.labels.forEach(label => {
        const latest = uberLatest(model, keyword, label);
        if (!latest) return;
        measuredCount += 1;
        if (latest.status === 'out') {
            outCount += 1;
            return;
        }
        if (!best || latest.value < best.value) best = { label, value: latest.value };
    });
    return { best, outCount, measuredCount };
}
