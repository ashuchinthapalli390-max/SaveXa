import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Music,
  Disc,
  Sliders,
  Sparkles,
  ArrowRight,
  Headphones,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { api } from "../services/api";

export const AudioXa: React.FC = () => {
  const navigate = useNavigate();
  const [urlsText, setUrlsText] = useState("");
  const [format, setFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState("320k");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedUrls = urlsText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http://") || l.startsWith("https://"));

  const handleStartAudioDownloads = async () => {
    if (parsedUrls.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      if (parsedUrls.length === 1) {
        await api.createDownload({
          url: parsedUrls[0],
          quality: "audio",
          format: format,
          audio_bitrate: bitrate,
        });
      } else {
        await api.createBatch({
          name: `AudioXa_Collection_${parsedUrls.length}_tracks`,
          items: parsedUrls.map((u) => ({
            url: u,
            quality: "audio",
            format: format,
            audio_bitrate: bitrate,
          })),
          selected_preset: "audio_only",
          concurrency: 5,
          auto_start: true,
        });
      }
      navigate("/queue");
    } catch (err: any) {
      setError(err.message || "Failed to start audio download");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
          <Music size={14} className="text-blue-400" />
          <span>AudioXa Dedicated Audio Engine</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          AudioXa
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Lossless audio extraction, custom bitrates, and multi-format conversion via FFmpeg.
        </p>
      </div>

      {/* Main Form */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-6">
        <div>
          <label className="text-xs text-slate-400 font-semibold block mb-2">
            Paste Media Link or Multiple Audio URLs (one per line)
          </label>
          <textarea
            rows={4}
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            placeholder="https://example.com/song-1&#10;https://example.com/song-2"
            className="w-full p-4 rounded-xl bg-[#111a2b] border border-[#26354c] text-sm font-mono text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 resize-y"
          />
          <div className="text-xs text-slate-500 mt-1">
            {parsedUrls.length} valid media {parsedUrls.length === 1 ? "track" : "tracks"} identified
          </div>
        </div>

        {/* Audio Format and Bitrate Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-[#1e293b]">
          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-2">
              Audio Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "mp3", label: "MP3", desc: "Universal" },
                { id: "m4a", label: "M4A", desc: "Apple / AAC" },
                { id: "flac", label: "FLAC", desc: "Lossless Hi-Fi" },
                { id: "wav", label: "WAV", desc: "Uncompressed" },
                { id: "opus", label: "OPUS", desc: "Modern" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    format === f.id
                      ? "bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-950/20"
                      : "bg-[#111a2b] border-[#26354c] text-slate-400 hover:text-white hover:bg-[#172338]"
                  }`}
                >
                  <div className="text-xs font-bold">{f.label}</div>
                  <div className="text-[10px] text-slate-500">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-2">
              Audio Bitrate
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "320k", label: "320 kbps", desc: "Maximum Fidelity" },
                { id: "256k", label: "256 kbps", desc: "High Quality" },
                { id: "192k", label: "192 kbps", desc: "Standard Quality" },
                { id: "128k", label: "128 kbps", desc: "Compact Size" },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBitrate(b.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    bitrate === b.id
                      ? "bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-950/20"
                      : "bg-[#111a2b] border-[#26354c] text-slate-400 hover:text-white hover:bg-[#172338]"
                  }`}
                >
                  <div className="text-xs font-bold">{b.label}</div>
                  <div className="text-[10px] text-slate-500">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Note */}
        <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/40 text-xs text-blue-300 flex items-start gap-2">
          <Headphones size={15} className="mt-0.5 flex-shrink-0 text-blue-400" />
          <span>
            Original source audio quality is preserved. Converting to 320 kbps ensures maximum bitrate without stripping existing harmonics.
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleStartAudioDownloads}
            disabled={submitting || parsedUrls.length === 0}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold shadow-lg shadow-blue-900/40 transition-all cursor-pointer"
          >
            {submitting ? (
              <>
                <Sparkles size={16} className="animate-spin" /> Queuing Audio...
              </>
            ) : (
              <>
                <span>Extract Audio ({parsedUrls.length})</span> <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
