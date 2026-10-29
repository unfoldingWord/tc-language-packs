"""Copy the shared reader into both skills, then publish both skills on the site (public/skills/) with a zip each.

src/langpack.py is the one source of the reader; each skill folder must carry its own copy, because a skill is
installed as a folder on its own. Run after changing the reader or a skill, before committing:

    python tools/publish_skills.py
"""
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
READER = os.path.join(ROOT, "src", "langpack.py")
SKILLS = os.path.join(ROOT, "plugins", "tc-language-packs", "skills")
OUT = os.path.join(ROOT, "public", "skills")
NAMES = ["tc-language-packs-translator", "tc-language-packs-dev"]

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT)
for name in NAMES:
    skill = os.path.join(SKILLS, name)
    os.makedirs(os.path.join(skill, "scripts"), exist_ok=True)
    shutil.copyfile(READER, os.path.join(skill, "scripts", "langpack.py"))
    dest = os.path.join(OUT, name)
    shutil.copytree(skill, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    archive = os.path.join(OUT, name + ".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for folder, _, files in sorted(os.walk(dest)):
            for f in sorted(files):
                path = os.path.join(folder, f)
                z.write(path, os.path.join(name, os.path.relpath(path, dest)))
    print("published", name)
