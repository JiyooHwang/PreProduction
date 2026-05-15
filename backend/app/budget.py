"""예산 계산 + 제안 로직.

사용자가 입력한 등급별 단가와 시나리오 분석 결과로 자동 비용을 계산하고,
예산 대비 차이를 분석해 제안을 만든다.
"""
from __future__ import annotations

from typing import Optional


ASSET_TYPES = ("characters", "locations", "props", "fx")
GRADES = ("S", "AA", "A", "C")


def aggregate_project_assets(shots: list) -> dict:
    """영상 프로젝트의 샷 리스트에서 에셋 (캐릭터/소품/FX) 집계.

    각 샷의 characters, props_used, fx_used 를 모아 unique name 별로
    appearance_count + shot_codes 계산.

    locations 는 영상에서 'background' 가 자유 텍스트 묘사라 자동 집계 어려움.
    여기서는 빈 리스트 반환 (필요 시 사용자가 수동 입력하는 방향).

    반환: {
      "characters": [{name, appearance_count, shot_codes}, ...],
      "locations":  [],
      "props":      [...],
      "fx":         [...],
    }
    """
    def _shot_code(sh) -> str:
        seq = getattr(sh, "sequence_number", None)
        sn = getattr(sh, "shot_number", None)
        if isinstance(seq, int) and isinstance(sn, int):
            return f"S{seq:04d}_C{sn:04d}"
        return ""

    def _aggregate(field: str) -> list[dict]:
        bucket: dict[str, dict] = {}  # name_lower → {name, codes}
        for sh in shots:
            val = getattr(sh, field, None)
            if not val:
                continue
            names: list[str] = []
            if isinstance(val, list):
                names = [str(x).strip() for x in val if x]
            elif isinstance(val, str) and val.strip():
                names = [val.strip()]
            code = _shot_code(sh)
            for n in names:
                key = n.lower()
                entry = bucket.setdefault(key, {"name": n, "shot_codes": []})
                if code:
                    entry["shot_codes"].append(code)
        out = []
        for key, e in bucket.items():
            codes = e["shot_codes"]
            out.append({
                "name": e["name"],
                "appearance_count": len(codes),
                "shot_codes": codes,
            })
        # 등장 빈도 내림차순
        out.sort(key=lambda x: x["appearance_count"], reverse=True)
        return out

    return {
        "characters": _aggregate("characters"),
        "locations": [],  # 영상은 background 자유 텍스트라 자동 집계 안 함
        "props": _aggregate("props_used"),
        "fx": _aggregate("fx_used"),
    }


# 단가 기본값 (사용자가 미설정 시). 단위: 원
DEFAULT_UNIT_PRICES: dict = {
    "currency": "KRW",
    "assets": {
        "characters": {"S": 0, "AA": 0, "A": 0, "C": 0},
        "locations":  {"S": 0, "AA": 0, "A": 0, "C": 0},
        "props":      {"S": 0, "AA": 0, "A": 0, "C": 0},
        "fx":         {"S": 0, "AA": 0, "A": 0, "C": 0},
    },
    "shot_unit": 0,
}


def normalize_prices(prices: dict | None) -> dict:
    """단가 dict 검증/기본값 보강."""
    out = {
        "currency": "KRW",
        "assets": {t: {g: 0.0 for g in GRADES} for t in ASSET_TYPES},
        "shot_unit": 0.0,
    }
    if not isinstance(prices, dict):
        return out

    currency = str(prices.get("currency") or "KRW").upper()
    out["currency"] = currency if len(currency) <= 8 else "KRW"

    assets = prices.get("assets") if isinstance(prices.get("assets"), dict) else {}
    for t in ASSET_TYPES:
        sub = assets.get(t) if isinstance(assets.get(t), dict) else {}
        for g in GRADES:
            v = sub.get(g)
            if isinstance(v, (int, float)) and v >= 0:
                out["assets"][t][g] = float(v)

    sv = prices.get("shot_unit")
    if isinstance(sv, (int, float)) and sv >= 0:
        out["shot_unit"] = float(sv)

    return out


def _count_by_grade(items: list, grade: str) -> int:
    if not items:
        return 0
    return sum(1 for it in items if str(it.get("grade") or "").upper() == grade)


