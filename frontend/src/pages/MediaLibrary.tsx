import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FolderOpen,
  Play,
  Scissors,
  Search,
  ExternalLink,
  FileVideo,
  FileAudio,
  Image as ImageIcon,
  Folder,
  X,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { api } from "../services/api";
import { LibraryItem } from "../types";
import { formatBytes } from "../utils/formatters";

export const MediaLibrary: React.FC = () => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activePreview, setActivePreview] = useState<LibraryItem | null>(null);

  // Trim state
  const [trimItem, setTrimItem] = useState<LibraryItem | null>(null);
  const [trimStart, setTrimStart] = useState("00:00:00");
  const [trimEnd, setTrimEnd] = useState("00:00:30");
  const [trimming, setTrimming] = useState(false);
  const [trimSuccess, setTrimSuccess] = useState<string | null>(null);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const data = await api.getLibrary(filterType !== "all" ? filterType : undefined, search || undefined);
      setItems(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, [filterType, search]);

  const handleOpenFile = async (item: LibraryItem) => {
    await api.openFile(item.output_path);
  };

  const handleOpenFolder = async (item: LibraryItem) => {
    await api.openFolder(item.output_path);
  };

  const handleExecuteTrim = async () => {
    if (!trimItem) return;
    setTrimming(true);
    setTrimSuccess(null);
    try {
      const ext = trimItem.filename.split(".").pop() || "mp4";
      const outName = `${trimItem.filename.replace(`.${ext}`, "")}_clip.${ext}`;
      await api.trimMedia({
        input_path: trimItem.output_path,
        output_filename: outName,
        start_time: trimStart,
        end_time: trimEnd,
      });
      setTrimSuccess(`Clip saved: ${outName}`);
      loadLibrary();
    } catch {
      // Ignore
    } finally {
      setTrimming(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
            <FolderOpen size={14} className="text-blue-400" />
            <span>Local Media Archive</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Media Library
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Browse, play, trim, and organize your saved videos, images, and audio tracks.
          </p>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search library..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#111a2b] border border-[#26354c] text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#111a2b] p-1 rounded-xl border border-[#26354c]">
            {["all", "video", "image", "audio"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                  filterType === t
                    ? "bg-blue-600 text-white shadow-md shadow-blue-950/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 text-xs">Loading media library...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-[#1e293b] bg-[#0b1220]/50">
          <FolderOpen size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm text-slate-400">No media saved yet.</p>
          <p className="text-xs text-slate-500 mt-1">
            Downloaded videos, images, and audios will automatically show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#1e293b] bg-[#0b1220] p-4 space-y-3 hover:border-blue-500/40 transition-all flex flex-col justify-between shadow-md"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    {item.format} • {item.quality}
                  </span>
                  <span className="text-[11px] text-slate-500">{formatBytes(item.file_size)}</span>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-3 rounded-xl bg-[#111a2b] border border-[#26354c] text-blue-400 flex-shrink-0">
                    {item.media_type === "image" ? (
                      <ImageIcon size={22} />
                    ) : item.media_type === "audio" ? (
                      <FileAudio size={22} />
                    ) : (
                      <FileVideo size={22} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white line-clamp-2" title={item.title}>
                      {item.title}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">
                      {item.filename}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#1e293b] text-xs">
                <button
                  onClick={() => setActivePreview(item)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-semibold transition-colors cursor-pointer"
                >
                  <Play size={13} /> Preview
                </button>

                <div className="flex items-center gap-1">
                  {item.media_type !== "image" && (
                    <button
                      onClick={() => {
                        setTrimItem(item);
                        setTrimSuccess(null);
                      }}
                      className="p-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Trim media"
                    >
                      <Scissors size={14} />
                    </button>
                  )}

                  <button
                    onClick={() => handleOpenFile(item)}
                    className="p-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Open in Windows Player"
                  >
                    <ExternalLink size={14} />
                  </button>

                  <button
                    onClick={() => handleOpenFolder(item)}
                    className="p-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Open Folder"
                  >
                    <Folder size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Player Modal */}
      <AnimatePresence>
        {activePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl rounded-3xl border border-[#26354c] bg-[#0b1220] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white truncate">{activePreview.title}</h3>
                  <p className="text-[11px] text-slate-400 font-mono truncate">{activePreview.filename}</p>
                </div>
                <button
                  onClick={() => setActivePreview(null)}
                  className="p-1.5 rounded-xl bg-[#111a2b] text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden bg-black/80 flex items-center justify-center max-h-[60vh]">
                {activePreview.media_type === "audio" ? (
                  <div className="p-8 text-center space-y-3 w-full">
                    <FileAudio size={48} className="mx-auto text-blue-400" />
                    <p className="text-xs text-slate-300 font-medium">{activePreview.title}</p>
                    <p className="text-[11px] text-slate-500">Audio playback through system player</p>
                    <button
                      onClick={() => handleOpenFile(activePreview)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      <Play size={14} /> Play in Default Media Player
                    </button>
                  </div>
                ) : (
                  <div className="p-8 text-center space-y-3 w-full">
                    <FileVideo size={48} className="mx-auto text-blue-400" />
                    <p className="text-xs text-slate-300 font-medium">{activePreview.title}</p>
                    <p className="text-[11px] text-slate-500">{activePreview.output_path}</p>
                    <div className="flex justify-center gap-3 pt-2">
                      <button
                        onClick={() => handleOpenFile(activePreview)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        <Play size={14} /> Open Video
                      </button>
                      <button
                        onClick={() => handleOpenFolder(activePreview)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <Folder size={14} /> Show in Explorer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Trim Modal */}
      <AnimatePresence>
        {trimItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-3xl border border-[#26354c] bg-[#0b1220] p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Scissors size={15} className="text-blue-400" /> Trim Media Clip
                </h3>
                <button
                  onClick={() => setTrimItem(null)}
                  className="p-1 rounded-lg bg-[#111a2b] text-slate-400 hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <p className="text-xs text-slate-300 font-medium truncate">{trimItem.title}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{trimItem.filename}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">Start Time (hh:mm:ss)</label>
                  <input
                    type="text"
                    value={trimStart}
                    onChange={(e) => setTrimStart(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#111a2b] border border-[#26354c] text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-medium block mb-1">End Time (hh:mm:ss)</label>
                  <input
                    type="text"
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#111a2b] border border-[#26354c] text-xs font-mono text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {trimSuccess && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>{trimSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1e293b]">
                <button
                  onClick={() => setTrimItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteTrim}
                  disabled={trimming}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {trimming ? <Sparkles size={14} className="animate-spin" /> : <Scissors size={14} />}
                  <span>{trimming ? "Trimming..." : "Extract Clip"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
