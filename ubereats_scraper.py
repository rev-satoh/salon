import datetime
import base64
import json
import os
import re
import time
import unicodedata
import urllib.parse

from bs4 import BeautifulSoup
from flask import current_app
from PIL import Image
import requests
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

import config
from utils import sse_format


UBER_EATS_LOCATION_OVERRIDES = {
    "岡山市役所": {
        "address": "岡山市役所",
        "formatted_address": "日本、〒700-8544 岡山県岡山市北区大供１丁目１−１",
        "reference": "ChIJz_qE0bAHVDUR9EsnJ0nsmrw",
        "latitude": 34.6544356,
        "longitude": 133.9195916,
    },
    "岡山市中区浜": {
        "address": "岡山市中区浜",
        "formatted_address": "日本、岡山県岡山市中区浜",
        "reference": "ChIJKe6RBiIGVDURLegKuEhab3A",
        "latitude": 34.670876,
        "longitude": 133.9377178,
    },
    "岡山市南区役所": {
        "address": "岡山市南区役所",
        "formatted_address": "日本、〒702-8023 岡山県岡山市南区浦安南町４９５−５",
        "reference": "ChIJt_LR_kX4UzUROqbRm1K7MCU",
        "latitude": 34.599776999999996,
        "longitude": 133.919555,
    },
    "西大寺駅": {
        "address": "西大寺駅",
        "formatted_address": "日本、岡山県岡山市東区西大寺上２丁目",
        "reference": "ChIJqW9CbRUMVDURr9686I6l0Nk",
        "latitude": 34.6617996,
        "longitude": 134.037254,
    },
}


_RETAIL_FILTER_CACHE = {"mtime": None, "data": None}

_RETAIL_FILTER_DEFAULT = {
    "categoryKeywords": [],
    "storeNameKeywords": [],
    "excludeStoreNameKeywords": [],
}


def load_retail_filter():
    """小売店判定の設定ファイル（ubereats_retail_filter.json）を読み込む。

    設定ファイルは社長が直接編集する前提のため、毎回mtimeを見て自動で読み直す。
    読めない場合は「小売判定なし」（＝実質順位＝生順位）として安全側に倒す。
    """
    path = getattr(config, "UBER_EATS_RETAIL_FILTER_FILE", "")
    if not path:
        return dict(_RETAIL_FILTER_DEFAULT)
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return dict(_RETAIL_FILTER_DEFAULT)
    if _RETAIL_FILTER_CACHE["mtime"] == mtime and _RETAIL_FILTER_CACHE["data"] is not None:
        return _RETAIL_FILTER_CACHE["data"]
    try:
        with open(path, "r", encoding="utf-8") as filter_file:
            raw = json.load(filter_file)
    except (OSError, ValueError):
        return dict(_RETAIL_FILTER_DEFAULT)
    data = {
        key: [str(item) for item in (raw.get(key) or []) if str(item).strip()]
        for key in _RETAIL_FILTER_DEFAULT
    }
    _RETAIL_FILTER_CACHE["mtime"] = mtime
    _RETAIL_FILTER_CACHE["data"] = data
    return data


def _normalize_for_match(value):
    return unicodedata.normalize("NFKC", str(value or "")).lower()


def detect_retail_category(text, retail_filter=None):
    """カード内テキストからUber側のカテゴリ表記（食料品・コンビニ等）を検出する。"""
    retail_filter = retail_filter or load_retail_filter()
    normalized = _normalize_for_match(text)
    for keyword in retail_filter.get("categoryKeywords", []):
        if _normalize_for_match(keyword) in normalized:
            return keyword
    return ""


def classify_store_card(card, retail_filter=None):
    """1店舗カードが小売店かを判定し、判定根拠を付けて返す。

    優先順位：
      1. カテゴリ表記（Uberが結果カードに出している場合のみ）
      2. 店名キーワード（設定ファイルの storeNameKeywords）
    excludeStoreNameKeywords に当たる店は必ず飲食店扱い（誤判定の救済）。
    """
    retail_filter = retail_filter or load_retail_filter()
    name = _normalize_for_match(card.get("foundStoreName"))
    for keyword in retail_filter.get("excludeStoreNameKeywords", []):
        if _normalize_for_match(keyword) and _normalize_for_match(keyword) in name:
            return {"isRetail": False, "retailReason": "", "categoryText": card.get("categoryText", "")}

    category_text = card.get("categoryText") or ""
    if category_text:
        return {"isRetail": True, "retailReason": f"カテゴリ:{category_text}", "categoryText": category_text}

    for keyword in retail_filter.get("storeNameKeywords", []):
        normalized_keyword = _normalize_for_match(keyword)
        if normalized_keyword and normalized_keyword in name:
            return {"isRetail": True, "retailReason": f"店名:{keyword}", "categoryText": ""}
    return {"isRetail": False, "retailReason": "", "categoryText": ""}


def annotate_food_ranks(ranked_results, retail_filter=None):
    """生順位付きリストへ、小売判定と実質順位（飲食のみの順位）を付与する。"""
    retail_filter = retail_filter or load_retail_filter()
    food_rank = 0
    for item in ranked_results:
        verdict = classify_store_card(item, retail_filter)
        item["isRetail"] = verdict["isRetail"]
        item["retailReason"] = verdict["retailReason"]
        if verdict["categoryText"]:
            item["categoryText"] = verdict["categoryText"]
        if verdict["isRetail"]:
            item["foodRank"] = None
        else:
            food_rank += 1
            item["foodRank"] = food_rank
    return ranked_results


def _load_ubereats_geocode_cache():
    try:
        with open(config.UBER_EATS_GEOCODE_CACHE_FILE, "r", encoding="utf-8") as cache_file:
            data = json.load(cache_file)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_ubereats_geocode_cache(cache):
    try:
        with open(config.UBER_EATS_GEOCODE_CACHE_FILE, "w", encoding="utf-8") as cache_file:
            json.dump(cache, cache_file, ensure_ascii=False, indent=2)
    except Exception:
        current_app.logger.exception("Uber Eats住所キャッシュの保存に失敗しました。")


