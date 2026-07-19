#!/usr/bin/env python3
"""Build WatchAlong's verified macOS FFmpeg Corresponding Source archive.

The checked-in manifest is the source of truth. Every network input is pinned
by SHA-256 before it is admitted to the bundle, and the checked-in FFmpeg and
ffprobe executables are hashed first so the source offer cannot silently drift
away from the binaries it covers.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import tomllib
from typing import Any, BinaryIO, Iterable
import urllib.error
import urllib.parse
import urllib.request


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_MANIFEST = SCRIPT_DIR / "ffmpeg-macos-source-inputs.json"
HASH_LENGTH = 64
DOWNLOAD_CHUNK_SIZE = 1024 * 1024
USER_AGENT = "WatchAlong-FFmpeg-Source-Bundler/1.1"


class BundleError(RuntimeError):
    """A user-actionable source-bundle failure."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(DOWNLOAD_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BundleError(f"Manifest field {field!r} must be a non-empty string.")
    return value


def _validate_sha256(value: Any, field: str) -> str:
    digest = _require_string(value, field)
    if len(digest) != HASH_LENGTH or any(char not in "0123456789abcdef" for char in digest):
        raise BundleError(
            f"Manifest field {field!r} must be a lowercase 64-character SHA-256 digest."
        )
    return digest


def _validate_archive_name(value: Any, field: str) -> str:
    name = _require_string(value, field)
    if name in {".", ".."} or Path(name).name != name or "/" in name or "\\" in name:
        raise BundleError(f"Manifest field {field!r} must be a plain filename, not a path.")
    return name


def _validate_https_url(value: Any, field: str) -> str:
    url = _require_string(value, field)
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise BundleError(f"Manifest field {field!r} must be an absolute HTTPS URL.")
    return url


def _validate_download_locations(entry: dict[str, Any], prefix: str) -> None:
    primary = _validate_https_url(entry.get("url"), f"{prefix}.url")
    mirrors = entry.get("mirrors", [])
    if not isinstance(mirrors, list):
        raise BundleError(f"Manifest field {prefix}.mirrors must be an array of HTTPS URLs.")
    seen = {primary}
    for index, value in enumerate(mirrors):
        mirror = _validate_https_url(value, f"{prefix}.mirrors[{index}]")
        if mirror in seen:
            raise BundleError(f"Duplicate download URL in manifest field {prefix}: {mirror}")
        seen.add(mirror)


