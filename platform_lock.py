"""Process locks on POSIX and Windows, held for the file handle lifetime."""
import os
import time

if os.name != 'nt':
    from fcntl import flock, LOCK_EX, LOCK_NB, LOCK_UN
else:
    import msvcrt
    LOCK_EX, LOCK_NB, LOCK_UN = 2, 4, 8

    def flock(stream, operation):
        fd = stream.fileno()
        if operation == LOCK_UN:
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            return
        if os.fstat(fd).st_size == 0:
            os.write(fd, b'\0')
        while True:
            os.lseek(fd, 0, os.SEEK_SET)
            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                return
            except OSError as exc:
                if exc.errno not in (13, 11, 36):
                    raise
                if operation & LOCK_NB:
                    raise BlockingIOError('Outro executor detem a fila') from exc
                time.sleep(0.05)
