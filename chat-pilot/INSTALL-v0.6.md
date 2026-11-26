# Samantha Social Desk 0.6.0

The existing Claude Desktop Chat extension now has two independent optional actions:

- Approved MP4/PNG transfer, as documented in TRANSFER.md.
- Explicitly confirmed draft creation that attaches the paired PNG to the video for the pinned Instagram and Facebook accounts, as documented in DRAFTS.md.

Both default off. The original synthetic preview, local file review and offline mock rehearsal remain.

Install/update this MCPB in ordinary Claude Desktop extension settings using the same extension ID. Do not bypass an organizational restriction. Requires Node 22+. Start a new Chat and test review_samantha_mock_reel.

For transfer setup and usage, read TRANSFER.md. For draft-only setup and the exact Chat acceptance prompt, read DRAFTS.md. Draft creation additionally requires a private account-pin config, an approved caption companion manifest, a credential authorized for the exact account reads and draft operation, and a separate native confirmation. Never paste a key or media URL in Chat.

A successful paired draft result reports cover-field-and-bytes-verified by platform. This means the draft API returned the cover association and its media bytes matched the approved PNG. Native preview rendering on the real Mac remains a separate visual check. This extension has no scheduling, immediate publishing or post-edit tool.

The 0.5.0 artifact is retained unchanged. Do not use either version to repeat the manually completed Week 3 transfers.