def calculate(
    *,
    characters: list,
    locations: list,
    props: list,
    fx: list,
    shots: list,
    prices: dict,
    budget: float | None,
) -> dict:
    """예산 분석 결과 반환.

    반환 dict:
    {
      "currency": "KRW",
      "budget": <사용자 입력 예산>,
      "total_cost": <자동 계산 비용>,
      "diff": <budget - total_cost>,  (budget 없으면 None)
      "breakdown": {
        "characters": {
          "S": {"count": 1, "unit_price": 1000000, "subtotal": 1000000},
          ...
        },
        ...
        "shots": {"count": 50, "unit_price": 100000, "subtotal": 5000000}
      },
      "asset_totals": {"characters": <sum>, ...},
      "suggestions": [{"type": "info|reduce|invest", "message": "..."}],
    }
    """
    p = normalize_prices(prices)
    asset_lists = {
        "characters": characters or [],
        "locations": locations or [],
        "props": props or [],
        "fx": fx or [],
    }

    breakdown: dict = {}
    asset_totals: dict = {}
    total_cost = 0.0

    for t in ASSET_TYPES:
        breakdown[t] = {}
        type_total = 0.0
        for g in GRADES:
            cnt = _count_by_grade(asset_lists[t], g)
            unit = p["assets"][t][g]
            sub = cnt * unit
            breakdown[t][g] = {
                "count": cnt,
                "unit_price": unit,
                "subtotal": sub,
            }
            type_total += sub
        asset_totals[t] = type_total
        total_cost += type_total

    shot_count = len(shots or [])
    shot_unit = p["shot_unit"]
    shot_sub = shot_count * shot_unit
    breakdown["shots"] = {
        "count": shot_count,
        "unit_price": shot_unit,
        "subtotal": shot_sub,
    }
    total_cost += shot_sub

    diff: Optional[float] = None
    if isinstance(budget, (int, float)):
        diff = float(budget) - total_cost

    suggestions = _build_suggestions(
        total_cost=total_cost,
        budget=budget if isinstance(budget, (int, float)) else None,
        breakdown=breakdown,
        asset_totals=asset_totals,
        prices=p,
    )

    return {
        "currency": p["currency"],
        "budget": float(budget) if isinstance(budget, (int, float)) else None,
        "total_cost": total_cost,
        "diff": diff,
        "breakdown": breakdown,
        "asset_totals": asset_totals,
        "suggestions": suggestions,
    }


def _build_suggestions(
    *,
    total_cost: float,
    budget: float | None,
    breakdown: dict,
    asset_totals: dict,
    prices: dict,
) -> list[dict]:
    """결정적 규칙 기반 제안. budget 없으면 단순 안내만."""
    out: list[dict] = []

    if not budget:
        out.append({
            "type": "info",
            "message": "예산을 입력하면 자동으로 차액과 제안을 보여드립니다.",
        })
        return out

    if total_cost == 0:
        out.append({
            "type": "info",
            "message": "단가가 0이라 비용이 0원으로 계산됩니다. 설정에서 등급별 단가를 입력해주세요.",
        })
        return out

    diff = budget - total_cost
    ratio = total_cost / budget if budget > 0 else 0

    if abs(diff) < budget * 0.05:
        out.append({
            "type": "ok",
            "message": f"예산 거의 정확히 일치합니다 (차이 {_fmt(diff)}원, ±5% 이내).",
        })
        return out

    if diff < 0:
        # 예산 초과
        over = -diff
        pct = (over / budget) * 100
        out.append({
            "type": "reduce",
            "message": f"⚠️ 예산 {_fmt(over)}원 초과 ({pct:.1f}%). 다음 항목 검토 권장:",
        })
        # 가장 큰 카테고리부터 줄이기 제안
        top = sorted(asset_totals.items(), key=lambda x: x[1], reverse=True)
        for t, val in top[:3]:
            if val <= 0:
                continue
            label = _asset_label(t)
            out.append({
                "type": "reduce",
                "message": f"  • {label}: {_fmt(val)}원 (전체의 {val/total_cost*100:.1f}%) — 등급 다운/통합 검토",
            })
        # C 등급으로 다운 시 절약 가능한 금액 계산
        savings_c = _estimated_c_consolidation_savings(breakdown, prices)
        if savings_c > 0:
            out.append({
                "type": "reduce",
                "message": f"  💡 엑스트라(C)를 더 묶으면 약 {_fmt(savings_c)}원 절약 가능",
            })
    else:
        # 예산 여유
        pct = (diff / budget) * 100
        out.append({
            "type": "invest",
            "message": f"✨ 예산 {_fmt(diff)}원 여유 ({pct:.1f}%). 다음 항목 투자 추천:",
        })
        # 작은 카테고리부터 키우기 제안 (특히 캐릭터/장소 S 추가)
        for t in ("characters", "locations", "fx"):
            s_unit = prices["assets"][t].get("S", 0)
            if s_unit > 0 and s_unit <= diff:
                label = _asset_label(t)
                out.append({
                    "type": "invest",
                    "message": f"  • {label} S급 1개 추가 가능 ({_fmt(s_unit)}원)",
                })
        out.append({
            "type": "invest",
            "message": "  💡 주요 샷 작화 디테일 향상, 추가 컷, 특수효과 보강 등 검토",
        })

    return out


def _estimated_c_consolidation_savings(breakdown: dict, prices: dict) -> float:
    """엑스트라(C) 등급을 절반으로 줄였을 때 절약 금액 추정."""
    saving = 0.0
    for t in ASSET_TYPES:
        info = breakdown.get(t, {}).get("C", {})
        cnt = int(info.get("count", 0))
        unit = float(info.get("unit_price", 0))
        if cnt >= 2 and unit > 0:
            saving += (cnt // 2) * unit
    return saving


def _asset_label(t: str) -> str:
    return {
        "characters": "캐릭터",
        "locations": "장소",
        "props": "소품/에셋",
        "fx": "특수효과(FX)",
    }.get(t, t)


def _fmt(n: float) -> str:
    """천 단위 콤마 포맷."""
    try:
        return f"{int(round(n)):,}"
    except (TypeError, ValueError):
        return str(n)
