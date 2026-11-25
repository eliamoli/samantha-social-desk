# Samantha Social Desk 0.5.0

One extension inside ordinary Claude Desktop Chat. Transfer is optional and off by default. This build cannot create a real draft, schedule or publish.

1. In Claude Desktop extension settings, install/update the 0.5.0 MCPB with the same extension ID. Keep duplicate preview extensions off during testing. Do not bypass an organizational unsigned-extension restriction. Node runtime 22+ is required.
2. Open a new ordinary Chat. Ask: **“Run review_samantha_mock_reel. Show the cover, caption and Halifax time. Don't save a draft.”** The synthetic preview remains unchanged. If the image is not inline, open the tool result in this Chat.
3. Optional local review still uses the exact configured folder and the existing caption manifest. Ask **“Run review_samantha_local_reel for the approved content ID.”** It shares the requested caption and PNG with Claude, never video bytes.
4. Optional offline rehearsal: set Offline pilot mode to mock, review and confirm the displayed synthetic target. Mock drafts remain local and have no provider transport. Return the mode to off afterward.
5. Optional native probe: turn the probe on and ask **“Run probe_samantha_native_approval; use only the native form.”** This synthetic probe cannot create a draft.
6. For real **media transfer**, follow [the full one-time setup and weekly usage guide](TRANSFER.md) in the installed bundle, or [the repository guide](../TRANSFER.md). This requires private Drive-for-desktop synced bytes, an approved batch manifest, authorized restricted Zernio credentials in the sensitive installer field, exact private destination pins and Claude native form support. No weekly browser uploader or drag-and-drop.

Weekly transfer wording: **“Run review_samantha_transfer_batch for BATCH_ID, show every video/cover pair and destination, then run transfer_samantha_approved_batch with its review binding and request native confirmation. Transfer only.”**

A successful transfer reports **pair uploaded; remote cover attachment not verified**. It does not complete an old browser upload-session link. Pairing and internal draft payload checks do not attach covers to live Zernio drafts. Week 3 re-upload is blocked.

Local review's original caption manifest remains: contentId, revision, caption, paired with matching MP4/PNG filenames. Transfer uses the separate explicit approved batch manifest documented in TRANSFER.md. Do not have Claude mark a For Review item Approved.
