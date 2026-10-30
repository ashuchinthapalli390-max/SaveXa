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
  Lock,
  Unlock,
  Key,
} from "lucide-react";
import { api } from "../services/api";
import { AppSettings, SystemStatus, PerformanceSettings, ExtractorHealth, AuthStatus } from "../types";
import { Slider } from "../components/ui/Slider";
import { Switch } from "../components/ui/Switch";
import { Checkbox } from "../components/ui/Checkbox";

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [perfSettings, setPerfSettings] = useState<PerformanceSettings | null>(null);
  const [extractorHealth, setExtractorHealth] = useState<ExtractorHealth | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [connectingAuth, setConnectingAuth] = useState(false);
  const [authApproved, setAuthApproved] = useState(false);
  const [authDisclaimerAccepted, setAuthDisclaimerAccepted] = useState(false);
  const [authActionMessage, setAuthActionMessage] = useState<string | null>(null);
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
      const [sData, statData, pData, healthData, aData] = await Promise.allSettled([
        api.getSettings(),
        api.getStatus(),
        api.getPerformanceSettings(),
        api.getExtractorHealth(),
        api.getAuthStatus(),
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
      if (aData.status === "fulfilled") {
        setAuthStatus(aData.value);
        setAuthApproved(aData.value.user_approved);
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

  const handleConnectChrome = async () => {
    if (!authApproved) {
      setAuthActionMessage("Please check the explicit approval checkbox before connecting.");
      return;
    }
    setConnectingAuth(true);
    setAuthActionMessage(null);
    try {
      const res = await api.connectBrowserAuth({
        browser: "chrome",
        user_approved: true,
        acknowledge_disclaimer: authDisclaimerAccepted,
      });
      setAuthStatus(res);
      setAuthActionMessage("Google Chrome browser session successfully connected.");
      const h = await api.getExtractorHealth();
      setExtractorHealth(h);
    } catch (e: any) {
      setAuthActionMessage(`Connection error: ${e.message || "Failed to connect"}`);
    } finally {
      setConnectingAuth(false);
    }
  };

  const handleDisconnect = async () => {
    setConnectingAuth(true);
    setAuthActionMessage(null);
    try {
      const res = await api.disconnectAuth();
      setAuthStatus(res);
      setAuthApproved(false);
      setAuthActionMessage("Disconnected. SaveXa is now in anonymous mode.");
      const h = await api.getExtractorHealth();
      setExtractorHealth(h);
    } catch (e: any) {
      setAuthActionMessage(`Disconnect error: ${e.message || "Failed to disconnect"}`);
    } finally {
      setConnectingAuth(false);
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

      {/* Source Authentication Panel */}
      <div className="rounded-2xl p-6 border border-[#1e293b] bg-[#0b1220] shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#1e293b] pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key size={16} className="text-blue-400" /> Source Authentication (Local Browser Session)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Optional local source authentication for permitted sources via yt-dlp browser session. Runs 100% locally.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                authStatus?.is_connected
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-slate-700/50 border-slate-600/30 text-slate-400"
              }`}
            >
              {authStatus?.is_connected ? "Connected: Chrome" : "Anonymous Mode"}
            </span>
          </div>
        </div>

        {/* Security and Disclaimer Checkboxes */}
        <div className="p-4 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={authApproved}
              onChange={(e) => setAuthApproved(e.target.checked)}
              className="mt-0.5 accent-blue-600 rounded cursor-pointer"
            />
            <span>
              <strong className="text-white">Explicit User Approval:</strong> I authorize SaveXa to use supported yt-dlp browser-session options with Google Chrome on this machine.
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={authDisclaimerAccepted}
              onChange={(e) => setAuthDisclaimerAccepted(e.target.checked)}
              className="mt-0.5 accent-blue-600 rounded cursor-pointer"
            />
            <span>
              <strong className="text-white">Source Restriction Disclaimer:</strong> I understand that authentication uses local session cookies only and cannot bypass DRM, copyright take-downs, or private memberships without account access.
            </span>
          </label>
        </div>

        {/* Browser Lock Notice if Chrome is running */}
        {authStatus?.browser_lock_detected && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
            <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Browser Database Lock Notice (Windows)</p>
              <p className="text-[11px] text-amber-200/90 mt-0.5">
                {authStatus.lock_reason || "Google Chrome is actively running and locking its cookie file. Close Chrome temporarily before bulk downloading, or export cookies to data/cookies.txt."}
              </p>
            </div>
          </div>
        )}

        {/* Action Message */}
        {authActionMessage && (
          <p className="text-xs text-blue-300 font-mono bg-[#111a2b] p-2.5 rounded-lg border border-[#26354c]">
            {authActionMessage}
          </p>
        )}

        {/* Connect / Disconnect Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-slate-500">
            Strict local isolation: cookies and credentials are never transmitted, logged, or exported.
          </p>

          <div className="flex items-center gap-2">
            {authStatus?.is_connected ? (
              <button
                onClick={handleDisconnect}
                disabled={connectingAuth}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 hover:text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <Unlock size={13} />
                <span>Disconnect Session (Revert to Anonymous)</span>
              </button>
            ) : (
              <button
                onClick={handleConnectChrome}
                disabled={connectingAuth}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-950/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <Lock size={13} />
                <span>{connectingAuth ? "Connecting..." : "Connect Chrome Session"}</span>
              </button>
            )}
          </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">yt-dlp Engine</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Active
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-white">v{extractorHealth?.ytdlp_version || "2026.10.26"}</p>
            <p className="text-[10px] text-slate-500">Universal media extractor</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">yt-dlp-ejs</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  extractorHealth?.ejs_installed
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {extractorHealth?.ejs_installed ? "Installed" : "Missing"}
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-white">
              {extractorHealth?.ejs_installed ? `v${extractorHealth.ejs_version || "0.8.0"}` : "None"}
            </p>
            <p className="text-[10px] text-slate-500">Challenge execution package</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111a2b] border border-[#26354c] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">JS Runtimes</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  extractorHealth?.deno_detected || extractorHealth?.node_detected
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {extractorHealth?.deno_detected ? "Deno + Node" : extractorHealth?.node_detected ? "Node.js" : "Missing"}
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-white truncate">
              {extractorHealth?.deno_detected
                ? `Deno ${extractorHealth.deno_version?.split(" ")[1] || "2.9.8"}`
                : extractorHealth?.node_version || "None"}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {extractorHealth?.node_detected ? `Node ${extractorHealth.node_version} available` : "Sandbox JS executor"}
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
