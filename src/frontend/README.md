# WorkGetsDone frontend

React client for the selected warm Console/Planner design in `design/spec/`.
The full build covers every route listed under "Routes" below: Overview, calendar,
Projects, Tasks, Calls, Notes, Companies, Contacts, attachments, Account and (for
administrators) Users, with create, edit, delete, sharing, note conversion,
attachment upload and URL filters. Collections support URL search, filters and
25-row pages. Task 21 (Google sign-in) is not part of this build yet; see
"Deferred" below.

## Review locally

From `frontend/`:

```sh
npm ci
npm run dev
npm run storybook
npm test
npm run build
npm run package
```

`npm run dev` serves the product client. It needs same-origin MeroFoundry services;
without them it shows explicit error states. Storybook renders the design with
fixtures. Fixtures are never imported into the product bundle.

The browser checks use the built output and mocked service responses:

```sh
docker run --rm -v /home/rob/src/personal/wgd:/repo -w /repo/frontend \
  mcr.microsoft.com/playwright:v1.59.1-noble npm run test:browser
```

Screenshots and rollout status are in `verification/2026-10-08-frontend/`.
134 unit tests and 76 browser tests pass. Storybook builds. Native live current
sessions (Bob/Jane), anonymous refusal, and logout/revocation are verified.

## Runtime boundary

The client calls relative service URLs with cookies and the CSRF request header.
Native login/logout use the platform identity submission models and never read
the returned token or response body. `public/services.json` contains only verified
active routes; missing contracts return explicit unavailable errors.

Tokens come from `design/tokens.json`; `src/tokens.css` is generated. The production
build checks for absolute fetches, browser storage, literal colors, SVG assets and
inline scripts. Google Fonts origins need to be included in the site's CSP; script
policy must remain same-origin without unsafe-inline. The intended archive layout
is `index.html`, hashed assets, services.json and merofoundry.json, served from the app origin root.

## Deployed with active services

The user deployed the platform support and authorized enabling the services.
The frontend is live at https://workgetsdone.merofoundry.app/, active version
`926d04da-eb1f-4d6d-9278-571db0e5b1cf`. Its registry has 23 verified services:
current session, dashboard stats/agenda/rollup, project read/timeline, search,
task/call/note create, task/call complete/reopen, note archive/unarchive,
project list and task/call/note list/read.

37 production read checks, 36 write checks and 11 hosted UI checks passed for
Bob/Jane, including ownership-query count baselines, cross-user and anonymous
denial, empty datasets, persisted state transitions, real Overview/Project loads,
mobile layout, QuickAdd dialog wiring, CSP and logout. Four temporary write records
were soft-deleted; temporary verification resources and the old diagnostic query
were removed. Earlier site versions are retained.

The platform emits a non-secret readable `session_present` hint; the actual
`__Host-mf_app_access` and `__Host-mf_app_refresh` token cookies are HttpOnly.
The verifier permits only that hint in script-visible cookies.

## Service authoring notes

All service rules have `scope.service_config_id`. The largest selected webhook
phase has 19 actions, including unscoped session/Google rules. Read queries retain
the original ownership/revocation conditions and use named dataset capture with
an explicit empty-list option. Counts are SQL aggregates; bounded row datasets
return an error rather than silently truncate. Response rules start with a 503
fallback before invoking the formatter.

The legacy ownership-query snapshot included diagnostic numeric/date expressions.
Frontend projections omit unused columns and search retrieves only title/context
fields, keeping function payloads serializable. Writable timeline sets return logical
keys; write guards retain native record ids and nonempty ownership checks.

Create/update rules use `on_failure: abort` so failed writes/cascades roll back.
Three model-scoped create companions persist the existing initializers' key and
logical version: the cascade runtime executes child rules but does not persist
their returned field updates. They use the server-bound created record id and
suppress further cascades. Original model rules remain unchanged.