def _geocode_address_details(address):
    if address in UBER_EATS_LOCATION_OVERRIDES:
        return UBER_EATS_LOCATION_OVERRIDES[address].copy()

    cache = _load_ubereats_geocode_cache()
    cached = cache.get(address)
    if isinstance(cached, dict) and {"address", "reference", "latitude", "longitude"}.issubset(cached):
        return cached.copy()

    if not config.GOOGLE_API_KEY:
        raise ValueError("Google APIキーが設定されていません。")

    geocode_url = (
        "https://maps.googleapis.com/maps/api/geocode/json?"
        + urllib.parse.urlencode({"address": address, "key": config.GOOGLE_API_KEY, "language": "ja"})
    )
    response = requests.get(geocode_url, timeout=15)
    response.raise_for_status()
    data = response.json()
    if data.get("status") != "OK" or not data.get("results"):
        raise ValueError(f"ジオコーディングに失敗しました: {data.get('error_message', data.get('status'))}")

    result = data["results"][0]
    location = result["geometry"]["location"]
    details = {
        "address": address,
        "formatted_address": result.get("formatted_address", address),
        "reference": result.get("place_id", ""),
        "latitude": location["lat"],
        "longitude": location["lng"],
    }
    cache[address] = details
    _save_ubereats_geocode_cache(cache)
    return details


def _build_ubereats_search_url(keyword, address_details):
    payload = {
        "address": address_details["address"],
        "reference": address_details["reference"],
        "referenceType": "google_places",
        "latitude": address_details["latitude"],
        "longitude": address_details["longitude"],
    }
    encoded_json = urllib.parse.quote(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
    pl = base64.b64encode(encoded_json.encode()).decode()
    return "https://www.ubereats.com/jp/search?" + urllib.parse.urlencode({"pl": pl, "q": keyword})


def _decode_location_payload_from_url(url):
    try:
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        pl = query.get("pl", [""])[0]
        if not pl:
            return {}
        decoded_json = urllib.parse.unquote(base64.b64decode(urllib.parse.unquote(pl)).decode())
        return json.loads(urllib.parse.unquote(decoded_json))
    except Exception:
        return {}


def _navigate_ubereats(driver, url, wait_seconds=2.5):
    """Uber Eatsは描画済みでもload完了を返さないことがあるため、timeoutは画面評価へ進める。"""
    try:
        driver.get(url)
        loaded = True
    except TimeoutException:
        loaded = False
        try:
            driver.execute_script("window.stop();")
        except Exception:
            pass
    if wait_seconds:
        time.sleep(wait_seconds)
    return loaded


def _current_location_label(driver):
    selectors = [
        '[data-testid="delivery-address-label"]',
        '[data-testid="edit-delivery-location-button"]',
    ]
    for selector in selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            texts = [" ".join((el.text or "").split()) for el in elements if el.is_displayed() and el.text]
            if texts:
                return " / ".join(texts[:2])
        except Exception:
            continue
    return ""


def _current_location_display(driver):
    label = _current_location_label(driver)
    if label:
        return label
    payload = _decode_location_payload_from_url(getattr(driver, "current_url", ""))
    return payload.get("address") or payload.get("formattedAddress") or ""


def _normalize_location_text(value):
    normalized = unicodedata.normalize("NFKC", value or "").lower()
    return re.sub(r"[\s　,、。・･|｜/／\\\-ー―:：()（）\[\]【】]+", "", normalized)


def _label_matches_address(label, address_details):
    normalized_label = _normalize_location_text(label)
    if not normalized_label:
        return False

    raw_candidates = [
        address_details.get("address", ""),
        address_details.get("formatted_address", ""),
    ]
    for raw in raw_candidates:
        normalized_raw = _normalize_location_text(raw)
        if normalized_raw and (normalized_raw in normalized_label or normalized_label in normalized_raw):
            return True

    ignored_terms = {
        _normalize_location_text(term)
        for term in ["日本", "岡山県", "岡山市", "岡山", "北区", "中区", "南区", "東区"]
    }
    terms = []
    for raw in raw_candidates:
        for token in re.split(r"[\s　,、。・･/／\\\-ー―:：()（）\[\]【】]+", raw):
            normalized_token = _normalize_location_text(token)
            if len(normalized_token) >= 2 and normalized_token not in ignored_terms:
                terms.append(normalized_token)

    if terms:
        return all(token in normalized_label for token in set(terms))

    return False


def _payload_matches_address(payload, address_details):
    if not payload:
        return False
    expected_ref = address_details.get("reference")
    if expected_ref and payload.get("reference") == expected_ref:
        return True
    try:
        lat_diff = abs(float(payload.get("latitude")) - float(address_details["latitude"]))
        lng_diff = abs(float(payload.get("longitude")) - float(address_details["longitude"]))
        return lat_diff < 0.001 and lng_diff < 0.001
    except Exception:
        return False


def _needs_delivery_address_input(driver):
    try:
        inputs = driver.find_elements(By.CSS_SELECTOR, 'input[placeholder*="お届け先"], input[placeholder*="住所"]')
        return any(el.is_displayed() for el in inputs)
    except Exception:
        return False


def _dismiss_ubereats_overlay(driver):
    try:
        driver.switch_to.active_element.send_keys(Keys.ESCAPE)
        time.sleep(0.5)
    except Exception:
        pass
    close_selectors = [
        '[data-testid="close-button"]',
        'button[aria-label*="閉じる"]',
        'button[aria-label*="Close"]',
    ]
    for selector in close_selectors:
        try:
            buttons = [el for el in driver.find_elements(By.CSS_SELECTOR, selector) if el.is_displayed() and el.is_enabled()]
            if buttons:
                _click_ubereats_option(driver, buttons[0])
                time.sleep(0.8)
                return True
        except Exception:
            continue
    return False


def _recover_location_with_url(driver, search_url, address_details):
    _dismiss_ubereats_overlay(driver)
    _navigate_ubereats(driver, search_url, wait_seconds=6.0)
    return _location_matches(driver, address_details)


def _wait_for_results_ready(driver, keyword, timeout_seconds=12):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if _is_ubereats_rate_limited(driver):
            return False
        if _is_ubereats_search_results_page(driver, keyword):
            stores = _extract_store_cards(getattr(driver, "page_source", ""))
            displayed_total = _extract_displayed_result_count(getattr(driver, "page_source", ""))
            if len(stores) >= 3 or displayed_total is not None:
                return True
        time.sleep(1.0)
    return _is_ubereats_search_results_page(driver, keyword)


def _location_matches(driver, address_details):
    label = _current_location_label(driver)
    if label and _label_matches_address(label, address_details):
        return True

    payload = _decode_location_payload_from_url(getattr(driver, "current_url", ""))
    if _payload_matches_address(payload, address_details):
        return True

    if label:
        return False

    if _needs_delivery_address_input(driver):
        return False

    return _payload_matches_address(payload, address_details)


def _blocked_location_result(driver, keyword, address, address_details, screenshot_path=None, save_screenshot=True):
    current_url = getattr(driver, "current_url", "")
    current_label = _current_location_display(driver)
    if save_screenshot and not screenshot_path:
        try:
            screenshot_path = _save_screenshot(driver, keyword, address)
        except Exception:
            screenshot_path = None

    expected = address_details.get("formatted_address") or address
    return {
        "final_result": {
            "rank": "要確認",
            "total_count": None,
            "screenshot_path": screenshot_path,
            "url": current_url,
            "html": getattr(driver, "page_source", ""),
            "results": [],
            "blocked": True,
            "blocked_reason": f"配達先を指定住所に変更できませんでした。期待地点: {expected} / 現在表示: {current_label or '不明'}",
        },
        "status": "Uber Eatsの配達先地点を確認できないため計測を中断しました。",
    }


def _save_screenshot(driver, keyword, address, ensure_top=True):
    if not os.path.exists(config.SCREENSHOT_DIR):
        os.makedirs(config.SCREENSHOT_DIR)

    timestamp = datetime.datetime.now().strftime("%y%m%d_%H%M%S")
    safe_keyword = re.sub(r'[\\/:*?"<>|]', "_", keyword)
    safe_address = re.sub(r'[\\/:*?"<>|]', "_", address)[:40]
    temp_png_path = os.path.join(config.SCREENSHOT_DIR, f"temp_ubereats_{timestamp}.png")
    jpeg_path = os.path.join(config.SCREENSHOT_DIR, f"{timestamp}_ubereats_{safe_address}_{safe_keyword}.jpg")

    if ensure_top:
        try:
            driver.execute_script("window.scrollTo(0, 0);")
            time.sleep(0.5)
        except Exception:
            pass

    captured_by_cdp = False
    try:
        driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
            "width": 1600,
            "height": 1100,
            "deviceScaleFactor": 1,
            "mobile": False,
        })
        screenshot = driver.execute_cdp_cmd("Page.captureScreenshot", {
            "format": "png",
            "fromSurface": True,
            "captureBeyondViewport": False,
        })
        with open(temp_png_path, "wb") as temp_file:
            temp_file.write(base64.b64decode(screenshot["data"]))
        captured_by_cdp = True
    except Exception:
        driver.save_screenshot(temp_png_path)
    finally:
        if captured_by_cdp:
            try:
                driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})
            except Exception:
                pass

    try:
        with Image.open(temp_png_path) as img:
            if img.mode == "RGBA":
                img = img.convert("RGB")
            img.save(jpeg_path, "jpeg", quality=config.SCREENSHOT_JPEG_QUALITY)
        return jpeg_path
    finally:
        if os.path.exists(temp_png_path):
            os.remove(temp_png_path)


