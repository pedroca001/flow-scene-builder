"""Read one complete prompt as JSON, avoiding truncated whole-job shell output."""
import argparse
import json
from pathlib import Path

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--job', required=True)
    p.add_argument('--id', required=True)
    a = p.parse_args()
    job = json.loads(Path(a.job).read_text(encoding='utf-8-sig'))
    slot = next(s for s in job['slots'] if s['id'] == a.id)
    print(json.dumps(slot,ensure_ascii=True))
