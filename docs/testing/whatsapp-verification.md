# WhatsApp verification — 24 October 2026

Verified story: Board authentication and company selection → scoped API → PostgreSQL queue
and attachment storage → Baileys worker → stored message/status → polling inbox.

## Evidence

| Check                            | Result | Evidence                                                                                                                                                                                                 |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API and auth regressions         | Passed | 69 tests across WhatsApp routes, auth, password persistence, record rules and request logging privacy                                                                                                    |
| PostgreSQL queue and isolation   | Passed | 13 WhatsApp route tests in a unique temporary schema; concurrent claims/events, retry lease, attempt fencing, deduplication, media rollback and company boundaries                                       |
| Baileys mock worker              | Passed | 5 tests: QR/open/logout, encrypted key round trip, restart/reconnect, media variants, group/private/history messages, delivery statuses and API outage recovery                                          |
| ORM seed compatibility           | Passed | 9 addon tests including composite identity adoption and preservation of an existing canonical external ID                                                                                                |
| Board Chromium E2E               | Passed | 2 scenarios cover real Board login against an isolated API/database, mocked WhatsApp QR/cancel/disconnect, group inbox, new private chat, reply, attachment upload, retry and failure draft preservation |
| Types, lint and formatting       | Passed | API/worker builds, Board typecheck, targeted ESLint/Oxlint and Prettier checks                                                                                                                           |
| Board production build           | Passed | Next.js production output includes `/board/whatsapp`                                                                                                                                                     |
| Workspace dependency lock        | Passed | Frozen lockfile-only install succeeds                                                                                                                                                                    |
| Compose                          | Passed | Development and production Compose configurations validate; production validated with temporary test secrets                                                                                             |
| Production worker image          | Passed | `docker build --target whatsapp-runtime --tag moonwitness-whatsapp:verification .`; full workspace build and production deploy complete                                                                  |
| Production worker runtime        | Passed | Image runs as `node`, returns healthy with zero accounts against an isolated API; missing token and invalid session key both fail startup                                                                |
| `pnpm start`                     | Passed | API readiness, worker health and standalone Board login all return HTTP 200 on distinct verification ports 3306/3106/5180; temporary processes stopped                                                   |
| Live `pnpm dev` session          | Passed | API :3000, Board :5173 and WhatsApp :3100 remain running; worker reports one active account and no pending in-memory work                                                                                |
| Live text/document delivery      | Passed | Owner-approved test destination; requests go through Board proxy and API transaction into worker; both stored messages become `sent`                                                                     |
| Live phone synchronization/media | Passed | Text and images sent from the linked phone materialize in PostgreSQL; images download through authenticated Board/API media route (75,717 bytes)                                                         |
| Live worker restart              | Passed | Listening process changes; stored encrypted credentials reconnect without another QR; account returns `connected`, pending event/session counts are zero                                                 |

Test output and a screenshot using mocked conversation data are stored locally under
`test-results/`. They are ignored by Git and excluded from Docker build contexts. Passwords,
tokens, actual phone numbers, private message content and downloaded images are not included
in this report or the commit.

## Fixes confirmed by the checks

- Preserve the installed `orm-whatsapp` addon/seed identities and adopt composite unique seed
  identities without creating a second canonical `_orm_data` mapping. Repeated API startup
  no longer fails with the previously reported unique constraint errors.
- Keep company scoping in dedicated WhatsApp routes and generic REST/JSON-RPC reads even for
  superadmin; generic mutation is denied so queue/control validation cannot be bypassed.
  A regression test first demonstrated that direct generic lookup by foreign ID returned 200;
  the fix makes that lookup return 404.
- Persist accepted incoming events before materialization. Deduplicate events, serialize
  conversation updates, preserve historical timestamps and avoid unread increments for history.
- Fence job results and heartbeats by attempt, recover expired claims, keep stable WhatsApp IDs,
  back off retries, pause claims for disconnected accounts, and offer manual retry after failure.
- Preserve advanced delivered/read states when older callbacks arrive later.
- Retry credential persistence after temporary API failure, preserve encrypted sessions when a
  key is wrong, and restore protobuf app-state keys when reconnecting.
- Keep message composers scoped to their conversation, prevent duplicate submits, preserve
  failed drafts, show data/media errors, allow QR cancellation, and keep QR payloads out of text.
- Keep the login form visible before animations and use POST as the native form method so a
  pre-hydration submit does not place a password in the query string.
- Start Board on its own default port, wait for API readiness in the worker, include WhatsApp
  in dev/start scripts, and give the production attachment volume a writable owner.

## Limits of the live test

The approved test number was also the linked account's number. Consequently the phone's
synchronized test messages are correctly marked as its own `outbound` messages. The owner
confirmed that a second phone was unavailable and explicitly chose mocked inbound testing.
Inbound messages from another sender, real group delivery, video/audio delivery and real
delivered/read receipts were therefore checked with mocks rather than claimed as live results.
`sent` means the worker send succeeded; it does not prove another device read the message.

The integration accepts history batches supplied by WhatsApp; it does not promise an unlimited
import of all historical phone data. The v1 inbox returns the latest 100 conversations and
500 messages per conversation. Run one WhatsApp worker per database. Delivery uses stable IDs
and retry fencing, with the external-system and pre-acceptance outage limits documented in
[operations](../operations/whatsapp.md). No production deployment or image publication was performed.

## Integration on the current remote branch

The publish branch is based on remote `dev` at `11b1455`. Existing remote WhatsApp controls,
route metadata and `start:built` scripts were retained while applying the tested fixes. The
combined source passes a full workspace build, 13 API cases on each database backend, 56 auth
and record-rule regression cases, 5 worker cases, 9 ORM cases and the 2 Chromium scenarios.
Generated API references and the CI worker test entry were updated. The base Docker WhatsApp
service uses an explicit profile to avoid competing with the host worker started by `pnpm dev`.
