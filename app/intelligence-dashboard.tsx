'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BellRing,
  Bookmark,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock3,
  ExternalLink,
  FileSearch,
  Filter,
  GitFork,
  History,
  Menu,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  IntelligenceData,
  IntelligenceItem,
  RunMode,
} from '@/lib/intelligence';

const ALL = '全部';
const PAGE_SIZE = 18;
const STORAGE_KEY = 'frontier-radar:favorites';

const topicOrder = [
  '具身智能',
  'AI Agent',
  '大模型',
  '企业 AI',
  '芯片算力',
  '自动驾驶',
  '开源生态',
  'AI 研究',
];

const signalStyles: Record<string, string> = {
  产品发布: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
  开源: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
  合作落地: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  融资并购: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
  政策监管: 'border-rose-300/25 bg-rose-300/10 text-rose-100',
  研究突破: 'border-blue-300/25 bg-blue-300/10 text-blue-100',
  组织招聘: 'border-lime-300/25 bg-lime-300/10 text-lime-100',
};

const topicAccent: Record<string, string> = {
  具身智能: 'signal-cyan',
  'AI Agent': 'signal-violet',
  大模型: 'signal-blue',
  '企业 AI': 'signal-amber',
  芯片算力: 'signal-lime',
  自动驾驶: 'signal-rose',
  开源生态: 'signal-violet',
  'AI 研究': 'signal-blue',
};

const modeCopy: Record<RunMode, { title: string; short: string }> = {
  daily: { title: '最近 3 天日常核查', short: '3 日核查' },
  weekly: { title: '本月周日回查', short: '本月回查' },
  monthly: { title: '上月月度封板', short: '上月回查' },
};