def _validate_relative_repo_path(value: Any, field: str) -> str:
    raw = _require_string(value, field)
    path = PurePosixPath(raw)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise BundleError(f"Manifest field {field!r} must stay inside the repository.")
    if "\\" in raw:
        raise BundleError(f"Manifest field {field!r} must use forward slashes.")
    return raw


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schemaVersion") != 1:
        raise BundleError("Unsupported source manifest schema; expected schemaVersion 1.")

    _require_string(manifest.get("sourceSetId"), "sourceSetId")
    _require_string(manifest.get("ffmpegVersion"), "ffmpegVersion")

    components = manifest.get("components")
    if not isinstance(components, list) or not components:
        raise BundleError("Manifest must contain at least one source component.")

    component_names: set[str] = set()
    archive_names: set[str] = set()
    for index, component in enumerate(components):
        if not isinstance(component, dict):
            raise BundleError(f"Manifest component {index} must be an object.")
        prefix = f"components[{index}]"
        name = _require_string(component.get("name"), f"{prefix}.name")
        if name in component_names:
            raise BundleError(f"Duplicate source component name: {name}.")
        component_names.add(name)
        _require_string(component.get("version"), f"{prefix}.version")
        _require_string(component.get("role"), f"{prefix}.role")
        archive_name = _validate_archive_name(
            component.get("archiveName"), f"{prefix}.archiveName"
        )
        if archive_name in archive_names:
            raise BundleError(f"Duplicate source archive filename: {archive_name}.")
        archive_names.add(archive_name)
        _validate_download_locations(component, prefix)
        _validate_sha256(component.get("sha256"), f"{prefix}.sha256")

    targets = manifest.get("buildTargets")
    if not isinstance(targets, list) or not targets:
        raise BundleError("Manifest must contain at least one covered macOS build target.")

    target_names: set[str] = set()
    binary_paths: set[str] = set()
    report_names: set[str] = set()
    for target_index, target in enumerate(targets):
        if not isinstance(target, dict):
            raise BundleError(f"Manifest buildTargets[{target_index}] must be an object.")
        prefix = f"buildTargets[{target_index}]"
        target_name = _require_string(target.get("target"), f"{prefix}.target")
        if target_name in target_names:
            raise BundleError(f"Duplicate build target: {target_name}.")
        target_names.add(target_name)
        _require_string(target.get("upstreamBuildId"), f"{prefix}.upstreamBuildId")

        report = target.get("versionsReport")
        if not isinstance(report, dict):
            raise BundleError(f"Manifest field {prefix}.versionsReport must be an object.")
        report_name = _validate_archive_name(
            report.get("archiveName"), f"{prefix}.versionsReport.archiveName"
        )
        if report_name in report_names:
            raise BundleError(f"Duplicate build report filename: {report_name}.")
        report_names.add(report_name)
        _validate_download_locations(report, f"{prefix}.versionsReport")
        _validate_sha256(report.get("sha256"), f"{prefix}.versionsReport.sha256")

        binaries = target.get("binaries")
        if not isinstance(binaries, list) or not binaries:
            raise BundleError(f"Manifest target {target_name} has no covered binaries.")
        for binary_index, binary in enumerate(binaries):
            if not isinstance(binary, dict):
                raise BundleError(
                    f"Manifest field {prefix}.binaries[{binary_index}] must be an object."
                )
            binary_prefix = f"{prefix}.binaries[{binary_index}]"
            binary_path = _validate_relative_repo_path(
                binary.get("path"), f"{binary_prefix}.path"
            )
            if binary_path in binary_paths:
                raise BundleError(f"Covered binary appears more than once: {binary_path}.")
            binary_paths.add(binary_path)
            _validate_sha256(binary.get("sha256"), f"{binary_prefix}.sha256")

    rav1e = manifest.get("rav1eCargo")
    if not isinstance(rav1e, dict):
        raise BundleError("Manifest field rav1eCargo must be an object.")
    rav1e_component = _require_string(rav1e.get("component"), "rav1eCargo.component")
    if rav1e_component not in component_names:
        raise BundleError(f"rav1eCargo references unknown component {rav1e_component!r}.")
    _validate_sha256(rav1e.get("cargoLockSha256"), "rav1eCargo.cargoLockSha256")
    for count_field in ("registryPackageCount", "gitPackageCount"):
        count = rav1e.get(count_field)
        if not isinstance(count, int) or count < 0:
            raise BundleError(f"Manifest field rav1eCargo.{count_field} must be non-negative.")


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise BundleError(f"Source manifest not found: {path}") from error
    except json.JSONDecodeError as error:
        raise BundleError(f"Source manifest is not valid JSON: {path}: {error}") from error
    if not isinstance(manifest, dict):
        raise BundleError("Source manifest root must be a JSON object.")
    validate_manifest(manifest)
    return manifest


def _resolve_repo_file(repo_root: Path, relative: str) -> Path:
    parts = PurePosixPath(relative).parts
    candidate = (repo_root.joinpath(*parts)).resolve()
    try:
        candidate.relative_to(repo_root.resolve())
    except ValueError as error:
        raise BundleError(f"Repository path escapes the repository: {relative}") from error
    return candidate


def verify_covered_binaries(manifest: dict[str, Any], repo_root: Path) -> None:
    for target in manifest["buildTargets"]:
        for binary in target["binaries"]:
            relative = binary["path"]
            path = _resolve_repo_file(repo_root, relative)
            if not path.is_file():
                raise BundleError(
                    f"Covered binary is missing: {relative}. Fetch Git LFS assets before "
                    "building the source offer."
                )
            with path.open("rb") as handle:
                prefix = handle.read(64)
            if prefix.startswith(b"version https://git-lfs.github.com/spec/v1"):
                raise BundleError(
                    f"Covered binary is only a Git LFS pointer: {relative}. Run git lfs pull first."
                )
            actual = sha256_file(path)
            expected = binary["sha256"]
            if actual != expected:
                raise BundleError(
                    f"Covered binary hash mismatch for {relative}: expected {expected}, got {actual}. "
                    "Refusing to publish source for a different binary."
                )


def _download_once(url: str, destination: Path) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        while chunk := response.read(DOWNLOAD_CHUNK_SIZE):
            digest.update(chunk)
            output.write(chunk)
    return digest.hexdigest()