Current active configurations and action budgets are saved in
`verification/2026-10-08-frontend/active-frontend-rules.json` and
`service-action-budgets.json`. The seven navigation services add 49 rules and stay within 11 selected actions.
Their configuration is in `active-navigation-rules.json`. The navigation release
passed 56 production API checks and 29 hosted browser checks. Creation generators are for a fresh app; this app
already has all resources. The prepared upgrade plan sets existing rules inactive,
so do not run it casually against the active app. For changes, generate an update
plan, verify its scopes/budgets and activate only the intended rules.

`verify-hosted-services.mjs` is a repeatable browser smoke with no business writes.
`verify-services.mjs` records this rollout's API matrix; its ownership baselines and
fixture cleanup used temporary resources that have now been removed. Preserve
its saved results rather than rerunning write fixtures without cleanup setup.

`verify-navigation.mjs` is a read-only production API matrix for collection filters,
pagination, anonymous denial and cross-user detail refusal. The extended hosted
smoke verifies all four navigation links, details, reloads and mobile layouts.

Sharing, note conversion, file delete and edit contracts were provisioned later in
the full build (see "Full build" below). SHARE controls are absent unless authorized
by the service response.
The existing Google-start service returns empty JSON rather than a redirect; it is
omitted from the registry until configured and verified. The earlier temporary diagnostic query has been removed.

Future releases upload via a direct ticket bound to the ZIP digest/size, then
activate under explicit authorization. The current release passed its live service matrix. Disabling site hosting
restores the legacy renderer if rollback is needed. Never log credentials or ticket
tokens; append every action to BUILD_LOG.md and never change an earlier entry.

## Demo release gate and reset status

The demo reset, the baseline and the release gate are documented in `docs/runbooks/demo-reset.md`. That runbook is the only
source; this README does not repeat its steps.

## Full build (2026-10-11)

The full build replaced the 23-service read/complete client with a complete client
on stage (`https://workgetsdone.staging.merofoundry.app`, application
`104c98da-971b-4a99-8fad-4fd2ef06eb3f`). Production still runs the earlier release.
Every step is journaled in `BUILD_LOG.md`; per-task rulings are in
`.superpowers/sdd/2026-10-11-full-build/progress.md` (not committed).

### Routes

| Route | Screen |
|---|---|
| `/sign-in` (`/login` redirects) | Native sign-in |
| `/` (`/dashboard` redirects) | Overview: stats, agenda, project cards, quick add |
| `/calendar` | Agenda by day |
| `/projects`, `/projects/:id` | Project list, project screen with timeline and filters |
| `/tasks`, `/tasks/:id` | Task list and detail |
| `/calls`, `/calls/:id` | Call list and detail |
| `/notes`, `/notes/:id` | Note list and detail, attachments, convert to task |
| `/companies`, `/companies/:id` | Company list and detail |
| `/contacts`, `/contacts/:id` | Contact list and detail |
| `/files/:id` | Attachment details (no download, see limitations) |
| `/account` | Own profile (`/change-password` redirects here) |
| `/admin/users` | User administration (administrators only; others see the not-found state) |
| anything else | "This page could not be found." |

### Services (61 registered in `public/services.json`)

All are called as `POST /api/v1/services/<id>/inbound` with the cookie session and
`X-Requested-With: XMLHttpRequest`.

