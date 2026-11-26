# Samantha Social Desk 0.6.0: video with paired cover in an unscheduled draft

This adds the missing usable path after transfer: one native-confirmed Chat action creates **one Zernio draft per reel, containing both the exact pinned Instagram and Facebook accounts**, with the same approved PNG attached as the cover. It does not create a second standalone image post. The draft feature is separately opt-in and defaults off. Preview and the 0.5 transfer behavior remain.

The API transport can only verify the credential, read the connected account pins, create an explicitly unscheduled draft, read saved drafts and verify their returned media bytes. There is no publish, scheduling, queue, review/promotion, update, delete, media-presign or media-PUT operation in the draft transport. Tool arguments cannot supply caption text, destinations, media URLs or scheduling fields.

## Verified provider contract

The official [create-post contract](https://docs.zernio.com/posts/create-post) says isDraft=true saves a draft and takes precedence over scheduling/publication. This implementation still omits all publish/schedule/queue arguments and rejects extra fields. One draft can include multiple platforms.

The existing isolated draft compiler supplies Instagram's platformSpecificData.instagramThumbnail and Facebook's mediaItems[0].thumbnail with contentType=reel. Both point to the same PNG receipt. See [Instagram fields](https://docs.zernio.com/platforms/instagram/fields) and [media upload/thumbnail guidance](https://docs.zernio.com/guides/media-uploads). Only one video item is sent.

Every attempt reserves a unique Idempotency-Key and externalId in private durable state before POST. The [list-post contract](https://docs.zernio.com/posts/list-posts) provides exact externalId lookup. Although the provider supports idempotent retries, this implementation **never sends a second POST for a reserved attempt**. Recovery uses only GETs.

A post may copy temporary uploads to permanent media URLs. Readback therefore validates the returned video and cover bytes against the approved SHA-256/size/MIME, using only the fixed media.zernio.com origin without redirects or bearer credentials. It does not assume a returned URL must equal its temporary upload URL.

## One-time setup by the authorized operator

1. Finish the private Drive-for-desktop and transfer setup in [TRANSFER.md](TRANSFER.md). Use those transfer settings in 0.6.0; installing or downgrading to 0.5.0 is unnecessary. Keep the existing approved source, transfer config and receipts. Source files remain unchanged. Do not repeat Week 3 or any previously manual transfer.
2. Independently identify the exact intended Zernio workspace, profile, Instagram account ID/username and Facebook account ID/username. Verify both belong to that profile and the authorized credential owner. The app checks the connected-account readback before every create and reconcile; wrong IDs, usernames, profile, disabled accounts or truncated reads stop the operation.
3. Separately authorize an expiring, profile-restricted integration credential that can perform publishing-group draft creation and connected-account reads. Disable other unnecessary resource groups. **Zernio does not offer a true draft-only or media-only key for these calls.** Its publishing authority is broader than this code uses; account-group authority can also be broader than the required reads. The extension's fixed transport is the operation boundary. No key creation, rotation or account setting change is performed by the extension or this development task. See [key restrictions](https://docs.zernio.com/api-keys/create-api-key).
4. From the local checkout on the Mac, run node scripts/prepare-draft-config.mjs once. It asks for the verified pins and reads the credential with hidden input only to calculate its hash. It makes no network calls, discovers no account secrets and saves no credential. It creates owner-only ~/Library/Application Support/Samantha Social Desk/draft-config.json and refuses overwrite.
5. Install the distinct 0.6.0 MCPB. In extension settings choose that private draft config and enter the credential only in the sensitive **Dedicated Zernio draft credential** field. It is passed via environment, removed from the child environment after capture, and never appears in arguments or tool output. Enable **paired draft creation** separately. Keep Offline pilot mode off.
6. In a new ordinary Chat, run preflight_samantha_drafts. This checks local configuration and native form support only. It cannot prove live account access or actual form rendering. If native forms are unsupported, the writer refuses to run; typed confirmations cannot substitute.

Private config shape, placeholders only:

```json
{
  "version": 1,
  "destinationId": "SAME_LOCAL_LABEL_AS_TRANSFER",
  "destinationLabel": "Authorized workspace display name",
  "expectedOwnerId": "<verified owner id>",
  "credentialSha256": "<locally calculated dedicated credential hash>",
  "profileId": "<verified profile id>",
  "targets": {
    "instagram": {"accountId": "<verified id>", "username": "<exact username>"},
    "facebook": {"accountId": "<verified id>", "username": "<exact username>"}
  }
}
```

Keep it outside synced/shared storage and Git. Config changes intentionally stop existing receipt contexts; do not delete receipts to bypass this.

## Approved caption and pair requirements

The producer supplies an additional SJ-WNN-RN.draft.json beside the existing approved transfer batch. It contains exactly:

```json
{
  "contentId": "SJ-W99-R1",
  "revision": 1,
  "status": "Approved",
  "caption": "Synthetic example only."
}
```

The ID/revision must match the transferred video and PNG. For Review, missing/mismatched captions, changed manifests, pending/uncertain/expired upload parts or any incomplete transfer batch prevent draft readiness. Do not ask Claude to invent or promote an approval manifest.

The native form shows the exact caption, filenames, size/hash, profile, both account pins and the action. After acceptance, the app rechecks source/config bindings and remotely verifies the pair's available bytes before any draft POST. A local upload receipt alone is not proof the remote bytes still exist.

## Weekly use: same ordinary Claude Chat

After the approved batch has transferred, use this prompt for one reel:

> Use Samantha Social Desk 0.6.0. Run review_samantha_draft_pair for batch BATCH_ID and content CONTENT_ID. Show the exact approved caption, video/PNG hashes, profile and both account pins. Then run save_samantha_paired_draft with that review binding and request its native confirmation. Create one unscheduled draft with the paired PNG as the cover for both Instagram and Facebook. Do not upload again, schedule, publish or edit any existing post.

Approve the exact native form once. The result reports each platform separately:

- verified-draft with cover-field-and-bytes-verified: readback is an exact unscheduled draft, the video and cover bytes match, and the appropriate cover field points to that PNG.
- held: one or both cover fields/bytes, targets or draft status could not be verified. A partial result identifies the affected platform.
- uncertain: the create response was lost or could not be confirmed. The draft might exist.

No delivery URLs or filesystem paths appear in Chat. The returned draft ID identifies the saved item; it is not a public post link. Native preview display remains unverified until inspected in the actual Zernio UI. No publishing capability is added.

One cross-platform draft avoids consuming a single-use temporary upload in separate draft creations for the two accounts. Each additional reel gets its own independently reviewed/native-confirmed action.

## Recovery and duplicate prevention

Private state is in ~/Library/Application Support/Samantha Social Desk/draft-v1. It contains the immutable caption, account pins, exact media references/hashes, request identifiers and observed platform cover state. File permissions are owner-only on the supported Mac. Credentials and presigned upload URLs are not saved.

For a held or uncertain attempt, ask:

> Run reconcile_samantha_paired_draft for CONTENT_ID, revision REVISION. Read only; do not create, upload, edit, schedule or publish.

If the draft ID was lost, reconciliation uses the locally saved externalId. Zero matches, multiple matches, unavailable bytes, mismatched cover/account, or a non-draft/scheduled result remain held. There is no fallback POST. If a prior attempt has a saved ID, only that ID is read.

Repeating save for the same immutable review reconciles the existing attempt; it cannot recreate it. A changed caption or pair under an existing content ID/revision cannot create a replacement. This version does not repair an incorrect existing draft; that would need a separate authorized edit workflow.

Reconciliation can still inspect the saved draft after temporary-upload receipt expiry; it verifies the saved draft's current media bytes. New draft creation always requires complete, locally unexpired receipts and a fresh remote byte check.

A crashed process can leave draft.lock. An authorized maintainer must verify no process remains, inspect the private attempt and remove only the stale lock. Never delete an attempt record, reset state, change machine or bump IDs to work around an uncertain create.

## Acceptance and remaining real verification

The Windows test suite drives the actual packaged stdio entry point with synthetic media and mocked HTTP. It covers transfer-to-draft, exact native approval, one video with both platform covers, copied media URLs, source mutation, denial, disabled/unsupported clients, malformed schedule arguments, partial/mismatched readback, missing media, corrupt state, restart reuse and uncertain-create GET-only recovery. Existing isolated compileDraft/verifyDraft invariants are reused.

No actual Mac/Claude native UI, secure installer storage, Google sync, account credentials, live Zernio draft or native cover rendering was available or tested. No live client data or credentials were acquired.

Smallest remaining test, only after separate authorization: on the intended Mac, use **one new disposable synthetic pair** with approved transfer/caption manifests and verified exact account pins. Transfer once, use the prompt above, approve the native draft form, confirm one unscheduled draft with both account cover states verified, then inspect the actual Instagram and Facebook draft previews. Repeat/restart and confirm no second create or upload. Never use the manually transferred Week 3 batch. Do not schedule or publish.

The 0.5.0 installer and its guide/report remain unchanged; 0.6.0 is a distinct local artifact, not a published release.
