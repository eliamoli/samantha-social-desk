# Samantha Social Desk 0.5.0: approved paired-media transfer

This build adds transfer to the existing extension in ordinary Claude Desktop Chat. Preview, local review and the separate offline mock rehearsal remain. Transfer is off by default. No new weekly app, browser upload link, picker, drag-and-drop or terminal step is used.

The implemented source is **Google Drive for desktop on the Mac**, reading the exact configured approved folder. This is not a direct Drive API integration, and it cannot obtain bytes from Claude's Google Drive connector. The source files remain private and unchanged. The destination is Zernio's temporary media storage under the configured credential; this does not create a Zernio media-library item, complete an old browser upload-session link, attach a cover to a draft, schedule or publish.

The direct Drive API route would need a separately authorized restricted Google identity and credential setup. No such credentials were acquired. This version implements only the synced-folder route. Zernio's [Drive integration](https://docs.zernio.com/platforms/google/files) grants access per picked file, so it is not used for zero-touch weekly intake.

## One-time setup: authorized operator

1. Install or configure Drive for desktop under an identity already allowed to read the exact shared handoff. Make that folder available offline and wait for the actual MP4, PNG and approved batch manifest to finish syncing. Keep Drive running. Verify real stable readable bytes in the exact local location. A browser Drive URL, Finder alias, symlink, placeholder metadata file or unhydrated shortcut is not a source. Shared Drives can only stream; shared-folder shortcuts are not proof that their target bytes are locally readable. If the exact handoff cannot be exposed as real readable files, stop setup rather than substitute manual weekly downloads. See Google's [offline files](https://support.google.com/drive/answer/2375012) and [streaming/shared-drive guidance](https://support.google.com/drive/answer/13401938).
2. The workspace owner/admin must identify the correct Zernio workspace and intended profile, then separately authorize a dedicated expiring, profile-restricted read-write API key. Disable every unnecessary resource group; only publishing is needed for media. **This is not a vendor media-only key:** presign and post creation share publishing authority. The extension never exercises post routes. Do not copy an existing unrelated client's credential or use a broadly authorized Claude connector token. See [API-key restrictions](https://docs.zernio.com/api-keys/create-api-key). This development task creates or changes no live keys/settings.
3. During that authorized setup, obtain the credential owner's exact ID using the official read-only `GET https://zernio.com/api/v1/auth/verify`. Obtain the exact R2 origin and bucket prefix from an authenticated official `POST https://zernio.com/api/v1/media/presign` response for a disposable synthetic filename (no client bytes need to upload). Verify the response came from Zernio, not from Chat or a copied third-party URL. The upload URL itself is short-lived and must never be copied into this config or logs. These setup calls are operator work, not calls performed by the local helper below. A restricted key that cannot verify itself must remain disabled; do not silently broaden it.
4. From the local checkout on the Mac, run `node scripts/prepare-transfer-config.mjs` once. It prompts for the verified non-secret pin fields and reads the new credential with hidden input to calculate its SHA-256. It makes no network calls, does not discover account/config data, and never saves the credential. It creates `~/Library/Application Support/Samantha Social Desk/transfer-config.json` with mode 0600 in an owner-only directory. It refuses to overwrite an existing config. Keep this file and all receipts outside Drive, shared folders, Git and backups shared with other users. Node 22+ is required.
5. Install `samantha-social-desk-0.5.0.mcpb` via Claude Desktop's extension settings, updating the same extension ID. Do not bypass organizational restrictions on unsigned extensions. Select the exact approved folder once. Select the private transfer config once. Enter the credential only into the **Dedicated Zernio credential** sensitive installer field. MCPB marks it sensitive for host secure storage and passes it via the child process environment, not arguments; the server removes it from its environment after capturing it in memory. Never paste it into Chat, a command argument, an environment file, Git or a screenshot.
6. Enable approved media transfer. Keep Offline pilot mode off. In a new ordinary Chat ask: **“Run preflight_samantha_transfer. Do not upload anything.”** This is local and makes no HTTP request. It checks configuration, credential pin, real folder and the client's native form capability. It does not prove the real workspace, storage pin, Mac sync or native form rendering. The operator is responsible for the initial key-to-workspace binding; auth/verify proves the pinned credential owner's ID, not an independent workspace ID.
7. Complete the synthetic acceptance test below before using a new real batch. If Claude does not support native form elicitation, the extension refuses transfer. A typed chat confirmation is not a substitute and no separate window is introduced.

