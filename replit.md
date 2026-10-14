# Rukn Training Platform

Rukn is an Arabic-first Saudi training management platform for learners, trainers, administrators, and corporate teams to discover courses, manage learning progress, and verify certificates. The requested public brand/domain is `www.rukn.my`; DNS and custom-domain setup are separate from the app.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/rukn-lms run dev` — run the Rukn web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/rukn-lms` — Arabic RTL public website, course catalog, learner/trainer/admin portals, company progress view, and certificate verification.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract.
- `artifacts/api-server/src/routes/` — course, enrollment, portal, and certificate endpoints.
- `lib/db/src/schema/` — PostgreSQL schema for Rukn users, courses, enrollments, and certificates.

## Architecture decisions

- Clerk manages sign-in; the app does not store passwords locally.
- New Clerk users are provisioned as trainees. Trainer, admin, and company roles need trusted assignment before those portals can be used.
- Paid-course enrollment is blocked until a payment provider is connected; free-course enrollment is available.
- Certificate records can be verified within Rukn. TVTC/NELC, Nafath, ZATCA, and live-class providers are not connected, so the app must not present records as official approvals.

## Product

Visitors can browse and filter Saudi training programs, view course details, and create an account. Signed-in learners can enroll in free programs, track progress, and view certificates; trainers/admins can manage programs and review completions; company users can view team progress.

## User preferences

- Use Arabic RTL interfaces with a coordinated, distinctive palette and responsive interactive pages.

## Gotchas

- Paid courses must never enroll without successful payment; return a payment-required response until checkout is implemented.
- Do not claim Saudi regulatory integrations or official accreditation until the corresponding providers and credentials are connected and verified.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
