"""Build a source-only distribution; never include local jobs or dependencies."""
import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['README.md', 'AGENTS.md', '.gitignore', 'requirements.txt', 'package.json',
         'package-lock.json', 'pnpm-lock.yaml', 'extension_id.txt', 'bridge.py',
         'flow_scene_builder.py', 'candidate_selection.py', 'bridge (1).py',
         'flow_scene_builder (1).py', 'candidate_selection (1).py', 'shared_runtime.py',
         'pnpm-workspace.yaml', 'settings.py',
         'platform_lock.py', 'settings_windows_defaults.json']
DIRECTORIES = ['extension', 'browser_executor', 'presets', 'scripts', 'tests', 'docs', '.agents/skills/gerar_video_flow']
EXTENSIONS = {'.md', '.py', '.mjs', '.sh', '.ps1', '.json', '.js', '.css', '.html', '.yaml'}


def source_files():
    result = [ROOT/name for name in FILES]
    for name in DIRECTORIES:
        result.extend(p for p in (ROOT/name).rglob('*') if p.is_file()
                      and '__pycache__' not in p.parts and p.suffix in EXTENSIONS)
    return sorted(set(result))


def main():
    destination = ROOT/'dist'
    destination.mkdir(exist_ok=True)
    archive = destination/'flow_scene_builder_macos.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
        for path in source_files():
            output.write(path, Path('flow_scene_builder')/path.relative_to(ROOT))
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
    print(f'{archive}\nSHA256 {checksum}\n{len(source_files())} source files')


if __name__ == '__main__':
    main()
