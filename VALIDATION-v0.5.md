# v0.5.0 local validation and handoff

Base: c42fabf (v0.4 branch). Local feature branch: transfer-v0.5. No push or release.

## Observed on Windows / Node 22.23.1

- `node --test test/*.test.mjs`: 55 tests; **43 pass, 0 fail, 12 skip**.
- Skips: 11 inherited POSIX-only mock/draft persistence tests and one real file-symlink test. Actual Windows directory junction and hardlink rejection tests pass. Mac permission/fsync behavior is not emulated or claimed.
- New transfer/stdio coverage: 34 pass and one POSIX symlink skip, including exact paired-cover assembly for both destinations.
- `scripts/build-samantha-desktop.ps1`: produced the MCPB and SHA-256 sidecar.
- `scripts/test-samantha-bundle.ps1`: extracted bundle, manifest defaults/sensitive field/platform checks and **6/6 actual stdio entry-point cases pass** with test-only mocked HTTP injected from outside the archive.
- Existing offline preview and configured local PNG review pass on Windows. The Mac legacy mock persistence smoke remains available in `scripts/smoke-samantha-desktop.py`.
- `git diff --check`: clean.
- No test made live provider calls. Credentials, accounts and manifests in fixtures are synthetic. No test transport or state is in the archive.

Artifact: `dist/samantha-social-desk-0.5.0.mcpb`

SHA-256: `eb9500f2d644f4a05d0703fe97e421db486ce06d6a64f1d57f9cf6112ca4f92f`

Evidence: `dist/test-results.txt`, `dist/bundle-test-results.txt`, checksum sidecar. The Windows build is the delivered artifact; the shell/Python build path was updated but could not run here (Python absent).

## Implemented boundary

Drive-for-desktop real readable bytes only; exact Approved manifest and MP4/PNG pairs; default off; native independent in-Chat confirmation; revalidation; fixed auth-verify/media-presign API routes and exact storage pins; no redirect or storage bearer; per-part durable receipts; safe cover-only resume; ambiguous completion requires read-only byte/hash reconciliation; conservative expiry and no automatic duplicate transfer.

The paired media assembler is pure/no-network and requires the same confirmed unexpired video and cover. Facebook uses thumbnail; Instagram uses instagramThumbnail, one video item per reel. Fixture readback proves local field association only. Tool output explicitly reports remoteCoverAttached=false.

## Remaining activation

The exact setup and weekly prompt are in [TRANSFER.md](TRANSFER.md). Requires an authorized operator to configure private credential/destination pins and the real approved synced folder once. No current account credentials were acquired, copied or inspected.

Smallest real transfer test: one new disposable synthetic pair on the intended Mac, actual native form approval, two confirmed storage receipts, then restart/repeat and verify no PUT repeats. Verify Drive hydration, Mac permissions, installer secure storage and form rendering. Week 3 is blocked.

Actual cover attachment needs separate authorization for unscheduled synthetic drafts on both destinations, exact cover readback and native preview checks. This extension has no live draft creation/edit endpoint and cannot run that step or mark an old browser upload link completed. Do not claim the real video-with-cover workflow is proven by the two storage PUTs.

No live Zernio/Google setting, real client upload, draft, schedule, publication, release or communication to Samantha was performed.
