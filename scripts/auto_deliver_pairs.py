import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import flow_scene_builder as pipeline
from scripts.compose_hook_recipe import compose

def run_assembler(manifest_path):
    root = Path(manifest_path).resolve().parent
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    destination = Path(manifest["destination"]).resolve()
    destination.mkdir(parents=True, exist_ok=True)

    delivery_log = root / "delivered_videos.json"
    delivered = json.loads(delivery_log.read_text(encoding="utf-8")) if delivery_log.exists() else {}

    print(f"Watching for ready pairs in {root} -> delivering to {destination}")

    while True:
        ready_file = root / "ready_edits.json"
        if ready_file.exists():
            try:
                ready_pairs = json.loads(ready_file.read_text(encoding="utf-8"))
            except Exception:
                ready_pairs = []

            for item in ready_pairs:
                pid = item["id"]
                target_filename = f"video_{pid}.mp4"
                final_path = destination / target_filename

                if pid in delivered and final_path.exists():
                    continue

                if final_path.exists() and final_path.stat().st_size > 1000000:
                    delivered[pid] = str(final_path)
                    continue

                try:
                    print(f"Composing 5-scene video for pair {pid}...")
                    with tempfile.TemporaryDirectory(prefix="compose_scratch_") as scratch:
                        result = compose(item["hook_folder"], item["recipe_folder"], scratch)
                        temp_final = Path(result["final"])
                        shutil.copy2(temp_final, final_path)

                    pipeline.run_ff(["-v", "error", "-i", str(final_path), "-f", "null", "-"])
                    delivered[pid] = str(final_path)
                    delivery_log.write_text(json.dumps(delivered, indent=2, ensure_ascii=False), encoding="utf-8")
                    print(f"Successfully delivered {target_filename} (5 scenes, {result.get('metadata', {}).get('duration', 0):.1f}s)")
                except Exception as e:
                    print(f"Error composing pair {pid}: {e}")

            target = int(manifest.get("quantity", 100))
            if len(delivered) >= target:
                print(f"All {target} target videos delivered successfully!")
                return

        time.sleep(5)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: auto_deliver_pairs.py <manifest.json>")
        sys.exit(1)
    run_assembler(sys.argv[1])
