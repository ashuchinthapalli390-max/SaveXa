import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Sliders,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowDownCircle,
  HardDrive,
  Video,
  Image as ImageIcon,
  Music,
} from "lucide-react";
import { Job } from "../types";
import { api } from "../services/api";
import { DownloadCard } from "../components/downloads/DownloadCard";
import { formatDualSpeed } from "../utils/formatters";
import { Tabs } from "../components/ui/Tabs";

interface DownloadQueueProps {
  jobs: Job[];
  refreshJobs: () => void;
  totalSpeed: number;
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({ jobs, refreshJobs, totalSpeed }) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mediaFilter, setMediaFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);

  const activeJobs = jobs.filter((j) => j.status === "DOWNLOADING" || j.status === "PROCESSING" || j.status === "VERIFYING");
  const queuedJobs = jobs.filter((j) => j.status === "QUEUED");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");
  const failedJobs = jobs.filter((j) => j.status === "FAILED");

  const filteredJobs = jobs.filter((j) => {
    // Status filter
    if (statusFilter === "active" && !(j.status === "DOWNLOADING" || j.status === "PROCESSING" || j.status === "VERIFYING")) return false;
    if (statusFilter === "queued" && j.status !== "QUEUED") return false;
    if (statusFilter === "completed" && j.status !== "COMPLETED") return false;
    if (statusFilter === "failed" && j.status !== "FAILED") return false;

    // Media filter
    if (mediaFilter === "images") {
      const isImg = j.media_type === "image" || ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"].includes(j.selected_format?.toLowerCase());
      if (!isImg) return false;
    } else if (mediaFilter === "videos") {
      const isImg = j.media_type === "image" || ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"].includes(j.selected_format?.toLowerCase());
      const isAud = ["mp3", "m4a", "flac", "wav", "opus"].includes(j.selected_format?.toLowerCase());
      if (isImg || isAud) return false;
    } else if (mediaFilter === "audio") {
      const isAud = ["mp3", "m4a", "flac", "wav", "opus"].includes(j.selected_format?.toLowerCase());
      if (!isAud) return false;
    }

    return true;
  });

  const handleRetryFailed = async () => {
    setBusy(true);
    try {
      for (const j of failedJobs) {
        await api.retryDownload(j.id);
      }
      refreshJobs();
    } finally {
      setBusy(false);
    }
  };

  const handleClearCompleted = async () => {
    setBusy(true);
    try {
      await api.clearCompleted();
      refreshJobs();
    } finally {
      setBusy(false);
    }
  };

  const totalProgressPct = jobs.length > 0 ? (completedJobs.length / jobs.length) * 100 : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
            <ListOrdered size={14} className="text-blue-400" />
            <span>Persistent Queue Manager</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Download Queue
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time status of active, pending, and completed download operations.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {failedJobs.length > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw size={14} /> Retry Failed ({failedJobs.length})
            </button>
          )}

          {completedJobs.length > 0 && (
            <button
              onClick={handleClearCompleted}
              disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Trash2 size={14} /> Clear Completed
            </button>
          )}
        </div>
      </div>

      {/* Aggregate Batch Summary Card */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <span className="text-xs text-slate-400 font-medium">Total Items</span>
            <div className="text-xl font-bold text-white mt-1">{jobs.length}</div>
          </div>
          <div>
            <span className="text-xs text-emerald-400 font-medium">Completed</span>
            <div className="text-xl font-bold text-emerald-300 mt-1">{completedJobs.length}</div>
          </div>
          <div>
            <span className="text-xs text-blue-400 font-medium">Downloading</span>
            <div className="text-xl font-bold text-blue-300 mt-1">{activeJobs.length}</div>
          </div>
          <div>
            <span className="text-xs text-sky-400 font-medium">Pending Queue</span>
            <div className="text-xl font-bold text-sky-300 mt-1">{queuedJobs.length}</div>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="pt-2">
          <div className="w-full h-2 rounded-full bg-[#172338] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-400 to-emerald-400"
              style={{ width: `${totalProgressPct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
            <span>
              {completedJobs.length} of {jobs.length} items completed ({totalProgressPct.toFixed(0)}%)
            </span>
            {activeJobs.length > 0 && (
              <span className="font-mono text-blue-300 font-semibold">
                Combined Speed: {formatDualSpeed(totalSpeed)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1e293b] pb-3">
        <Tabs
          tabs={[
            { id: "all", label: "All Items", count: jobs.length },
            { id: "active", label: "Active", count: activeJobs.length },
            { id: "queued", label: "Queued", count: queuedJobs.length },
            { id: "completed", label: "Completed", count: completedJobs.length },
            { id: "failed", label: "Failed", count: failedJobs.length },
          ]}
          activeTab={statusFilter}
          onChange={setStatusFilter}
          size="sm"
        />

        {/* Media type sub-filter */}
        <div className="flex items-center gap-1.5 bg-[#0b1220] p-1 rounded-xl border border-[#1e293b]">
          {[
            { id: "all", label: "All Types" },
            { id: "videos", label: "Videos", icon: <Video size={13} /> },
            { id: "images", label: "Images", icon: <ImageIcon size={13} /> },
            { id: "audio", label: "Audio", icon: <Music size={13} /> },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMediaFilter(m.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                mediaFilter === m.id
                  ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m.icon}
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-[#1e293b] bg-[#0b1220]/50">
            <p className="text-sm text-slate-400">No jobs in this category.</p>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <DownloadCard key={job.id} job={job} onRefresh={refreshJobs} />
          ))
        )}
      </div>
    </div>
  );
};
