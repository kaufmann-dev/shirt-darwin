# Shirt Darwin

Shirt Darwin is a manual-first platform for running small US print-on-demand experiments. One SvelteKit application serves distinct niche storefronts on subdomains, a private operator dashboard on the root domain, and an authenticated MCP endpoint for structured AI-assisted brand drafting.

The platform centralizes evidence and repetitive data work. It does not choose niches, generate products, publish stores, operate ads, issue refunds, or decide experiment outcomes without the operator.

## Implemented system

- SvelteKit 2 and Svelte 5 with `adapter-node`, TypeScript, Tailwind CSS, and pnpm.
- PostgreSQL through Drizzle for immutable brand/catalog revisions, versioned product mappings and provider health, experiments, no-PII order projections, provider events, the contribution ledger, legal documents, issues, and audit events.
- Pocket ID OIDC through Better Auth for the single operator. Local passwords and public signup are disabled.
- Stateless Streamable HTTP MCP at `/mcp`, protected by Pocket ID resource scopes. MCP can read evidence and create or revise drafts; it cannot publish or change external providers.
- One shared Shopify store for products, variants, carts, hosted checkout, payments, orders, refunds, and customer data.
- Printful v2 for signed order, cost, shipment, refund events and reconciliation. Products are imported from Shopify; optional Printful IDs are mapped manually.
- Meta Marketing API v25.0 Insights plus consent-aware Pixel and Conversions API events. Campaigns and budgets remain manual in Meta.
- Separate private and public S3-compatible asset buckets. Production targets Cloudflare R2; MinIO works locally through the same interface.
- PostgreSQL-backed jobs for verified webhooks, manual syncs, and nightly reconciliation at 03:00 UTC.
- A derived dashboard action queue for near/reached budgets, ended tests without outcomes, unreconciled ledger entries, and stale unlinked fulfillment. It sends no notifications and never acknowledges or acts for the operator.

See [ARCHITECTURE_AND_WORKFLOW.md](ARCHITECTURE_AND_WORKFLOW.md) for boundaries and the exact operator workflow.

## Development

Requirements:

- Node `>=24 <25`
- pnpm `11.18.0`
- PostgreSQL
- Two S3-compatible buckets for private drafts/print files and public storefront assets

Install and prepare the database:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:migrate
pnpm dev
```

The root development host is `localhost:5173`. A brand can be tested through `<slug>.localhost:5173` when the local resolver supports wildcard localhost names.

Quality checks:

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
```

Database integration tests use `TEST_DATABASE_URL` and never fall back to `DATABASE_URL`.

## Core operator flow

1. Research a niche manually and create a storefront with a useful niche brief.
2. Ask a hosted MCP-capable AI tool to author the typed brand draft, then inspect it in the authenticated preview.
3. Create three designs manually. For each design, create a Gildan 5000 T-shirt, Gildan 18500 hoodie, and Gildan 18000 crewneck through Printful and Shopify.
4. Import the nine Shopify products by handle, optionally add their Printful IDs, and choose one active T-shirt as the hero offer.
5. Upload an externally generated hero video if one is used, then create the experiment with a UTC date window and USD budget. Creating it freezes the reviewed catalog revision.
6. Create the Meta campaign manually, save its IDs, and use the generated tracked landing URL.
7. Publish the storefront and activate the campaign manually after checkout, consent, Pixel, and CAPI testing.
8. During the weekend review, sync providers, resolve operational issues, inspect internal and Meta attribution separately, and record `keep`, `iterate`, or `retire` after the experiment ends.

There are no reminders, approval workflow, automatic budget changes, or automatic champion replacement.

Shopify fees are not treated as one fixed percentage. Actual payment/FX effects are imported from balance transactions when available; chargebacks, replacements, and exceptional gaps can be appended to an experiment ledger manually. Corrections create superseding revisions, so provider facts are never edited in place. The Shopify plan, apps, VPS, and other fixed software costs are appended separately as monthly portfolio overhead and do not reduce an individual experiment's contribution.

Provider-native non-EUR ledger facts remain visibly pending rather than appearing as zero EUR. Use **Integrations → EUR ledger reconciliation** to append the actual EUR settlement or invoice value as a new audited revision.

