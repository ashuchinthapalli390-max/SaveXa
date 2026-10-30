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
  ShieldAlert,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  HelpCircle,
  WifiOff,
  Lock,
  RefreshCw,
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

  // Filter & disclosure states
  const [filterTab, setFilterTab] = useState<"all" | "available" | "attention" | "unavailable">("all");
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

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
        selected: item.is_valid && item.is_selectable !== false,
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

  // Selection calculations (strictly scoped to eligible items)
  const eligibleItems = useMemo(
    () => mediaItems.filter((i) => i.is_valid && i.is_selectable !== false),
    [mediaItems]
  );
  const eligibleCount = eligibleItems.length;

  const selectedItems = useMemo(
    () => mediaItems.filter((i) => i.selected && i.is_valid && i.is_selectable !== false),
    [mediaItems]
  );
  const selectedCount = selectedItems.length;

  // Crucial bug fix: allSelected can only be true if eligibleCount > 0
  const allSelected = eligibleCount > 0 && selectedCount === eligibleCount;
  const isIndeterminate = selectedCount > 0 && selectedCount < eligibleCount;

  const toggleSelectAll = (checked: boolean) => {
    if (eligibleCount === 0) return;
    setMediaItems((prev) =>
      prev.map((item) => ({
        ...item,
        selected: item.is_valid && item.is_selectable !== false ? checked : false,
      }))
    );
  };

  // Categorized counts for tabs
  const attentionItems = useMemo(
    () =>
      mediaItems.filter(
        (i) => i.analysis_status === "SOURCE_ACCESS_CHALLENGE" || i.analysis_status === "RATE_LIMITED"
      ),
    [mediaItems]
  );
  const attentionCount = attentionItems.length;

  const unavailableItems = useMemo(
    () =>
      mediaItems.filter(
        (i) =>
          !i.is_valid &&
          i.analysis_status !== "SOURCE_ACCESS_CHALLENGE" &&
          i.analysis_status !== "RATE_LIMITED"
      ),
    [mediaItems]
  );
  const unavailableCount = unavailableItems.length;

  // Filtered view items
  const displayedItems = useMemo(() => {
    if (filterTab === "available") return eligibleItems;
    if (filterTab === "attention") return attentionItems;
    if (filterTab === "unavailable") return unavailableItems;
    return mediaItems;
  }, [filterTab, eligibleItems, attentionItems, unavailableItems, mediaItems]);

  const toggleErrorDisclosure = (url: string) => {
    setExpandedErrors((prev) => ({
      ...prev,
      [url]: !prev[url],
    }));
  };

  const handleCopyPreservedUrls = async (urlsToCopy?: string[]) => {
    const list = urlsToCopy || mediaItems.map((i) => i.url);
    if (list.length === 0) return;
    try {
      await navigator.clipboard.writeText(list.join("\n"));
      setCopiedNotification(`Copied ${list.length} URLs to clipboard`);
      setTimeout(() => setCopiedNotification(null), 3500);
    } catch {
      // Ignore
    }
  };

  const handleExportTxtFile = () => {
    if (mediaItems.length === 0) return;
    const content = mediaItems
      .map((i) => `${i.url} # ${i.title} [${i.analysis_status || (i.is_valid ? "AVAILABLE" : "ERROR")}]`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SaveXa_Preserved_Links_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
          Queue up to 200 media links simultaneously with source-aware polite pacing, automated anti-bot circuit breaking, and persistent link preservation.
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
          {/* Header & Filter Controls */}
          <div className="flex flex-col gap-4 border-b border-[#1e293b] pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Discovered Media Items</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      eligibleCount > 0
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-amber-500/10 border border-amber-500/30 text-amber-300"
                    }`}
                  >
                    {eligibleCount > 0
                      ? `${selectedCount} of ${eligibleCount} eligible selected`
                      : `0 of ${mediaItems.length} available (${mediaItems.length} links preserved)`}
                  </span>
                </h3>
              </div>

              {/* Action Buttons: Export & Select All */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleCopyPreservedUrls()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Copy all preserved URLs to clipboard"
                >
                  <Copy size={13} className="text-blue-400" />
                  <span>Copy URLs</span>
                </button>

                <button
                  onClick={handleExportTxtFile}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Export all URLs with diagnostic status to TXT file"
                >
                  <Download size={13} className="text-emerald-400" />
                  <span>Export TXT</span>
                </button>

                <div className="pl-2 border-l border-[#26354c]">
                  <Checkbox
                    id="select-all-media"
                    checked={allSelected}
                    indeterminate={isIndeterminate}
                    disabled={eligibleCount === 0}
                    onChange={toggleSelectAll}
                    label="Select All"
                  />
                </div>
              </div>
            </div>

            {/* Notification Bar if Copied */}
            {copiedNotification && (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                <Check size={14} />
                <span>{copiedNotification}</span>
              </div>
            )}

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[
                { id: "all", label: `All (${mediaItems.length})` },
                { id: "available", label: `Available (${eligibleCount})`, count: eligibleCount },
                { id: "attention", label: `Requires Attention (${attentionCount})`, count: attentionCount },
                { id: "unavailable", label: `Unavailable (${unavailableCount})`, count: unavailableCount },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    filterTab === tab.id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                      : "bg-[#111a2b] text-slate-400 hover:text-slate-200 border border-[#26354c]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Attention Banner when 0 eligible items */}
          {eligibleCount === 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldAlert size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wide">
                    Source Access Challenge Detected — 0 of {mediaItems.length} items ready for download
                  </h4>
                  <p className="text-xs text-amber-300/90 leading-relaxed">
                    YouTube anti-bot verification was requested for automated queries from this IP. To prevent rate limiting or temporary blocking, subsequent requests were safely paused.
                    All <span className="font-bold text-white">{mediaItems.length} links are preserved below</span> for review, direct browsing, or clipboard export.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20 text-xs">
                <button
                  onClick={() => handleCopyPreservedUrls()}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold cursor-pointer transition-colors"
                >
                  Copy All {mediaItems.length} Preserved Links
                </button>
                <button
                  onClick={() => navigate("/settings")}
                  className="px-3 py-1.5 rounded-lg bg-[#111a2b] hover:bg-[#172338] border border-[#26354c] text-slate-200 font-semibold cursor-pointer transition-colors"
                >
                  Open Diagnostics in Settings
                </button>
              </div>
            </div>
          )}

          {/* Media Items List */}
          <div className="space-y-2.5 max-h-[550px] overflow-y-auto pr-1">
            {displayedItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No items match the selected tab filter.
              </div>
            ) : (
              displayedItems.map((item, idx) => {
                const originalIndex = mediaItems.findIndex((it) => it.url === item.url);
                const isItemValid = item.is_valid && item.is_selectable !== false;
                const isChallenge =
                  item.analysis_status === "SOURCE_ACCESS_CHALLENGE" ||
                  item.analysis_status === "RATE_LIMITED";

                const qualityOptions: SelectOption[] = [
                  { value: "original", label: "Original Quality" },
                  ...item.available_qualities
                    .filter((q) => q !== "original")
                    .map((q) => ({ value: q, label: q })),
                ];

                return (
                  <div
                    key={`${item.url}-${idx}`}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isItemValid
                        ? item.selected
                          ? "bg-[#111a2b] border-blue-500/40 shadow-[0_0_15px_rgba(37,99,235,0.1)]"
                          : "bg-[#0b1220] border-[#1e293b]"
                        : isChallenge
                        ? "bg-[#0c1424] border-amber-500/20 hover:border-amber-500/40"
                        : "bg-[#0c1424] border-red-500/20 hover:border-red-500/40"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        {/* Checkbox: strictly disabled on invalid or challenge items */}
                        <div className="pt-0.5 sm:pt-0">
                          <Checkbox
                            checked={!!item.selected}
                            disabled={!isItemValid}
                            onChange={(checked) => {
                              if (!isItemValid) return;
                              setMediaItems((prev) =>
                                prev.map((it, i) => (i === originalIndex ? { ...it, selected: checked } : it))
                              );
                            }}
                          />
                        </div>

                        {/* Thumbnail / Source Avatar */}
                        <div className="w-14 h-10 rounded-lg overflow-hidden bg-black/50 flex-shrink-0 border border-[#26354c] relative">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase">
                              {item.source}
                            </div>
                          )}
                          {item.duration ? (
                            <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/80 text-[9px] text-white font-mono">
                              {Math.round(item.duration)}s
                            </span>
                          ) : null}
                        </div>

                        {/* Title and Status Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold text-white truncate max-w-md" title={item.title}>
                              {item.title}
                            </p>

                            {/* Status badges */}
                            {item.analysis_status === "SOURCE_ACCESS_CHALLENGE" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                                <Lock size={10} /> Access Challenge Required
                              </span>
                            )}
                            {item.analysis_status === "RATE_LIMITED" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                                <Clock size={10} /> Rate Limited
                              </span>
                            )}
                            {item.analysis_status === "MEDIA_UNAVAILABLE" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-[10px] font-semibold">
                                <AlertCircle size={10} /> Unavailable
                              </span>
                            )}
                            {item.analysis_status === "NETWORK_TIMEOUT" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-300 text-[10px] font-semibold">
                                <WifiOff size={10} /> Network Timeout
                              </span>
                            )}
                            {isItemValid && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                                <CheckCircle2 size={10} /> Ready
                              </span>
                            )}
                          </div>

                          {/* Friendly user explanation */}
                          <div className="mt-1 text-[11px] text-slate-400">
                            {item.user_message ? (
                              <p className={isChallenge ? "text-amber-300/80" : "text-slate-400"}>
                                {item.user_message}
                              </p>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="capitalize text-slate-300">{item.source}</span>
                                {item.creator && <span>• {item.creator}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right action controls */}
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        {isItemValid ? (
                          <>
                            <Select
                              value={item.targetQuality || "original"}
                              onChange={(val) => {
                                setMediaItems((prev) =>
                                  prev.map((it, i) => (i === originalIndex ? { ...it, targetQuality: val } : it))
                                );
                              }}
                              options={qualityOptions}
                              size="sm"
                            />

                            <Select
                              value={item.targetFormat || "mp4"}
                              onChange={(val) => {
                                setMediaItems((prev) =>
                                  prev.map((it, i) => (i === originalIndex ? { ...it, targetFormat: val } : it))
                                );
                              }}
                              options={formatOptions}
                              size="sm"
                            />
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-[11px] text-blue-300 font-medium transition-colors"
                              title="Open original link in browser"
                            >
                              <span>Open</span>
                              <ExternalLink size={12} />
                            </a>

                            {item.raw_error && (
                              <button
                                onClick={() => toggleErrorDisclosure(item.url)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-[11px] text-slate-400 hover:text-slate-200 font-medium transition-colors cursor-pointer"
                              >
                                <span>Details</span>
                                {expandedErrors[item.url] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expandable Technical Traceback (Safe Disclosure) */}
                    {expandedErrors[item.url] && item.raw_error && (
                      <div className="mt-3 p-3 rounded-lg bg-[#080d17] border border-[#26354c] text-[11px] font-mono text-slate-400 space-y-1 overflow-x-auto">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">
                          Technical Diagnostic Details:
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-slate-300 text-[10px]">
                          {item.raw_error}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Download Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#1e293b]">
            <span className="text-xs text-slate-400">
              {eligibleCount > 0
                ? `Ready to process ${selectedCount} of ${eligibleCount} eligible items with ${concurrency} parallel workers.`
                : `0 items ready for download • ${mediaItems.length} items safely preserved in collection.`}
            </span>

            <button
              onClick={handleStartDownload}
              disabled={submitting || selectedCount === 0}
              className={`flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-white text-sm font-bold shadow-xl transition-all w-full sm:w-auto ${
                selectedCount > 0
                  ? "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40 cursor-pointer"
                  : "bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60"
              }`}
            >
              {submitting ? (
                <>
                  <Sparkles size={16} className="animate-spin" /> Queuing Batch...
                </>
              ) : selectedCount > 0 ? (
                <>
                  <span>Download All ({selectedCount})</span> <ArrowRight size={16} />
                </>
              ) : (
                <span>No Eligible Items to Download</span>
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
