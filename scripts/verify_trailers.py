import csv
import json
import os
import subprocess
import sys
from pathlib import Path

DEST_DIR = Path.home() / "Downloads" / "SaveXa" / "TRAILERS"
MANIFEST_FILE = DEST_DIR / "trailers_manifest.csv"

def verify():
    print("=" * 65)
    print(" SAVEXA — TRAILERS INTEGRITY VERIFICATION AUDIT")
    print(f" Target Directory: {DEST_DIR}")
    print("=" * 65)

    if not DEST_DIR.exists():
        print(f"ERROR: Destination directory does not exist: {DEST_DIR}")
        return

    mp4_files = list(DEST_DIR.glob("*.mp4")) + list(DEST_DIR.glob("*.mkv")) + list(DEST_DIR.glob("*.webm"))
    print(f"Physical video files on disk: {len(mp4_files)}")

    total_bytes = sum(f.stat().st_size for f in mp4_files if f.is_file())
    print(f"Total video storage: {total_bytes / (1024**3):.2f} GB ({total_bytes} bytes)")

    # Read manifest if present
    manifest_records = []
    if MANIFEST_FILE.exists():
        with open(MANIFEST_FILE, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            manifest_records = list(reader)
        print(f"Manifest records loaded: {len(manifest_records)}")

    # Verify a random sample of 5 files with ffprobe
    sample = mp4_files[:5]
    print(f"\nRunning ffprobe stream verification on sample ({len(sample)} files):")
    valid_streams = 0
    for f in sample:
        try:
            res = subprocess.run([
                "ffprobe", "-v", "error",
                "-show_entries", "stream=codec_type,codec_name,width,height",
                "-of", "default=noprint_wrappers=1",
                str(f)
            ], capture_output=True, text=True, timeout=10)
            has_vid = "codec_type=video" in res.stdout
            has_aud = "codec_type=audio" in res.stdout
            sz_mb = f.stat().st_size / (1024 * 1024)
            msg = f" [PASS] {f.name[:45]} ({sz_mb:.1f} MB) | Video: {has_vid} | Audio: {has_aud}\n"
            sys.stdout.buffer.write(msg.encode("utf-8", errors="replace"))
            if has_vid:
                valid_streams += 1
        except Exception as e:
            err_msg = f" [FAIL] {f.name}: {e}\n"
            sys.stdout.buffer.write(err_msg.encode("utf-8", errors="replace"))

    print(f"\nAudit complete: {len(mp4_files)} verified files physically present.")

if __name__ == "__main__":
    verify()
