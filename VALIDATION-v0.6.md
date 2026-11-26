# v0.6.0 local validation and handoff

Base: v0.5.0 commit 5692dec8521d1e23881ff6f78347eb607d658a7b. Local branch: draft-v0.6. No push or release. Validation completed on Windows with Node 22.23.1; no live provider calls.

## Delivered artifact

- Installer: dist/samantha-social-desk-0.6.0.mcpb
- SHA-256: 7714cad75d4f0ab94fde3ac194e0887cb5d1a96835f217cd91cefc81fec25817
- Setup and exact weekly acceptance prompt: [DRAFTS.md](DRAFTS.md)
- Installer instructions: [INSTALL-v0.6.md](chat-pilot/INSTALL-v0.6.md)
- Build: scripts/build-samantha-draft.ps1
- Packaged entry-point validation: scripts/test-samantha-draft-bundle.ps1

The archive contains the production stdio server, pure existing draft compiler/readback checks, fixed transfer/draft transports, synthetic preview fixtures and guides. No test HTTP preload, private config, credential, receipt or historical live provider adapter is bundled. Both transfer and paired-draft creation default off. Sensitive installer fields and Mac/Node requirements were checked after extraction.

## Observed tests

- node --test test/*.test.mjs: **80 tests; 68 pass, 0 fail, 12 skip**.
- Skips: 11 inherited POSIX-only mock/draft persistence tests and one real file-symlink test. Windows directory junction and hardlink rejection pass. These skips do not claim Mac filesystem verification.
- Extracted 0.6.0 MCPB: **12/12 actual stdio acceptance tests pass**, using test-only mocked HTTP outside the archive. This includes six transfer/regression cases and six paired-draft cases.
- Unchanged extracted 0.5.0 MCPB: **6/6 stdio cases pass** when rechecked against its expected version.
- git diff --check: clean.
- Evidence: dist/test-results-v0.6.txt, dist/bundle-test-results-v0.6.txt, dist/bundle-test-results-v0.5-recheck.txt and installer checksum sidecars.

Coverage includes the full synthetic transfer-to-draft flow through the packaged Chat entry point, native approval/denial, feature disabled or unsupported, exact paired cover for both accounts, one video item, copied permanent media URLs, per-platform missing/mismatched cover, wrong account/profile, unapproved/missing/changed caption, pending/expired media receipts, final source mutation, concurrent requests, corrupt state, strict forbidden URL/publish fields, restart reuse and uncertain-create read-only recovery. Existing preview, local review and mock regressions remain covered.

## Implemented boundary

One separately enabled, native-confirmed action creates one explicitly unscheduled Zernio draft per reel for the exact configured Instagram and Facebook accounts. It uses existing confirmed transfer receipts without another upload. Facebook mediaItems[0].thumbnail and Instagram platformSpecificData.instagramThumbnail refer to the same approved PNG. The existing pure draft compiler and readback invariants are reused.

The draft transport only supports fixed credential/account reads, POST /api/v1/posts with a strict isDraft=true payload, saved-draft reads and exact-byte reads from the fixed media CDN. It exposes no scheduling, publish, queue, edit, delete, presign or PUT action. Zernio's credential itself is not draft-only: the publishing resource group has broader authority. The one-time setup explicitly requires correct account authorization and minimal available vendor scope.

A private durable reservation precedes the create request. A repeated or uncertain attempt never sends a second POST. Exact externalId lookup and saved-ID readback are GET-only; zero/multiple matches or mismatched state remain held. Successful readback reports cover-field-and-bytes-verified separately for each platform, with nativePreviewVerified=false. Upload success alone is never reported as cover attachment.

## Remaining real activation

No actual Mac/Claude native confirmation UI, host secure credential storage, Google Drive hydration, Mac owner-permission/fsync behavior, live Zernio account/readback or native cover rendering was available or verified.

Smallest remaining test, only with separate authorization: on the intended Mac, configure verified account pins and use one new disposable synthetic MP4/PNG pair with approved transfer/caption manifests. Transfer once, native-confirm one unscheduled paired draft, verify both returned cover states, then visually inspect the Instagram and Facebook draft previews. Restart/repeat and confirm no second upload or draft creation. Do not use Week 3, schedule or publish.

The original 0.5.0 installer remains byte-for-byte unchanged with SHA-256 eb9500f2d644f4a05d0703fe97e421db486ce06d6a64f1d57f9cf6112ca4f92f. TRANSFER.md and VALIDATION-v0.5.md remain unchanged. No live settings, real client upload/draft, external communication or release action was performed.
