"""Register one native image without visual evaluation, one receipt per slot."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bridge import atomic


def register(job_path, slot_id, source):
    job = json.loads(Path(job_path).read_text(encoding='utf-8-sig'))
    slot = next(s for s in job['slots'] if s['id'] == slot_id)
    source = Path(source).resolve()
    if not source.is_file():
        raise ValueError('Native image file missing.')
    root = Path(job['root']).resolve()
    receipt = root / 'image_receipts' / (slot_id + '.json')
    checksum = hashlib.sha256(source.read_bytes()).hexdigest()
    if receipt.exists():
        existing = json.loads(receipt.read_text(encoding='utf-8-sig'))
        if existing['sha256'] != checksum:
            raise ValueError('Slot already registered; do not regenerate or overwrite.')
        return existing
    destination = root / 'images' / (slot_id + source.suffix.lower())
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != checksum:
        raise ValueError('Image destination collision.')
    shutil.copy2(source, destination)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != checksum:
        raise ValueError('Copy incomplete.')
    result = dict(id=slot_id, pair_id=slot['pair_id'], kind=slot['kind'], path=str(destination),
                  source_path=str(source), sha256=checksum, visual_reviewed=False,
                  disposition='as_generated', chat_number=job['chat_number'])
    atomic(receipt, result)
    return result


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--job', required=True)
    p.add_argument('--id', required=True)
    p.add_argument('--source', required=True)
    a = p.parse_args()
    print(json.dumps(register(a.job, a.id, a.source)))
