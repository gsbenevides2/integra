-- =============================================================================
-- auth-bootstrap.sql
--
-- One-time, idempotent bootstrap for the authorization feature.
-- Generated: 2026-10-11 (authorization v1).
--
-- This is NOT a maintained artifact. It seeds the first permission manager and
-- every resource that existed when it was written. Routes and resources added
-- later are granted through the Permissões dashboard, and new Tuya resources
-- get creator auto-grants. Re-running it is harmless but does not grant
-- anything created after this file was generated.
--
-- Run with psql, passing your own Authentik UID/username, and optionally the
-- Authentik login_failed service account:
--
--   psql "$DATABASE_URL" \
--     -v owner_uid="'<your-uid>'"     -v owner_username="'<your-username>'" \
--     -v service_uid="'<svc-uid>'"     -v service_username="'<svc-username>'" \
--     -f server/db/sql/auth-bootstrap.sql
--
-- Omit the -v service_* pairs to skip the service-account section.
--
-- The id columns have no database default (Drizzle generates them in the app),
-- so every insert here generates its own with gen_random_uuid() (PostgreSQL 13+).
-- =============================================================================

BEGIN;

-- 1. The owner's user row.
INSERT INTO auth.users (id, uid, username)
VALUES (gen_random_uuid()::text, :'owner_uid', :'owner_username')
ON CONFLICT (uid) DO NOTHING;

-- 2. Every guarded route key, including the permission management routes and
--    both openapi routes.
WITH route_keys(route_key) AS (
  VALUES
    ('GET /openapi'),
    ('GET /openapi/json'),
    ('POST /api/authentik/login-failed'),
    ('GET /api/crons/list'),
    ('POST /api/crons/run/:jobName'),
    ('GET /api/frigate/cameras'),
    ('GET /api/frigate/cameras/:name/stream'),
    ('GET /api/frigate/cameras/:name/goToFrigate'),
    ('GET /api/google/oauth/start'),
    ('GET /api/google/oauth/callback'),
    ('GET /api/google/accounts'),
    ('DELETE /api/google/accounts/:email'),
    ('GET /api/server-metrics/latest'),
    ('GET /api/server-metrics/history'),
    ('GET /api/server-metrics/speedtest/latest'),
    ('GET /api/server-metrics/speedtest/history'),
    ('GET /api/status-platform/list'),
    ('GET /api/status-platform/:id/history'),
    ('POST /api/status-platform/'),
    ('PATCH /api/status-platform/:id'),
    ('DELETE /api/status-platform/:id'),
    ('GET /api/tplink/devices'),
    ('POST /api/tplink/devices'),
    ('PUT /api/tplink/devices/:id'),
    ('DELETE /api/tplink/devices/:id'),
    ('POST /api/tplink/devices/:id/interface'),
    ('PUT /api/tplink/devices/:id/interface/:interfaceId'),
    ('DELETE /api/tplink/devices/:id/interface/:interfaceId'),
    ('GET /api/tplink/devices/:id/history'),
    ('POST /api/tplink/router/sync'),
    ('POST /api/tplink/router/restart-network'),
    ('GET /api/tplink/checks/latest'),
    ('GET /api/tplink/settings/latest-router-status'),
    ('GET /api/tplink/settings/router-status-history'),
    ('GET /api/train-status/lines'),
    ('GET /api/train-status/:code/history'),
    ('GET /api/tuya/devices'),
    ('POST /api/tuya/devices'),
    ('PUT /api/tuya/devices/:id'),
    ('DELETE /api/tuya/devices/:id'),
    ('GET /api/tuya/devices/:id/state'),
    ('POST /api/tuya/devices/:id/command'),
    ('GET /api/tuya/devices/:id/history'),
    ('GET /api/tuya/presets'),
    ('POST /api/tuya/presets'),
    ('PUT /api/tuya/presets/:id'),
    ('DELETE /api/tuya/presets/:id'),
    ('POST /api/tuya/presets/:id/apply'),
    ('GET /api/tuya/sensors'),
    ('POST /api/tuya/sensors'),
    ('PUT /api/tuya/sensors/:id'),
    ('DELETE /api/tuya/sensors/:id'),
    ('GET /api/tuya/sensors/:id/history'),
    ('GET /api/permissions/users'),
    ('GET /api/permissions/users/:id/grants'),
    ('DELETE /api/permissions/users/:id'),
    ('POST /api/permissions/users/:id/route-grants'),
    ('DELETE /api/permissions/route-grants/:grantId'),
    ('POST /api/permissions/users/:id/resource-grants'),
    ('DELETE /api/permissions/resource-grants/:grantId'),
    ('GET /api/permissions/routes'),
    ('GET /api/permissions/resources')
)
INSERT INTO auth.route_grants (id, "userId", "routeKey")
SELECT gen_random_uuid()::text, u.id, r.route_key
FROM auth.users u
CROSS JOIN route_keys r
WHERE u.uid = :'owner_uid'
ON CONFLICT ("userId", "routeKey") DO NOTHING;