function formatBeijing(value: string, withDate = true) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: withDate ? 'short' : undefined,
    day: withDate ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function relativeTime(value: string, referenceTime: string) {
  const delta = new Date(referenceTime).getTime() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(delta / 3_600_000));
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} 天前`;
  return formatBeijing(value);
}

function selectTopSignals(items: IntelligenceItem[]) {
  const selected: IntelligenceItem[] = [];
  for (const item of items) {
    const hasCompany = selected.some(
      (candidate) => candidate.company === item.company,
    );
    const hasTopic = selected.some(
      (candidate) => candidate.topic === item.topic,
    );
    if (hasCompany || (hasTopic && selected.length < 2)) continue;
    selected.push(item);
    if (selected.length === 3) break;
  }
  for (const item of items) {
    if (selected.length === 3) break;
    if (!selected.some((candidate) => candidate.id === item.id))
      selected.push(item);
  }
  return selected;
}

function scopeStart(scope: string, referenceTime: string) {
  const now = new Date(referenceTime);
  if (scope === '24h') return now.getTime() - 24 * 3_600_000;
  if (scope === '3d') return now.getTime() - 72 * 3_600_000;
  if (scope === 'month')
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (scope === 'last-month')
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  return 0;
}

function priorityLabel(score: number) {
  if (score >= 86) return '高优先级';
  if (score >= 72) return '重点关注';
  return '持续观察';
}

export function IntelligenceDashboard({ data }: { data: IntelligenceData }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [signal, setSignal] = useState(ALL);
  const [scale, setScale] = useState(ALL);
  const [scope, setScope] = useState('3d');
  const [sort, setSort] = useState('priority');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) queueMicrotask(() => setFavorites(JSON.parse(stored)));
    } catch {
      // Device-local favorites are optional; a blocked storage API should not block reading.
    }
  }, []);

  const updateFavorites = (next: string[]) => {
    setFavorites(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the in-memory selection for this session.
    }
  };

  const topics = useMemo(() => {
    const found = new Set(data.items.map((item) => item.topic));
    return topicOrder
      .filter((value) => found.has(value))
      .concat([...found].filter((value) => !topicOrder.includes(value)).sort());
  }, [data.items]);

  const regions = useMemo(
    () => [...new Set(data.items.map((item) => item.region))].sort(),
    [data.items],
  );
  const signals = useMemo(
    () => [...new Set(data.items.map((item) => item.signal_type))].sort(),
    [data.items],
  );
  const scales = useMemo(
    () => [...new Set(data.items.map((item) => item.company_scale))].sort(),
    [data.items],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const start = scopeStart(scope, data.meta.generated_at);
    return data.items
      .filter(
        (item) => !start || new Date(item.published_at).getTime() >= start,
      )
      .filter((item) => topic === ALL || item.topic === topic)
      .filter((item) => region === ALL || item.region === region)
      .filter((item) => signal === ALL || item.signal_type === signal)
      .filter((item) => scale === ALL || item.company_scale === scale)
      .filter((item) => !onlyFavorites || favorites.includes(item.id))
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.title, item.summary, item.company, item.source, item.topic]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        if (sort === 'latest')
          return right.published_at.localeCompare(left.published_at);
        return (
          right.score - left.score ||
          right.published_at.localeCompare(left.published_at)
        );
      });
  }, [
    data.items,
    data.meta.generated_at,
    favorites,
    onlyFavorites,
    query,
    region,
    scale,
    scope,
    signal,
    sort,
    topic,
  ]);

  const recentItems = useMemo(() => {
    const start = new Date(data.meta.generated_at).getTime() - 72 * 3_600_000;
    return data.items.filter(
      (item) => new Date(item.published_at).getTime() >= start,
    );
  }, [data.items, data.meta.generated_at]);
  const topSignals = useMemo(
    () => selectTopSignals(recentItems.length ? recentItems : data.items),
    [data.items, recentItems],
  );
  const chinaCount = recentItems.filter(
    (item) => item.region === '中国',
  ).length;
  const globalCount = recentItems.length - chinaCount;
  const productCount = recentItems.filter((item) =>
    ['产品发布', '开源', '合作落地'].includes(item.signal_type),
  ).length;
  const activeFilterCount =
    [topic, region, signal, scale].filter((value) => value !== ALL).length +
    (scope !== '3d' ? 1 : 0) +
    (onlyFavorites ? 1 : 0);

  const resetFilters = () => {
    setQuery('');
    setTopic(ALL);
    setRegion(ALL);
    setSignal(ALL);
    setScale(ALL);
    setScope('3d');
    setOnlyFavorites(false);
    setLimit(PAGE_SIZE);
  };

  const toggleFavorite = (id: string) => {
    updateFavorites(
      favorites.includes(id)
        ? favorites.filter((item) => item !== id)
        : [...favorites, id],
    );
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a
            href="#today"
            className="flex items-center gap-3"
            aria-label="前沿雷达首页"
          >
            <div className="grid size-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(86,230,255,.12)]">
              <Radar className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-[15px] font-semibold tracking-[0.02em]">
                前沿雷达
              </p>
              <p className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
                Frontier Intelligence
              </p>
            </div>
          </a>

          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="主导航"
          >
            {[
              ['今日', '#today'],
              ['情报流', '#feed'],
              ['职业雷达', '#career'],
              ['核查记录', '#review'],
              ['数据源', '#sources'],
            ].map(([label, href], index) => (
              <a
                key={label}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${index === 0 ? 'bg-white/7 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="hidden border-white/10 bg-white/4 text-slate-200 hover:bg-white/8 sm:flex"
              onClick={() =>
                document
                  .querySelector<HTMLInputElement>('#intel-search')
                  ?.focus()
              }
            >
              <Search data-icon="inline-start" />
              搜索情报
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-300 md:hidden"
              aria-label="打开筛选"
              onClick={() => setMobileFilters((value) => !value)}
            >
              {mobileFilters ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>

      <section id="today" className="scroll-mt-24 border-b border-white/6">
        <div className="mx-auto max-w-[1480px] px-4 pb-11 pt-7 sm:px-6 lg:px-8 lg:pt-10">
          <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="min-w-0">
              <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      className={
                        data.meta.run_status === 'healthy'
                          ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200'
                          : 'border-amber-300/20 bg-amber-300/10 text-amber-200'
                      }
                    >
                      {data.meta.run_status === 'healthy'
                        ? '情报已完整更新'
                        : '已更新 · 部分来源待恢复'}
                    </Badge>
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      北京时间 {data.meta.generated_at_beijing} 完成
                    </span>
                    <span className="text-slate-600">·</span>
                    <span>
                      {data.meta.healthy_source_count}/{data.meta.source_count}{' '}
                      个来源正常
                    </span>
                  </div>
                  <h1 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-[42px]">
                    今天，什么值得你行动？
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                    不只是更多新闻。把全球 AI
                    与机器人动态，变成产品判断、竞争信号和职业行动。
                  </p>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[560px] lg:justify-end">
                  {[ALL, ...topics.slice(0, 6)].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setTopic(value);
                        document
                          .querySelector('#feed')
                          ?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`min-h-9 shrink-0 rounded-full border px-3 text-xs transition-colors ${topic === value ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100' : 'border-white/8 bg-white/[.025] text-muted-foreground hover:border-white/15 hover:text-white'}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-300 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-cyan-300" />
                  </span>
                  <h2 className="text-sm font-medium text-slate-200">
                    今日关键信号
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  按产品影响与职业相关度排序
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {topSignals.map((item, index) => (
                  <Card
                    key={item.id}
                    className={`signal-card group relative min-h-[390px] border border-white/8 bg-card/75 py-0 ring-0 ${topicAccent[item.topic] ?? 'signal-cyan'}`}
                  >
                    <div className="signal-line" aria-hidden="true" />
                    <CardHeader className="px-5 pt-5">
                      <div className="mb-4 flex items-start justify-between">
                        <div className="signal-icon grid size-10 place-items-center rounded-xl border bg-white/[.035]">
                          {item.topic === '具身智能' ? (
                            <Bot className="size-[18px]" />
                          ) : item.signal_type === '研究突破' ? (
                            <FileSearch className="size-[18px]" />
                          ) : (
                            <Sparkles className="size-[18px]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={
                              favorites.includes(item.id)
                                ? '取消收藏'
                                : '收藏情报'
                            }
                            onClick={() => toggleFavorite(item.id)}
                            className="grid size-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/6 hover:text-white"
                          >
                            <Bookmark
                              className={`size-4 ${favorites.includes(item.id) ? 'fill-cyan-300 text-cyan-300' : ''}`}
                            />
                          </button>
                          <span className="font-mono text-[11px] text-slate-600">
                            0{index + 1}
                          </span>
                        </div>
                      </div>
                      <CardDescription className="signal-label text-[11px] font-medium tracking-[0.06em]">
                        {item.signal_type} · {priorityLabel(item.score)}
                      </CardDescription>
                      <CardTitle className="mt-2 text-lg font-semibold leading-[1.5] tracking-[-0.02em] text-white">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col px-5 pb-5">
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {item.summary}
                      </p>
                      <div className="mt-auto border-t border-white/7 pt-4">
                        <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                          对你的意义
                        </p>
                        <p className="line-clamp-3 text-sm leading-5 text-slate-300">
                          {item.career_angle}
                        </p>
                        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <CircleDot
                              className="size-3 shrink-0 text-emerald-400"
                              aria-hidden="true"
                            />
                            <span className="truncate">{item.source}</span>
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-3 flex shrink-0 items-center gap-1 text-slate-300 transition-colors hover:text-white"
                          >
                            查看证据{' '}
                            <ArrowUpRight
                              className="size-3"
                              aria-hidden="true"
                            />
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    String(recentItems.length),
                    '近 3 天有效情报',
                    `${productCount} 条产品信号`,
                  ],
                  [
                    String(chinaCount),
                    '中国公司动态',
                    `海外 ${globalCount} 条`,
                  ],
                  [
                    String(data.meta.revision_count),
                    '旧事件有修订',
                    '持续复查而非一次抓取',
                  ],
                  [String(favorites.length), '你的收藏', '仅保存在当前设备'],
                ].map(([value, label, note]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/7 bg-white/[.025] px-5 py-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <strong className="font-mono text-2xl font-medium text-white">
                        {value}
                      </strong>
                      <span className="text-right text-[11px] text-emerald-300">
                        {note}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <aside id="career" className="scroll-mt-24 space-y-4">
              <Card className="border border-violet-300/12 bg-violet-300/[.055] ring-0">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-2 text-violet-200">
                    <TrendingUp className="size-4" aria-hidden="true" />
                    <span className="text-xs font-medium">本周职业提示</span>
                  </div>
                  <CardTitle className="text-lg font-semibold leading-7 text-white">
                    把“看过新闻”变成可展示的产品能力
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-slate-400">
                    从今天的高优先信号中选一条，用事实、产品影响、指标与失败兜底做成一页纸。
                  </p>
                  <div className="mt-5 rounded-lg border border-white/7 bg-black/15 p-3.5">
                    <p className="text-[11px] text-slate-500">建议你本周产出</p>
                    <p className="mt-1.5 text-sm leading-5 text-slate-200">
                      {topSignals[0]?.career_angle ??
                        '一份垂直场景 AI 评测框架'}
                    </p>
                  </div>
                  <a
                    href="#feed"
                    className="mt-4 flex items-center justify-between rounded-lg px-1 py-2 text-sm text-violet-100 hover:text-white"
                  >
                    找一个案例开始
                    <ArrowUpRight className="size-4" />
                  </a>
                </CardContent>
              </Card>

              <Card
                id="review"
                className="scroll-mt-24 border border-white/8 bg-card/60 ring-0"
              >
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-slate-200">
                    数据核查进度
                  </CardTitle>
                  <CardDescription className="text-xs">
                    持续回看，避免旧结论悄悄过期
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(['daily', 'weekly', 'monthly'] as RunMode[]).map((mode) => {
                    const completed =
                      data.meta.active_modes.includes(mode) || mode === 'daily';
                    const detail =
                      mode === 'daily'
                        ? formatBeijing(data.meta.generated_at)
                        : mode === 'weekly'
                          ? (data.meta.weekly_last_due_date ?? '待首次完成')
                          : (data.meta.monthly_complete_through ??
                            '待首次完成');
                    return (
                      <div key={mode} className="flex items-center gap-3">
                        <span
                          className={`grid size-5 place-items-center rounded-full ${completed ? 'bg-cyan-300/12 text-cyan-200' : 'bg-white/5 text-slate-500'}`}
                        >
                          {completed ? (
                            <Check className="size-3" />
                          ) : (
                            <Clock3 className="size-3" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-slate-300">
                            {modeCopy[mode].title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-600">
                            {detail}
                          </p>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {completed ? '完成' : '已计划'}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </section>

      <section
        id="feed"
        className="scroll-mt-24 mx-auto max-w-[1480px] px-4 py-12 sm:px-6 lg:px-8"
      >
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-200">
              <BellRing className="size-4" />
              <span className="text-xs font-medium uppercase tracking-[0.12em]">
                Intelligence stream
              </span>
            </div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">
              可核查的情报流
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              每条判断都保留官方来源、复查状态和职业启示。
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            当前匹配{' '}
            <span className="font-mono text-slate-200">{filtered.length}</span>{' '}
            条
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-white/8 bg-card/45 p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(120px,auto))_auto]">
            <label className="relative block" htmlFor="intel-search">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="intel-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索公司、产品、技术或来源"
                className="h-10 border-white/9 bg-black/12 pl-9 text-slate-100"
              />
            </label>

            <FilterSelect
              label="时间范围"
              value={scope}
              onChange={setScope}
              options={[
                ['24h', '24 小时'],
                ['3d', '最近 3 天'],
                ['month', '本月'],
                ['last-month', '上月'],
                ['all', '全部历史'],
              ]}
            />
            <FilterSelect
              label="地区"
              value={region}
              onChange={setRegion}
              options={[[ALL, ALL], ...regions.map((value) => [value, value])]}
            />
            <FilterSelect
              label="信号类型"
              value={signal}
              onChange={setSignal}
              options={[[ALL, ALL], ...signals.map((value) => [value, value])]}
            />
            <FilterSelect
              label="公司阶段"
              value={scale}
              onChange={setScale}
              options={[[ALL, ALL], ...scales.map((value) => [value, value])]}
            />
            <Button
              variant={onlyFavorites ? 'default' : 'outline'}
              className={
                onlyFavorites
                  ? 'h-10 bg-cyan-300 text-slate-950 hover:bg-cyan-200'
                  : 'h-10 border-white/10 bg-white/3 text-slate-300 hover:bg-white/7'
              }
              onClick={() => setOnlyFavorites((value) => !value)}
            >
              <Star
                data-icon="inline-start"
                className={onlyFavorites ? 'fill-slate-950' : ''}
              />
              收藏
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {[ALL, ...topics].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setTopic(value);
                  setLimit(PAGE_SIZE);
                }}
                className={`min-h-8 shrink-0 rounded-full border px-3 text-xs transition-colors ${topic === value ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100' : 'border-white/7 text-slate-500 hover:text-slate-200'}`}
              >
                {value}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto flex min-h-8 shrink-0 items-center gap-1 px-2 text-xs text-slate-500 hover:text-white"
              >
                <RefreshCcw className="size-3" /> 重置
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1">
              <p className="text-xs text-muted-foreground">
                显示 {Math.min(limit, filtered.length)} / {filtered.length}
              </p>
              <FilterSelect
                label="排序"
                value={sort}
                onChange={setSort}
                compact
                options={[
                  ['priority', '优先级'],
                  ['latest', '最新发布'],
                ]}
              />
            </div>

            {filtered.slice(0, limit).map((item) => (
              <article
                key={item.id}
                className="group rounded-2xl border border-white/8 bg-card/55 p-4 transition-colors hover:border-white/14 hover:bg-card/80 sm:p-5"
              >
                <div className="flex gap-3 sm:gap-4">
                  <div
                    className={`mt-1 hidden size-10 shrink-0 place-items-center rounded-xl border bg-white/[.025] sm:grid ${topicAccent[item.topic] ?? 'signal-cyan'} signal-icon`}
                  >
                    {item.topic === '具身智能' ? (
                      <Bot className="size-[18px]" />
                    ) : (
                      <CircleDot className="size-[18px]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          signalStyles[item.signal_type] ??
                          'border-white/12 bg-white/5 text-slate-300'
                        }
                      >
                        {item.signal_type}
                      </Badge>
                      <span className="text-[11px] text-slate-500">
                        {item.topic}
                      </span>
                      <span className="text-[11px] text-slate-700">·</span>
                      <span className="text-[11px] text-slate-500">
                        {item.region}
                      </span>
                      <span className="text-[11px] text-slate-700">·</span>
                      <span className="text-[11px] text-slate-500">
                        {relativeTime(
                          item.published_at,
                          data.meta.generated_at,
                        )}
                      </span>
                      {item.revisions.length > 0 && (
                        <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-200">
                          复查有更新
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold leading-6 text-slate-100 sm:text-base">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-cyan-100"
                          >
                            {item.title}
                          </a>
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {item.summary}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(item.id)}
                        aria-label={
                          favorites.includes(item.id) ? '取消收藏' : '收藏情报'
                        }
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white/6 hover:text-white"
                      >
                        <Bookmark
                          className={`size-4 ${favorites.includes(item.id) ? 'fill-cyan-300 text-cyan-300' : ''}`}
                        />
                      </button>
                    </div>

                    <details className="intel-details mt-4 rounded-xl border border-white/6 bg-black/10">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-xs text-slate-300">
                        <span className="flex items-center gap-2">
                          <Sparkles className="size-3.5 text-violet-300" />
                          展开产品与职业解读
                        </span>
                        <ChevronDown className="size-3.5 text-slate-600 transition-transform" />
                      </summary>
                      <div className="grid gap-4 border-t border-white/6 px-3.5 py-4 sm:grid-cols-2">
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-cyan-200">
                            为什么重要
                          </p>
                          <p className="text-xs leading-5 text-slate-400">
                            {item.why_it_matters}
                          </p>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-violet-200">
                            对你的职业启示
                          </p>
                          <p className="text-xs leading-5 text-slate-400">
                            {item.career_angle}
                          </p>
                        </div>
                      </div>
                    </details>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                      <div className="flex min-w-0 items-center gap-2">
                        <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" />
                        <span className="truncate">
                          {item.company} · {item.source}
                        </span>
                        <span>·</span>
                        <span>{item.verification_status}</span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-slate-300 hover:text-white"
                      >
                        原始来源 <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/12 px-6 py-16 text-center">
                <FileSearch className="mx-auto size-7 text-slate-600" />
                <h3 className="mt-4 text-sm font-medium text-slate-200">
                  没有匹配的情报
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  试试放宽时间范围或清除一部分筛选条件。
                </p>
                <Button
                  variant="outline"
                  className="mt-5 border-white/10 bg-white/3"
                  onClick={resetFilters}
                >
                  重置筛选
                </Button>
              </div>
            )}

            {limit < filtered.length && (
              <Button
                variant="outline"
                className="h-11 w-full border-white/10 bg-white/[.025] text-slate-300 hover:bg-white/6"
                onClick={() => setLimit((value) => value + PAGE_SIZE)}
              >
                加载更多情报
              </Button>
            )}
          </div>

          <aside className="space-y-4">
            <Card className="border border-white/8 bg-card/50 ring-0">
              <CardHeader>
                <div className="flex items-center gap-2 text-emerald-200">
                  <BriefcaseBusiness className="size-4" />
                  <CardTitle className="text-sm font-medium">
                    能力升值信号
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  从当前情报中提取的练习方向
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectTopSignals(filtered)
                  .slice(0, 3)
                  .map((item, index) => (
                    <div key={item.id} className="flex gap-3">
                      <span className="font-mono text-xs text-slate-600">
                        0{index + 1}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-slate-300">
                          {item.topic}
                        </p>
                        <p className="mt-1.5 line-clamp-3 text-[11px] leading-5 text-slate-500">
                          {item.career_angle}
                        </p>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card className="border border-white/8 bg-card/50 ring-0">
              <CardHeader>
                <div className="flex items-center gap-2 text-cyan-200">
                  <History className="size-4" />
                  <CardTitle className="text-sm font-medium">
                    这次查了什么
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.meta.active_modes.map((mode) => (
                  <div
                    key={mode}
                    className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[.025] px-3 py-2.5"
                  >
                    <span className="text-xs text-slate-300">
                      {modeCopy[mode].short}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-300">
                      <Check className="size-3" />
                      完成
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] leading-5 text-slate-600">
                  若定时任务延迟，系统会根据上次成功记录自动补做遗漏的周检与月检。
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>

      <section
        id="sources"
        className="scroll-mt-24 border-t border-white/6 bg-black/10"
      >
        <div className="mx-auto max-w-[1480px] px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">
                来源健康度
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                优先使用公司官方发布、官方 GitHub
                与论文源；异常来源不会阻塞其他有效情报。
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <CircleCheck className="size-3.5" />
                {data.meta.healthy_source_count} 正常
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <CircleAlert className="size-3.5" />
                {data.meta.degraded_source_count} 待恢复
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[.02] px-4 py-3"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${source.status === 'ok' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-300">
                    {source.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">
                    {source.kind} ·{' '}
                    {source.status === 'ok'
                      ? `匹配 ${source.matched}`
                      : '将在下次重试'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/6 pb-20 md:pb-0">
        <div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-4 px-4 py-7 text-xs text-slate-600 sm:px-6 md:flex-row md:items-center lg:px-8">
          <p>前沿雷达 · 给产品经理的 AI 与机器人行业决策台</p>
          <div className="flex flex-wrap items-center gap-4">
            <span>每日 11:00（北京时间）自动核查</span>
            <a
              href="https://github.com/yibowei-work/frontier-radar"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white"
            >
              <GitFork className="size-3.5" />
              查看 GitHub
            </a>
          </div>
        </div>
      </footer>

      <nav
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-2xl border border-white/10 bg-[#111827]/94 p-1.5 shadow-2xl backdrop-blur-xl md:hidden"
        aria-label="移动导航"
      >
        {[
          ['今日', '#today', Radar],
          ['情报', '#feed', BellRing],
          ['收藏', '#feed', Bookmark],
          ['洞察', '#career', BriefcaseBusiness],
        ].map(([label, href, Icon], index) => (
          <a
            key={String(label)}
            href={String(href)}
            onClick={index === 2 ? () => setOnlyFavorites(true) : undefined}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <Icon className="size-4" />
            {String(label)}
          </a>
        ))}
      </nav>

      {mobileFilters && (
        <div className="fixed inset-x-3 top-[72px] z-50 rounded-2xl border border-white/10 bg-[#111827]/98 p-4 shadow-2xl backdrop-blur-xl md:hidden">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-white">
              <Filter className="size-4" />
              快速筛选
            </span>
            <button
              type="button"
              aria-label="关闭筛选"
              onClick={() => setMobileFilters(false)}
              className="grid size-8 place-items-center text-slate-400"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FilterSelect
              label="时间"
              value={scope}
              onChange={setScope}
              options={[
                ['24h', '24 小时'],
                ['3d', '最近 3 天'],
                ['month', '本月'],
                ['all', '全部'],
              ]}
            />
            <FilterSelect
              label="地区"
              value={region}
              onChange={setRegion}
              options={[[ALL, ALL], ...regions.map((value) => [value, value])]}
            />
            <FilterSelect
              label="信号"
              value={signal}
              onChange={setSignal}
              options={[[ALL, ALL], ...signals.map((value) => [value, value])]}
            />
            <FilterSelect
              label="阶段"
              value={scale}
              onChange={setScale}
              options={[[ALL, ALL], ...scales.map((value) => [value, value])]}
            />
          </div>
          <Button
            className="mt-4 h-10 w-full bg-cyan-300 text-slate-950"
            onClick={() => {
              setMobileFilters(false);
              document
                .querySelector('#feed')
                ?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            查看 {filtered.length} 条情报
          </Button>
        </div>
      )}
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
  compact?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`relative block ${compact ? 'w-auto' : ''}`}>
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${compact ? 'h-8 min-w-24 pl-3 pr-7 text-xs' : 'h-10 w-full min-w-28 pl-3 pr-8 text-xs'} appearance-none rounded-lg border border-white/9 bg-[#141c2c] text-slate-300 outline-none transition-colors hover:border-white/15 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10`}
        aria-label={label}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
    </label>
  );
}
