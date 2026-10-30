import { useEffect, useState, useRef, useCallback } from "react";
import { Job } from "../types";
import { api } from "../services/api";

export function useSaveXaSocket() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await api.listDownloads();
      setJobs(data);
    } catch {
      // Ignore network hiccup
    }
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        fetchJobs();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "SNAPSHOT" && Array.isArray(data.jobs)) {
            // merge snapshot
            setJobs((prev) => {
              const map = new Map(prev.map((j) => [j.id, j]));
              for (const j of data.jobs) {
                const existing = map.get(j.id);
                map.set(j.id, existing ? { ...existing, ...j } : j);
              }
              return Array.from(map.values());
            });
          } else if (data.event === "JOB_PROGRESS") {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === data.job_id
                  ? {
                      ...j,
                      status: data.status,
                      downloaded_bytes: data.downloaded_bytes,
                      file_size: data.total_bytes || j.file_size,
                      progress: data.progress,
                      speed: data.speed,
                      eta: data.eta,
                    }
                  : j
              )
            );
          } else if (data.event === "JOB_STATUS" || data.event === "JOB_COMPLETED" || data.event === "JOB_FAILED") {
            // Refresh full state for consistency
            fetchJobs();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        // Exponential reconnect
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [fetchJobs]);

  useEffect(() => {
    connect();
    // Keepalive ping
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send("ping");
      }
    }, 15000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const activeDownloads = jobs.filter((j) => j.status === "DOWNLOADING" || j.status === "PROCESSING");
  const totalSpeed = activeDownloads.reduce((acc, j) => acc + (j.speed || 0), 0);

  return {
    jobs,
    connected,
    activeDownloads,
    activeCount: activeDownloads.length,
    queuedCount: jobs.filter((j) => j.status === "QUEUED").length,
    totalSpeed,
    refreshJobs: fetchJobs,
  };
}

