/**
 * Accurate byte formatter preventing misleading '0.0 MB' displays.
 * Accurately formats bytes into B, KB, MB, GB, TB.
 */
export const formatBytes = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(2)} GB`;
  const tb = gb / 1024;
  return `${tb.toFixed(2)} TB`;
};

/**
 * Formats transfer speed in KB/s or MB/s.
 */
export const formatSpeed = (bytesPerSec?: number | null): string => {
  if (!bytesPerSec || bytesPerSec <= 0 || isNaN(bytesPerSec)) return "0 KB/s";
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB/s`;
};

/**
 * Formats transfer speed in both MB/s and Mbps simultaneously.
 * Example: '6.25 MB/s (50.0 Mbps)'
 */
export const formatDualSpeed = (bytesPerSec?: number | null): string => {
  if (!bytesPerSec || bytesPerSec <= 0 || isNaN(bytesPerSec)) return "0.0 MB/s (0.0 Mbps)";
  const mbs = bytesPerSec / (1024 * 1024);
  const mbps = (bytesPerSec * 8) / 1_000_000;
  if (mbs < 0.1) {
    const kbs = bytesPerSec / 1024;
    return `${kbs.toFixed(0)} KB/s (${mbps.toFixed(1)} Mbps)`;
  }
  return `${mbs.toFixed(2)} MB/s (${mbps.toFixed(1)} Mbps)`;
};

/**
 * Formats seconds into mm:ss or hh:mm:ss.
 */
export const formatDuration = (seconds?: number | null): string => {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return "0:00";
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