def _try_set_delivery_address(driver, address, address_details=None):
    """Uber Eatsの住所入力UIが出た場合だけ、できる範囲で配達先を設定する。"""
    if not address:
        return False

    original_timeout = None
    try:
        original_timeout = driver.timeouts.page_load
        driver.set_page_load_timeout(15)
    except Exception:
        pass

    trigger_xpaths = [
        '//*[@data-testid="edit-delivery-location-button"]',
        '//button[contains(., "今すぐ")]',
        '//button[contains(., "配達先")]',
        '//button[contains(@aria-label, "配達")]',
        '//button[contains(@aria-label, "住所")]',
        '//a[contains(@aria-label, "配達先")]',
        '//*[@role="button" and contains(., "今すぐ")]',
    ]
    for xpath in trigger_xpaths:
        try:
            elements = driver.find_elements(By.XPATH, xpath)
            visible_triggers = [el for el in elements if el.is_displayed()]
            if visible_triggers:
                visible_triggers[0].click()
                _find_delivery_address_input(driver, wait_seconds=2)
                break
        except Exception:
            continue

    change_selectors = [
        '[data-testid="change-address-button"]',
        'a[href*="mod=locationManager"]',
    ]
    for selector in change_selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            visible_changes = [el for el in elements if el.is_displayed()]
            if visible_changes:
                href = visible_changes[-1].get_attribute("href")
                if href:
                    _navigate_ubereats(driver, href, wait_seconds=0)
                else:
                    visible_changes[-1].click()
                _find_delivery_address_input(driver, wait_seconds=4)
                break
        except Exception:
            continue

    if not _find_delivery_address_input(driver):
        try:
            _navigate_ubereats(driver, "https://www.ubereats.com/jp/feed?mod=locationManager", wait_seconds=0)
        except TimeoutException:
            pass
        except Exception:
            pass
        _find_delivery_address_input(driver, wait_seconds=5)

    selectors = [
        'input[data-testid="location-typeahead-input"]',
        'input[placeholder*="お届け先"]',
        'input[placeholder*="住所"]',
        'input[placeholder*="配達"]',
        'input[placeholder*="番地"]',
        'input[placeholder*="所在地"]',
        'input[aria-label*="住所"]',
        'input[aria-label*="配達"]',
        'input[data-testid*="address"]',
    ]
    for field in _find_delivery_address_input(driver, selectors=selectors, wait_seconds=10):
        placeholder = field.get_attribute("placeholder") or ""
        aria_label = field.get_attribute("aria-label") or ""
        data_testid = field.get_attribute("data-testid") or ""
        if any(word in f"{placeholder} {aria_label} {data_testid}" for word in ["検索", "search"]):
            continue
        field.click()
        _set_input_value(driver, field, address)
        time.sleep(1.0)
        if not _select_delivery_address_suggestion(driver, address):
            if _confirm_address_with_keyboard(driver, field, address_details):
                try:
                    if original_timeout is not None:
                        driver.set_page_load_timeout(original_timeout)
                except Exception:
                    pass
                return True
            if address_details and _location_matches(driver, address_details):
                try:
                    if original_timeout is not None:
                        driver.set_page_load_timeout(original_timeout)
                except Exception:
                    pass
                return True
            try:
                if original_timeout is not None:
                    driver.set_page_load_timeout(original_timeout)
            except Exception:
                pass
            return False
        time.sleep(0.8)
        if address_details and _location_matches(driver, address_details):
            try:
                if original_timeout is not None:
                    driver.set_page_load_timeout(original_timeout)
            except Exception:
                pass
            return True
        _click_find_food_button(driver)
        time.sleep(1.5)
        if address_details and _location_matches(driver, address_details):
            try:
                if original_timeout is not None:
                    driver.set_page_load_timeout(original_timeout)
            except Exception:
                pass
            return True
        try:
            if original_timeout is not None:
                driver.set_page_load_timeout(original_timeout)
        except Exception:
            pass
        if address_details:
            return False
        return not _needs_delivery_address_input(driver)
    try:
        if original_timeout is not None:
            driver.set_page_load_timeout(original_timeout)
    except Exception:
        pass
    return False


