from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

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

    def test_manifest_rejects_insecure_and_duplicate_mirrors(self) -> None:
        manifest = minimal_manifest("a" * 64)
        manifest["components"][0]["mirrors"] = ["http://example.invalid/rav1e.tar.gz"]
        with self.assertRaisesRegex(bundle.BundleError, "absolute HTTPS URL"):
            bundle.validate_manifest(manifest)

        manifest["components"][0]["mirrors"] = [
            manifest["components"][0]["url"]
        ]
        with self.assertRaisesRegex(bundle.BundleError, "Duplicate download URL"):
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


class DownloadTests(unittest.TestCase):
    def test_hash_mismatch_is_retried_before_verified_bytes_are_accepted(self) -> None:
        good_bytes = b"verified upstream source"
        expected = digest(good_bytes)
        bad_hash = digest(b"transient corrupt response")

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "source.tar.gz"

            def fake_download(_url: str, partial: Path) -> str:
                if fake_download.call_count == 0:
                    fake_download.call_count += 1
                    partial.write_bytes(b"transient corrupt response")
                    return bad_hash
                partial.write_bytes(good_bytes)
                return expected

            fake_download.call_count = 0
            with (
                mock.patch.object(bundle, "_download_once", side_effect=fake_download) as download,
                mock.patch.object(bundle.time, "sleep") as sleep,
            ):
                result = bundle.download_verified(
                    name="test source",
                    url="https://example.invalid/source.tar.gz",
                    expected_sha256=expected,
                    destination=destination,
                )

            self.assertEqual(result.read_bytes(), good_bytes)
            self.assertEqual(download.call_count, 2)
            sleep.assert_called_once_with(1)
            self.assertFalse(destination.with_name(destination.name + ".part").exists())

    def test_primary_hash_mismatch_falls_back_to_pinned_manifest_mirror(self) -> None:
        good_bytes = b"verified mirrored source"
        expected = digest(good_bytes)
        primary = "https://primary.example.invalid/source.tar.gz"
        mirror = "https://mirror.example.invalid/source.tar.gz"

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "source.tar.gz"

            def fake_download(url: str, partial: Path) -> str:
                if url == primary:
                    partial.write_bytes(b"bad CDN response")
                    return digest(b"bad CDN response")
                partial.write_bytes(good_bytes)
                return expected

            with (
                mock.patch.object(bundle, "_download_once", side_effect=fake_download) as download,
                mock.patch.object(bundle.time, "sleep") as sleep,
            ):
                result = bundle.download_verified(
                    name="test source",
                    url=primary,
                    mirrors=(mirror,),
                    expected_sha256=expected,
                    destination=destination,
                )

            self.assertEqual(result.read_bytes(), good_bytes)
            self.assertEqual(
                [call.args[0] for call in download.call_args_list],
                [primary, mirror],
            )
            sleep.assert_not_called()

    def test_repeated_hash_mismatches_fail_closed_without_cached_bytes(self) -> None:
        expected = digest(b"expected source")
        bad_bytes = b"untrusted response"
        bad_hash = digest(bad_bytes)

        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "source.tar.gz"

            def fake_download(_url: str, partial: Path) -> str:
                partial.write_bytes(bad_bytes)
                return bad_hash

            mirror = "https://mirror.example.invalid/source.tar.gz"
            with (
                mock.patch.object(bundle, "_download_once", side_effect=fake_download) as download,
                mock.patch.object(bundle.time, "sleep") as sleep,
                self.assertRaisesRegex(
                    bundle.BundleError,
                    rf"after 3 attempts.*2 source\(s\).*expected SHA-256 {expected}.*{bad_hash}",
                ),
            ):
                bundle.download_verified(
                    name="test source",
                    url="https://example.invalid/source.tar.gz",
                    mirrors=(mirror,),
                    expected_sha256=expected,
                    destination=destination,
                )

            self.assertEqual(download.call_count, 6)
            self.assertEqual(sleep.call_args_list, [mock.call(1), mock.call(2)])
            self.assertFalse(destination.exists())
            self.assertFalse(destination.with_name(destination.name + ".part").exists())

    def test_verified_cache_is_reused_without_network_access(self) -> None:
        cached = b"already verified source"
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "source.tar.gz"
            destination.write_bytes(cached)
            with mock.patch.object(bundle, "_download_once") as download:
                result = bundle.download_verified(
                    name="test source",
                    url="https://example.invalid/source.tar.gz",
                    expected_sha256=digest(cached),
                    destination=destination,
                )

            self.assertEqual(result, destination)
            download.assert_not_called()

    def test_verified_partial_is_removed_when_atomic_cache_write_fails(self) -> None:
        verified = b"verified source"
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "source.tar.gz"

            def fake_download(_url: str, partial: Path) -> str:
                partial.write_bytes(verified)
                return digest(verified)

            with (
                mock.patch.object(bundle, "_download_once", side_effect=fake_download),
                mock.patch.object(Path, "replace", side_effect=OSError("disk full")),
                self.assertRaisesRegex(bundle.BundleError, "Unable to cache verified source input"),
            ):
                bundle.download_verified(
                    name="test source",
                    url="https://example.invalid/source.tar.gz",
                    expected_sha256=digest(verified),
                    destination=destination,
                )

            self.assertFalse(destination.exists())
            self.assertFalse(destination.with_name(destination.name + ".part").exists())


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
