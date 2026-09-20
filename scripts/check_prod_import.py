#!/usr/bin/env python3
"""本番（Render）相当での `import app` スモークチェック。

目的＝「ローカルにしか無いもの」に依存したままpushして起動時ImportErrorで落ちる事故を断つ。

やること:
  1. requirements.txt に載っているパッケージ（が提供するトップレベルモジュール）と
     標準ライブラリ・リポジトリ内の自作モジュールだけを import 可能にする。
     それ以外の site-packages のモジュールは ImportError にする（＝Renderには無い）。
  2. Mac固有パス（live_reload の共通部品ディレクトリ）を実在しないパスに差し替える。
  3. その状態で `import app` を実行し、成功すれば exit 0。

使い方: python3 scripts/check_prod_import.py
"""
from __future__ import annotations

import os
import re
import sys
import sysconfig
from importlib.machinery import PathFinder
from importlib.metadata import PackageNotFoundError, distribution
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def allowed_top_levels() -> set[str]:
    """requirements.txt のパッケージ＋その依存（pipが一緒に入れるもの）のトップレベル名。"""
    allowed = {"_distutils_hack", "pkg_resources", "setuptools", "wheel", "pip"}
    req = REPO / "requirements.txt"
    queue = []
    for line in req.read_text(encoding="utf-8").splitlines():
        name = re.split(r"[<>=!~;,\[ ]", line.strip(), 1)[0]
        if name and not name.startswith("#"):
            queue.append(name)

    done: set[str] = set()
    while queue:
        name = queue.pop()
        key = name.replace("-", "_").lower()
        if key in done:
            continue
        done.add(key)
        allowed.add(key)
        try:
            dist = distribution(name)
        except PackageNotFoundError:
            print(f"[warn] requirements にあるがローカル未インストール: {name}")
            continue
        tl = dist.read_text("top_level.txt")
        if tl:
            allowed.update(t.strip().lower() for t in tl.splitlines() if t.strip())
        for f in dist.files or []:
            parts = f.parts
            if parts and parts[0] not in ("..", "__pycache__") and not parts[0].endswith(
                (".dist-info", ".egg-info")
            ):
                allowed.add(parts[0].split(".")[0].lower())
        for dep in dist.requires or []:
            # 例: "werkzeug>=3.0.0" / "pytest; extra == 'test'"（extra依存は入らないので除外）
            if ";" in dep and "extra" in dep.split(";", 1)[1]:
                continue
            dep_name = re.split(r"[<>=!~;,\[ (]", dep.strip(), 1)[0]
            if dep_name:
                queue.append(dep_name)
    return allowed


class ProdOnlyFinder(PathFinder):
    """requirements 外の外部パッケージを「Renderには無い」として拒否する。"""

    def __init__(self, allowed: set[str]) -> None:
        self.allowed = allowed
        self.stdlib = {
            Path(sysconfig.get_paths()[k]).resolve()
            for k in ("stdlib", "platstdlib")
            if sysconfig.get_paths().get(k)
        }

    def find_spec(self, fullname, path=None, target=None):  # type: ignore[override]
        if "." in fullname:
            return None
        spec = super().find_spec(fullname, path, target)
        if spec is None or not spec.origin or spec.origin == "built-in":
            return spec
        origin = Path(spec.origin).resolve()
        if origin.parent == REPO or REPO in origin.parents:
            return spec  # リポジトリ内の自作モジュール
        in_site = any(
            p.name in ("site-packages", "dist-packages") for p in origin.parents
        )
        if not in_site and any(
            s == origin.parent or s in origin.parents for s in self.stdlib
        ):
            return spec  # 標準ライブラリ（site-packages配下は除く）
        if fullname.lower() in self.allowed:
            return spec  # requirements 由来
        raise ImportError(
            f"'{fullname}' は requirements.txt に無く、本番(Render)には存在しません "
            f"(実体: {origin})"
        )


def main() -> int:
    allowed = allowed_top_levels()
    # Mac固有パスを無効化（存在しないパスを渡す）
    os.environ["LIVE_RELOAD_COMMON_DIR"] = "/nonexistent/prod-smoke-check"
    sys.path.insert(0, str(REPO))
    sys.meta_path.insert(0, ProdOnlyFinder(allowed))
    try:
        import app  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        print(f"NG: 本番相当の環境で `import app` に失敗しました\n  {type(exc).__name__}: {exc}")
        return 1
    print("OK: 本番相当（requirements.txt のみ / Mac固有パス無効）で `import app` 成功")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
