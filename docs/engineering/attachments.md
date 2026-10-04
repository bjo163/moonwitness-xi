# Attachment storage contract

The Board chatter uploads real file bytes to `POST /api/base.attachment/upload` as
`application/octet-stream`. The request includes the related model/record and original filename
as query metadata, plus a declared MIME type in `X-File-Mime`. The API accepts a 16-type allowlist,
rejects empty content and unsafe names, and limits each upload to 10 MiB and 20 requests per minute
per client IP. SVG and other active document formats are not accepted. The declared MIME value is
not content-sniffed; downloads are always `Content-Disposition: attachment`, carry
`X-Content-Type-Options: nosniff`, and are private/no-store.

The server generates a UUID storage key and SHA-256 digest. `storage_key` is hidden from serialized
records, query fields, views, audit snapshots, and client responses. Generic REST/JSON-RPC cannot
create or edit attachment metadata; only the upload route can create a stored object. Upload first
writes to a mode-0600 temporary file and atomically renames it, then inserts metadata and the audit/
outbox rows in one database transaction. If the transaction fails, the new file is removed. A hard
delete removes metadata transactionally and then removes the corresponding file; archive keeps the
file so an authorized restore remains possible. Database and filesystem cannot share one atomic
transaction: if the filesystem delete fails after the database commit, the orphaned object needs
manual cleanup until the M9.02 reconciliation worker exists.

Every upload and download resolves the parent record using the caller's row/company scope. A caller
who cannot read the parent receives the same not-found response as for an absent attachment. The
server never builds a path from a filename or accepts a caller-supplied storage key.

`ATTACHMENT_STORAGE_DIR` selects the writable storage directory; its default is
`storage/attachments` under the repository root. It must be on persistent storage and shared by all
API instances that serve the same database. The built-in provider is local-filesystem storage; it
does not provide cross-region replication, malware scanning, or automatic orphan reconciliation.
Use one shared mounted volume for multiple local API instances. A cloud/object-storage adapter and
automated orphan/retention sweeper remain future work under M9.02. Archived files have no age-based
expiry; permanent deletion is explicit and immediate.

The Base add-on's seeded attachment is demonstration metadata only and has no corresponding binary
object. Downloading that placeholder returns 404; uploaded files always have a generated UUID key
and real content. This keeps seed data illustrative without fabricating a stored document.
