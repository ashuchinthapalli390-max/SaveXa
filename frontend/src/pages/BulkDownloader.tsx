import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Layers,
  Upload,
  FileText,
  FileSpreadsheet,
  Check,
  Trash2,
  Sparkles,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertCircle,
  Folder,
  Sliders,
  Settings2,
  Clock,
  Play,
  RotateCcw,
} from "lucide-react";
import { api } from "../services/api";
import { MediaMetadata } from "../types";
import { Checkbox } from "../components/ui/Checkbox";
import { Select, SelectOption } from "../components/ui/Select";
import { Slider } from "../components/ui/Slider";

export const BulkDownloader: React.FC = () => {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaMetadata[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("original"); // original, high_mp4, audio_only, data_saver, custom
  const [concurrency, setConcurrency] = useState(10);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [batchName, setBatchName] = useState("");
  const [destinationFolder, setDestinationFolder] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live URL parsing stats
  const urlStats = useMemo(() => {
    const rawLines = inputText.split("\n").map((l) => l.trim()).filter(Boolean);
    const seen = new Set<string>();
    let valid = 0;
    let duplicates = 0;
    let invalid = 0;

    for (const line of rawLines) {
      if (line.startsWith("http://") || line.startsWith("https://")) {
        if (seen.has(line)) {
          duplicates++;
        } else {
          seen.add(line);
          valid++;
        }
      } else {
        invalid++;
      }
    }

    return {
      total: rawLines.length,
      valid,
      duplicates,
      invalid,
      uniqueUrls: Array.from(seen),
    };
  }, [inputText]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText((prev) => (prev ? `${prev}\n${text}` : text));
      }
    } catch {
      // Ignore
    }
  };

  const handleRemoveDuplicates = () => {
    const rawLines = inputText.split("\n").map((l) => l.trim()).filter(Boolean);
    const unique = Array.from(new Set(rawLines));
    setInputText(unique.join("\n"));
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>, isCsv = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      if (isCsv) {
        const lines = content.split("\n");
        const foundUrls: string[] = [];
        for (const line of lines) {
          const match = line.match(/https?:\/\/[^\s,"]+/g);
          if (match) {
            foundUrls.push(...match);
          }
        }
        if (foundUrls.length > 0) {
          setInputText((prev) => (prev ? `${prev}\n${foundUrls.join("\n")}` : foundUrls.join("\n")));
        }
      } else {
        setInputText((prev) => (prev ? `${prev}\n${content.trim()}` : content.trim()));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleAnalyzeAll = async () => {
    const urlsToAnalyze = urlStats.uniqueUrls.slice(0, 200);
    if (urlsToAnalyze.length === 0) return;

    setAnalyzing(true);
    setErrorMessage(null);

    try {
      const results = await api.analyzeBulk(urlsToAnalyze);
      const initialized = results.map((item) => ({
        ...item,
        selected: item.is_valid,
        targetQuality: selectedPreset === "audio_only" ? "audio" : selectedPreset === "high_mp4" ? "1080p" : "original",
        targetFormat: selectedPreset === "audio_only" ? "mp3" : "mp4",
      }));
      setMediaItems(initialized);
    } catch (err: any) {
      setErrorMessage(err.message || "Bulk analysis failed. Please verify URLs and backend connection.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    setMediaItems((prev) =>
      prev.map((item) => {
        let q = "original";
        let f = "mp4";
        if (preset === "audio_only") {
          q = "audio";
          f = "mp3";
        } else if (preset === "high_mp4") {
          q = "1080p";
          f = "mp4";
        } else if (preset === "data_saver") {
          q = "480p";
          f = "mp4";
        }
        return {
          ...item,
          targetQuality: q,
          targetFormat: f,
        };
      })
    );
  };

  const selectedItems = useMemo(() => mediaItems.filter((i) => i.selected && i.is_valid), [mediaItems]);

  const toggleSelectAll = (checked: boolean) => {
    setMediaItems((prev) => prev.map((item) => ({ ...item, selected: item.is_valid ? checked : false })));
  };

  const allSelected = mediaItems.length > 0 && selectedItems.length === mediaItems.filter((i) => i.is_valid).length;
  const isIndeterminate = selectedItems.length > 0 && !allSelected;

  const handleStartDownload = async () => {
    if (selectedItems.length === 0) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        name: batchName || `Bulk Download (${selectedItems.length} items)`,
        items: selectedItems.map((item) => ({
          url: item.url,
          title: item.title,
          creator: item.creator,
          thumbnail: item.thumbnail,
          duration: item.duration,
          quality: item.targetQuality || "original",
          format: item.targetFormat || "mp4",
          audio_bitrate: "320k",
        })),
        selected_preset: selectedPreset,
        destination_folder: destinationFolder || undefined,
        concurrency: concurrency,
        auto_start: true,
        skip_duplicates: skipDuplicates,
      };

      const batch = await api.createBatch(payload);
      navigate("/queue", { state: { batchId: batch.id } });
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to start bulk download");
      setSubmitting(false);
    }
  };

  const formatOptions: SelectOption[] = [
    { value: "mp4", label: "MP4" },
    { value: "mkv", label: "MKV" },
    { value: "mp3", label: "MP3" },
    { value: "m4a", label: "M4A" },
    { value: "flac", label: "FLAC" },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
          <Layers size={14} className="text-blue-400" />
          <span>Universal Bulk Download Engine (Up to 200 Links)</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Bulk Downloader
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Queue up to 200 media links simultaneously with bounded concurrency, automatic deduplication, and original quality preservation.
        </p>
      </div>

      {/* Input Panel */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <span>Paste Links (one per line, up to 200 links)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePaste}
              className="px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Paste Clipboard
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer">
              <FileText size={13} className="text-blue-400" />
              <span>Import TXT</span>
              <input
                type="file"
                accept=".txt"
                className="hidden"
                onChange={(e) => handleImportFile(e, false)}
              />
            </label>

            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer">
              <FileSpreadsheet size={13} className="text-emerald-400" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleImportFile(e, true)}
              />
            </label>

            <button
              onClick={handleRemoveDuplicates}
              disabled={urlStats.duplicates === 0}
              className="px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] disabled:opacity-40 text-xs font-medium text-amber-300 transition-colors cursor-pointer"
            >
              Deduplicate
            </button>

            <button
              onClick={() => {
                setInputText("");
                setMediaItems([]);
              }}
              disabled={!inputText}
              className="p-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-red-500/20 text-slate-400 hover:text-red-400 disabled:opacity-40 transition-colors cursor-pointer"
              title="Clear all"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <textarea
          rows={6}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`https://example.com/video-1\nhttps://example.com/video-2\nhttps://example.com/video-3\nPaste up to 200 media links...`}
          className="w-full p-4 rounded-xl bg-[#111a2b] border border-[#26354c] text-sm font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
        />

        {/* Live Detected Stats & Trigger */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-white">
              {urlStats.total} {urlStats.total === 1 ? "Link" : "Links"} Detected
            </span>
            <span className="text-emerald-400 font-medium">{urlStats.valid} Valid</span>
            {urlStats.valid > 200 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold">
                Capped at 200 links
              </span>
            )}
            {urlStats.duplicates > 0 && (
              <span className="text-amber-400 font-medium">{urlStats.duplicates} Duplicates</span>
            )}
            {urlStats.invalid > 0 && (
              <span className="text-red-400 font-medium">{urlStats.invalid} Invalid</span>
            )}
          </div>

          <button
            onClick={handleAnalyzeAll}
            disabled={analyzing || urlStats.valid === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition-all w-full sm:w-auto justify-center cursor-pointer"
          >
            {analyzing ? (
              <>
                <Sparkles size={15} className="animate-spin" /> Analyzing {Math.min(urlStats.valid, 200)} Links...
              </>
            ) : (
              <>
                <span>Analyze {urlStats.valid > 0 ? `${Math.min(urlStats.valid, 200)} Links` : "All Links"}</span> <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preset & Batch Settings Panel */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sliders size={16} className="text-blue-400" /> Bulk Download Configuration
        </h3>

        {/* Quality Presets */}
        <div>
          <label className="text-xs text-slate-400 font-medium block mb-2">
            Quality Preset Mode
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: "original", label: "Original / Best", desc: "Highest source streams" },
              { id: "high_mp4", label: "High MP4 (1080p)", desc: "1080p stream copy" },
              { id: "audio_only", label: "Audio Only", desc: "MP3 320 kbps lossless extract" },
              { id: "data_saver", label: "Data Saver (480p)", desc: "Reduced file size" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedPreset === p.id
                    ? "bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-950/20"
                    : "bg-[#111a2b] border-[#26354c] text-slate-400 hover:bg-[#172338] hover:text-slate-200"
                }`}
              >
                <div className="text-xs font-bold">{p.label}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Concurrency and Duplicates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-t border-[#1e293b]">
          <div>
            <Slider
              value={concurrency}
              min={1}
              max={20}
              step={1}
              onChange={setConcurrency}
              label="Concurrent Workers"
              unit="workers"
            />
            <p className="text-[10px] text-slate-500 mt-1">1 to 20 workers. Global budget enforcement.</p>
          </div>

          <div>
            <label htmlFor="batch-name" className="text-xs text-slate-400 font-medium block mb-1.5">
              Batch Collection Name (Optional)
            </label>
            <input
              id="batch-name"
              type="text"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Creator Playlist 2026"
              className="w-full px-3 py-2 rounded-xl bg-[#111a2b] border border-[#26354c] text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-col justify-center">
            <Checkbox
              id="skip-duplicates"
              checked={skipDuplicates}
              onChange={setSkipDuplicates}
              label="Skip previously completed downloads"
              description="Checks history & disk before downloading"
            />
          </div>
        </div>
      </div>

      {/* Discovered Media Items Table */}
      {mediaItems.length > 0 && (
        <div className="rounded-2xl border border-[#1e293b] bg-[#0b1220] shadow-lg overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Discovered Media Items</span>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold">
                  {selectedItems.length} of {mediaItems.length} selected
                </span>
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-media"
                checked={allSelected}
                indeterminate={isIndeterminate}
                onChange={toggleSelectAll}
                label="Select All"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {mediaItems.map((item, idx) => {
              const qualityOptions: SelectOption[] = [
                { value: "original", label: "Original Quality" },
                ...item.available_qualities
                  .filter((q) => q !== "original")
                  .map((q) => ({ value: q, label: q })),
              ];

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    item.selected
                      ? "bg-[#111a2b] border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.1)]"
                      : "bg-[#080d17]/60 border-[#1e293b] opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Checkbox
                      checked={!!item.selected}
                      onChange={(checked) => {
                        setMediaItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, selected: checked } : it))
                        );
                      }}
                      disabled={!item.is_valid}
                    />

                    {/* Thumbnail */}
                    <div className="w-12 h-9 rounded-lg overflow-hidden bg-black/40 flex-shrink-0 border border-[#26354c]">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-500 uppercase">
                          {item.source}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate" title={item.title}>
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                        <span className="capitalize text-slate-300">{item.source}</span>
                        {item.duration ? <span>• {Math.round(item.duration)}s</span> : null}
                        {!item.is_valid && (
                          <span className="text-red-400 font-medium">({item.error})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Per-Item Overrides */}
                  {item.is_valid && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={item.targetQuality || "original"}
                        onChange={(val) => {
                          setMediaItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, targetQuality: val } : it))
                          );
                        }}
                        options={qualityOptions}
                        size="sm"
                      />

                      <Select
                        value={item.targetFormat || "mp4"}
                        onChange={(val) => {
                          setMediaItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, targetFormat: val } : it))
                          );
                        }}
                        options={formatOptions}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Download Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#1e293b]">
            <span className="text-xs text-slate-400">
              Ready to process {selectedItems.length} items with {concurrency} parallel workers.
            </span>

            <button
              onClick={handleStartDownload}
              disabled={submitting || selectedItems.length === 0}
              className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold shadow-xl shadow-blue-900/40 transition-all w-full sm:w-auto cursor-pointer"
            >
              {submitting ? (
                <>
                  <Sparkles size={16} className="animate-spin" /> Queuing Batch...
                </>
              ) : (
                <>
                  <span>Download All ({selectedItems.length})</span> <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
