"""Shared account cadence/holds and short UI leases for isolated profile queues."""
import os
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
import platform_lock
from settings import read_settings


def shared_root(app):
    return Path(os.environ.get('FLOW_SHARED_ROOT') or read_settings().get('shared_account_root') or app)


@contextmanager
def account_lock(app):
    root = shared_root(app)
    root.mkdir(parents=True, exist_ok=True)
    with (root / 'account.lock').open('a') as lock:
        platform_lock.flock(lock, platform_lock.LOCK_EX)
        try:
            yield root
        finally:
            platform_lock.flock(lock, platform_lock.LOCK_UN)


class SharedUiLease:
    def __init__(self):
        self.guard = threading.Lock()
        self.file = None
        self.owner = self.token = None

    def acquire(self, app, owner):
        with self.guard:
            if self.file:
                return {'acquired': False, 'wait_ms': 250}
            root = shared_root(app)
            root.mkdir(parents=True, exist_ok=True)
            handle = (root / 'ui.lock').open('a')
            try:
                platform_lock.flock(handle, platform_lock.LOCK_EX | platform_lock.LOCK_NB)
            except BlockingIOError:
                handle.close()
                return {'acquired': False, 'wait_ms': 250}
            self.file, self.owner, self.token = handle, owner, uuid.uuid4().hex
            return {'acquired': True, 'token': self.token}

    def release(self, owner, token):
        with self.guard:
            if not self.file or owner != self.owner or token != self.token:
                raise ValueError('Lease de interface nao pertence a este trabalho.')
            self.file.close()  # OS releases the lease even after a host crash.
            self.file = self.owner = self.token = None
            return True

    def close(self):
        with self.guard:
            if self.file:
                self.file.close()
            self.file = self.owner = self.token = None
