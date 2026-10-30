import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  DownloadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HardDrive,
  Layers,
  Image as ImageIcon,
  ArrowRight,
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  FolderOpen,
  Zap,
} from "lucide-react";
import { api } from "../services/api";
import { SystemStatus, Job, MediaMetadata } from "../types";
import { DownloadCard } from "../components/downloads/DownloadCard";
import { formatBytes } from "../utils/formatters";

interface DashboardProps {
  jobs: Job[];
  activeDownloads: Job[];
  refreshJobs: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ jobs, activeDownloads, refreshJobs }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [quickUrl, setQuickUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const heroRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const inputCardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline();
      tl.fromTo(
        headingRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }
      )
        .fromTo(
          subtitleRef.current,
          { opacity: 0, y: 15 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
          "-=0.3"
        )
        .fromTo(
          inputCardRef.current,
          { opacity: 0, scale: 0.98, y: 15 },
          { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.4)" },
          "-=0.2"
        );
    },
    { scope: heroRef }
  );

  const loadStatus = async () => {
    try {
      const data = await api.getStatus();
      setStatus(data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const meta = await api.analyzeUrl(quickUrl.trim());
      if (!meta.is_valid) {
        setAnalysisError(meta.error || "Could not analyze link");
        return;
      }
      navigate("/new", { state: { url: quickUrl.trim(), initialMeta: meta } });
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to analyze URL");
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQuickUrl(text.trim());
      }
    } catch {
      // Ignore
    }
  };

  const completedCount = jobs.filter((j) => j.status === "COMPLETED").length;
  const queuedCount = jobs.filter((j) => j.status === "QUEUED").length;
  const failedCount = jobs.filter((j) => j.status === "FAILED").length;
  const totalDownloadedBytes = jobs
    .filter((j) => j.status === "COMPLETED")
    .reduce((acc, j) => acc + (j.file_size || 0), 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Hero Section */}
      <div ref={heroRef} className="relative rounded-3xl p-8 sm:p-10 border border-[#1e293b] bg-gradient-to-b from-[#0f172a]/90 to-[#080d17]/95 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-60 h-60 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300">
            <ShieldCheck size={14} className="text-blue-400" />
            <span>SaveXa V2 • 50 Mbps Engine • 20 Concurrent Workers</span>
          </div>

          <h1 ref={headingRef} className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Your Media. <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300">Your Control.</span>
          </h1>

          <p ref={subtitleRef} className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl">
            SaveXa preserves the best available source streams directly to your PC. Single links, 200-item video batches, or bulk high-res image crawls without ads or cloud bloat.
          </p>

          {/* Quick Paste & Analyze Input */}
          <div ref={inputCardRef} className="pt-4">
            <form onSubmit={handleQuickAnalyze} className="relative flex flex-col sm:flex-row items-center gap-2 p-2 rounded-2xl bg-[#080d17]/80 border border-[#26354c] shadow-inner">
              <div className="flex-1 flex items-center gap-2 px-3 w-full">
                <Search size={18} className="text-slate-400" />
                <input
                  type="text"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="Paste video, audio, or media URL (e.g., YouTube, Vimeo, direct link)..."
                  className="w-full bg-transparent border-none outline-none text-sm text-white placeholder-slate-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-[#111a2b] border border-[#26354c] hover:bg-[#172338] transition-colors cursor-pointer"
                >
                  Paste
                </button>
                <button
                  type="submit"
                  disabled={analyzing || !quickUrl.trim()}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-blue-900/40 transition-all w-full sm:w-auto cursor-pointer"
                >
                  {analyzing ? (
                    <>
                      <Sparkles size={14} className="animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <span>Analyze</span> <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {analysisError && (
              <p className="mt-2 text-xs text-red-400 font-medium px-2">
                {analysisError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-3 px-2 text-xs text-slate-400">
              <Link to="/bulk" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
                <Layers size={13} /> Bulk Downloader (Up to 200 Links) →
              </Link>
              <span className="text-slate-600">•</span>
              <Link to="/images" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium">
                <ImageIcon size={13} /> New: Bulk Image Downloader (20 Workers) →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#0b1220] border border-[#1e293b] shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Completed</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{completedCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">Saved to laptop</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0b1220] border border-[#1e293b] shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Active Workers</span>
            <DownloadCloud size={16} className="text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-300">{activeDownloads.length}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {status ? `Concurrency max: ${status.concurrency}` : "Processing"}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0b1220] border border-[#1e293b] shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">In Queue</span>
            <Clock size={16} className="text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-300">{queuedCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">Awaiting workers</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0b1220] border border-[#1e293b] shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Data Saved</span>
            <HardDrive size={16} className="text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {formatBytes(totalDownloadedBytes)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {status ? `Free: ${formatBytes(status.storage_free_bytes)}` : "Available space"}
          </div>
        </div>
      </div>

      {/* Active Downloads Section */}
      {activeDownloads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              Active Downloads ({activeDownloads.length})
            </h3>
            <Link to="/queue" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              View All in Queue →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {activeDownloads.map((job) => (
              <DownloadCard key={job.id} job={job} onRefresh={refreshJobs} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Completed Downloads */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Recent Downloads</h3>
          <Link to="/history" className="text-xs text-slate-400 hover:text-slate-200">
            View Download History →
          </Link>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-[#1e293b] bg-[#0b1220]/50">
            <DownloadCloud size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">No downloads yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Paste a URL above, jump to the Bulk Downloader, or crawl web images.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {jobs.slice(0, 5).map((job) => (
              <DownloadCard key={job.id} job={job} onRefresh={refreshJobs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