def _set_input_value(driver, field, value):
    try:
        driver.execute_script(
            """
            const input = arguments[0];
            const value = arguments[1];
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            """,
            field,
            value,
        )
    except Exception:
        field.send_keys(Keys.COMMAND, "a")
        field.send_keys(Keys.BACKSPACE)
        field.send_keys(value)


def _find_delivery_address_input(driver, selectors=None, wait_seconds=0):
    selectors = selectors or [
        'input[data-testid="location-typeahead-input"]',
        'input[placeholder*="お届け先"]',
        'input[placeholder*="住所"]',
        'input[placeholder*="配達"]',
        'input[placeholder*="番地"]',
        'input[placeholder*="所在地"]',
        'input[aria-label*="住所"]',
        'input[aria-label*="配達"]',
        'input[data-testid*="address"]',
    ]
    deadline = time.time() + wait_seconds
    while True:
        found = []
        for selector in selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                for element in elements:
                    if element.is_displayed():
                        found.append(element)
            except Exception:
                continue
        if found or time.time() >= deadline:
            return found
        time.sleep(0.5)


def _element_visible_text(driver, element):
    text = ""
    try:
        text = element.text or ""
    except Exception:
        text = ""
    if not text:
        try:
            text = driver.execute_script(
                "return arguments[0].innerText || arguments[0].textContent || arguments[0].getAttribute('aria-label') || '';",
                element,
            ) or ""
        except Exception:
            text = ""
    return " ".join(text.split())


def _confirm_address_with_keyboard(driver, field, address_details=None):
    try:
        field.click()
        field.send_keys(Keys.ARROW_DOWN)
        time.sleep(0.2)
        field.send_keys(Keys.ENTER)
        time.sleep(2.0)
        if address_details and _location_matches(driver, address_details):
            return True
        if address_details:
            return False
        if not _needs_delivery_address_input(driver):
            return True
    except Exception:
        pass
    return False


def _select_delivery_address_suggestion(driver, address):
    normalized_address = _normalize_location_text(address)
    tokens = _address_match_tokens(address)
    token = _normalize_location_text(address[-4:] if len(address) >= 4 else address)
    option_selectors = [
        '[role="option"]',
        'li',
        '[data-testid*="address"]',
        'button',
    ]
    deadline = time.time() + 5
    best_candidate = None
    best_score = 0
    while time.time() < deadline:
        visible_options = []
        for selector in option_selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                visible_options.extend((selector, el) for el in elements if el.is_displayed())
            except Exception:
                continue

        for selector, element in visible_options:
            text = _element_visible_text(driver, element)
            if not text or "見つかりませんでした" in text:
                continue
            normalized_text = _normalize_location_text(text)
            matches_exact = normalized_address and normalized_address in normalized_text
            matches_token = token and token in normalized_text
            matches_all_tokens = tokens and all(item in normalized_text for item in tokens)
            score = 20 if matches_exact else 0
            if matches_token:
                score += 8
            for item in tokens:
                if item in normalized_text:
                    score += 6
            if matches_exact or matches_token or matches_all_tokens:
                _click_ubereats_option(driver, element)
                time.sleep(2.0)
                return True
            if selector == '[role="option"]' and score > best_score:
                best_candidate = element
                best_score = score

        if best_candidate and best_score >= 6:
            _click_ubereats_option(driver, best_candidate)
            time.sleep(2.0)
            return True

        time.sleep(0.5)
    return False


def _address_match_tokens(address):
    normalized = _normalize_location_text(address)
    normalized = normalized.replace("本店", "").replace("店", "")
    ignored_terms = {
        _normalize_location_text(term)
        for term in ["日本", "岡山県", "岡山市", "岡山", "北区", "中区", "南区", "東区"]
    }
    raw_tokens = re.split(r"[\s　,、。・･/／\\\-ー―:：()（）\[\]【】]+", address)
    tokens = []
    for raw in raw_tokens:
        token = _normalize_location_text(raw).replace("本店", "").replace("店", "")
        if len(token) >= 2 and token not in ignored_terms:
            tokens.append(token)
    if "天満屋" in normalized:
        tokens.append("天満屋")
    if normalized.endswith("駅") and len(normalized) >= 3:
        tokens.append(normalized)
    return list(dict.fromkeys(tokens))


def _click_ubereats_option(driver, element):
    try:
        driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'center'});", element)
        time.sleep(0.2)
    except Exception:
        pass
    try:
        ActionChains(driver).move_to_element(element).pause(0.1).click().perform()
        time.sleep(0.4)
    except Exception:
        pass
    try:
        rect = driver.execute_script(
            """
            const r = arguments[0].getBoundingClientRect();
            return {x: r.left + r.width / 2, y: r.top + r.height / 2};
            """,
            element,
        )
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
            "type": "mouseMoved",
            "x": rect["x"],
            "y": rect["y"],
            "button": "none",
        })
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
            "type": "mousePressed",
            "x": rect["x"],
            "y": rect["y"],
            "button": "left",
            "clickCount": 1,
        })
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
            "type": "mouseReleased",
            "x": rect["x"],
            "y": rect["y"],
            "button": "left",
            "clickCount": 1,
        })
        time.sleep(0.4)
    except Exception:
        pass
    try:
        driver.execute_script(
            """
            const el = arguments[0];
            const target = el.querySelector('div:last-child') || el;
            for (const node of [target, el]) {
                for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                    const EventClass = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
                    node.dispatchEvent(new EventClass(type, {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        button: 0,
                        buttons: type.includes('down') ? 1 : 0
                    }));
                }
                node.click();
            }
            """,
            element,
        )
    except Exception:
        pass
    try:
        element.click()
    except Exception:
        pass


