from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from scripts import ffmpeg_macos_source_bundle as bundle


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def minimal_manifest(binary_hash: str) -> dict:
    return {
        "schemaVersion": 1,
        "sourceSetId": "test-source-set",
        "ffmpegVersion": "8.1.2",
        "recipe": {"name": "test", "commit": "a" * 40},
        "buildTargets": [
            {
                "target": "macos-arm64",
                "upstreamBuildId": "test-build",
                "versionsReport": {
                    "archiveName": "versions.txt",
                    "url": "https://example.invalid/versions.txt",
                    "sha256": "b" * 64,
                },
                "binaries": [
                    {
                        "path": "resources/ffmpeg",
                        "sha256": binary_hash,
                    }
                ],
            }
        ],
        "rav1eCargo": {
            "component": "rav1e",
            "cargoLockSha256": "c" * 64,
            "registryPackageCount": 0,
            "gitPackageCount": 0,
        },
        "components": [
            {
                "name": "rav1e",
                "version": "0.8.1",
                "role": "static-library-with-cargo-dependencies",
                "archiveName": "rav1e.tar.gz",
                "url": "https://example.invalid/rav1e.tar.gz",
                "sha256": "d" * 64,
            }
        ],
    }


class ManifestTests(unittest.TestCase):
    def test_manifest_rejects_archive_path_traversal(self) -> None:
        manifest = minimal_manifest("a" * 64)
        manifest["components"][0]["archiveName"] = "../rav1e.tar.gz"
        with self.assertRaisesRegex(bundle.BundleError, "plain filename"):
            bundle.validate_manifest(manifest)

    def test_binary_verification_names_the_mismatched_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = root / "resources" / "ffmpeg"
            binary.parent.mkdir(parents=True)
            binary.write_bytes(b"different binary")
            manifest = minimal_manifest("0" * 64)
            bundle.validate_manifest(manifest)
            with self.assertRaisesRegex(
                bundle.BundleError, "Covered binary hash mismatch for resources/ffmpeg"
            ):
                bundle.verify_covered_binaries(manifest, root)


class Rav1eTests(unittest.TestCase):
    def test_lock_manifest_is_machine_readable_and_counted(self) -> None:
        lock_text = """version = 3

[[package]]
name = "rav1e"
version = "0.8.1"

[[package]]
name = "example"
version = "1.2.3"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
"""
        with tempfile.TemporaryDirectory() as temporary:
            lock_path = Path(temporary) / "Cargo.lock"
            lock_path.write_text(lock_text, encoding="utf-8", newline="\n")
            cargo_manifest = {
                "cargoLockSha256": bundle.sha256_file(lock_path),
                "registryPackageCount": 1,
                "gitPackageCount": 0,
            }
            crates = bundle._read_rav1e_lock(lock_path, cargo_manifest)
            self.assertEqual(
                crates,
                [
                    {
                        "name": "example",
                        "version": "1.2.3",
                        "url": "https://static.crates.io/crates/example/example-1.2.3.crate",
                        "sha256": "a" * 64,
                    }
                ],
            )

    def test_rav1e_extraction_rejects_parent_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "unsafe.tar.gz"
            payload = b"escape"
            with tarfile.open(archive, mode="w:gz") as source:
                info = tarfile.TarInfo("../escape.txt")
                info.size = len(payload)
                source.addfile(info, io.BytesIO(payload))
            with self.assertRaisesRegex(bundle.BundleError, "Unsafe path"):
                bundle._safe_extract_regular_tar(archive, root / "extract")
            self.assertFalse((root / "escape.txt").exists())


class DeterministicArchiveTests(unittest.TestCase):
    def test_archive_ignores_source_mtime_and_has_canonical_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            (source / "nested").mkdir()
            data = source / "nested" / "file.txt"
            data.write_text("same bytes\n", encoding="utf-8", newline="\n")

            first = root / "first.tar.xz"
            second = root / "second.tar.xz"
            bundle.create_deterministic_tar_xz(source, first, "bundle")
            data.touch()
            bundle.create_deterministic_tar_xz(source, second, "bundle")
            self.assertEqual(bundle.sha256_file(first), bundle.sha256_file(second))

            with tarfile.open(first, mode="r:xz") as archive:
                members = archive.getmembers()
            self.assertEqual([member.name for member in members], sorted(member.name for member in members))
            self.assertTrue(all(member.mtime == 0 for member in members))
            self.assertTrue(all(member.uid == 0 and member.gid == 0 for member in members))


class BundleMetadataTests(unittest.TestCase):
    def test_archive_name_matches_v_prefixed_release_assets(self) -> None:
        self.assertEqual(
            bundle._source_bundle_root_name("1.1.0"),
            "WatchAlong-v1.1.0-ffmpeg-macos-corresponding-source",
        )

    def test_readme_qualifies_the_release_recipe(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            staging = Path(temporary)
            bundle._write_bundle_readme(staging, minimal_manifest("a" * 64), "1.1.0")
            readme = (staging / "README.txt").read_text(encoding="utf-8")

        self.assertIn("release recipe in effect\nfor the FFmpeg 8.1.2 build family", readme)
        self.assertNotIn("exact build recipe", readme)


if __name__ == "__main__":
    unittest.main()
