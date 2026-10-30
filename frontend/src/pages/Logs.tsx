import React, { useState } from "react";
import { Terminal, Trash2, Copy, Check, AlertCircle, Info } from "lucide-react";
import { Job } from "../types";

interface LogsProps {
  jobs: Job[];
}

export const Logs: React.FC<LogsProps> = ({ jobs }) => {
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(false);

  // Generate diagnostic log entries from jobs history and errors
  const logEntries = jobs
    .flatMap((j) => {
      const list = [];
      list.push({
        timestamp: j.created_at,
        level: "INFO",
        jobId: j.id,
        message: `Job initialized: "${j.title}" (${j.selected_quality}, ${j.selected_format}) from ${j.source_url}`,
      });
      if (j.started_at) {
        list.push({
          timestamp: j.started_at,
          level: "INFO",
          jobId: j.id,
          message: `Worker assigned to download stream: destination "${j.destination_dir}"`,
        });
      }
      if (j.error_message) {
        list.push({
          timestamp: j.completed_at || j.created_at,
          level: "ERROR",
          jobId: j.id,
          message: `Job error [${j.error_code || "DOWNLOAD_FAILED"}]: ${j.error_message}`,
        });
      }
      if (j.status === "COMPLETED") {
        list.push({
          timestamp: j.completed_at || j.created_at,
          level: "SUCCESS",
          jobId: j.id,
          message: `File verified: saved to "${j.output_path}" (${(j.file_size / (1024*1024)).toFixed(1)} MB)`,
        });
      }
      return list;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredLogs = logEntries.filter((l) => {
    if (filter === "error") return l.level === "ERROR";
    if (filter === "info") return l.level === "INFO" || l.level === "SUCCESS";
    return true;
  });

  const handleCopy = () => {
    const raw = filteredLogs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
            <Terminal size={14} className="text-blue-400" />
            <span>Diagnostic Console</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            System Logs
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Engine activity, verification messages, and diagnostic traces.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#111a2b] p-1 rounded-xl border border-[#26354c]">
            {["all", "error", "info"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                  filter === lvl ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? "Copied" : "Copy Logs"}</span>
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="rounded-2xl border border-[#26354c] bg-[#080d17] p-4 font-mono text-xs overflow-x-auto max-h-[600px] overflow-y-auto space-y-2 shadow-2xl">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 py-8 text-center">No log messages recorded yet.</div>
        ) : (
          filteredLogs.map((l, i) => (
            <div key={i} className="flex items-start gap-3 py-1 border-b border-white/[0.03]">
              <span className="text-slate-500 select-none flex-shrink-0">
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>

              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-bold select-none flex-shrink-0 ${
                  l.level === "ERROR"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : l.level === "SUCCESS"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                }`}
              >
                {l.level}
              </span>

              <span
                className={`flex-1 break-all ${
                  l.level === "ERROR"
                    ? "text-red-300"
                    : l.level === "SUCCESS"
                    ? "text-emerald-300"
                    : "text-slate-300"
                }`}
              >
                {l.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