def download_verified(
    *,
    name: str,
    url: str,
    expected_sha256: str,
    destination: Path,
    mirrors: Iterable[str] = (),
    attempts: int = 3,
) -> Path:
    if attempts < 1:
        raise BundleError("Download attempts must be at least one.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        actual = sha256_file(destination)
        if actual == expected_sha256:
            print(f"Reusing verified source input: {name}")
            return destination
        print(f"Discarding corrupt cached source input: {destination}")
        destination.unlink()

    partial = destination.with_name(destination.name + ".part")
    partial.unlink(missing_ok=True)
    source_urls = (url, *tuple(mirrors))
    failures: list[str] = []
    for attempt in range(1, attempts + 1):
        for source_index, source_url in enumerate(source_urls, start=1):
            try:
                print(
                    f"Downloading source input (attempt {attempt}/{attempts}, "
                    f"source {source_index}/{len(source_urls)}): {name}"
                )
                actual = _download_once(source_url, partial)
            except (OSError, urllib.error.URLError) as error:
                partial.unlink(missing_ok=True)
                failures.append(f"{source_url}: {type(error).__name__}: {error}")
                continue
            if actual != expected_sha256:
                partial.unlink(missing_ok=True)
                failures.append(f"{source_url}: SHA-256 {actual}")
                continue
            try:
                partial.replace(destination)
            except OSError as error:
                partial.unlink(missing_ok=True)
                raise BundleError(
                    f"Unable to cache verified source input {name} at {destination}: {error}"
                ) from error
            if source_index > 1:
                print(f"Verified {name} from manifest mirror {source_index - 1}.")
            return destination
        if attempt < attempts:
            time.sleep(2 ** (attempt - 1))
    details = "; ".join(failures)
    raise BundleError(
        f"Unable to download verified source input {name} after {attempts} attempts from "
        f"{len(source_urls)} source(s): expected SHA-256 {expected_sha256}; observed failures: "
        f"{details}. Refusing to continue."
    )


def _safe_extract_regular_tar(archive: Path, destination: Path) -> None:
    """Extract regular files/directories while rejecting links and special files."""
    destination.mkdir(parents=True, exist_ok=True)
    destination_root = destination.resolve()
    try:
        source = tarfile.open(archive, mode="r:*")
    except tarfile.TarError as error:
        raise BundleError(f"Unable to read rav1e source archive {archive}: {error}") from error

    with source:
        for member in source.getmembers():
            raw_name = member.name
            posix_name = PurePosixPath(raw_name)
            if (
                not raw_name
                or "\\" in raw_name
                or posix_name.is_absolute()
                or any(part in {"", ".", ".."} for part in posix_name.parts)
            ):
                raise BundleError(f"Unsafe path in rav1e source archive: {raw_name!r}")
            target = destination.joinpath(*posix_name.parts).resolve()
            try:
                target.relative_to(destination_root)
            except ValueError as error:
                raise BundleError(f"Unsafe path in rav1e source archive: {raw_name!r}") from error

            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                target.chmod(0o755)
                continue
            if not member.isfile():
                raise BundleError(
                    f"Unsupported link or special file in rav1e source archive: {raw_name!r}"
                )
            target.parent.mkdir(parents=True, exist_ok=True)
            extracted = source.extractfile(member)
            if extracted is None:
                raise BundleError(f"Unable to extract rav1e source file: {raw_name!r}")
            with extracted, target.open("wb") as output:
                shutil.copyfileobj(extracted, output)
            target.chmod(0o755 if member.mode & 0o111 else 0o644)


def _read_rav1e_lock(
    cargo_lock: Path, cargo_manifest: dict[str, Any]
) -> list[dict[str, str]]:
    actual_lock_hash = sha256_file(cargo_lock)
    expected_lock_hash = cargo_manifest["cargoLockSha256"]
    if actual_lock_hash != expected_lock_hash:
        raise BundleError(
            f"rav1e Cargo.lock hash mismatch: expected {expected_lock_hash}, got {actual_lock_hash}."
        )

    try:
        lock = tomllib.loads(cargo_lock.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise BundleError(f"Unable to parse rav1e Cargo.lock: {error}") from error

    packages = lock.get("package")
    if not isinstance(packages, list):
        raise BundleError("rav1e Cargo.lock has no package list.")

    crates: list[dict[str, str]] = []
    git_count = 0
    for package in packages:
        if not isinstance(package, dict):
            raise BundleError("rav1e Cargo.lock contains a malformed package entry.")
        source = package.get("source", "")
        if isinstance(source, str) and source.startswith("registry+"):
            name = _require_string(package.get("name"), "Cargo.lock package.name")
            version = _require_string(package.get("version"), "Cargo.lock package.version")
            checksum = _validate_sha256(package.get("checksum"), f"Cargo.lock {name}.checksum")
            crates.append(
                {
                    "name": name,
                    "version": version,
                    "url": f"https://static.crates.io/crates/{name}/{name}-{version}.crate",
                    "sha256": checksum,
                }
            )
        elif isinstance(source, str) and source.startswith("git+"):
            git_count += 1

    crates.sort(key=lambda item: (item["name"], item["version"]))
    expected_registry = cargo_manifest["registryPackageCount"]
    expected_git = cargo_manifest["gitPackageCount"]
    if len(crates) != expected_registry or git_count != expected_git:
        raise BundleError(
            "rav1e Cargo dependency graph changed: "
            f"expected {expected_registry} registry/{expected_git} git packages, "
            f"found {len(crates)} registry/{git_count} git packages."
        )
    return crates


def _run_checked(command: list[str], *, cwd: Path, env: dict[str, str], purpose: str) -> str:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as error:
        raise BundleError(
            f"Unable to {purpose}: {command[0]!r} was not found. Install Rust/Cargo first."
        ) from error
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "no diagnostic output").strip()
        if len(detail) > 4000:
            detail = detail[-4000:]
        raise BundleError(f"Unable to {purpose} (exit {result.returncode}):\n{detail}")
    return result.stdout


def _verify_vendored_crates(vendor_dir: Path, crates: list[dict[str, str]]) -> None:
    actual_directories = [entry for entry in vendor_dir.iterdir() if entry.is_dir()]
    if len(actual_directories) != len(crates):
        raise BundleError(
            f"cargo vendor produced {len(actual_directories)} package directories; "
            f"expected {len(crates)}."
        )
    for crate in crates:
        crate_dir = vendor_dir / f"{crate['name']}-{crate['version']}"
        checksum_path = crate_dir / ".cargo-checksum.json"
        if not checksum_path.is_file():
            raise BundleError(f"Vendored crate is missing checksum metadata: {crate_dir.name}")
        try:
            checksum = json.loads(checksum_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise BundleError(f"Invalid checksum metadata for {crate_dir.name}: {error}") from error
        if checksum.get("package") != crate["sha256"]:
            raise BundleError(
                f"Vendored crate checksum mismatch for {crate_dir.name}: expected "
                f"{crate['sha256']}, got {checksum.get('package')!r}."
            )


def prepare_rav1e_with_vendor(
    *,
    archive: Path,
    destination: Path,
    cargo_manifest: dict[str, Any],
    cargo_executable: str,
    work_dir: Path,
) -> list[dict[str, str]]:
    extraction_dir = work_dir / "rav1e-extracted"
    _safe_extract_regular_tar(archive, extraction_dir)
    lock_candidates = sorted(extraction_dir.rglob("Cargo.lock"))
    roots = [path.parent for path in lock_candidates if (path.parent / "Cargo.toml").is_file()]
    if len(roots) != 1:
        raise BundleError(
            f"Expected one rav1e Cargo workspace in the source archive, found {len(roots)}."
        )
    rav1e_root = roots[0]
    crates = _read_rav1e_lock(rav1e_root / "Cargo.lock", cargo_manifest)

    if destination.exists():
        raise BundleError(f"Internal staging collision: {destination}")
    shutil.move(str(rav1e_root), destination)
    vendor_temp = work_dir / "rav1e-vendor"
    cargo_home = work_dir / "cargo-home"
    cargo_home.mkdir(parents=True, exist_ok=True)
    cargo_env = os.environ.copy()
    cargo_env.update(
        {
            "CARGO_HOME": str(cargo_home),
            "CARGO_INCREMENTAL": "0",
            "CARGO_NET_RETRY": "3",
        }
    )
    _run_checked(
        [cargo_executable, "vendor", "--locked", "--versioned-dirs", str(vendor_temp)],
        cwd=destination,
        env=cargo_env,
        purpose="vendor rav1e Cargo sources",
    )
    _verify_vendored_crates(vendor_temp, crates)
    shutil.move(str(vendor_temp), destination / "vendor")

    cargo_config = destination / ".cargo" / "config.toml"
    cargo_config.parent.mkdir(parents=True, exist_ok=True)
    cargo_config.write_text(
        '[source.crates-io]\nreplace-with = "vendored-sources"\n\n'
        '[source.vendored-sources]\ndirectory = "vendor"\n',
        encoding="utf-8",
        newline="\n",
    )
    offline_env = cargo_env.copy()
    offline_env["CARGO_NET_OFFLINE"] = "true"
    _run_checked(
        [
            cargo_executable,
            "metadata",
            "--locked",
            "--offline",
            "--format-version",
            "1",
            "--manifest-path",
            str(destination / "Cargo.toml"),
        ],
        cwd=destination,
        env=offline_env,
        purpose="verify rav1e's vendored sources offline",
    )
    return crates


def _canonical_mode(path: Path) -> int:
    return 0o755 if path.stat().st_mode & stat.S_IXUSR else 0o644


def _base_tar_info(name: str, mode: int) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name=name)
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    info.mtime = 0
    info.mode = mode
    return info


def create_deterministic_tar_xz(source_dir: Path, output: Path, root_name: str) -> None:
    if not source_dir.is_dir():
        raise BundleError(f"Source staging directory does not exist: {source_dir}")
    if not root_name or "/" in root_name or "\\" in root_name or root_name in {".", ".."}:
        raise BundleError(f"Invalid bundle root name: {root_name!r}")

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".part")
    temporary.unlink(missing_ok=True)
    try:
        with temporary.open("wb") as raw_output:
            with lzma.LZMAFile(raw_output, mode="wb", preset=6, format=lzma.FORMAT_XZ) as compressed:
                with tarfile.open(
                    fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT
                ) as archive:
                    root = _base_tar_info(root_name, 0o755)
                    root.type = tarfile.DIRTYPE
                    archive.addfile(root)
                    entries = sorted(source_dir.rglob("*"), key=lambda path: path.relative_to(source_dir).as_posix())
                    for path in entries:
                        relative = path.relative_to(source_dir).as_posix()
                        archive_name = f"{root_name}/{relative}"
                        if path.is_symlink():
                            info = _base_tar_info(archive_name, 0o777)
                            info.type = tarfile.SYMTYPE
                            info.linkname = os.readlink(path)
                            archive.addfile(info)
                        elif path.is_dir():
                            info = _base_tar_info(archive_name, 0o755)
                            info.type = tarfile.DIRTYPE
                            archive.addfile(info)
                        elif path.is_file():
                            info = _base_tar_info(archive_name, _canonical_mode(path))
                            info.type = tarfile.REGTYPE
                            info.size = path.stat().st_size
                            with path.open("rb") as handle:
                                archive.addfile(info, handle)
                        else:
                            raise BundleError(f"Unsupported special file in source bundle: {path}")
        temporary.replace(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def _write_source_file_hashes(staging: Path) -> None:
    checksum_path = staging / "SOURCE_FILES_SHA256.txt"
    lines: list[str] = []
    for path in sorted(staging.rglob("*"), key=lambda item: item.relative_to(staging).as_posix()):
        if path.is_file() and path != checksum_path:
            relative = path.relative_to(staging).as_posix()
            lines.append(f"{sha256_file(path)}  {relative}")
    checksum_path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def _write_bundle_readme(
    staging: Path, manifest: dict[str, Any], app_version: str
) -> None:
    binary_lines = []
    for target in manifest["buildTargets"]:
        for binary in target["binaries"]:
            binary_lines.append(
                f"  {target['target']}: {binary['path']}  SHA-256 {binary['sha256']}"
            )
    text = f"""WatchAlong {app_version} - macOS FFmpeg Corresponding Source

This archive covers the exact FFmpeg and ffprobe executables listed below.
It contains the verified upstream source archives, the release recipe in effect
for the FFmpeg 8.1.2 build family, both upstream build reports, and rav1e with
every Cargo dependency vendored for offline source access. SOURCE_MANIFEST.json
records every immutable URL and digest. SOURCE_FILES_SHA256.txt verifies the
files inside this archive.

Covered binaries:
{os.linesep.join(binary_lines)}

The same source set covers Intel and Apple Silicon. The two builds used the
same FFmpeg 8.1.2 configuration and library versions, but different Apple
compiler patch releases. This archive is intended to provide the Corresponding
Source for those binaries; it is not a claim that rebuilding on a different
modern toolchain will be bit-for-bit reproducible.
"""
    (staging / "README.txt").write_text(text.replace(os.linesep, "\n"), encoding="utf-8", newline="\n")


def _package_version(repo_root: Path) -> str:
    package_path = repo_root / "package.json"
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BundleError(f"Unable to read package version from {package_path}: {error}") from error
    return _require_string(package.get("version"), "package.json version")


def _source_bundle_root_name(app_version: str) -> str:
    return f"WatchAlong-v{app_version}-ffmpeg-macos-corresponding-source"


def build_bundle(
    *,
    manifest_path: Path,
    repo_root: Path,
    output: Path,
    cargo_executable: str,
    cache_dir: Path | None,
    app_version: str,
) -> Path:
    manifest = load_manifest(manifest_path)
    verify_covered_binaries(manifest, repo_root)

    with tempfile.TemporaryDirectory(prefix="watchalong-ffmpeg-source-") as temporary_name:
        work_dir = Path(temporary_name)
        downloads = cache_dir.resolve() if cache_dir else work_dir / "downloads"
        downloads.mkdir(parents=True, exist_ok=True)
        staging = work_dir / "bundle"
        upstream_dir = staging / "upstream-source-archives"
        reports_dir = staging / "upstream-build-reports"
        upstream_dir.mkdir(parents=True)
        reports_dir.mkdir(parents=True)

        component_files: dict[str, Path] = {}
        for component in manifest["components"]:
            cached = download_verified(
                name=f"{component['name']} {component['version']}",
                url=component["url"],
                mirrors=component.get("mirrors", ()),
                expected_sha256=component["sha256"],
                destination=downloads / component["archiveName"],
            )
            component_files[component["name"]] = cached
            shutil.copyfile(cached, upstream_dir / component["archiveName"])

        for target in manifest["buildTargets"]:
            report = target["versionsReport"]
            cached = download_verified(
                name=f"{target['target']} versions report",
                url=report["url"],
                mirrors=report.get("mirrors", ()),
                expected_sha256=report["sha256"],
                destination=downloads / report["archiveName"],
            )
            shutil.copyfile(cached, reports_dir / report["archiveName"])

        rav1e_name = manifest["rav1eCargo"]["component"]
        crates = prepare_rav1e_with_vendor(
            archive=component_files[rav1e_name],
            destination=staging / "rav1e-0.8.1-with-vendored-cargo-sources",
            cargo_manifest=manifest["rav1eCargo"],
            cargo_executable=cargo_executable,
            work_dir=work_dir,
        )
        (staging / "RAV1E_CARGO_SOURCES.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "cargoLockSha256": manifest["rav1eCargo"]["cargoLockSha256"],
                    "packages": crates,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
        (staging / "SOURCE_MANIFEST.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        for notice_name in ("THIRD_PARTY_NOTICES.md", "TOOL_PROVENANCE.md"):
            notice = repo_root / notice_name
            if notice.is_file():
                shutil.copyfile(notice, staging / notice_name)
        _write_bundle_readme(staging, manifest, app_version)
        _write_source_file_hashes(staging)

        root_name = _source_bundle_root_name(app_version)
        print(f"Creating deterministic source archive: {output}")
        create_deterministic_tar_xz(staging, output, root_name)
    print(f"Source archive ready: {output} ({sha256_file(output)})")
    return output


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--repo-root", type=Path, default=SCRIPT_DIR.parent)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--cargo", default="cargo", help="Cargo executable used to vendor rav1e")
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Validate the manifest and local covered binary hashes without network access",
    )
    return parser.parse_args(argv)


def main(argv: Iterable[str] | None = None) -> int:
    if sys.version_info < (3, 11):
        print("error: Python 3.11 or newer is required.", file=sys.stderr)
        return 2
    args = _parse_args(argv)
    repo_root = args.repo_root.resolve()
    try:
        manifest = load_manifest(args.manifest.resolve())
        verify_covered_binaries(manifest, repo_root)
        if args.verify_only:
            binaries = sum(len(target["binaries"]) for target in manifest["buildTargets"])
            print(
                f"Verified source manifest: {len(manifest['components'])} inputs, "
                f"{binaries} covered binaries."
            )
            return 0

        app_version = _package_version(repo_root)
        output = args.output
        if output is None:
            output = (
                repo_root
                / "release-assets"
                / f"{_source_bundle_root_name(app_version)}.tar.xz"
            )
        build_bundle(
            manifest_path=args.manifest.resolve(),
            repo_root=repo_root,
            output=output.resolve(),
            cargo_executable=args.cargo,
            cache_dir=args.cache_dir,
            app_version=app_version,
        )
        return 0
    except BundleError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