-- 3. All actions on every existing Tuya resource.
INSERT INTO auth.resource_grants (id, "userId", "resourceType", "resourceId", action)
SELECT gen_random_uuid()::text, u.id, 'tuya_device'::auth.resource_type, d.id, a.action::auth.resource_action
FROM auth.users u
CROSS JOIN tuya.devices d
CROSS JOIN (VALUES ('read'), ('write')) AS a(action)
WHERE u.uid = :'owner_uid'
ON CONFLICT ("userId", "resourceType", "resourceId", action) DO NOTHING;

INSERT INTO auth.resource_grants (id, "userId", "resourceType", "resourceId", action)
SELECT gen_random_uuid()::text, u.id, 'tuya_sensor'::auth.resource_type, s.id, a.action::auth.resource_action
FROM auth.users u
CROSS JOIN tuya.sensors s
CROSS JOIN (VALUES ('read'), ('write')) AS a(action)
WHERE u.uid = :'owner_uid'
ON CONFLICT ("userId", "resourceType", "resourceId", action) DO NOTHING;

INSERT INTO auth.resource_grants (id, "userId", "resourceType", "resourceId", action)
SELECT gen_random_uuid()::text, u.id, 'tuya_preset'::auth.resource_type, p.id, a.action::auth.resource_action
FROM auth.users u
CROSS JOIN tuya.presets p
CROSS JOIN (VALUES ('read'), ('write'), ('apply')) AS a(action)
WHERE u.uid = :'owner_uid'
ON CONFLICT ("userId", "resourceType", "resourceId", action) DO NOTHING;

-- 4. read + execute on every job registered when this file was written.
INSERT INTO auth.resource_grants (id, "userId", "resourceType", "resourceId", action)
SELECT gen_random_uuid()::text, u.id, 'cron_job'::auth.resource_type, j.name, a.action::auth.resource_action
FROM auth.users u
CROSS JOIN (
  VALUES
    ('tuya.history.prune'),
    ('google.calendar.schedule'),
    ('google.calendar.send'),
    ('google.gmail.support'),
    ('google.gmail.accesscode'),
    ('google.gmail.payslip'),
    ('trainStatus.check'),
    ('statusPlatform.check'),
    ('serverMetrics.collect'),
    ('serverMetrics.speedtest'),
    ('tplink.sync'),
    ('birthday.send')
) AS j(name)
CROSS JOIN (VALUES ('read'), ('execute')) AS a(action)
WHERE u.uid = :'owner_uid'
ON CONFLICT ("userId", "resourceType", "resourceId", action) DO NOTHING;

-- 5. Optional: the Authentik login_failed service account gets exactly one
--    route grant. The whole section is skipped when owner_uid's companion
--    service variables are absent.
\if :{?service_uid}
INSERT INTO auth.users (id, uid, username)
VALUES (gen_random_uuid()::text, :'service_uid', :'service_username')
ON CONFLICT (uid) DO NOTHING;

INSERT INTO auth.route_grants (id, "userId", "routeKey")
SELECT gen_random_uuid()::text, u.id, 'POST /api/authentik/login-failed'
FROM auth.users u
WHERE u.uid = :'service_uid'
ON CONFLICT ("userId", "routeKey") DO NOTHING;
\endif

COMMIT;
