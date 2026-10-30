import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Folder,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { Job } from "../../types";
import { api } from "../../services/api";
import { formatBytes, formatDualSpeed } from "../../utils/formatters";

interface DownloadCardProps {
  job: Job;
  onRefresh?: () => void;
}

export const DownloadCard: React.FC<DownloadCardProps> = ({ job, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);

  const formatEta = (seconds?: number) => {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return null;
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const remS = s % 60;
    return `${m}m ${remS}s`;
  };

  const handlePause = async () => {
    setActing(true);
    try {
      await api.pauseDownload(job.id);
      onRefresh?.();
    } finally {
      setActing(false);
    }
  };

  const handleResume = async () => {
    setActing(true);
    try {
      await api.resumeDownload(job.id);
      onRefresh?.();
    } finally {
      setActing(false);
    }
  };

  const handleRetry = async () => {
    setActing(true);
    try {
      await api.retryDownload(job.id);
      onRefresh?.();
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    setActing(true);
    try {
      await api.cancelDownload(job.id);
      onRefresh?.();
    } finally {
      setActing(false);
    }
  };

  const handleOpenFile = async () => {
    if (job.output_path) {
      await api.openFile(job.output_path);
    }
  };

  const handleOpenFolder = async () => {
    if (job.output_path) {
      await api.openFolder(job.output_path);
    } else if (job.destination_dir) {
      await api.openFolder(job.destination_dir);
    }
  };

  const isCompleted = job.status === "COMPLETED";
  const isDownloading = job.status === "DOWNLOADING";
  const isProcessing = job.status === "PROCESSING" || job.status === "VERIFYING";
  const isFailed = job.status === "FAILED";
  const isPaused = job.status === "PAUSED";
  const isQueued = job.status === "QUEUED";

  const isImage = job.media_type === "image" || ["jpg", "jpeg", "png", "webp", "gif", "svg", "avif"].includes(job.selected_format?.toLowerCase());

  return (
    <motion.div
      layout
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        isCompleted
          ? "bg-[#0b1220] border-emerald-500/20 hover:border-emerald-500/40"
          : isFailed
          ? "bg-[#180f12]/90 border-red-500/30 hover:border-red-500/50"
          : isDownloading
          ? "bg-[#111a2b] border-blue-500/50 shadow-lg shadow-blue-950/30"
          : "bg-[#0b1220] border-[#1e293b] hover:border-slate-600"
      }`}
    >
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Thumbnail or Media Icon */}
        <div className="flex items-center gap-3.5 flex-1 min-w-0">
          <div className="relative w-16 h-12 rounded-xl overflow-hidden bg-black/50 border border-[#26354c] flex-shrink-0 flex items-center justify-center">
            {job.thumbnail_url ? (
              <img
                src={job.thumbnail_url}
                alt={job.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : isImage ? (
              <ImageIcon className="text-blue-400" size={24} />
            ) : ["mp3", "m4a", "flac", "wav"].includes(job.selected_format?.toLowerCase()) ? (
              <FileAudio className="text-sky-400" size={24} />
            ) : (
              <FileVideo className="text-blue-400" size={24} />
            )}

            {/* Quality / Resolution pill badge */}
            <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-bold text-blue-300">
              {job.image_width && job.image_height
                ? `${job.image_width}p`
                : job.actual_quality || job.selected_quality}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white truncate" title={job.title}>
              {job.title}
            </h4>

            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
              <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#172338] border border-[#26354c] font-semibold text-blue-300">
                {job.actual_format || job.image_format || job.selected_format}
              </span>

              {job.image_width && job.image_height ? (
                <span className="text-[11px] text-slate-400">
                  {job.image_width} × {job.image_height}
                </span>
              ) : job.creator ? (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[120px]">{job.creator}</span>
                </>
              ) : null}

              {/* Status pill */}
              <span>•</span>
              {isCompleted && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 size={12} /> Completed ({formatBytes(job.file_size)})
                </span>
              )}
              {isDownloading && (
                <span className="flex items-center gap-1.5 text-blue-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                  Downloading {formatDualSpeed(job.speed)}
                </span>
              )}
              {isProcessing && (
                <span className="flex items-center gap-1 text-amber-400 font-medium">
                  <Sparkles size={12} className="animate-spin" /> Finalizing Streams
                </span>
              )}
              {isQueued && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock size={12} /> In Queue
                </span>
              )}
              {isPaused && (
                <span className="text-amber-400 font-medium">Paused</span>
              )}
              {isFailed && (
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  <AlertCircle size={12} /> Failed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {isDownloading && (
            <button
              onClick={handlePause}
              disabled={acting}
              className="p-2 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Pause"
            >
              <Pause size={16} />
            </button>
          )}

          {isPaused && (
            <button
              onClick={handleResume}
              disabled={acting}
              className="p-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white transition-colors cursor-pointer"
              title="Resume"
            >
              <Play size={16} />
            </button>
          )}

          {isFailed && (
            <button
              onClick={handleRetry}
              disabled={acting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30 text-xs font-semibold transition-colors cursor-pointer"
              title="Retry download"
            >
              <RotateCcw size={14} /> Retry
            </button>
          )}

          {isCompleted && (
            <>
              <button
                onClick={handleOpenFile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                title="Open file"
              >
                <Play size={13} /> Open
              </button>
              <button
                onClick={handleOpenFolder}
                className="p-2 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Show in Windows Explorer"
              >
                <Folder size={15} />
              </button>
            </>
          )}

          {(isDownloading || isQueued) && (
            <button
              onClick={handleCancel}
              disabled={acting}
              className="p-2 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Cancel"
            >
              <XCircle size={16} />
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Inspect Details"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Live Progress Bar */}
      {(isDownloading || isProcessing || isPaused) && (
        <div className="px-5 pb-3">
          <div className="w-full h-1.5 rounded-full bg-[#172338] overflow-hidden">
            <motion.div
              className={`h-full rounded-full transition-all duration-300 ${
                isDownloading
                  ? "bg-gradient-to-r from-blue-600 via-blue-400 to-sky-300"
                  : isProcessing
                  ? "bg-gradient-to-r from-amber-400 to-orange-400"
                  : "bg-slate-600"
              }`}
              style={{ width: `${Math.max(2, job.progress)}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
            <span>
              {formatBytes(job.downloaded_bytes)} of{" "}
              {job.file_size ? formatBytes(job.file_size) : "unknown size"} ({job.progress.toFixed(1)}%)
            </span>
            <div className="flex items-center gap-3">
              {job.speed > 0 && (
                <span className="font-mono text-blue-300 font-medium">
                  {formatDualSpeed(job.speed)}
                </span>
              )}
              {formatEta(job.eta) && (
                <span className="text-slate-300 font-medium">ETA {formatEta(job.eta)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded Details Drawer */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 py-3.5 border-t border-[#1e293b] bg-[#080d17]/60 text-xs space-y-2"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
              <div>
                <span className="text-slate-500">Source URL:</span>
                <p className="font-mono text-slate-300 truncate" title={job.source_url}>
                  {job.source_url}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Output Destination:</span>
                <p className="font-mono text-slate-300 truncate" title={job.output_path || job.destination_dir}>
                  {job.output_path || job.destination_dir}
                </p>
              </div>
            </div>

            {job.content_hash && (
              <div className="text-[11px] font-mono text-slate-400">
                <span className="text-slate-500">SHA-256: </span>
                <span>{job.content_hash}</span>
              </div>
            )}

            {job.error_message && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/40 text-red-300 text-xs font-mono">
                {job.error_message}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
