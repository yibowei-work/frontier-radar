#!/usr/bin/env python3
"""Collect first-party AI and robotics intelligence into a static JSON dataset."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, time as dt_time, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / "config" / "sources.json"
DATA_FILE = ROOT / "public" / "data" / "intelligence.json"
STATE_FILE = ROOT / "public" / "data" / "state.json"
SHANGHAI = ZoneInfo("Asia/Shanghai")
UTC = timezone.utc
USER_AGENT = "FrontierRadar/1.0 (+https://github.com/yibowei-work/frontier-radar)"
TRACKING_PARAMS = {"ref", "ref_src", "spm", "source", "src", "campaign"}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


@dataclass(frozen=True)
class Window:
    name: str
    start: datetime
    end: datetime
    due_key: str


def utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    cleaned = value.strip()
    try:
        parsed = parsedate_to_datetime(cleaned)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except (TypeError, ValueError, OverflowError):
        pass
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except ValueError:
        return None


def month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def previous_month(value: date) -> date:
    first = value.replace(day=1)
    return (first - timedelta(days=1)).replace(day=1)


def month_start(value: date) -> datetime:
    return datetime.combine(value.replace(day=1), dt_time.min, tzinfo=SHANGHAI).astimezone(UTC)


def plan_windows(now: datetime, state: dict[str, Any]) -> list[Window]:
    now = now.astimezone(UTC)
    local_now = now.astimezone(SHANGHAI)
    local_day = local_now.date()
    windows = [Window("daily", now - timedelta(hours=72), now, local_day.isoformat())]

    days_since_sunday = (local_day.weekday() + 1) % 7
    last_sunday = local_day - timedelta(days=days_since_sunday)
    if state.get("weekly_last_due_date", "") < last_sunday.isoformat():
        windows.append(Window("weekly", month_start(local_day), now, last_sunday.isoformat()))

    prev_month = previous_month(local_day)
    prev_key = month_key(prev_month)
    if state.get("monthly_complete_through", "") < prev_key:
        windows.append(Window("monthly", month_start(prev_month), month_start(local_day), prev_key))

    return windows


def canonical_url(raw_url: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(raw_url.strip())
    except ValueError:
        return raw_url.strip()
    host = (parsed.hostname or "").lower()
    port = parsed.port
    if port and not ((parsed.scheme == "https" and port == 443) or (parsed.scheme == "http" and port == 80)):
        host = f"{host}:{port}"
    query = []
    for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_PARAMS:
            continue
        query.append((key, value))
    path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if path != "/":
        path = path.rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme.lower(), host, path, urllib.parse.urlencode(sorted(query)), ""))


def clean_text(value: str | None, limit: int = 280) -> str:
    if not value:
        return ""
    parser = _TextExtractor()
    try:
        parser.feed(html.unescape(value))
        text = " ".join(parser.parts)
    except Exception:
        text = value
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip(" ,.;，。；") + "…"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def child_text(node: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(node):
        if local_name(child.tag) in names:
            if child.text and child.text.strip():
                return child.text.strip()
    return ""


def entry_link(node: ET.Element) -> str:
    for child in list(node):
        if local_name(child.tag) == "link":
            href = child.attrib.get("href")
            rel = child.attrib.get("rel", "alternate")
            if href and rel in {"alternate", ""}:
                return href
            if child.text and child.text.strip():
                return child.text.strip()
    return ""


def parse_feed(payload: bytes) -> list[dict[str, str]]:
    root = ET.fromstring(payload)
    entries: list[dict[str, str]] = []
    for node in root.iter():
        kind = local_name(node.tag)
        if kind not in {"item", "entry"}:
            continue
        title = child_text(node, ("title",))
        link = entry_link(node)
        published = child_text(node, ("pubdate", "published", "updated", "date"))
        summary = child_text(node, ("description", "summary", "content", "encoded"))
        native_id = child_text(node, ("guid", "id"))
        if title and link:
            entries.append(
                {
                    "title": clean_text(title, 240),
                    "url": link,
                    "published": published,
                    "summary": clean_text(summary, 360),
                    "native_id": native_id,
                }
            )
    return entries


def fetch(url: str, token: str | None = None, attempts: int = 3) -> tuple[bytes, dict[str, str]]:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.6"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    last_error: Exception | None = None
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                response_headers = {key.lower(): value for key, value in response.headers.items()}
                return response.read(), response_headers
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {last_error}")


TOPIC_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("具身智能", ("robot", "humanoid", "embodied", "manipulation", "具身", "机器人", "人形")),
    ("AI Agent", ("agent", "agentic", "computer use", "智能体", "multi-agent")),
    ("芯片算力", ("gpu", "cuda", "chip", "accelerator", "inference engine", "芯片", "算力")),
    ("自动驾驶", ("autonomous driving", "self-driving", "robotaxi", "自动驾驶", "智驾")),
    ("大模型", ("llm", "language model", "foundation model", "reasoning model", "大模型", "多模态")),
    ("开源生态", ("open source", "github", "repository", "release", "开源", "sdk", "api")),
    ("端侧 AI", ("on-device", "edge ai", "mobile", "端侧", "端上")),
]

SIGNAL_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("产品发布", ("launch", "release", "introducing", "announce", "unveil", "发布", "推出", "上线")),
    ("开源", ("open source", "github", "repository", "开源", "weights", "model card")),
    ("合作落地", ("partner", "customer", "deploy", "adopt", "contract", "合作", "客户", "订单", "落地")),
    ("融资并购", ("funding", "raised", "acquire", "merger", "investment", "融资", "收购", "投资")),
    ("政策监管", ("regulation", "policy", "safety standard", "监管", "政策", "合规")),
    ("研究突破", ("research", "paper", "benchmark", "state-of-the-art", "研究", "论文", "基准")),
    ("组织招聘", ("hire", "hiring", "appoint", "team", "招聘", "任命", "团队")),
]


def classify_topic(text: str, fallback: str) -> str:
    lowered = text.lower()
    for topic, keywords in TOPIC_RULES:
        if any(keyword in lowered for keyword in keywords):
            return topic
    return fallback


def classify_signal(text: str, source_id: str) -> str:
    if source_id.startswith("arxiv"):
        return "研究突破"
    if source_id.startswith("github"):
        return "开源"
    lowered = text.lower()
    for signal, keywords in SIGNAL_RULES:
        if any(keyword in lowered for keyword in keywords):
            return signal
    return "行业动态"


def insight_for(topic: str, signal: str) -> tuple[str, str]:
    why = {
        "产品发布": "产品能力边界或使用门槛发生变化，值得检查目标用户、采用路径与竞品跟进节奏。",
        "开源": "开放程度会改变开发成本和生态位，可能催生新的集成工具、评测和垂直应用机会。",
        "合作落地": "这是一条商业化验证信号，应继续核查客户场景、交付方式和可复制性。",
        "融资并购": "资金或所有权变化可能加速产品路线、团队扩张与行业整合。",
        "政策监管": "合规边界可能改变产品设计、数据流程、上市节奏和市场准入。",
        "研究突破": "技术可行性正在变化，但需要把实验指标与真实用户价值、成本和稳定性分开判断。",
        "组织招聘": "团队配置能反映下一阶段投入方向，可与产品发布和客户信号交叉验证。",
        "行业动态": "它可能影响赛道节奏或竞争判断，建议结合一手资料和后续动作继续观察。",
    }.get(signal, "它可能影响赛道节奏或竞争判断，建议继续观察。")
    career = {
        "具身智能": "关注软硬件协同、任务评测与真实场景数据闭环；这些经验比单一功能设计更稀缺。",
        "AI Agent": "练习定义任务成功率、人工接管率和失败兜底，形成一份可复用的 Agent 评测框架。",
        "芯片算力": "把延迟、吞吐、成本和端云取舍写进产品决策，而不只比较模型榜单。",
        "自动驾驶": "积累安全约束、人机交互和灰度运营案例，强化复杂系统产品能力。",
        "大模型": "把模型能力翻译成用户任务、评测集和业务指标，构建可证明的产品判断力。",
        "开源生态": "研究开发者上手路径、文档与社区反馈，补强平台和开发者产品经验。",
        "端侧 AI": "关注隐私、功耗、延迟和离线体验，形成端云协同的产品取舍框架。",
        "企业 AI": "优先研究部署、权限、审计和 ROI，补齐从 Demo 到规模化落地的经验。",
        "AI 研究": "先问“能解决哪个用户任务”，再把论文指标转成产品假设和验证计划。",
    }.get(topic, "把这条动态整理成“事实—影响—下一步验证”，沉淀为竞品与面试素材。")
    return why, career


def item_score(published: datetime, now: datetime, signal: str, region: str) -> int:
    age_hours = max(0.0, (now - published).total_seconds() / 3600)
    freshness = max(0, 46 - int(age_hours / 3))
    signal_weight = {
        "产品发布": 28,
        "合作落地": 25,
        "融资并购": 24,
        "政策监管": 23,
        "开源": 21,
        "研究突破": 18,
        "组织招聘": 16,
        "行业动态": 12,
    }.get(signal, 10)
    region_balance = 4 if region == "中国" else 0
    return min(100, 24 + freshness + signal_weight + region_balance)


def matching_windows(published: datetime, windows: list[Window]) -> list[str]:
    return [window.name for window in windows if window.start <= published < window.end]


def make_item(
    *,
    source: dict[str, Any],
    title: str,
    url: str,
    summary: str,
    published: datetime,
    now: datetime,
    native_id: str = "",
    windows: list[Window],
    topic_override: str | None = None,
) -> dict[str, Any] | None:
    matched = matching_windows(published, windows)
    if not matched:
        return None
    canonical = canonical_url(url)
    if urllib.parse.urlsplit(canonical).scheme not in {"http", "https"}:
        return None
    stable_value = f"{source['id']}\n{native_id or canonical}"
    item_id = hashlib.sha256(stable_value.encode("utf-8")).hexdigest()[:20]
    combined = f"{title} {summary}"
    topic = topic_override or classify_topic(combined, source.get("default_topic", "行业综合"))
    signal = classify_signal(combined, source["id"])
    why, career = insight_for(topic, signal)
    return {
        "id": item_id,
        "title": clean_text(title, 220),
        "summary": clean_text(summary, 300) or "原始来源未提供摘要，请打开原文核查完整信息。",
        "url": canonical,
        "source": source["name"],
        "source_id": source["id"],
        "source_tier": "一手来源",
        "company": source.get("company", source["name"]),
        "company_scale": source.get("company_scale", "研究机构"),
        "region": source.get("region", "全球"),
        "topic": topic,
        "signal_type": signal,
        "published_at": utc_iso(published),
        "first_seen_at": utc_iso(now),
        "last_checked_at": utc_iso(now),
        "matched_windows": matched,
        "confidence": "高",
        "verification_status": "官方一手源",
        "why_it_matters": why,
        "career_angle": career,
        "score": item_score(published, now, signal, source.get("region", "全球")),
        "content_hash": hashlib.sha256(f"{title}\n{summary}".encode("utf-8")).hexdigest()[:16],
        "revisions": [],
    }


def collect_rss(source: dict[str, Any], now: datetime, windows: list[Window]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started = time.monotonic()
    payload, headers = fetch(source["url"])
    parsed = parse_feed(payload)
    items: list[dict[str, Any]] = []
    for entry in parsed[:80]:
        published = parse_datetime(entry.get("published"))
        if not published:
            continue
        item = make_item(
            source=source,
            title=entry["title"],
            url=entry["url"],
            summary=entry.get("summary", ""),
            published=published,
            now=now,
            native_id=entry.get("native_id", ""),
            windows=windows,
        )
        if item:
            items.append(item)
    return items, {
        "id": source["id"],
        "name": source["name"],
        "status": "ok",
        "kind": "RSS",
        "fetched": len(parsed),
        "matched": len(items),
        "latest_item_at": max((item["published_at"] for item in items), default=None),
        "etag": headers.get("etag"),
        "duration_ms": round((time.monotonic() - started) * 1000),
    }


def collect_github(source: dict[str, Any], now: datetime, windows: list[Window], token: str | None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Collect a quiet, first-party signal from recently pushed public repositories.

    The public organization event stream is easily saturated by stars, comments and
    pull-request activity, so release/create events can disappear from its first page.
    Repository ``pushed_at`` is a more reliable official signal. We emit at most five
    repositories per organization and one stable update per repository/day.
    """

    started = time.monotonic()
    url = (
        f"https://api.github.com/orgs/{urllib.parse.quote(source['org'])}/repos"
        "?type=public&sort=pushed&direction=desc&per_page=100"
    )
    payload, _ = fetch(url, token=token)
    repositories = json.loads(payload)
    items: list[dict[str, Any]] = []
    if not isinstance(repositories, list):
        raise RuntimeError(f"unexpected GitHub response for {source['org']}")

    candidates: list[tuple[datetime, dict[str, Any]]] = []
    for repository in repositories:
        if repository.get("archived") or repository.get("fork"):
            continue
        if repository.get("name") in {".github", ".github-private", "profile"}:
            continue
        pushed = parse_datetime(repository.get("pushed_at"))
        if pushed and matching_windows(pushed, windows):
            candidates.append((pushed, repository))

    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    for published, repository in candidates[:5]:
        repo_name = clean_text(repository.get("name"), 100) or "未命名项目"
        created = parse_datetime(repository.get("created_at"))
        is_new = bool(created and matching_windows(created, windows))
        action = "创建开源项目" if is_new else "更新开源项目"
        title = f"{source['company']} {action}：{repo_name}"

        details = []
        description = clean_text(repository.get("description"), 220)
        if description:
            details.append(description)
        language = clean_text(repository.get("language"), 40)
        if language:
            details.append(f"主要语言：{language}")
        stars = repository.get("stargazers_count")
        if isinstance(stars, int):
            details.append(f"GitHub Stars：{stars:,}")
        details.append(f"最近代码推送：{utc_iso(published)}")
        summary = "；".join(details) + "。"

        repo_id = repository.get("id") or repository.get("full_name") or repo_name
        native_id = f"repo:{repo_id}:{published.date().isoformat()}"
        item = make_item(
            source=source,
            title=title,
            url=repository.get("html_url") or f"https://github.com/{source['org']}/{repo_name}",
            summary=summary,
            published=published,
            now=now,
            native_id=native_id,
            windows=windows,
            topic_override=source.get("default_topic"),
        )
        if item:
            items.append(item)

    return items, {
        "id": source["id"],
        "name": source["name"],
        "status": "ok",
        "kind": "GitHub",
        "fetched": len(repositories),
        "matched": len(items),
        "latest_item_at": max((item["published_at"] for item in items), default=None),
        "duration_ms": round((time.monotonic() - started) * 1000),
    }


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return fallback