| Service | Id |
|---|---|
| `session.current` | `54a9f902-ddf5-439f-9a94-910e594e0bf6` |
| `dashboard.stats` | `7143df88-27d4-4df3-b3e3-8fb05d92108a` |
| `dashboard.agenda` | `0f2912f6-977a-4c39-b0bd-d5e0de521702` |
| `dashboard.rollup` | `991d95d8-3260-4ceb-8fdb-579e3afe9fdc` |
| `projects.read` | `b1a53edb-cb90-42b3-bddc-003fe2ee9d6c` |
| `projects.timeline` | `3bf51fac-1bc0-4e7b-8103-ab4a373ed533` |
| `projects.list` | `b20fa943-e90a-4851-928e-e7651d5d109e` |
| `projects.create` | `53565415-df5f-41a8-806f-665670ac5032` |
| `projects.update` | `0eb8912b-1c58-4f29-9323-5b5cf9712089` |
| `projects.archive` | `f57f206a-39be-4f88-9440-80559cc88fc9` |
| `projects.unarchive` | `bb1c2926-a172-4430-ad95-c5eb7deaeff7` |
| `projects.delete` | `86402251-0cdf-4f6a-991e-d8ee77fdb5d6` |
| `projects.deleteChildren` | `ffd22292-4871-493e-85f8-c47043391be9` |
| `search` | `4d02242a-23e0-4bd6-8e17-3b4bb0ffad76` |
| `tasks.create` | `56dfdba5-0b8f-4c45-b4cb-2a1e9d2d24fc` |
| `tasks.complete` | `2e90968b-b35a-48bb-ae6d-e38cd54e9efa` |
| `tasks.reopen` | `5350692e-fed6-45f1-9a39-cf0ecc1dd198` |
| `tasks.list` | `c48c9261-21f1-4392-a312-eb7f6a03898a` |
| `tasks.read` | `74e5d655-3320-4296-a1b0-634d96a108ce` |
| `tasks.update` | `d59c89b5-2df3-4251-a1e2-eaf7d9bca2c9` |
| `tasks.delete` | `8fe1ddec-ee87-42db-99f5-668b74ed6f7b` |
| `calls.create` | `fc3f9a33-9f7f-4ffa-8ffd-09b26adcd510` |
| `calls.complete` | `08e88a64-5bde-4a79-8b79-f72d6f460a93` |
| `calls.reopen` | `1d4674e8-3274-4058-a506-2be3d585b340` |
| `calls.list` | `fa286e12-a73f-4933-a932-c1908155b096` |
| `calls.read` | `34dd3526-ce25-4905-816b-ca3109dc4f9d` |
| `calls.update` | `93230343-6893-4218-85a3-de5747417561` |
| `calls.delete` | `c9fe81de-916f-4b27-853d-f567de0eed15` |
| `notes.create` | `62493998-a1d8-43ae-bd9e-92ec08b69ceb` |
| `notes.archive` | `635e596f-55e7-4a5a-8b32-33716b24e89c` |
| `notes.unarchive` | `2b69c493-6674-45ad-952d-678479c25a5a` |
| `notes.list` | `f27f875b-9e58-4985-b6b8-82580ee9e8d5` |
| `notes.read` | `d12d7537-4ff9-40b0-90bc-63d2a96eb73e` |
| `notes.update` | `6b1d7f12-d50e-4034-a011-d8eed0b238e9` |
| `notes.delete` | `7de4bb42-7db0-4722-ba6c-fd28d78de53e` |
| `notes.convertToTask` | `7d76cf9f-0f31-4701-ac47-007d09cd1ea8` |
| `companies.list` | `0d49a7a0-354d-4c8e-8283-129bced91d99` |
| `companies.read` | `a4ab5cbf-b9cd-4a02-8919-f2b129d49c95` |
| `companies.timeline` | `754f8c38-267b-45c5-a6b4-d532c9f57ee5` |
| `companies.create` | `e27d4f25-f0ed-4a93-a02f-82a7ffaeaa36` |
| `companies.update` | `b9c63d7b-8214-4ef2-a482-d39575565925` |
| `companies.setPrimaryContact` | `e7cdce92-1d6b-4bee-9962-107c4912388d` |
| `companies.delete` | `4ede97e0-adfb-4816-9605-3f4e94fddf02` |
| `contacts.list` | `a3e0a549-c4b1-4c73-ba28-dfb2c166c887` |
| `contacts.read` | `9fe783b8-3b1b-477f-9a85-f2aebd9a8e93` |
| `contacts.timeline` | `997c8ba5-e518-46be-80ba-04bca5657a5e` |
| `contacts.create` | `dc017fbf-db77-417e-9018-b8e2ff52f2a4` |
| `contacts.update` | `c62df635-4401-4093-a870-6d457e9d50c3` |
| `contacts.associate` | `a8a13326-a924-4caa-b8aa-c7e86d25cee6` |
| `contacts.dissociate` | `525f1fbe-faa1-4025-a8f3-195ea42ff792` |
| `contacts.delete` | `c8efaa08-c2f0-495d-a9ba-630d77a8cb6a` |
| `grants.list` | `032058f8-d884-417d-9e4c-72faf9a8d40e` |
| `grants.grant` | `1feea27b-c7f1-4ba0-8d91-0f35f66d533e` |
| `grants.revoke` | `d301a14c-fe4c-40f7-a501-8861713bc219` |
| `files.read` | `0e8ea413-92d1-40a4-b613-30ba9580b2b7` |
| `files.delete` | `0aa91f2f-568a-4af4-ba99-ed682f2ac5e0` |
| `account.read` | `06a4e2ef-cf74-40de-ae3e-1b57f3d7b3e1` |
| `account.update` | `4143b8a1-6cf6-40ee-b71a-fa7d48ee863d` |
| `account.changePassword` | `2d013c98-d2a4-4725-928c-3d5940fe9574` |
| `users.list` | `a05457b9-9f8c-42b5-83e2-fb1f7a61fdb9` |
| `users.update` | `b47bd93c-fcd1-4bdb-be44-8253d555de02` |

