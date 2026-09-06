# Operations health collection

The Control Plane exposes `POST /api/jobs/health`. It is an ingestion seam, not a deployed schedule. Configure a trusted scheduler to call it every five minutes with `Authorization: Bearer <RANZA_HEALTH_COLLECTOR_SECRET>`. Generate a separate random secret of at least 32 characters; store it only in the deployment/scheduler secret stores. Never put it in a URL or public environment variable.

Set `STOREFRONT_ORIGIN`, `PRODUCT_WEB_ORIGIN`, `CONTROL_PLANE_ORIGIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` on the Control Plane deployment. Origins must be HTTPS (HTTP loopback is accepted for local development), have no embedded credentials, and contain no path/query/fragment. Never derive these destinations from incoming requests.

The collector probes the three deployables' `/health` endpoints and the Supabase Auth gateway's `/auth/v1/health`. App probes verify the expected application identity and status. Auth gateway success establishes HTTP liveness only, not Student sign-in or MFA correctness. Redirects are rejected, requests bypass caches and time out after five seconds. Raw response bodies, error text, URLs and credentials are never persisted or returned.

Observations are written through the service-role-only `record_operational_signal` RPC; the database timestamps each observation. A successful database write establishes database reachability. Missing configuration yields `unknown`; failed probes yield `failed`; the dashboard marks observations older than ten minutes `stale`. An outage that prevents ingestion cannot write its own failure: alert on the collector's 503/timeouts and stale dashboard observations. The endpoint returns no-store JSON with generated correlation ID and coarse outcome booleans; 200 means all configured checks succeeded and were persisted, while 503 includes unknown/failed checks or ingestion failure.

## Worker signals are separate

This collector deliberately does not update `scheduler` or `exports`: its success is not evidence that Attendance finalization, Meal finalization, or exports ran. Those workers must emit their own service-role `record_operational_signal(component, signal_status)` after their real work, and their deployment schedules must be configured independently. Task24's failed/stuck-job panel and due counts remain the available operational evidence until that instrumentation is wired. Do not use a synthetic periodic `ok` heartbeat to mask failed workers.

## Deployment verification still required

After migrations and deployment, verify unauthorized requests return 401, then trigger an authorized collection and inspect Operations with an AAL2 platform identity. Test one stopped service, one invalid origin, one failed database write, and a collector paused beyond ten minutes. Confirm unknown/failure/stale states and an external alert reach the on-call owner. No live deployment, scheduler, alert destination, database probe or browser verification is claimed by this implementation.
