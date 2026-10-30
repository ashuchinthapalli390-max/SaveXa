import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Folder, HardDrive, Plus, ArrowDownCircle, Zap, Cpu } from "lucide-react";
import { api } from "../../services/api";
import { SystemStatus, PerformanceStatus } from "../../types";
import { formatBytes, formatDualSpeed } from "../../utils/formatters";

interface TopBarProps {
  totalSpeed: number;
  activeCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({ totalSpeed, activeCount }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [perfStatus, setPerfStatus] = useState<PerformanceStatus | null>(null);

  const loadStatus = async () => {
    try {
      const [sys, perf] = await Promise.allSettled([
        api.getStatus(),
        api.getPerformanceStatus(),
      ]);
      if (sys.status === "fulfilled") setStatus(sys.value);
      if (perf.status === "fulfilled") setPerfStatus(perf.value);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenFolder = async () => {
    if (status?.default_destination) {
      await api.openFolder(status.default_destination);
    }
  };

  const activeWorkers = perfStatus?.active_workers ?? activeCount;
  const maxWorkers = perfStatus?.global_max_workers ?? 20;
  const currentSpeed = totalSpeed > 0 ? totalSpeed : (perfStatus?.speed_bytes_sec ?? 0);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 bg-[#080d17]/85 backdrop-blur-xl border-b border-[#1e293b]/70">
      <div className="flex items-center gap-3">
        {status?.default_destination && (
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#1e293b] text-xs text-slate-300 hover:text-white hover:bg-[#172338] hover:border-blue-500/40 transition-all cursor-pointer"
            title="Open download folder in Windows Explorer"
          >
            <Folder size={14} className="text-blue-400" />
            <span className="max-w-[220px] truncate">{status.default_destination}</span>
          </button>
        )}

        {status && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#1e293b]">
            <HardDrive size={13} className="text-blue-400" />
            <span>Free:</span>
            <span className="font-semibold text-slate-200">
              {formatBytes(status.storage_free_bytes)}
            </span>
          </div>
        )}

        {perfStatus && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 px-2.5 py-1.5 rounded-lg bg-[#111a2b] border border-[#1e293b]">
            <Cpu size={13} className="text-blue-400" />
            <span>Workers:</span>
            <span className="font-mono font-bold text-blue-300">
              {activeWorkers}/{maxWorkers}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 ml-1 font-semibold">
              ({perfStatus.mode})
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {activeWorkers > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 shadow-[0_0_15px_rgba(37,99,235,0.2)]">
            <ArrowDownCircle size={14} className="text-blue-400 animate-bounce" />
            <span className="font-medium">{activeWorkers} downloading</span>
            <span className="text-blue-500/60">•</span>
            <span className="font-mono font-bold text-white tracking-wide">
              {formatDualSpeed(currentSpeed)}
            </span>
          </div>
        )}

        <Link
          to="/new"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/40 transition-all active:scale-95"
        >
          <Plus size={15} />
          <span>New Link</span>
        </Link>
      </div>
    </header>
  );
};