`account.changePassword` stays registered but its rules are deactivated and it
answers 503 (deviation H-1). User creation is not a service: see H-2.

### Procedures

- **Generators.** Each `scripts/provision-*.py` writes a plan JSON of MeroFoundry
  operations (create/update service, rule, saved query, function, form, field) using
  `scripts/provision_lib.py`. Plans are fresh-app creation plans; for changes generate
  an update plan, check scopes and action budgets, and activate only the intended rules.
- **Apply loop.** For each plan: `plan-step.py <plan> <authoring.json>` prints the next
  unrecorded step key, `plan-step.py <plan> <authoring.json> <key>` prints the tool and
  arguments with earlier ids substituted, the step is run through the MCP session, and
  `plan-record.py <authoring.json> <key> <tool> ok <id>` (or `failed "<error>"`) records
  it. `write-registry.py` merges service ids into `public/services.json`; `journal.py`
  appends the authoring results to `BUILD_LOG.md`. Never edit an earlier log line.
- **Matrix.** `verification/harness/run.sh` runs a script in the Playwright image
  with the bob and jane credentials from `.env-bob` and `.env-jane`:
  `WGD_BASE=https://workgetsdone.staging.merofoundry.app bash verification/harness/run.sh /repo/frontend/scripts/verify-full.mjs smoke entities-read entities-write sharing delete convert files filters account admin attachments`.
  Run it between :05 and :50 past the hour; the hourly demo reset at :00 wipes
  `WGD-MATRIX` fixtures and would race the run. Logins are rate limited (about 5 per
  10 minutes per account); sessions are cached in `verification/harness/.session-<name>.json`
  (gitignored), so one run of all sections needs two logins. A failing check throws and
  the run exits non-zero; evidence is `verification/2026-10-11-full-build/matrix-*.json`.
- **Stage guard.** Every full-build verify script imports `scripts/stage-guard.mjs` first. It
  refuses to run unless `WGD_BASE` is set explicitly, and refuses the production host
  unless `WGD_ALLOW_PROD=1`. This follows the Task 17 incident, where a matrix run with
  the harness default hit production (read-only).
- **Hosted checks.** `verify-hosted-*.mjs` drive the real site with Playwright.
  `verify-hosted-cutover.mjs` visits every route as bob (1280x900) and jane (375x812)
  and asserts no console errors, no CSP violations and no unexpected not-found text.
  `verify-cutover-acs.mjs` re-checks AC-34 to AC-37.
