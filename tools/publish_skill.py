"""Copy the language-packs skill into the site (public/skills/), with a zip, so any agent harness can fetch it.

Run before deploying when the skill changes:  python tools/publish_skill.py
"""
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(ROOT, "plugins", "language-packs", "skills", "language-packs")
OUT = os.path.join(ROOT, "public", "skills")

dest = os.path.join(OUT, "language-packs")
shutil.rmtree(dest, ignore_errors=True)
shutil.copytree(SKILL, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
archive = os.path.join(OUT, "language-packs.zip")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for folder, _, files in os.walk(dest):
        for name in sorted(files):
            path = os.path.join(folder, name)
            z.write(path, os.path.join("language-packs", os.path.relpath(path, dest)))
print("wrote", os.path.relpath(dest, ROOT), "and", os.path.relpath(archive, ROOT))
