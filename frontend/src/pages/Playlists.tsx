import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  ListMusic,
  Search,
  Sparkles,
  ArrowRight,
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Layers,
} from "lucide-react";
import { api } from "../services/api";
import { MediaMetadata } from "../types";
import { Checkbox } from "../components/ui/Checkbox";
import { Select, SelectOption } from "../components/ui/Select";

export const Playlists: React.FC = () => {
  const navigate = useNavigate();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [playlistMeta, setPlaylistMeta] = useState<MediaMetadata | null>(null);
  const [createSubfolder, setCreateSubfolder] = useState(true);
  const [quality, setQuality] = useState("original");
  const [format, setFormat] = useState("mp4");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyzePlaylist = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!playlistUrl.trim()) return;

    setAnalyzing(true);
    setError(null);
    try {
      const meta = await api.analyzeUrl(playlistUrl.trim(), true);
      if (!meta.is_valid) {
        setError(meta.error || "Could not analyze playlist");
      } else {
        if (meta.playlist_entries) {
          meta.playlist_entries = meta.playlist_entries.map((it) => ({
            ...it,
            selected: true,
          }));
        }
        setPlaylistMeta(meta);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze playlist");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleToggleAll = (val: boolean) => {
    if (!playlistMeta || !playlistMeta.playlist_entries) return;
    setPlaylistMeta({
      ...playlistMeta,
      playlist_entries: playlistMeta.playlist_entries.map((it) => ({
        ...it,
        selected: val,
      })),
    });
  };

  const selectedEntries = playlistMeta?.playlist_entries?.filter((it) => it.selected) || [];
  const allSelected = (playlistMeta?.playlist_entries?.length || 0) > 0 && selectedEntries.length === playlistMeta?.playlist_entries?.length;
  const isIndeterminate = selectedEntries.length > 0 && !allSelected;

  const handleDownloadPlaylist = async () => {
    if (!playlistMeta || selectedEntries.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      await api.createBatch({
        name: playlistMeta.title || "Playlist Batch",
        items: selectedEntries.map((it, idx) => ({
          url: it.url,
          title: `${String(idx + 1).padStart(2, "0")} - ${it.title}`,
          creator: it.creator,
          thumbnail: it.thumbnail,
          duration: it.duration,
          quality: quality,
          format: format,
          audio_bitrate: "320k",
        })),
        selected_preset: quality,
        concurrency: 5,
        auto_start: true,
      });

      navigate("/queue");
    } catch (err: any) {
      setError(err.message || "Failed to start playlist download");
      setSubmitting(false);
    }
  };

  const qualityOptions: SelectOption[] = [
    { value: "original", label: "Original / Best Quality" },
    { value: "1080p", label: "1080p Full HD" },
    { value: "720p", label: "720p HD" },
    { value: "audio", label: "Audio Only (MP3)" },
  ];

  const formatOptions: SelectOption[] = [
    { value: "mp4", label: "MP4 Video" },
    { value: "mkv", label: "MKV Raw Stream" },
    { value: "mp3", label: "MP3 Audio" },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
          <ListMusic size={14} className="text-blue-400" />
          <span>Playlist Enumeration Engine</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Playlist Downloader
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Paste album or playlist links, inspect track lists, and download sequentially or selectively.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg">
        <form onSubmit={handleAnalyzePlaylist} className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-3 rounded-xl bg-[#111a2b] border border-[#26354c] w-full">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="Paste playlist URL (e.g. YouTube playlist, SoundCloud album, Vimeo showcase)..."
              className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={analyzing || !playlistUrl.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-blue-900/40 transition-all w-full sm:w-auto cursor-pointer"
          >
            {analyzing ? (
              <>
                <Sparkles size={15} className="animate-spin" /> Enumerating...
              </>
            ) : (
              <>
                <span>Analyze Playlist</span> <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Playlist Preview */}
      {playlistMeta && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-5"
        >
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-[#1e293b] pb-4">
            <div>
              <h3 className="text-lg font-bold text-white">{playlistMeta.title}</h3>
              <p className="text-xs text-slate-400 mt-1">
                {selectedEntries.length} of {playlistMeta.playlist_entries?.length || 0} tracks selected
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                indeterminate={isIndeterminate}
                onChange={handleToggleAll}
                label="Select All Tracks"
              />
            </div>
          </div>

          {/* Track List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {playlistMeta.playlist_entries?.map((entry, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border border-[#1e293b] bg-[#111a2b] flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Checkbox
                    checked={!!entry.selected}
                    onChange={(checked) => {
                      if (!playlistMeta.playlist_entries) return;
                      const updated = [...playlistMeta.playlist_entries];
                      updated[idx].selected = checked;
                      setPlaylistMeta({ ...playlistMeta, playlist_entries: updated });
                    }}
                  />
                  <span className="font-mono text-slate-500 w-6 text-right">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p className="text-slate-200 font-semibold truncate flex-1" title={entry.title}>
                    {entry.title}
                  </p>
                </div>
                {entry.duration ? (
                  <span className="text-slate-400 font-mono text-[11px]">
                    {Math.round(entry.duration)}s
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Footer Submit */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#1e293b]">
            <div className="flex items-center gap-3">
              <Select
                value={quality}
                onChange={setQuality}
                options={qualityOptions}
                size="sm"
              />

              <Select
                value={format}
                onChange={setFormat}
                options={formatOptions}
                size="sm"
              />
            </div>

            <button
              onClick={handleDownloadPlaylist}
              disabled={submitting || selectedEntries.length === 0}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition-all w-full sm:w-auto justify-center cursor-pointer"
            >
              {submitting ? (
                <>
                  <Sparkles size={15} className="animate-spin" /> Queuing Playlist...
                </>
              ) : (
                <>
                  <span>Download Selected ({selectedEntries.length})</span> <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
