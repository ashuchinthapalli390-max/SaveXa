import React, { useState, useEffect } from "react";
import { History as HistoryIcon, Search, Trash2, Folder, Play, CheckCircle2 } from "lucide-react";
import { api } from "../services/api";
import { HistoryItem } from "../types";
import { formatBytes } from "../utils/formatters";

export const History: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await api.getHistory(formatFilter || undefined, search || undefined);
      setHistory(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [search, formatFilter]);

  const handleDelete = async (id: number) => {
    try {
      await api.deleteHistory(id, false);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
            <HistoryIcon size={14} className="text-blue-400" />
            <span>Download Archive</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Download History
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Complete persistent log of completed downloads, output paths, and file sizes.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#111a2b] border border-[#26354c] text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-2xl border border-[#1e293b] bg-[#0b1220] overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-xs">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-xs">No history records found.</div>
        ) : (
          <div className="divide-y divide-[#1e293b]">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-[#111a2b]/60 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                    <h4 className="text-xs font-bold text-white truncate" title={item.title}>
                      {item.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                    <span className="uppercase text-blue-300 font-semibold">{item.format}</span>
                    <span>•</span>
                    <span>{item.quality}</span>
                    <span>•</span>
                    <span>{formatBytes(item.file_size)}</span>
                    <span>•</span>
                    <span className="text-slate-500 truncate max-w-xs">{item.output_path}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => api.openFile(item.output_path)}
                    className="p-2 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-400 hover:text-white cursor-pointer"
                    title="Open file"
                  >
                    <Play size={13} />
                  </button>
                  <button
                    onClick={() => api.openFolder(item.output_path)}
                    className="p-2 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-400 hover:text-white cursor-pointer"
                    title="Open in Windows Explorer"
                  >
                    <Folder size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-2 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer"
                    title="Remove from history"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
