import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  PlusCircle,
  Search,
  Sparkles,
  ArrowRight,
  FileVideo,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Folder,
  Layers,
  Film,
  Music,
} from "lucide-react";
import { api } from "../services/api";
import { MediaMetadata } from "../types";
import { Select, SelectOption } from "../components/ui/Select";

export const NewDownload: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [selectedQuality, setSelectedQuality] = useState("original");
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [audioBitrate, setAudioBitrate] = useState("320k");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If navigated from Dashboard with initial URL / metadata
  useEffect(() => {
    if (location.state?.url) {
      setUrl(location.state.url);
    }
    if (location.state?.initialMeta) {
      setMetadata(location.state.initialMeta);
    }
  }, [location.state]);

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setAnalyzing(true);
    setError(null);
    try {
      const meta = await api.analyzeUrl(url.trim(), true);
      if (!meta.is_valid) {
        setError(meta.error || "Could not analyze link");
      } else {
        setMetadata(meta);
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze link");
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // Ignore
    }
  };

  const handleStartDownload = async () => {
    if (!metadata) return;
    setSubmitting(true);
    setError(null);

    try {
      await api.createDownload({
        url: metadata.url,
        title: metadata.title,
        creator: metadata.creator,
        thumbnail: metadata.thumbnail,
        duration: metadata.duration,
        quality: selectedQuality,
        format: selectedFormat,
        audio_bitrate: audioBitrate,
      });

      navigate("/queue");
    } catch (err: any) {
      setError(err.message || "Failed to start download");
      setSubmitting(false);
    }
  };

  const videoFormatOptions: SelectOption[] = [
    { value: "mp4", label: "MP4 (Default video compatibility)" },
    { value: "mkv", label: "MKV (Preserves all raw streams)" },
    { value: "webm", label: "WebM (Open web media)" },
  ];

  const audioFormatOptions: SelectOption[] = [
    { value: "mp3", label: "MP3 (Universal compatibility)" },
    { value: "m4a", label: "M4A (Apple AAC)" },
    { value: "flac", label: "FLAC (Lossless Hi-Fi)" },
    { value: "wav", label: "WAV (Uncompressed)" },
    { value: "opus", label: "OPUS (Modern low-latency)" },
  ];

  const bitrateOptions: SelectOption[] = [
    { value: "320k", label: "320 kbps (Highest Quality)" },
    { value: "256k", label: "256 kbps (High Quality)" },
    { value: "192k", label: "192 kbps (Standard Quality)" },
    { value: "128k", label: "128 kbps (Compact)" },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
          <PlusCircle size={14} className="text-blue-400" />
          <span>Smart Media Inspector</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          New Download
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Inspect source stream options, audio tracks, and choose exact quality.
        </p>
      </div>

      {/* URL Input Bar */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg">
        <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-3 rounded-xl bg-[#111a2b] border border-[#26354c] w-full">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste media link (YouTube, Vimeo, SoundCloud, or direct video/audio)..."
              className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePaste}
              className="px-4 py-3 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Paste
            </button>
            <button
              type="submit"
              disabled={analyzing || !url.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-blue-900/40 transition-all w-full sm:w-auto cursor-pointer"
            >
              {analyzing ? (
                <>
                  <Sparkles size={15} className="animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  <span>Analyze</span> <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Metadata & Quality Chooser */}
      {metadata && metadata.is_valid && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-6"
        >
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Thumbnail */}
            <div className="w-full sm:w-48 h-32 rounded-xl overflow-hidden bg-black/50 border border-[#26354c] flex-shrink-0 relative">
              {metadata.thumbnail ? (
                <img src={metadata.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                  No Thumbnail
                </div>
              )}
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-bold text-blue-300 uppercase">
                {metadata.source}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-2">
              <h3 className="text-lg font-bold text-white line-clamp-2">{metadata.title}</h3>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                {metadata.creator && <span>By {metadata.creator}</span>}
                {metadata.duration ? (
                  <span>• {Math.floor(metadata.duration / 60)}m {Math.round(metadata.duration % 60)}s</span>
                ) : null}
                <span>• {metadata.formats.length} formats available</span>
              </div>
            </div>
          </div>

          {/* Quality Options */}
          <div className="space-y-4 pt-4 border-t border-[#1e293b]">
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-2">
                Quality Preference
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "original", label: "Original / Best", icon: Film },
                  { id: "1080p", label: "1080p Full HD", icon: Film },
                  { id: "720p", label: "720p HD", icon: Film },
                  { id: "audio", label: "Audio Only", icon: Music },
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSelectedQuality(opt.id);
                        if (opt.id === "audio") {
                          setSelectedFormat("mp3");
                        } else {
                          setSelectedFormat("mp4");
                        }
                      }}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        selectedQuality === opt.id
                          ? "bg-blue-600/20 border-blue-500 text-white"
                          : "bg-[#111a2b] border-[#26354c] text-slate-400 hover:text-white hover:bg-[#172338]"
                      }`}
                    >
                      <Icon size={16} className={selectedQuality === opt.id ? "text-blue-400" : "text-slate-500"} />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format Container Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1.5">
                  Output Format Container
                </label>
                <Select
                  value={selectedFormat}
                  onChange={setSelectedFormat}
                  options={selectedQuality === "audio" ? audioFormatOptions : videoFormatOptions}
                  className="w-full"
                />
              </div>

              {selectedQuality === "audio" && (
                <div>
                  <label className="text-xs text-slate-400 font-semibold block mb-1.5">
                    Audio Bitrate
                  </label>
                  <Select
                    value={audioBitrate}
                    onChange={setAudioBitrate}
                    options={bitrateOptions}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-4 flex justify-end">
              <button
                onClick={handleStartDownload}
                disabled={submitting}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold shadow-lg shadow-blue-900/40 transition-all cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Sparkles size={16} className="animate-spin" /> Adding to Queue...
                  </>
                ) : (
                  <>
                    <span>Start Download</span> <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
