export interface FormatOption {
  format_id: string;
  ext: string;
  resolution: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  fps?: number;
  quality_label: string;
}

export interface MediaMetadata {
  url: string;
  canonical_url?: string;
  media_id?: string;
  title: string;
  creator?: string;
  thumbnail?: string;
  duration?: number;
  source: string;
  is_playlist?: boolean;
  playlist_count?: number;
  playlist_entries?: MediaMetadata[];
  available_qualities: string[];
  formats: FormatOption[];
  is_valid: boolean;
  error?: string;
  // UI selection states
  selected?: boolean;
  targetQuality?: string;
  targetFormat?: string;
}

export interface Job {
  id: string;
  batch_id?: string;
  source_id: string;
  source_url: string;
  canonical_url?: string;
  media_id?: string;
  title: string;
  creator?: string;
  thumbnail_url?: string;
  duration?: number;
  selected_quality: string;
  actual_quality?: string;
  selected_format: string;
  actual_format?: string;
  audio_bitrate?: string;
  destination_dir: string;
  filename?: string;
  output_path?: string;
  file_size: number;
  downloaded_bytes: number;
  status: "CREATED" | "PENDING_ANALYSIS" | "ANALYZING" | "READY" | "QUEUED" | "DOWNLOADING" | "PROCESSING" | "VERIFYING" | "COMPLETED" | "PAUSED" | "FAILED" | "CANCELLED" | "SKIPPED";
  progress: number;
  speed: number;
  eta?: number;
  error_code?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  queue_position: number;
  media_type?: string;
  image_width?: number;
  image_height?: number;
  mime_type?: string;
  image_format?: string;
  source_variant?: string;
  original_resolution_verified?: boolean;
  content_hash?: string;
  download_engine?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface Batch {
  id: string;
  name: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  skipped_items: number;
  selected_preset: string;
  destination_folder: string;
  concurrency: number;
  status: "pending" | "active" | "paused" | "completed" | "failed" | "cancelled";
  created_at: string;
  completed_at?: string;
  jobs?: Job[];
}

export interface SystemStatus {
  app_name: string;
  version: string;
  ffmpeg_installed: boolean;
  ffmpeg_version?: string;
  ffprobe_installed: boolean;
  active_downloads: number;
  queued_downloads: number;
  completed_downloads: number;
  failed_downloads: number;
  concurrency: number;
  default_destination: string;
  storage_free_bytes: number;
  storage_total_bytes: number;
}

export interface HistoryItem {
  id: number;
  job_id: string;
  media_identifier?: string;
  title: string;
  output_path: string;
  file_size: number;
  format: string;
  quality: string;
  duration?: number;
  source_url: string;
  completed_at: string;
}

export interface LibraryItem {
  id: number;
  job_id: string;
  title: string;
  output_path: string;
  filename: string;
  file_size: number;
  format: string;
  quality: string;
  duration?: number;
  media_type: "video" | "audio" | "image" | "other";
  mime_type?: string;
  exists_on_disk: boolean;
  completed_at: string;
}

export interface AppSettings {
  default_destination: string;
  default_quality: string;
  default_format: string;
  concurrency: number;
  max_retries: number;
  auto_organize: boolean;
  prefer_mp4: boolean;
  speed_limit_kbps: number;
  ffmpeg_path?: string;
  ffprobe_path?: string;
}

export interface ImageItem {
  url: string;
  resolved_url: string;
  filename: string;
  width?: number;
  height?: number;
  file_size?: number;
  format: string;
  mime_type: string;
  orientation: string;
  aspect_ratio?: string;
  source: string;
  is_valid: boolean;
  error?: string;
  preview_url?: string;
  selected?: boolean;
  targetFormat?: string;
}

export interface PerformanceSettings {
  mode: string;
  global_max_workers: number;
  concurrency: number;
  image_workers: number;
  video_workers: number;
  per_host_limit: number;
  speed_limit_kbps: number;
}

export interface PerformanceStatus {
  mode: string;
  concurrency: number;
  global_max_workers: number;
  active_workers: number;
  active_images: number;
  active_videos: number;
  speed_bytes_sec: number;
  speed_mbs: number;
  speed_mbps: number;
  formatted_speed: string;
  queued_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
}