def _click_find_food_button(driver):
    button_selectors = [
        '[data-testid="done-button"]',
        'button[data-testid="done-button"]',
        '[data-testid="save-address-button"]',
    ]
    for selector in button_selectors:
        try:
            buttons = [el for el in driver.find_elements(By.CSS_SELECTOR, selector) if el.is_displayed() and el.is_enabled()]
            if buttons:
                _click_ubereats_option(driver, buttons[0])
                return True
        except Exception:
            continue

    button_xpaths = [
        '//button[contains(., "フードを探す")]',
        '//button[contains(., "検索")]',
        '//button[contains(., "完了")]',
        '//button[contains(., "保存")]',
    ]
    for xpath in button_xpaths:
        try:
            buttons = [el for el in driver.find_elements(By.XPATH, xpath) if el.is_displayed() and el.is_enabled()]
            if buttons:
                _click_ubereats_option(driver, buttons[0])
                return True
        except Exception:
            continue
    return False


def _extract_store_cards(html):
    soup = BeautifulSoup(html, "lxml")
    candidates = []
    seen_names = set()

    for link in soup.select('[data-testid="store-card"] a[href], a[data-testid="store-card"][href], a[href^="/jp/store/"], a[href^="/store/"]'):
        href = link.get("href", "")
        parsed_href = urllib.parse.urlparse(href)
        if parsed_href.netloc and not parsed_href.netloc.endswith("ubereats.com"):
            continue
        if not (parsed_href.path.startswith("/jp/store/") or parsed_href.path.startswith("/store/")):
            continue

        text = " ".join(link.get_text(" ", strip=True).split())
        if not text:
            continue

        parts = [part.strip() for part in re.split(r"\s{2,}| • | · ", text) if part.strip()]
        name = parts[0] if parts else text
        if len(name) < 2 or name in seen_names or name in {"Android", "iPhone", "iPad"}:
            continue

        detail_text = _extract_ubereats_meta_text(text)
        seen_names.add(name)
        candidates.append({
            "foundStoreName": name,
            "detailText": detail_text,
            "categoryText": detect_retail_category(text),
            "url": urllib.parse.urljoin("https://www.ubereats.com", href),
        })

        if len(candidates) >= config.UBER_EATS_MAX_RESULTS:
            break

    return candidates


def _extract_ubereats_meta_text(text):
    normalized = " ".join((text or "").split())
    if not normalized:
        return ""

    rating_match = re.search(
        r"(?<!\d)([3-5]\.\d)\s*[★☆⭐]?\s*(?:\(\s*([\d,]+\+?)\s*\)|([\d,]+\+))?",
        normalized,
    )
    if rating_match:
        rating = rating_match.group(1)
        review_count = rating_match.group(2) or rating_match.group(3) or ""
        time_match = re.search(r"\d+\s*分", normalized)
        reviews = f"({review_count})" if review_count else ""
        delivery_time = re.sub(r"\s+", "", time_match.group(0)) if time_match else ""
        return f"{rating}★{reviews}{delivery_time}"

    patterns = [
        r"\d(?:\.\d)?\s*[★☆⭐]\s*(?:\(?\s*\d+\s*\)?\s*)?\d+\s*分",
        r"\d(?:\.\d)?\s*[★☆⭐]\s*\(?\s*\d+\s*\)?",
        r"(?<!\d)[3-5]\.\d\s*(?:\(?\s*\d+\+?\s*\)?\s*)?\d+\s*分",
        r"(?<!\d)[3-5]\.\d\s*\(?\s*\d+\+?\s*\)?",
        r"\d+\s*分",
    ]
    for pattern in patterns:
        match = re.search(pattern, normalized)
        if match:
            meta = re.sub(r"\s+", "", match.group(0)).replace(")(", ") ")
            if not re.search(r"[★☆⭐]", meta):
                meta = re.sub(r"^([3-5]\.\d)", r"\1★", meta)
            return meta
    return ""


def _store_card_from_text_and_href(text, href, name_text=None):
    parsed_href = urllib.parse.urlparse(href or "")
    if parsed_href.netloc and not parsed_href.netloc.endswith("ubereats.com"):
        return None
    if not (parsed_href.path.startswith("/jp/store/") or parsed_href.path.startswith("/store/")):
        return None

    text = " ".join((text or "").split())
    name_text = " ".join((name_text or "").split())
    if not text:
        return None

    source_for_name = name_text or text
    source_for_name = re.split(r"\d(?:\.\d)?\s*[★☆⭐]|\d+\s*分", source_for_name, maxsplit=1)[0].strip()
    parts = [part.strip() for part in re.split(r"\s{2,}| • | · ", source_for_name) if part.strip()]
    name = parts[0] if parts else text
    if len(name) < 2 or name in {"Android", "iPhone", "iPad"}:
        return None

    detail_text = _extract_ubereats_meta_text(text)
    return {
        "foundStoreName": name,
        "detailText": detail_text,
        # カテゴリ表記は結果カードに出ないことが多い（2026-09-06実測）。取れた時だけ入る。
        "categoryText": detect_retail_category(text),
        "url": urllib.parse.urljoin("https://www.ubereats.com", href),
    }


