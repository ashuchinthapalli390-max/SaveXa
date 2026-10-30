import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Image as ImageIcon,
  Globe,
  Link as LinkIcon,
  Download,
  Archive,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Maximize2,
  ExternalLink,
  Layers,
  Zap,
} from "lucide-react";
import { api } from "../services/api";
import { ImageItem } from "../types";
import { formatBytes } from "../utils/formatters";
import { Checkbox } from "../components/ui/Checkbox";
import { Select, SelectOption } from "../components/ui/Select";
import { Slider } from "../components/ui/Slider";
import { Switch } from "../components/ui/Switch";
import { Tabs } from "../components/ui/Tabs";

export const ImageDownloader: React.FC = () => {
  const navigate = useNavigate();

  // Mode: "direct" | "page"
  const [activeTab, setActiveTab] = useState<string>("direct");

  // Inputs
  const [urlsInput, setUrlsInput] = useState<string>("");
  const [pageUrlInput, setPageUrlInput] = useState<string>("");
  const [folderName, setFolderName] = useState<string>("");

  // Options
  const [concurrency, setConcurrency] = useState<number>(10);
  const [targetFormat, setTargetFormat] = useState<string>("original");
  const [preserveOriginal, setPreserveOriginal] = useState<boolean>(true);

  // Filter states
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [orientationFilter, setOrientationFilter] = useState<string>("all");

  // State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isQueuing, setIsQueuing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Format options for Select
  const formatOptions: SelectOption[] = [
    { value: "original", label: "Original Format (Preserve)", description: "Bit-for-bit lossless download" },
    { value: "jpg", label: "Convert to JPG", description: "Best for compatibility & photography" },
    { value: "png", label: "Convert to PNG", description: "Lossless raster with alpha channel" },
    { value: "webp", label: "Convert to WEBP", description: "Modern ultra-compact web format" },
  ];

  // Filter options
  const filterFormatOptions: SelectOption[] = [
    { value: "all", label: "All Formats" },
    { value: "jpg", label: "JPG / JPEG" },
    { value: "png", label: "PNG" },
    { value: "webp", label: "WEBP" },
    { value: "gif", label: "GIF" },
    { value: "svg", label: "SVG" },
  ];

  const orientationOptions: SelectOption[] = [
    { value: "all", label: "All Orientations" },
    { value: "Landscape", label: "Landscape" },
    { value: "Portrait", label: "Portrait" },
    { value: "Square", label: "Square" },
  ];

  // Analyze Direct URLs
  const handleAnalyzeDirect = async () => {
    const rawList = urlsInput
      .split(/[\r\n\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

    if (rawList.length === 0) {
      setError("Please paste at least one valid HTTP or HTTPS image URL.");
      return;
    }

    setIsScanning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const results = await api.analyzeImages(rawList);
      // Mark valid ones as selected by default
      const withSelection = results.map((img) => ({
        ...img,
        selected: img.is_valid,
      }));
      setImages(withSelection);
      if (withSelection.length === 0) {
        setError("No analyzable images found at the provided URLs.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to analyze image URLs.");
    } finally {
      setIsScanning(false);
    }
  };

  // Discover from Webpage
  const handleDiscoverPage = async () => {
    const target = pageUrlInput.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      setError("Please enter a valid webpage URL starting with http:// or https://");
      return;
    }

    setIsScanning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const results = await api.discoverPageImages(target, 60, 60);
      const withSelection = results.map((img) => ({
        ...img,
        selected: img.is_valid,
      }));
      setImages(withSelection);
      if (withSelection.length === 0) {
        setError("No suitable high-resolution images discovered on this webpage.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to crawl webpage for images.");
    } finally {
      setIsScanning(false);
    }
  };

  // Filtered Images
  const filteredImages = images.filter((img) => {
    if (formatFilter !== "all") {
      const f = img.format?.toLowerCase() || "";
      if (formatFilter === "jpg" && !(f === "jpg" || f === "jpeg")) return false;
      if (formatFilter !== "jpg" && f !== formatFilter) return false;
    }
    if (orientationFilter !== "all") {
      if (img.orientation !== orientationFilter) return false;
    }
    return true;
  });

  const selectedCount = images.filter((img) => img.selected).length;
  const allSelected = images.length > 0 && selectedCount === images.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < images.length;

  const toggleSelectAll = (checked: boolean) => {
    setImages((prev) => prev.map((img) => ({ ...img, selected: checked })));
  };

  const toggleSelectImage = (url: string) => {
    setImages((prev) =>
      prev.map((img) => (img.url === url ? { ...img, selected: !img.selected } : img))
    );
  };

  // Start Bulk Download
  const handleStartDownload = async () => {
    const toDownload = images.filter((img) => img.selected && img.is_valid);
    if (toDownload.length === 0) {
      setError("Please select at least one valid image to download.");
      return;
    }

    setIsQueuing(true);
    setError(null);

    try {
      const batchName = folderName.trim() || `Image_Batch_${new Date().toISOString().slice(0, 10)}`;
      await api.createImageBatch({
        name: batchName,
        concurrency: concurrency,
        target_format: targetFormat,
        preserve_metadata: preserveOriginal,
        items: toDownload.map((item) => ({
          url: item.url,
          resolved_url: item.resolved_url,
          filename: item.filename,
          title: item.filename,
          width: item.width,
          height: item.height,
          file_size: item.file_size,
          mime_type: item.mime_type,
          source_variant: item.source,
          original_verified: true,
          target_format: targetFormat,
        })),
      });

      setSuccessMessage(`Successfully queued ${toDownload.length} images with ${concurrency} concurrent workers!`);
      setTimeout(() => {
        navigate("/queue");
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to start image batch download.");
      setIsQueuing(false);
    }
  };

  // Export ZIP
  const handleExportZip = async () => {
    setIsZipping(true);
    setError(null);

    try {
      const zipName = folderName.trim() || `SaveXa_Export_${Date.now()}`;
      const res = await api.exportImagesZip({ zip_name: zipName });
      setSuccessMessage(`ZIP created successfully: ${res.filename} (${formatBytes(res.zip_size)})`);
      window.open(`/api/images/download-zip?path=${encodeURIComponent(res.zip_path)}`, "_blank");
    } catch (err: any) {
      setError(err.message || "Failed to create ZIP archive.");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-r from-[#0b1220] via-[#0f1a30] to-[#0b1220] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
              <ImageIcon size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">Bulk Image Downloader</h1>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30">
                  V2 High-Speed
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Extract high-resolution original variants from direct URLs or crawl public webpages with 20-worker concurrency.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportZip}
              disabled={isZipping}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111a2b] border border-[#26354c] text-slate-300 hover:text-white hover:border-blue-500/40 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              {isZipping ? <Loader2 size={14} className="animate-spin text-blue-400" /> : <Archive size={14} className="text-blue-400" />}
              <span>Export Completed as ZIP</span>
            </button>
          </div>
        </div>
      </div>

      {/* Input Section Card */}
      <div className="rounded-2xl border border-[#1e293b] bg-[#0b1220] p-6 shadow-lg space-y-5">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-4">
          <Tabs
            tabs={[
              { id: "direct", label: "Direct Image URLs", icon: <LinkIcon size={14} /> },
              { id: "page", label: "Webpage Image Crawler", icon: <Globe size={14} /> },
            ]}
            activeTab={activeTab}
            onChange={(id) => {
              setActiveTab(id);
              setError(null);
            }}
          />
        </div>

        {activeTab === "direct" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <label htmlFor="image-urls" className="font-medium text-slate-300">
                Paste Image URLs (One per line or space-separated):
              </label>
              <span>Supports JPG, PNG, WEBP, AVIF, GIF, SVG</span>
            </div>
            <textarea
              id="image-urls"
              rows={4}
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              placeholder="https://images.unsplash.com/photo-1542291026-7eec264c27ff&#10;https://example.com/gallery/full-hd.png"
              className="w-full rounded-xl border border-[#26354c] bg-[#111a2b] p-3 font-mono text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex justify-end">
              <button
                onClick={handleAnalyzeDirect}
                disabled={isScanning || !urlsInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Analyzing Images...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Analyze URLs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <label htmlFor="page-url" className="font-medium text-slate-300">
                Public Webpage / Article / Gallery URL:
              </label>
              <span>Auto-detects high-res variants, srcset, and Open Graph cards</span>
            </div>
            <div className="flex gap-3">
              <input
                id="page-url"
                type="url"
                value={pageUrlInput}
                onChange={(e) => setPageUrlInput(e.target.value)}
                placeholder="https://en.wikipedia.org/wiki/Aurora or https://unsplash.com/t/wallpapers"
                className="flex-1 rounded-xl border border-[#26354c] bg-[#111a2b] px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleDiscoverPage}
                disabled={isScanning || !pageUrlInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Crawling Page...</span>
                  </>
                ) : (
                  <>
                    <Globe size={14} />
                    <span>Discover Images</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}
      </div>

      {/* Configuration & Batch Control Bar */}
      {images.length > 0 && (
        <div className="rounded-2xl border border-[#1e293b] bg-[#0b1220] p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
            <div className="flex items-center gap-4">
              <Checkbox
                id="select-all-images"
                checked={allSelected}
                indeterminate={isIndeterminate}
                onChange={toggleSelectAll}
                label={`Select All (${selectedCount} / ${images.length} selected)`}
              />
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={formatFilter}
                onChange={setFormatFilter}
                options={filterFormatOptions}
                size="sm"
              />
              <Select
                value={orientationFilter}
                onChange={setOrientationFilter}
                options={orientationOptions}
                size="sm"
              />
            </div>
          </div>

          {/* Download settings grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Output Format</label>
              <Select
                value={targetFormat}
                onChange={setTargetFormat}
                options={formatOptions}
                size="md"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="folder-name" className="block text-xs font-medium text-slate-300 mb-1.5">Subfolder Name (Optional)</label>
              <input
                id="folder-name"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. Wallpapers"
                className="w-full rounded-xl border border-[#26354c] bg-[#111a2b] px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <Slider
                value={concurrency}
                min={1}
                max={20}
                step={1}
                onChange={setConcurrency}
                label="Concurrent Workers"
                unit="workers"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleStartDownload}
                disabled={isQueuing || selectedCount === 0}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900/40 transition-all cursor-pointer disabled:opacity-50"
              >
                {isQueuing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Queuing Batch...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Download Selected ({selectedCount})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Previews Grid */}
      {filteredImages.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredImages.map((img) => (
            <div
              key={img.url}
              onClick={() => toggleSelectImage(img.url)}
              className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
                img.selected
                  ? "border-blue-500 bg-[#111a2b] shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                  : "border-[#1e293b] bg-[#0b1220] hover:border-slate-600 hover:bg-[#111a2b]"
              }`}
            >
              {/* Image Preview Container */}
              <div className="relative aspect-video w-full bg-[#080d17] overflow-hidden">
                <img
                  src={img.preview_url || img.url}
                  alt={img.filename}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    // Fallback on broken image
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />

                {/* Overlay Checkbox */}
                <div className="absolute top-2.5 left-2.5 z-10">
                  <Checkbox
                    checked={!!img.selected}
                    onChange={() => toggleSelectImage(img.url)}
                  />
                </div>

                {/* Badges on preview */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-medium text-white pointer-events-none">
                  {img.width && img.height ? (
                    <span className="rounded-md bg-black/60 px-2 py-0.5 backdrop-blur-md">
                      {img.width} × {img.height}
                    </span>
                  ) : (
                    <span />
                  )}

                  <span className="rounded-md bg-blue-600/80 px-1.5 py-0.5 uppercase tracking-wider font-mono font-bold text-[10px]">
                    {img.format || "IMG"}
                  </span>
                </div>
              </div>

              {/* Card Meta Footer */}
              <div className="flex flex-col p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs font-semibold text-slate-200 max-w-[180px]" title={img.filename}>
                    {img.filename}
                  </span>
                  {img.file_size ? (
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {formatBytes(img.file_size)}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate max-w-[140px]">{img.source}</span>
                  <span className="rounded bg-[#172338] px-1.5 py-0.5 text-[10px] text-slate-300 border border-[#26354c]">
                    {img.orientation}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : images.length > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1e293b] bg-[#0b1220] p-12 text-center">
          <Filter size={32} className="text-slate-500 mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">No images match your active filters</h3>
          <p className="text-xs text-slate-500 mt-1">Try resetting the format or orientation dropdowns above.</p>
        </div>
      ) : null}
    </div>
  );
};