Private config shape (placeholders only, never a usable live config):

```json
{
  "version": 1,
  "destinationId": "LOCAL_WORKSPACE_LABEL",
  "destinationLabel": "Authorized workspace display name",
  "expectedOwnerId": "<verified 24-hex owner id>",
  "credentialSha256": "<sha256 calculated locally from the dedicated credential>",
  "storageOrigin": "https://<verified 32-hex account>.r2.cloudflarestorage.com",
  "storagePathPrefix": "/<verified-bucket>/"
}
```

The exact origin, bucket prefix and credential are pinned; they cannot be supplied by a tool call. Credential rotation or config changes intentionally block old receipt context. Migrate it with an authorized maintainer after reconciling attempts; never delete receipts to work around that hold.

## Approved handoff contract

The producer/approver supplies a companion `transfer-batch-BATCH_ID.json` alongside the real files. This manifest is a prerequisite: 0.4 caption manifests alone are not approval evidence. The extension never writes an approval manifest or upgrades “For Review” to “Approved.” The producer must keep its status consistent with final QA approval before syncing. Claude must not manufacture approval labels or hashes to make a batch pass.

There are 1–4 exact MP4/PNG pairs, each with an Approved status and matching content ID/revision. Names are `SJ-WNN-R1-v1.mp4` / `.png` through R4. MP4 is at most 120 MiB; PNG is 1080×1920 and at most 10 MiB. Size, MIME signature and SHA-256 are checked against both files. Header checks do not prove full decoding/playback. The manifest is read and hashed again after native approval and before each subsequent transfer. Every change invalidates the review. Unlisted files are never enumerated or uploaded.

Synthetic template (replace sizes and hashes upstream with exact approved bytes):

```json
{
  "version": 1,
  "batchId": "SYNTHETIC_BATCH",
  "status": "Approved",
  "destinationId": "LOCAL_WORKSPACE_LABEL",
  "pairs": [{
    "contentId": "SJ-W99-R1",
    "revision": 1,
    "status": "Approved",
    "video": {
      "name": "SJ-W99-R1-v1.mp4",
      "mime": "video/mp4",
      "size": 123,
      "sha256": "<64 lowercase hex>"
    },
    "cover": {
      "name": "SJ-W99-R1-v1.png",
      "mime": "image/png",
      "size": 456,
      "sha256": "<64 lowercase hex>"
    }
  }]
}
```

Week 3 transfer IDs are explicitly blocked. The existing synthetic Week 3 preview is still allowed because it has no live transfer route. Previously manual uploads cannot be inferred from a local empty ledger; never use this version to repeat a manually completed handoff.

## Weekly use: ordinary Claude Chat

After the approved handoff has synced, use this exact pattern with the new batch ID:

> Use Samantha Social Desk 0.5.0, not a browser upload link. Run review_samantha_transfer_batch for BATCH_ID. Show the exact approved video/cover pairs, byte sizes, hashes, destination and receipt status. Then run transfer_samantha_approved_batch with that review binding and request the native confirmation form. Transfer only. Do not create or edit a draft, schedule or publish.

Check the native form and approve once. It contains every filename, SHA-256, byte count, destination and receipt state. The request is tied to its independent MCP response, expires after four minutes and is revalidated against source/config bytes. The completion result shows each part and whether the pair is complete. No delivery URL is returned in Chat.

**Video and cover uploaded** means both temporary storage PUTs succeeded. It does not mean the cover is attached to a reel. Use that wording when reporting completion.

## Receipt and recovery behavior

Receipts live in the owner-only `~/Library/Application Support/Samantha Social Desk/transfer-v1`. They include exact destination/config binding, batch manifest binding, per-part name/size/MIME/SHA, status, timestamp and private delivery reference. Presigned upload URLs and credentials are never persisted. The local lock and atomic, fsynced receipt updates precede each PUT. Source files are never moved, edited or deleted.