def merge_items(existing: list[dict[str, Any]], incoming: list[dict[str, Any]], now: datetime) -> tuple[list[dict[str, Any]], int]:
    by_id = {item["id"]: item for item in existing if item.get("id")}
    revisions = 0
    for item in incoming:
        previous = by_id.get(item["id"])
        if previous:
            item["first_seen_at"] = previous.get("first_seen_at", item["first_seen_at"])
            old_revisions = previous.get("revisions", [])
            if previous.get("content_hash") != item.get("content_hash"):
                old_revisions = [
                    *old_revisions,
                    {
                        "at": utc_iso(now),
                        "previous_title": previous.get("title", ""),
                        "previous_summary": previous.get("summary", ""),
                    },
                ][-5:]
                revisions += 1
                item["verification_status"] = "复查有更新"
            item["revisions"] = old_revisions
        by_id[item["id"]] = item

    cutoff = now - timedelta(days=370)
    merged = [item for item in by_id.values() if (parse_datetime(item.get("published_at")) or now) >= cutoff]
    merged.sort(key=lambda item: (item.get("score", 0), item.get("published_at", "")), reverse=True)
    return merged[:1500], revisions


def source_summary(statuses: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "total": len(statuses),
        "healthy": sum(1 for status in statuses if status["status"] == "ok"),
        "degraded": sum(1 for status in statuses if status["status"] != "ok"),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def run(as_of: datetime) -> int:
    sources = load_json(SOURCE_FILE, {"rss": [], "github_orgs": []})
    previous_dataset = load_json(DATA_FILE, {"items": []})
    state = load_json(STATE_FILE, {})
    windows = plan_windows(as_of, state)
    earliest = min(window.start for window in windows)
    token = os.environ.get("GITHUB_TOKEN")
    collected: list[dict[str, Any]] = []
    statuses: list[dict[str, Any]] = []

    tasks: list[tuple[str, dict[str, Any]]] = [
        *[("RSS", source) for source in sources.get("rss", [])],
        *[("GitHub", source) for source in sources.get("github_orgs", [])],
    ]

    def collect_one(kind: str, source: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if kind == "RSS":
            return collect_rss(source, as_of, windows)
        return collect_github(source, as_of, windows, token)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        pending = {
            executor.submit(collect_one, kind, source): (kind, source)
            for kind, source in tasks
        }
        for future in concurrent.futures.as_completed(pending):
            kind, source = pending[future]
            try:
                items, status = future.result()
                collected.extend(items)
                statuses.append(status)
            except Exception as exc:
                statuses.append({"id": source["id"], "name": source["name"], "kind": kind, "status": "error", "error": clean_text(str(exc), 180), "matched": 0})

    statuses.sort(key=lambda status: status["id"])

    merged, revision_count = merge_items(previous_dataset.get("items", []), collected, as_of)
    summary = source_summary(statuses)
    run_status = "healthy" if summary["degraded"] == 0 else ("degraded" if summary["healthy"] else "failed")
    local_now = as_of.astimezone(SHANGHAI)
    active_modes = [window.name for window in windows]

    dataset = {
        "meta": {
            "schema_version": 1,
            "generated_at": utc_iso(as_of),
            "generated_at_beijing": local_now.strftime("%Y-%m-%d %H:%M"),
            "run_status": run_status,
            "active_modes": active_modes,
            "window_start": utc_iso(earliest),
            "window_end": utc_iso(as_of),
            "source_count": summary["total"],
            "healthy_source_count": summary["healthy"],
            "degraded_source_count": summary["degraded"],
            "new_or_checked_count": len(collected),
            "total_item_count": len(merged),
            "revision_count": revision_count,
            "weekly_last_due_date": next((window.due_key for window in windows if window.name == "weekly"), state.get("weekly_last_due_date")),
            "monthly_complete_through": next((window.due_key for window in windows if window.name == "monthly"), state.get("monthly_complete_through")),
        },
        "items": merged,
        "sources": statuses,
    }
    write_json(DATA_FILE, dataset)

    if run_status != "failed":
        next_state = {
            "daily_last_success": utc_iso(as_of),
            "weekly_last_due_date": dataset["meta"]["weekly_last_due_date"],
            "monthly_complete_through": dataset["meta"]["monthly_complete_through"],
            "last_run_status": run_status,
        }
        write_json(STATE_FILE, next_state)

    print(
        json.dumps(
            {
                "status": run_status,
                "modes": active_modes,
                "sources": summary,
                "matched": len(collected),
                "published": len(merged),
                "revisions": revision_count,
            },
            ensure_ascii=False,
        )
    )
    return 1 if run_status == "failed" else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="Override the run time with an ISO-8601 value")
    args = parser.parse_args()
    as_of = parse_datetime(args.as_of) if args.as_of else datetime.now(UTC)
    if not as_of:
        parser.error("--as-of must be a valid ISO-8601 date-time")
    return run(as_of)


if __name__ == "__main__":
    sys.exit(main())
