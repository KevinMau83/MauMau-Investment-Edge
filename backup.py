"""Take a consistent SQLite snapshot while the application is running."""
import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3


def backup(source, destination):
    source = Path(source).resolve(strict=True)
    destination = Path(destination)
    with destination.open("xb"):
        pass
    try:
        with closing(sqlite3.connect(f"{source.as_uri()}?mode=ro", uri=True)) as live:
            with closing(sqlite3.connect(destination)) as snapshot:
                live.backup(snapshot)
                if snapshot.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise sqlite3.DatabaseError("Backup integrity check failed")
    except BaseException:
        destination.unlink()
        raise


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    backup(args.source, args.destination)