- **Release.** `cd frontend && npm run build && npm run package && cd .. && bash frontend/scripts/stage-release.sh`
  uploads the ZIP through a ticket bound to its digest, activates the version and runs
  the hosted login check. The API key is read from `.env-api-key` inside the script
  and never printed.
- **Schema-change window.** Adding or changing a model field is not safe while the site
  is enabled. Sequence: prepare the change, disable the site hosting, add or publish
  the field or model, re-enable the site, run the hosted login check. Done for
  `task.source_note` (Task 15) and `note_file.blob` (Task 20, two windows).
- **Unit and browser tests.** `npx vitest run`, `npx tsc -p tsconfig.json --noEmit`,
  `npm run build`, and the mocked Playwright suite (see "Review locally").

### Deviations

- **C-1.** The created-id lookup after a create finds the new row by `client_ref`
  without an ownership predicate. Record ids are not secret and reads and writes stay
  guarded; the residual risk is that a guessed 122-bit `client_ref` reveals a record id.
- **F-1.** Converting a note to a task does not copy the note's sharing grants to the
  new task.
- **H-1.** Self-service password change is withdrawn. Rule `update_record` does not
  hash password fields, and the first matrix run stored a stage password in plaintext
  (recovered by a manual demo reset). `account.changePassword` is deactivated and the
  Account page says password changes are handled by an administrator. FR-AUTH-10
  stays unmet pending a platform fix.
- **H-2.** Administrator user creation goes through the authenticated form route
  (`user_create_authenticated`), which hashes the password; a rule cannot set a
  password. Same BYOF-03 exception as I-1.
- **I-1.** Attachment upload goes through the form route (`attachment_upload` form
  bound to `note_file`), not a service; the blob id is copied to `storage_key` and
  metadata by a rule, and a rule requires the uploader to be able to write the note.
- **I-2.** FR-FIL-04 is not met: the stored content type and size are client-declared
  and rules cannot inspect bytes. Server-side inspection is on the platform card.

### Known limitations

- **Project cycles.** DM-PRJ-04: only self-parenting is rejected; longer parent cycles (A under B under A) are not.
- **Deleted attachment blobs.** Deleting an attachment row leaves its blob in file storage.
- **Delete batching.** Rules cannot update N children, so cascading deletes run in
  batches of 3 to 7 rows per call and answer `{done, remaining}`; the delete dialog
  repeats the call until `done`.
- **12 MB upload cap.** The edge refuses bodies above roughly 12 to 15 MB; the client
  limit is 12 MB. The server-side 25 MB rule trusts the declared size.
- **Download gap.** Attachments cannot be downloaded yet; `/files/:id` shows the
  details and a notice. Blobs of deleted attachment rows remain in file storage.
- **Sharing panel.** The panel only appears where the caller has direct SHARE
  permission (`canShare`); subtree grants that `share_check` honours are not offered
  in the UI.
- **Platform finding.** `create_record` with `trigger_rules: true` does not run the
  target model's pre_save rules, so `normalize` repeats those validations.

### Deferred

Task 21 (Google sign-in) is coded (admin linking, account panel, sign-in link) and waits
for the owner's OAuth client for the stage site; see docs/runbooks/google-signin-stage.md.
The Google button is omitted from the sign-in page until `session.googleStart` is added to services.json. Milestone L (TailAdmin
restyle) follows the commit of this build.

### Dependency hygiene

React stays on 18.3.1. In-major bumps made on 2026-10-11: `react-router-dom` 6.30.6,
`vite` 6.4.4, `vitest` 3.2.7, `storybook` and `@storybook/react-vite` 8.6.18. The
remaining `npm audit` advisories have no fix inside the current majors and are
recorded in `BUILD_LOG.md`.
