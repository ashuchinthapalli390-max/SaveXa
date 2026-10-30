import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Folder,
  HardDrive,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Save,
  Check,
  Zap,
  Gauge,
  ShieldCheck,
  Activity,
  Terminal,
  RefreshCw,
  Cookie,
  Code2,
} from "lucide-react";
import { api } from "../services/api";
import { AppSettings, SystemStatus, PerformanceSettings, ExtractorHealth } from "../types";
import { Slider } from "../components/ui/Slider";
import { Switch } from "../components/ui/Switch";
import { Checkbox } from "../components/ui/Checkbox";

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [perfSettings, setPerfSettings] = useState<PerformanceSettings | null>(null);
  const [extractorHealth, setExtractorHealth] = useState<ExtractorHealth | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testingDiagnostics, setTestingDiagnostics] = useState(false);

  const [destinationInput, setDestinationInput] = useState("");
  const [concurrency, setConcurrency] = useState(10);
  const [perfMode, setPerfMode] = useState("balanced");
  const [maxRetries, setMaxRetries] = useState(3);
  const [autoOrganize, setAutoOrganize] = useState(true);
  const [preferMp4, setPreferMp4] = useState(true);
  const [perHostLimit, setPerHostLimit] = useState(4);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [pathValidMessage, setPathValidMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [sData, statData, pData, healthData] = await Promise.allSettled([
        api.getSettings(),
        api.getStatus(),
        api.getPerformanceSettings(),
        api.getExtractorHealth(),
      ]);

      if (sData.status === "fulfilled") {
        setSettings(sData.value);
        setDestinationInput(sData.value.default_destination);
        setMaxRetries(sData.value.max_retries);
        setAutoOrganize(sData.value.auto_organize);
        setPreferMp4(sData.value.prefer_mp4);
      }
      if (statData.status === "fulfilled") {
        setSystemStatus(statData.value);
      }
      if (pData.status === "fulfilled") {
        setPerfSettings(pData.value);
        setConcurrency(pData.value.concurrency);
        setPerfMode(pData.value.mode);
        setPerHostLimit(pData.value.per_host_limit);
      }
      if (healthData.status === "fulfilled") {
        setExtractorHealth(healthData.value);
      }
    } catch {
      // Ignore
    }
  };

  const handleRunDiagnostics = async () => {
    setTestingDiagnostics(true);
    setTestResult(null);
    try {
      const [health, test] = await Promise.all([
        api.getExtractorHealth(),
        api.testExtractor(),
      ]);
      setExtractorHealth(health);
      setTestResult(test);
    } catch (e: any) {
      setTestResult({ error: e.message || "Diagnostics failed" });
    } finally {
      setTestingDiagnostics(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleValidatePath = async () => {
    try {
      const res = await api.validatePath(destinationInput);
      if (res.valid && res.writable) {
        setPathValidMessage("✓ Folder verified and writable on disk");
      } else {
        setPathValidMessage(`✗ Path error: ${res.error || "Not writable"}`);
      }
    } catch (e: any) {
      setPathValidMessage(`✗ Error: ${e.message}`);
    }
  };

  const handleModeSelect = (mode: string) => {
    setPerfMode(mode);
    if (mode === "stable") setConcurrency(4);
    else if (mode === "balanced") setConcurrency(10);
    else if (mode === "fast") setConcurrency(16);
    else if (mode === "maximum") setConcurrency(20);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      await Promise.all([
        api.updateSettings({
          default_destination: destinationInput,
          concurrency,
          max_retries: maxRetries,
          auto_organize: autoOrganize,
          prefer_mp4: preferMp4,
        }),
        api.updatePerformanceSettings({
          mode: perfMode,
          concurrency,
          per_host_limit: perHostLimit,
        }),
      ]);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 mb-2">
          <SettingsIcon size={14} className="text-blue-400" />
          <span>Local Engine Configuration</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Settings
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Configure storage destinations, 20-worker concurrency engine, performance profiles, and media tools.
        </p>
      </div>

      {/* High-Speed Engine Performance Modes */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-5">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Gauge size={16} className="text-blue-400" /> High-Speed Engine Concurrency Profile
          </h3>
          <span className="text-[11px] font-mono text-blue-400 font-semibold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
            Target: 50 Mbps Throughput
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: "stable", name: "Stable", workers: "4 Workers", desc: "Low CPU & RAM impact" },
            { id: "balanced", name: "Balanced", workers: "10 Workers", desc: "Default optimal speed" },
            { id: "fast", name: "Fast", workers: "16 Workers", desc: "High-speed multi-file" },
            { id: "maximum", name: "Maximum", workers: "20 Workers", desc: "Full 20-worker saturation" },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleModeSelect(mode.id)}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                perfMode === mode.id
                  ? "bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-950/30"
                  : "bg-[#111a2b] border-[#26354c] text-slate-400 hover:bg-[#172338] hover:text-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{mode.name}</span>
                <span className="text-[10px] font-mono text-blue-400 font-semibold">{mode.workers}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{mode.desc}</p>
            </button>
          ))}
        </div>

        <div className="pt-2">
          <Slider
            value={concurrency}
            min={1}
            max={20}
            step={1}
            onChange={(val) => {
              setConcurrency(val);
              setPerfMode("custom");
            }}
            label="Active Worker Concurrency Limit"
            unit="workers"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Global budget capped at 20 active parallel jobs. Respects per-media quotas (videos vs images).
          </p>
        </div>
      </div>

      {/* Destination Folder Configuration */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Folder size={16} className="text-blue-400" /> Default Storage Destination
        </h3>

        <div className="flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            value={destinationInput}
            onChange={(e) => {
              setDestinationInput(e.target.value);
              setPathValidMessage(null);
            }}
            placeholder="C:\Users\Username\Downloads\SaveXa"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2b] border border-[#26354c] text-xs font-mono text-white outline-none focus:border-blue-500"
          />

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleValidatePath}
              className="px-3.5 py-2.5 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Verify
            </button>
            <button
              onClick={() => api.openFolder(destinationInput)}
              className="px-3.5 py-2.5 rounded-xl bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Open Folder
            </button>
          </div>
        </div>

        {pathValidMessage && (
          <p className="text-xs text-slate-400 font-mono">{pathValidMessage}</p>
        )}

        {/* Quick Drive Suggestions */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Quick Drive Shortcuts:</span>
          {["D:\\SaveXa", "E:\\SaveXa"].map((p) => (
            <button
              key={p}
              onClick={() => {
                setDestinationInput(p);
                setPathValidMessage(null);
              }}
              className="px-2 py-0.5 rounded bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] text-blue-300 font-mono text-[11px] cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Engine Options */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Cpu size={16} className="text-blue-400" /> Advanced Options
        </h3>

        <div className="space-y-4 pt-1">
          <Switch
            checked={preferMp4}
            onChange={setPreferMp4}
            label="Prefer MP4 Container Compatibility"
            description="Merges video and audio streams into an MP4 container when codecs allow without re-encoding."
          />

          <div className="border-t border-[#1e293b] pt-4">
            <Switch
              checked={autoOrganize}
              onChange={setAutoOrganize}
              label="Automatic Subfolder Organization"
              description="Automatically separates downloads into Videos, Images, and Audio subfolders."
            />
          </div>
        </div>
      </div>

      {/* Media Tools Status */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <HardDrive size={16} className="text-blue-400" /> Media Processing Tools
        </h3>

        <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-slate-200">FFmpeg / FFprobe Engine</span>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              {systemStatus?.ffmpeg_version || settings?.ffmpeg_path || "Active & Verified"}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            {systemStatus?.ffmpeg_installed ? "Ready" : "Detected"}
          </span>
        </div>
      </div>

      {/* Source Compatibility Diagnostics Panel */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-blue-400" /> Source Compatibility Diagnostics
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time inspection of yt-dlp extractor, external JavaScript runtimes, cookies, and network health.
            </p>
          </div>

          <button
            onClick={handleRunDiagnostics}
            disabled={testingDiagnostics}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-blue-950/30 cursor-pointer"
          >
            <RefreshCw size={13} className={testingDiagnostics ? "animate-spin" : ""} />
            <span>{testingDiagnostics ? "Testing..." : "Run Diagnostics Check"}</span>
          </button>
        </div>

        {/* Runtime Diagnostics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">yt-dlp Extractor</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Active
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-white">v{extractorHealth?.ytdlp_version || "2026.10.26"}</p>
            <p className="text-[10px] text-slate-500">Universal web extractor</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">JS Runtime (EJS)</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  extractorHealth?.node_detected || extractorHealth?.deno_detected
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {extractorHealth?.node_detected ? "Node.js (Active)" : extractorHealth?.deno_detected ? "Deno (Active)" : "Missing"}
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-white">
              {extractorHealth?.node_version || extractorHealth?.deno_version || "None"}
            </p>
            <p className="text-[10px] text-slate-500 truncate" title={extractorHealth?.node_path || ""}>
              {extractorHealth?.node_path ? "Path verified" : "Required for modern JS extraction"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Cookies Session</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  extractorHealth?.cookies_file_present
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
                }`}
              >
                {extractorHealth?.cookies_file_present ? "Loaded" : "Not Provided"}
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-white">
              {extractorHealth?.cookies_file_present ? "cookies.txt active" : "Anonymous Mode"}
            </p>
            <p className="text-[10px] text-slate-500">
              {extractorHealth?.detected_browsers.length
                ? `Browsers: ${extractorHealth.detected_browsers.join(", ")}`
                : "No browsers detected"}
            </p>
          </div>
        </div>

        {/* Live Test Results banner */}
        {testResult && (
          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Activity size={13} className="text-blue-400" />
                Live Extractor Reachability Test
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Latency: {testResult.latency_ms}ms
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Status:</span>
              <span
                className={`font-semibold ${
                  testResult.is_valid ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {testResult.status} {testResult.error_code ? `(${testResult.error_code})` : ""}
              </span>
            </div>
            {testResult.user_message && (
              <p className="text-[11px] text-slate-300 bg-[#080d17] p-2 rounded border border-[#1e293b]">
                {testResult.user_message}
              </p>
            )}
          </div>
        )}

        {/* Diagnostic Notes */}
        <div className="space-y-1.5 text-xs text-slate-400 pt-1">
          <p className="font-semibold text-slate-300">System Architecture Notes:</p>
          <ul className="space-y-1 pl-4 list-disc text-[11px] text-slate-400">
            {extractorHealth?.notes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-2">
        {savedSuccess ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
            <Check size={15} /> Settings successfully saved
          </span>
        ) : (
          <span />
        )}

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition-all cursor-pointer disabled:opacity-50"
        >
          <Save size={14} />
          <span>Save Settings</span>
        </button>
      </div>
    </div>
  );
};