- Repeating a completed batch uses its receipts and performs no upload.
- A definitive storage rejection (400/401/403/413/415) leaves that part pending. Ask for the same reviewed batch again: completed video stays saved and only the cover retries. The unchanged batch's native approval is retained for at most 24 hours. Never replace its manifest mid-resume.
- Timeout, interrupted process, redirect or other uncertain PUT holds that part. Ask **“Run reconcile_samantha_transfer_batch for BATCH_ID; do not upload.”** It reads only the saved exact delivery URL, with no bearer, and proves returned bytes/MIME/size/SHA. It cannot retry the PUT. A 404, mismatch or network failure leaves the hold intact; it is not evidence that retrying is safe.
- A crashed process can leave `transfer.lock`. An authorized maintainer must verify that no transfer process is running, inspect private receipts, then remove only that stale lock. A leftover receipt temporary file also requires inspection. Do not delete the ledger or change the batch ID to bypass an uncertain result.
- Completed media is only locally reusable for 23 hours, a conservative limit for zero-retention workspaces. Normal provider uploads expire after seven days; zero-retention uploads can expire after one day or be consumed earlier. Receipts do not guarantee remote availability. Expired receipts never trigger automatic re-upload. See [media retention](https://docs.zernio.com/guides/media-uploads).
- Do not run two Macs with separate receipt stores against the same handoff. Local receipts cannot deduplicate separate machines or old browser/manual transfers.

## Cover association: internal preview only

`transfer/draft-preview.mjs` is an internal, pure no-network assembler. It accepts the exact reviewed pair and two confirmed, matching, unexpired private receipts. It builds **one video media item**, never a standalone cover item:

- Facebook/Reels: `mediaItems[0].thumbnail` is that exact PNG; `contentType: reel`.
- Instagram: `mediaItems[0].instagramThumbnail` and `platformSpecificData.instagramThumbnail` both reference that exact PNG.

Missing, mismatched, uncertain or expired covers prevent local draft readiness. Synthetic readback comparisons verify those bindings for both destinations. The assembler has no Chat tool and cannot create/edit a live draft or expose private URLs through a tool result. The earlier isolated draft implementation remains unwired to live transfer. See [media contract](https://docs.zernio.com/guides/media-uploads) and [Instagram fields](https://docs.zernio.com/platforms/instagram/fields).

A separate authorized future draft step must consume the private pair references, recheck remote availability, bind the exact caption and accounts, create/update only the approved unscheduled draft, verify the returned cover fields, and visually inspect both actual native previews. Until that happens, report **“pair uploaded; remote cover attachment not verified.”** This extension intentionally does not finish the full live drafting workflow.

## Acceptance and remaining real checks

Local Windows tests use only generated synthetic manifests/IDs and mocked HTTP through the **same stdio entry point** as the MCPB. They cover native approval/decline/unsupported clients, upload, restart reuse, cover-only failure, ambiguous recovery, changed manifests, destination and path restrictions, corrupted state, expiry, concurrency and paired cover assembly. The extracted MCPB is tested again through that entry point. HTTP fixtures are not bundled.

The legacy POSIX draft/mock persistence tests require a Mac/Unix host and are explicitly skipped on Windows; their production code and permission checks are not weakened to manufacture passing results. Windows checks do not verify Mac ownership, directory fsync, real file symlinks, File Provider behavior, secure installer storage or Claude's native form UI.

Smallest remaining activation, requiring separate authorization/access:

1. On the intended Mac, install this bundle, verify the cover preview and run local preflight. Use one **new disposable synthetic** approved MP4+PNG pair and manifest in the real synced handoff. Confirm there is no prior manual or browser upload of that pair.
2. Use the exact weekly prompt above. Confirm the actual native form shows the pair and correct destination. Approve once. Verify two storage responses and private receipts, then repeat the same request and observe receipt reuse without another PUT. No Week 3 assets.
3. For cover attachment, obtain separate approval for one unscheduled synthetic draft per intended platform. A future authorized draft integration must use the internal paired payload, then verify readback and native preview. This version cannot execute that step; two PUTs alone do not satisfy it.
4. Confirm no post/schedule/calendar changes and no source changes. Do not call an old browser link “completed.”

No live Zernio/Google settings, client transfer, draft creation, publication, release or contact with Samantha occurred while building this version.
