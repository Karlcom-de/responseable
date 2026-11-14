# Optional AI services

ResponseAble uses separate server-side OpenAI-compatible endpoints for chat completions, embeddings and speech transcription. For each capability set `RESPONSEABLE_AI_CHAT_URL`, `RESPONSEABLE_AI_EMBEDDINGS_URL` or `RESPONSEABLE_AI_STT_URL`, with the corresponding `_MODEL` and optional `_KEY`. Supply the API base (for example one ending in `/v1`). Each capability defaults to unavailable. Credentials never go to the browser.

Use HTTPS for external services and trusted egress routes. Loopback HTTP is accepted for in-pod services. Set `RESPONSEABLE_AI_ALLOW_HTTP=true` only for a trusted internal network. A key sent over HTTP is visible on that network hop. Redirects are rejected. Requests time out after 20 seconds. Provider-specific behavior and media format support vary.

## Room knowledge

Operators explicitly index current wiki or playbook revisions. Edits invalidate the old index for retrieval. Changing embedding base or model requires reindexing. The assistant searches up to 20 indexed documents from the current room and returns at most six excerpts to the chat endpoint. Citations link to the source document, revision and section. An answer without a source is discarded. Transcripts and notes are excluded from indexing. The assistant has no tools or external actions.

## Transcript and notes

An operator enables transcription per room. Each participant opts in separately and uploads only short segments from their local microphone. No remote, SIP or camera capture. Audio is sent to the configured provider without persisting the raw file. An operator can view transcribed text, author manual notes, export them and review an optional AI draft before saving. Manual notes remain available without service credentials.

`RESPONSEABLE_TRANSCRIPT_RETENTION_DAYS` controls transcript visibility and scheduled deletion (default 7, range 1–365). Run the retention script daily with the app database credential. Operator deletion clears transcript and saved notes and disables transcription. Notes remain until an operator clears them. Provider retention policies and database backups are separate.
