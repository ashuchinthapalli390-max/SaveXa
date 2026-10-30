import { MediaMetadata, Job, Batch, SystemStatus, HistoryItem, LibraryItem, AppSettings, ImageItem, PerformanceSettings, PerformanceStatus, ExtractorHealth, AuthStatus, ConnectBrowserRequest } from "../types";

const API_BASE = "/api";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let errorDetail = "API request failed";
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || errorDetail;
    } catch {
      errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

export const api = {
  // System
  getStatus: () => request<SystemStatus>("/system/status"),
  openFolder: (path: string) => request<{ status: string }>("/system/open-folder", {
    method: "POST",
    body: JSON.stringify({ path }),
  }),
  openFile: (path: string) => request<{ status: string }>("/system/open-file", {
    method: "POST",
    body: JSON.stringify({ path }),
  }),
  getExtractorHealth: () => request<ExtractorHealth>("/system/extractor-health"),
  testExtractor: (url?: string) =>
    request<{ url: string; status: string; is_valid: boolean; title: string; error_code?: string; user_message?: string; latency_ms: number }>(
      "/system/extractor-test",
      {
        method: "POST",
        body: JSON.stringify({ url }),
      }
    ),

  // Analysis
  analyzeUrl: (url: string, allowLocalhost: boolean = false) =>
    request<MediaMetadata>("/analyze", {
      method: "POST",
      body: JSON.stringify({ url, allow_localhost: allowLocalhost }),
    }),
  analyzeBulk: (urls: string[], allowLocalhost: boolean = false) =>
    request<MediaMetadata[]>("/analyze/bulk", {
      method: "POST",
      body: JSON.stringify({ urls, allow_localhost: allowLocalhost }),
    }),

  // Downloads
  createDownload: (data: {
    url: string;
    title?: string;
    creator?: string;
    thumbnail?: string;
    duration?: number;
    quality?: string;
    format?: string;
    audio_bitrate?: string;
    destination_folder?: string;
  }) => request<Job>("/downloads", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  listDownloads: (status?: string, batchId?: string, limit: number = 300) => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (batchId) params.append("batch_id", batchId);
    if (limit) params.append("limit", limit.toString());
    return request<Job[]>(`/downloads?${params.toString()}`);
  },
  getDownload: (jobId: string) => request<Job>(`/downloads/${jobId}`),
  pauseDownload: (jobId: string) => request<{ status: string }>(`/downloads/${jobId}/pause`, { method: "POST" }),
  resumeDownload: (jobId: string) => request<{ status: string }>(`/downloads/${jobId}/resume`, { method: "POST" }),
  cancelDownload: (jobId: string) => request<{ status: string }>(`/downloads/${jobId}/cancel`, { method: "POST" }),
  retryDownload: (jobId: string) => request<{ status: string }>(`/downloads/${jobId}/retry`, { method: "POST" }),
  deleteDownload: (jobId: string) => request<{ status: string }>(`/downloads/${jobId}`, { method: "DELETE" }),
  clearCompleted: () => request<{ status: string }>("/downloads/clear-completed", { method: "POST" }),

  // Batches
  createBatch: (data: {
    name?: string;
    items: Array<{
      url: string;
      title?: string;
      creator?: string;
      thumbnail?: string;
      duration?: number;
      quality?: string;
      format?: string;
      audio_bitrate?: string;
    }>;
    selected_preset?: string;
    destination_folder?: string;
    concurrency?: number;
    auto_start?: boolean;
    skip_duplicates?: boolean;
  }) => request<Batch>("/batches", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  listBatches: () => request<Batch[]>("/batches"),
  getBatch: (batchId: string) => request<Batch>(`/batches/${batchId}`),
  startBatch: (batchId: string) => request<{ status: string }>(`/batches/${batchId}/start`, { method: "POST" }),
  pauseBatch: (batchId: string) => request<{ status: string }>(`/batches/${batchId}/pause`, { method: "POST" }),
  cancelBatch: (batchId: string) => request<{ status: string }>(`/batches/${batchId}/cancel`, { method: "POST" }),
  retryFailedBatch: (batchId: string) => request<{ status: string; retried_count: number }>(`/batches/${batchId}/retry-failed`, { method: "POST" }),

  // History
  getHistory: (format?: string, search?: string) => {
    const params = new URLSearchParams();
    if (format) params.append("format_type", format);
    if (search) params.append("search", search);
    return request<HistoryItem[]>(`/history?${params.toString()}`);
  },
  deleteHistory: (id: number, deleteFile: boolean = false) =>
    request<{ status: string }>(`/history/${id}?delete_file=${deleteFile}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (data: Partial<AppSettings>) => request<{ status: string }>("/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  }),
  validatePath: (path: string) => request<{ valid: boolean; path: string; writable: boolean; error?: string }>("/settings/validate-path", {
    method: "POST",
    body: JSON.stringify({ path }),
  }),

  // Library
  getLibrary: (mediaType?: string, search?: string) => {
    const params = new URLSearchParams();
    if (mediaType) params.append("media_type", mediaType);
    if (search) params.append("search", search);
    return request<LibraryItem[]>(`/library?${params.toString()}`);
  },
  trimMedia: (data: { input_path: string; output_filename: string; start_time: string; end_time: string }) =>
    request<{ status: string; output_path: string; file_size: number }>("/library/trim", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Images
  analyzeImages: (urls: string[]) =>
    request<ImageItem[]>("/images/analyze", {
      method: "POST",
      body: JSON.stringify({ urls }),
    }),
  discoverPageImages: (url: string, minWidth: number = 80, minHeight: number = 80) =>
    request<ImageItem[]>("/images/discover-page", {
      method: "POST",
      body: JSON.stringify({ url, min_width: minWidth, min_height: minHeight }),
    }),
  createImageBatch: (data: {
    name?: string;
    items: Array<{
      url: string;
      resolved_url?: string;
      filename?: string;
      title?: string;
      target_format?: string;
      width?: number;
      height?: number;
      file_size?: number;
      mime_type?: string;
      source_variant?: string;
      original_verified?: boolean;
    }>;
    destination_folder?: string;
    concurrency?: number;
    target_format?: string;
    preserve_metadata?: boolean;
    auto_start?: boolean;
    skip_duplicates?: boolean;
  }) =>
    request<Batch>("/images/batches", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  exportImagesZip: (data: { job_ids?: string[]; batch_id?: string; zip_name?: string }) =>
    request<{ zip_path: string; filename: string; file_count: number; zip_size: number; message: string }>("/images/export-zip", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Performance & Concurrency
  getPerformanceSettings: () => request<PerformanceSettings>("/performance/settings"),
  updatePerformanceSettings: (data: Partial<PerformanceSettings>) =>
    request<PerformanceSettings>("/performance/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  getPerformanceStatus: () => request<PerformanceStatus>("/performance/status"),
  getPerformanceDiagnostics: () => request<any>("/performance/diagnostics"),

  // Source Authentication (Local Browser Session)
  getAuthStatus: () => request<AuthStatus>("/auth/status"),
  connectBrowserAuth: (data: ConnectBrowserRequest) =>
    request<AuthStatus>("/auth/connect", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  disconnectAuth: () =>
    request<AuthStatus>("/auth/disconnect", {
      method: "POST",
    }),
  testAuthConnectivity: (sampleUrl?: string) => {
    const params = sampleUrl ? `?sample_url=${encodeURIComponent(sampleUrl)}` : "";
    return request<any>(`/auth/test${params}`, {
      method: "POST",
    });
  },
};