## Coolify Deployment

Configure these Coolify UI fields:

- **Build Pack:** Nixpacks.
- **Base Directory:** `/`.
- **Post-Deployment Command:** `npx --yes pnpm@11.18.0 db:migrate` (Coolify executes it through `sh -c`).
- **Health Check Path:** `/health/ready`.
- **Domains:** the apex domain, `www`, and a wildcard brand domain all point to this application. Reserve the Shopify checkout hostname outside the wildcard.

Required environment variables:

- `DATABASE_URL` — PostgreSQL connection string.
- `PUBLIC_APP_ORIGIN` — canonical HTTPS root origin, including scheme.
- `PUBLIC_ROOT_HOST` — root hostname without scheme.
- `BETTER_AUTH_SECRET` — at least 32 random characters.
- `POCKET_ID_ISSUER`, `POCKET_ID_CLIENT_ID`, `POCKET_ID_CLIENT_SECRET`, `POCKET_ID_ALLOWED_SUBJECT` — single-operator OIDC configuration.
- `MCP_RESOURCE_URI` — public HTTPS MCP resource URI, normally `${PUBLIC_APP_ORIGIN}/mcp`.
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_API_VERSION` — Shopify access and pinned API version.
- `PRINTFUL_API_TOKEN`, `PRINTFUL_STORE_ID`, `PRINTFUL_WEBHOOK_PUBLIC_KEY`, `PRINTFUL_WEBHOOK_SECRET_HEX` — Printful v2 access and signed webhook verification.
- `PUBLIC_META_PIXEL_ID`, `META_DATASET_ID`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_GRAPH_API_VERSION` — Meta Pixel, CAPI, and Insights configuration.
- `S3_ENDPOINT`, `S3_REGION`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` — R2 or compatible object storage. The two bucket names must differ.
- `PROTOCOL_HEADER=x-forwarded-proto`, `HOST_HEADER=x-forwarded-host` — preserve dynamic brand hosts and HTTPS behind Coolify's proxy.
- `ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1` — trust exactly the configured Coolify proxy hop for client addresses.

Optional environment variables:

- `POCKET_ID_ADMIN_GROUP` — defaults to `shirt-darwin-admin`; Pocket ID should restrict the client to this operator group.
- `TRUSTED_HOSTS` — defaults to `localhost,127.0.0.1`; set the comma-separated proxy hosts when enforcing an explicit proxy allowlist.
- `SHOPIFY_CHECKOUT_DOMAIN` — defaults to the configured `myshopify.com` domain.
- `META_TEST_EVENT_CODE` — sends CAPI traffic to Meta Test Events while validating a release.
- `S3_FORCE_PATH_STYLE` — defaults to `false`; `true` is recommended for R2 and required by common MinIO setups.
- `PORT` — injected by Coolify/Nixpacks and consumed by `adapter-node`.

The private bucket must have no public development URL or public access policy. Grant the application credentials read/write access to both buckets, expose only the public bucket through `S3_PUBLIC_BASE_URL`, and permit public reads only there. Configure private-bucket CORS for the exact `PUBLIC_APP_ORIGIN`, methods `PUT` and `HEAD`, and the `Content-Type` header so authenticated admin presigned uploads and confirmation work. Do not allow wildcard origins on the private bucket.

Configure the shared Shopify store with the United States as the active market, USD product/checkout currency, and shipping only to the contiguous states plus Washington, DC. The application also requests Storefront API products and carts in US context and blocks non-USD product publication. Use a USD Meta ad account; a different Insights currency is surfaced as an integration issue and excluded from USD budget alerts.

The repository pin in `package.json` is the Node runtime source. `nixpacks.toml` overrides only the generated Nixpacks pnpm phases because the detected plan selects pnpm 9 and an old Corepack despite the pnpm 11.18.0 package-manager pin.

Before production use, create the Pocket ID browser client and MCP API resource, register Shopify and Printful webhooks, configure the Shopify US market and Meta Test Events, publish all four legal documents, set the support contact, verify private/public bucket policies and CORS, and complete a database backup-and-restore rehearsal.
