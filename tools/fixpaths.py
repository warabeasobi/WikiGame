#!/usr/bin/env python3
"""Flattens accidental duplicated absolute paths inside the project.

Some editors/tools resolve relative paths against a nested copy of the absolute
path. This script moves any file found under <root>/data/data/... back to its
intended location. Safe to run repeatedly.
"""
import os
import shutil

BASE = os.path.expanduser(os.environ.get('WSR_ROOT', '~/wikipedia-speedrun'))
PREFIX = 'data/data/com.termux/files/home/wikipedia-speedrun/'


def main():
    nested_root = os.path.join(BASE, 'data', 'data')
    if not os.path.isdir(nested_root):
        print('nothing to fix')
        return
    moved = 0
    for root, _dirs, files in os.walk(nested_root):
        for name in files:
            src = os.path.join(root, name)
            rel = os.path.relpath(src, BASE)
            clean = rel
            while clean.startswith(PREFIX):
                clean = clean[len(PREFIX):]
            dst = os.path.join(BASE, clean)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)
            moved += 1
            print('moved ->', clean)
    shutil.rmtree(nested_root)
    print('files moved:', moved)


if __name__ == '__main__':
    main()