def _extract_visible_store_cards(driver):
    """画面上の見た目どおり、表示中カードを上→下・左→右で抽出する。"""
    try:
        raw_cards = driver.execute_script(
            """
            const selectors = [
              '[data-testid="store-card"] a[href]',
              'a[data-testid="store-card"][href]',
              'a[href^="/jp/store/"]',
              'a[href^="/store/"]'
            ];
            const seen = new Set();
            const cards = [];
            for (const el of document.querySelectorAll(selectors.join(','))) {
              const href = el.getAttribute('href') || '';
              if (seen.has(href)) continue;
              seen.add(href);
              const rect = el.getBoundingClientRect();
              if (rect.width < 80 || rect.height < 60) continue;
              if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
              const style = window.getComputedStyle(el);
              if (style.visibility === 'hidden' || style.display === 'none') continue;
              const anchorText = (el.innerText || el.textContent || '').trim();
              const ratingRe = /\\d(?:\\.\\d)?\\s*[★☆⭐]|(^|\\D)[3-5]\\.\\d(\\D|$)/;
              const timeRe = /\\d+\\s*分/;
              const visibleTextNear = (box) => {
                const right = box.right + 8;
                const bottom = Math.min(window.innerHeight, box.bottom + 120);
                const pieces = [];
                const nodes = document.querySelectorAll('span, div, p, [aria-label], [title], img[alt]');
                for (const node of nodes) {
                  const nodeRect = node.getBoundingClientRect();
                  if (nodeRect.width <= 0 || nodeRect.height <= 0) continue;
                  const centerX = nodeRect.left + nodeRect.width / 2;
                  const centerY = nodeRect.top + nodeRect.height / 2;
                  if (centerX < box.left - 8 || centerX > right || centerY < box.top - 8 || centerY > bottom) continue;
                  const nodeStyle = window.getComputedStyle(node);
                  if (nodeStyle.visibility === 'hidden' || nodeStyle.display === 'none') continue;
                  const text = [
                    node.innerText || node.textContent || '',
                    node.getAttribute('aria-label') || '',
                    node.getAttribute('title') || '',
                    node.getAttribute('alt') || ''
                  ].join(' ').trim();
                  if (text && text.length <= 220) pieces.push(text);
                }
                return pieces.join(' ');
              };
              let bestText = anchorText;
              let timeOnlyText = '';
              for (let parent = el; parent && parent !== document.body; parent = parent.parentElement) {
                const attrText = Array.from(parent.querySelectorAll('[aria-label], [title], img[alt]'))
                  .map(node => node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('alt') || '')
                  .filter(Boolean)
                  .join(' ');
                const parentText = `${parent.innerText || parent.textContent || ''} ${attrText}`.trim();
                if (!parentText || parentText.length > 500) continue;
                if (anchorText && !parentText.includes(anchorText.slice(0, Math.min(anchorText.length, 8)))) continue;
                if (ratingRe.test(parentText)) {
                  bestText = parentText;
                  break;
                }
                if (!timeOnlyText && timeRe.test(parentText)) timeOnlyText = parentText;
                if (!bestText) bestText = parentText;
              }
              const nearbyText = `${anchorText} ${visibleTextNear(rect)}`.trim();
              if (ratingRe.test(nearbyText)) {
                bestText = nearbyText;
              } else if (!timeOnlyText && timeRe.test(nearbyText)) {
                timeOnlyText = nearbyText;
              }
              if (ratingRe.test(bestText) && timeOnlyText && !timeRe.test(bestText)) {
                bestText = `${bestText} ${timeOnlyText}`;
              }
              if (!ratingRe.test(bestText) && timeOnlyText) bestText = timeOnlyText;
              cards.push({
                href,
                nameText: anchorText,
                text: bestText,
                top: rect.top,
                left: rect.left
              });
            }
            cards.sort((a, b) => (a.top - b.top) || (a.left - b.left));
            return cards;
            """
        )
    except Exception:
        return []

    cards = []
    seen_names = set()
    for raw in raw_cards or []:
        card = _store_card_from_text_and_href(raw.get("text"), raw.get("href"), raw.get("nameText"))
        if not card or card["foundStoreName"] in seen_names:
            continue
        seen_names.add(card["foundStoreName"])
        cards.append(card)
    return cards


def _collect_store_cards_by_visual_order(driver):
    """スクロールしながら、実際の表示順で店舗カードを集める。"""
    collected = []
    seen_keys = set()
    stagnant_scrolls = 0

    try:
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(1.0)
    except Exception:
        pass

    for _ in range(12):
        before_count = len(collected)
        for card in _extract_visible_store_cards(driver):
            key = card.get("url") or card.get("foundStoreName")
            if key in seen_keys:
                continue
            seen_keys.add(key)
            collected.append(card)
            if len(collected) >= config.UBER_EATS_MAX_RESULTS:
                return collected

        if len(collected) == before_count:
            stagnant_scrolls += 1
        else:
            stagnant_scrolls = 0

        try:
            metrics = driver.execute_script(
                """
                const y = window.scrollY || document.documentElement.scrollTop || 0;
                const maxY = Math.max(
                  document.body.scrollHeight,
                  document.documentElement.scrollHeight
                ) - window.innerHeight;
                window.scrollBy(0, Math.max(320, window.innerHeight * 0.82));
                return { y, maxY };
                """
            ) or {}
        except Exception:
            break

        time.sleep(0.8)
        if metrics.get("y", 0) >= metrics.get("maxY", 0) - 5 and stagnant_scrolls >= 1:
            break
        if stagnant_scrolls >= 3:
            break

    return collected


