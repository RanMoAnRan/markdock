import { useMemo, useState } from 'react';
import { Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import type { WhitelistEntry } from '../types/bookmark';

interface WhitelistTabProps {
  entries: WhitelistEntry[];
  onAdd: (pattern: string, matchType: 'url' | 'domain') => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function WhitelistTab({ entries, onAdd, onRemove }: WhitelistTabProps) {
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<'domain' | 'url'>('domain');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.pattern.toLowerCase().includes(q));
  }, [entries, query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pattern.trim();
    if (!cleaned) return;
    await onAdd(cleaned, matchType);
    setPattern('');
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      >
        <select
          value={matchType}
          onChange={(e) => setMatchType(e.target.value as 'domain' | 'url')}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
        >
          <option value="domain">按整个域名跳过</option>
          <option value="url">按精确 URL 跳过</option>
        </select>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={
            matchType === 'domain'
              ? '输入域名，例如 github.com 或 internal.company.net'
              : '输入完整链接，例如 https://example.com/private'
          }
          className="flex-1 min-w-[260px] rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!pattern.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>加入白名单</span>
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索白名单..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <span className="text-xs text-slate-500">共 {entries.length} 条规则</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <ShieldCheck className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm">暂无白名单规则，检测时命中的规则将自动跳过。</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/70"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                      entry.matchType === 'domain'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {entry.matchType === 'domain' ? '域名' : 'URL'}
                  </span>
                  <span className="truncate text-sm text-slate-800" title={entry.pattern}>
                    {entry.pattern}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>移除</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
