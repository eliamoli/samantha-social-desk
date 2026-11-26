# Samantha Social Desk
Private Samantha-only Mac pilot. Do not copy Bridgerow's account, profile, credentials, posting history or schedules.

## Readiness
- **0.6.0 local draft-only build:** [paired-cover draft setup and usage](DRAFTS.md). Separately opt in, native-confirm one unscheduled draft per reel for both pinned IG/FB accounts, then verify cover fields and exact media bytes. No schedule/publish/edit route. Actual Mac/native preview activation remains unverified.
- **0.5.0 local transfer build:** [one-time setup, weekly Chat usage and remaining activation tests](TRANSFER.md). Optional approved paired-media transfer with native confirmation and durable receipts; default off. Includes an internal no-network paired-cover payload check, not live cover attachment. No release published.
- **Consolidated v0.4.0:** see [Install and test in ordinary Claude Chat](chat-pilot/INSTALL.md). Local folder reviews are opt-in and read-only. Mock draft and native approval rehearsal remain separate from real file review. No live provider code is in the bundle.
- Offline MCPB preview emits a synthetic PNG, sample caption and Halifax time, plus a second simulated in-chat draft report, as ordinary MCP image/text. See [Mac Chat verification](preview/README.md). Install and presentation on a real Mac have not been verified.
- The earlier provider adapter and Mac Keychain helper remain isolated and mock-tested. Version 0.6 reuses the pure draft compiler and readback checks through its separate fixed draft-only transport. No live credentials, uploads, schedules or publishing were used.
- The pilot CLI reviews one exact local draft package without external calls; it is a developer fixture, never part of Samantha’s workflow. Node 22+, no npm dependencies or install steps. Run tests with: npm test.

## Local review
Use owner-only app data directory ~/Library/Application Support/Samantha Social Desk (mode 0700), not within shared or synced storage. Its config.json (mode 0600) uses the exact shape below. No credential in config.

    {
      "approvedFolder": "/absolute/real/path/to/samantha-approved",
      "profileId": "SET_EXACT_SAMANTHA_PROFILE_ID",
      "targets": {
        "instagram": {"accountId":"SET_EXACT_ID","username":"SET_EXACT_HANDLE"},
        "facebook": {"accountId":"SET_EXACT_ID","username":"SET_EXACT_PAGE_USERNAME"}
      }
    }

Do not guess IDs or scope. For 0.5 transfer, configure private Drive-for-desktop synced bytes as described in TRANSFER.md; do not make Drive public or manually move originals. The following older local-review contract remains separate. Sample input names: SJ-W03-R1.json, SJ-W03-R1-v1.mp4, SJ-W03-R1-v1.png. The PNG must be 1080 × 1920, at most 10 MiB. MP4 max 120 MiB. Header validation is not a playback check. Example manifest:

    {"contentId":"SJ-W03-R1","revision":1,"caption":"Approved caption for this exact reel."}

Use fully QA-approved files only. Bump the revision for changes. Review each destination:

    node draft/desk.mjs review SJ-W03-R1 instagram
    node draft/desk.mjs review SJ-W03-R1 facebook

Output includes the local SHA-256 binding for exact caption, media, cover, profile, account, and revision. It does not create a draft.

## Earlier isolated draft adapter design
The 0.6 in-Chat native-confirmed path is documented in DRAFTS.md. These notes describe the earlier isolated adapter.
A future human approval entry point outside Claude must bind the exact reviewed package and pass that binding to execute(). A hash supplied by an agent is not human approval. Before transfer, execute() recalculates the binding and checks the provider-returned active connected profile/account/handle. It saves a durable reservation per content ID and platform before uploads, and synchronizes an attempt with a unique idempotency key before the only POST. If a send is uncertain or the readback omits a cover, stop; do not delete the reservation or recreate the post. Reconciliation requires the exact locally known or independently found draft ID and verifies the saved media/caption/account. It never sends another POST; remote edits are not implemented.

The provider transport allows only an account lookup, media presign, presigned PUT to the confirmed exact storage host, draft POST, and readback. No redirects; no bearer on the presigned storage PUT. The POST requires explicit isDraft true and one approved destination, with no publish, schedule or queue fields. Instagram uses platformSpecificData.instagramThumbnail and Facebook uses mediaItems[0].thumbnail and contentType reel. Exact cover readback does not prove native cover display. Zernio-hosted draft bytes may expire: confirm preview/playback later. Scope the provider credential to Samantha's profile, no Bridgerow access, store it in Mac Keychain, never console, arguments, environment file, Chat or Git. The provider credential itself is not assumed draft-only.

Provider references: [create post](https://docs.zernio.com/posts/create-post), [media uploads](https://docs.zernio.com/guides/media-uploads), [Instagram](https://docs.zernio.com/platforms/instagram), [connected accounts](https://docs.zernio.com/accounts/list-accounts).

## Remaining pilot gates
1. Verify image/text tool availability in normal Claude Desktop Chat on a real Mac before sending any real media to Chat. The offline bundle uses only dummy data.
2. Verify Mac filesystem sync/locking and Keychain behavior; confirm Samantha's correct accounts, scope, actual provider readback fields and exact reviewed presign storage host. Keep the draft adapter offline unless these are proven.
3. After separate approval for one exact package, add a local human approval command, connect the guarded runner and read-only reconcile command, then test a real Zernio draft for each account. Verify custom cover in both native previews and prove neither was scheduled nor published. No test uses actual publication. Never copy an existing ledger or key.