def _extract_displayed_result_count(html):
    text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    patterns = [
        r"[“\"]?[^“”\"]+[”\"]?\s*の検索結果\s*([0-9,]+)\s*results",
        r"検索結果\s*([0-9,]+)\s*results",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                return int(match.group(1).replace(",", ""))
            except Exception:
                return None
    return None


def _is_ubereats_search_results_page(driver, keyword):
    current_url = getattr(driver, "current_url", "")
    page_source = getattr(driver, "page_source", "")
    parsed_url = urllib.parse.urlparse(current_url)
    if not parsed_url.netloc.endswith("ubereats.com"):
        return False
    if "/search" not in parsed_url.path:
        return False

    if "検索結果" in page_source or f"“{keyword}”" in page_source:
        return True
    return bool(driver.find_elements(By.CSS_SELECTOR, '[data-testid="store-card"], a[href^="/jp/store/"], a[href^="/store/"]'))


def _blocked_page_result(driver, keyword, address, screenshot_path=None, save_screenshot=True):
    current_url = getattr(driver, "current_url", "")
    if save_screenshot and not screenshot_path:
        try:
            screenshot_path = _save_screenshot(driver, keyword, address)
        except Exception:
            screenshot_path = None
    return {
        "final_result": {
            "rank": "要確認",
            "total_count": None,
            "screenshot_path": screenshot_path,
            "url": current_url,
            "html": getattr(driver, "page_source", ""),
            "results": [],
            "blocked": True,
            "blocked_reason": f"Uber Eats検索結果ページに到達できませんでした。現在URL: {current_url}",
        },
        "status": "Uber Eats検索結果ページではないため計測を中断しました。",
    }


def _is_ubereats_rate_limited(driver):
    current_url = getattr(driver, "current_url", "")
    page_source = getattr(driver, "page_source", "")
    markers = [
        "bd.error.too_many_requests",
        "too_many_requests",
        "Too Many Requests",
    ]
    return "ubereats.com" in current_url and any(marker in page_source for marker in markers)


def _rate_limited_result(driver, keyword, address, screenshot_path=None, save_screenshot=True):
    if save_screenshot and not screenshot_path:
        try:
            screenshot_path = _save_screenshot(driver, keyword, address)
        except Exception:
            screenshot_path = None
    return {
        "final_result": {
            "rank": "要確認",
            "total_count": None,
            "screenshot_path": screenshot_path,
            "url": getattr(driver, "current_url", ""),
            "html": getattr(driver, "page_source", ""),
            "results": [],
            "blocked": True,
            "stop_batch": True,
            "blocked_reason": "Uber Eats側のアクセス制限（too_many_requests）により検索結果を取得できませんでした。時間を空けて再実行してください。",
        },
        "status": "Uber Eatsのアクセス制限により計測を中断しました。",
    }


def _incomplete_results(driver, keyword, address, stores, screenshot_path=None, save_screenshot=True):
    if save_screenshot and not screenshot_path:
        try:
            screenshot_path = _save_screenshot(driver, keyword, address)
        except Exception:
            screenshot_path = None
    return {
        "final_result": {
            "rank": "要確認",
            "total_count": len(stores),
            "screenshot_path": screenshot_path,
            "url": getattr(driver, "current_url", ""),
            "html": getattr(driver, "page_source", ""),
            "results": stores,
            "blocked": True,
            "stop_batch": True,
            "blocked_reason": f"検索結果の読み込みが不完全です（取得店舗数: {len(stores)}件）。Uber Eats側の制限または一時的な読み込み失敗の可能性があるため、時間を空けて再実行してください。",
        },
        "status": "Uber Eats検索結果の読み込みが不完全なため計測を中断しました。",
    }


def _is_security_challenge(driver):
    current_url = getattr(driver, "current_url", "")
    page_source = getattr(driver, "page_source", "")
    parsed_url = urllib.parse.urlparse(current_url)
    hostname = parsed_url.netloc.lower()
    path = parsed_url.path

    # Uber Eatsの通常ページや検索結果まで戻れているなら、ページ内に防御系の
    # スクリプト文字列が残っていても検証完了として扱う。
    if hostname.endswith("ubereats.com") and ("/search" in path or "検索結果" in page_source or "/store/" in page_source):
        return False

    if hostname == "def.uber.com" or "/challenge" in path:
        return True

    challenge_text_markers = [
        "自動セキュリティチェックが完了するまで",
        "まもなく完了です",
        "画像あわせ",
        "セキュリティ検証",
    ]
    return any(marker in page_source for marker in challenge_text_markers)


def _wait_for_security_challenge(driver):
    """表示ブラウザでユーザーがセキュリティ確認を完了するのを待つ。"""
    if not _is_security_challenge(driver):
        return False

    started_at = time.time()
    while time.time() - started_at < config.UBER_EATS_CHALLENGE_WAIT_SECONDS:
        remaining = int(config.UBER_EATS_CHALLENGE_WAIT_SECONDS - (time.time() - started_at))
        yield sse_format({
            "status": f"Uber Eatsのセキュリティ確認が表示されています。開いているChromeで確認を完了してください。残り約{remaining}秒"
        })
        time.sleep(5)
        if not _is_security_challenge(driver):
            yield sse_format({"status": "セキュリティ確認が完了しました。計測を再開します..."})
            return True

    yield sse_format({"status": "セキュリティ確認の待機時間を超過しました。"})
    return False


def check_ubereats_ranking(driver, keyword, store_name, address, save_screenshot=True):
    """Uber Eatsの検索結果で店舗の表示順位を取得するジェネレータ関数。"""
    last_url = ""
    screenshot_path = None
    try:
        yield sse_format({"status": "配達先住所をジオコーディングしています..."})
        address_details = _geocode_address_details(address)
        search_url = _build_ubereats_search_url(keyword, address_details)
        session_search_url = "https://www.ubereats.com/jp/search?" + urllib.parse.urlencode({"q": keyword})

        yield sse_format({"status": "Uber Eatsを開いています..."})
        _navigate_ubereats(driver, search_url)
        if _is_ubereats_rate_limited(driver):
            yield sse_format(_rate_limited_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
            return

        if _is_security_challenge(driver):
            challenge_cleared = False
            wait_generator = _wait_for_security_challenge(driver)
            while True:
                try:
                    wait_message = next(wait_generator)
                    yield wait_message
                except StopIteration as stop:
                    challenge_cleared = bool(stop.value)
                    break
            last_url = driver.current_url
            if not challenge_cleared:
                if save_screenshot:
                    screenshot_path = _save_screenshot(driver, keyword, address)
                yield sse_format({
                    "final_result": {
                        "rank": "要確認",
                        "total_count": None,
                        "screenshot_path": screenshot_path,
                        "url": last_url,
                        "html": driver.page_source,
                        "results": [],
                        "blocked": True,
                        "blocked_reason": "Uber Eatsの自動セキュリティチェックが時間内に完了しませんでした。",
                    },
                    "status": "Uber Eatsの自動セキュリティチェックにより計測を中断しました。",
                })
                return
            yield sse_format({"status": "セキュリティ確認後のページから検索に戻ります..."})
            _navigate_ubereats(driver, search_url)
            if _is_ubereats_rate_limited(driver):
                yield sse_format(_rate_limited_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
                return

        if not _location_matches(driver, address_details):
            yield sse_format({"status": "URL指定で配達先が反映されないため、住所入力UIを試します..."})
            address_set = _try_set_delivery_address(driver, address, address_details)
            if address_set:
                time.sleep(2.0)
                _navigate_ubereats(driver, session_search_url)
                if _is_ubereats_rate_limited(driver):
                    yield sse_format(_rate_limited_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
                    return

        last_url = driver.current_url
        if _location_matches(driver, address_details):
            yield sse_format({"status": f"配達先住所を確認しました: {address}"})
        elif _recover_location_with_url(driver, search_url, address_details):
            yield sse_format({"status": f"配達先住所をURL指定で再確認しました: {address}"})
        else:
            yield sse_format(_blocked_location_result(driver, keyword, address, address_details, screenshot_path, save_screenshot=save_screenshot))
            return

        if _wait_for_results_ready(driver, keyword):
            yield sse_format({"status": f"「{keyword}」の検索結果ページを確認しました。"})
        else:
            yield sse_format({"status": f"「{keyword}」を検索しています..."})
            _navigate_ubereats(driver, session_search_url)
            if _is_ubereats_rate_limited(driver):
                yield sse_format(_rate_limited_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
                return
            _wait_for_results_ready(driver, keyword)
        last_url = driver.current_url

        if not _location_matches(driver, address_details):
            if _recover_location_with_url(driver, search_url, address_details):
                yield sse_format({"status": f"配達先住所を再設定しました: {address}"})
            else:
                yield sse_format(_blocked_location_result(driver, keyword, address, address_details, screenshot_path, save_screenshot=save_screenshot))
                return

        if not _is_ubereats_search_results_page(driver, keyword):
            retry_url = "https://www.ubereats.com/jp/search?" + urllib.parse.urlencode({"q": keyword})
            yield sse_format({"status": "Uber Eats検索結果ページへ再遷移しています..."})
            _navigate_ubereats(driver, retry_url)
            if _is_ubereats_rate_limited(driver):
                yield sse_format(_rate_limited_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
                return
            _wait_for_results_ready(driver, keyword)
            last_url = driver.current_url
            if not _is_ubereats_search_results_page(driver, keyword):
                yield sse_format(_blocked_page_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
                return

        if _is_security_challenge(driver):
            challenge_cleared = False
            wait_generator = _wait_for_security_challenge(driver)
            while True:
                try:
                    wait_message = next(wait_generator)
                    yield wait_message
                except StopIteration as stop:
                    challenge_cleared = bool(stop.value)
                    break
            last_url = driver.current_url
            if not challenge_cleared:
                if save_screenshot:
                    screenshot_path = _save_screenshot(driver, keyword, address)
                yield sse_format({
                    "final_result": {
                        "rank": "要確認",
                        "total_count": None,
                        "screenshot_path": screenshot_path,
                        "url": last_url,
                        "html": driver.page_source,
                        "results": [],
                        "blocked": True,
                        "blocked_reason": "Uber Eatsの自動セキュリティチェックが時間内に完了しませんでした。",
                    },
                    "status": "Uber Eatsの自動セキュリティチェックにより計測を中断しました。",
                })
                return
            yield sse_format({"status": "セキュリティ確認後のページから検索に戻ります..."})
            _navigate_ubereats(driver, search_url)
            last_url = driver.current_url
            if not _is_ubereats_search_results_page(driver, keyword):
                yield sse_format(_blocked_page_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
                return

        if save_screenshot:
            yield sse_format({"status": "スクリーンショットを撮影しています..."})
            screenshot_path = _save_screenshot(driver, keyword, address, ensure_top=False)

        yield sse_format({"status": "検索結果を画面表示順で読み込んでいます..."})
        stores = _collect_store_cards_by_visual_order(driver)

        yield sse_format({"status": "検索結果を解析しています..."})
        if _is_security_challenge(driver):
            yield sse_format({
                "final_result": {
                    "rank": "要確認",
                    "total_count": None,
                    "screenshot_path": screenshot_path,
                    "url": last_url,
                    "html": driver.page_source,
                    "results": [],
                    "blocked": True,
                    "blocked_reason": "Uber Eatsの自動セキュリティチェック画面に遷移しました。",
                },
                "status": "Uber Eatsの自動セキュリティチェックにより計測を中断しました。",
            })
            return

        if _is_ubereats_rate_limited(driver):
            yield sse_format(_rate_limited_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
            return

        displayed_total = _extract_displayed_result_count(driver.page_source)
        if displayed_total and len(stores) > displayed_total:
            stores = stores[:displayed_total]
        if 0 < len(stores) <= 2 and (displayed_total is None or displayed_total > len(stores)):
            yield sse_format(_incomplete_results(driver, keyword, address, stores, screenshot_path, save_screenshot=save_screenshot))
            return
        if not stores and not _is_ubereats_search_results_page(driver, keyword):
            yield sse_format(_blocked_page_result(driver, keyword, address, screenshot_path, save_screenshot=save_screenshot))
            return

        ranked_results = []
        for index, store in enumerate(stores, start=1):
            ranked = {"rank": index, **store}
            ranked_results.append(ranked)
        annotate_food_ranks(ranked_results)
        retail_count = sum(1 for item in ranked_results if item.get("isRetail"))
        food_total_count = len(ranked_results) - retail_count

        matched = None
        normalized_target = store_name.lower()
        for result in ranked_results:
            if normalized_target and normalized_target in result["foundStoreName"].lower():
                matched = result
                break

        final_result = {
            "total_count": displayed_total if displayed_total is not None else len(ranked_results),
            "retail_count": retail_count,
            "food_total_count": food_total_count,
            "screenshot_path": screenshot_path,
            "url": last_url,
            "html": driver.page_source,
            "results": ranked_results,
            "list_fetched": True, # 検索結果ページを読み切った
        }
        if matched:
            final_result["rank"] = matched["rank"]
            # 実質順位＝小売店を除いた飲食店内の順位。自店が小売判定になった場合は付けない。
            final_result["food_rank"] = matched.get("foodRank") if matched.get("foodRank") else "圏外"
        else:
            final_result["rank"] = "圏外"
            final_result["food_rank"] = "圏外"

        yield sse_format({"final_result": final_result, "status": "完了"})
    except Exception as e:
        current_app.logger.exception("Uber Eats計測中にエラーが発生しました。")
        yield sse_format({
            "error": f"Uber Eats計測中にエラーが発生しました: {e}",
            "url": last_url or getattr(driver, "current_url", ""),
            "html": getattr(driver, "page_source", ""),
            "screenshot_path": screenshot_path,
        })
