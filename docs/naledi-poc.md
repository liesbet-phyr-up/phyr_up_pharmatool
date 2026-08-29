# Naledi POC architecture (MAXIMED-NALEDI-001)

Inspected: `vanderberghenry-oss/maximed-learning` @ `main` SHA `aa6444cc00c9ca10cbc1302cee50ca5ac3cb5194` (29 Aug 2026, Rune boot-crash fix). Later main SHAs are acceptable; rebase if main moved.

## What already exists

| Layer | Fact |
|---|---|
| Stack | Express + tRPC + Vite / React 19 + wouter + drizzle mysql + JWT cookie 10h (`app_session_id`, HS256, `maximed-first-party` marker) |
| Routes | `/`, `/login`, `/invite/:token`, `/learn`, `/course/:id`, `/training`, `/admin` |
| Auth | Email OTP (RESEND), invite magic link, `BOOTSTRAP_ADMIN_EMAIL`. Session from httpOnly cookie. Learner is `ctx.user.id` / JWT `sub`. |
| Learning | `learning.catalog`, `learning.course`, `learning.completeModule`, assessments. Completions live in `module_completions`. |
| Schema | `users`, `employee_profiles`, `staff_invites`, `courses`, `course_modules` (`body` text, `moduleType`, `position`), `course_enrollments`, `module_completions`, `assessments` + questions + attempts. **No `contentVersion` column. No Anam tables.** |
| Current module | Not stored. Course workspace lists modules by `position` and shows `completedAt`. |
| CSP | None in `client/index.html`. HTTPS is already required in production (secure cookie). |
| Feature flags | None. Boot fail-closed only for `JWT_SECRET` + `DATABASE_URL`. |

## Source of truth

Maximed owns identity, module, approved text, scoring, completion, rewards, audit.

Anam / ElevenLabs is a replaceable renderer and voice shell. Naledi (character) is Maximed IP. This POC never writes `module_completions`, never calls `recordModuleCompletion`, and never accepts a learner id from the browser.

## Bridge (smallest reversible)

```
Learner (JWT cookie)
    -> GET  /api/naledi/config                 feature flag, no secrets
    -> GET  /api/training/modules/current      domain shape (JWT -> user id)
       GET  /api/naledi/current-module         adapter (same handler)
    -> POST /api/naledi/session-token          server mints Anam token
       POST /api/anam/session-token            alias
    -> @anam-ai/js-sdk createClient(sessionToken)
       fallback: <anam-agent> widget if ANAM_API_KEY unset
```

`/course/:id` keeps working if any of those calls fail. The Talk to Naledi control is hidden unless `NALEDI_ENABLED` is `true`/`1` **and** `ANAM_PERSONA_ID` is set.

## Current-module resolution (no new table)

1. Learner = JWT cookie session, then `users.id`. Client `learnerId` / `userId` is rejected (400).
2. `courseId` comes from the workspace URL the learner already opened.
3. Optional `moduleId` must belong to that course; otherwise ignored.
4. Else: first incomplete module by `position`; else first module.
5. Course must be `published`.
6. `contentVersion` = sha256 prefix of `id|updatedAt|title|body` (derived, not a column).
7. `learnerId` in the JSON is a 16-char sha256 prefix, not email and not the numeric pk.

Returned fields only: `learnerId`, `moduleId`, `moduleTitle`, `content`, `contentVersion`, `instruction` (plus `briefing`, a server-built prompt string from those fields).

## Auth modes

- **SDK + session-token (preferred):** `ANAM_API_KEY` present. Server POSTs `https://api.anam.ai/v1/auth/session-token` with `Authorization: Bearer <key>` and `{ personaConfig: { personaId } }`. Client never sees the API key.
- **Widget fallback:** key unset, flag on, persona id set. `<anam-agent agent-id>` from `https://unpkg.com/@anam-ai/agent-widget`. Widget auth is **domain allowlist in Anam Lab**. Henry must allowlist `https://maximed-learning-production.up.railway.app` (and localhost for dev).

## Failure

Anam down, widget blocked, mic denied, SDK import failure: panel shows an error; `/learn` and `/course/:id` keep serving. Local error boundary around the Naledi control so a renderer crash cannot take the workspace with it.

## Out of scope

Completion, scoring, rewards, reporting, multilingual, analytics, schema migrations, production push, Railway (Javin after merge).
