# Shirt Darwin Architecture and Workflow

Status: implemented v1 architecture.

## Product boundary

Shirt Darwin runs comparable print-on-demand experiments for one Austrian merchant launching into the contiguous United States and Washington, DC. Customer storefronts are English and USD. Shopify's neutral parent merchant identity appears at checkout and on shared legal pages.

One modular SvelteKit application has three surfaces:

- Distinct brand storefronts on `<brand>.<root-domain>`.
- A neutral company site and shared legal/contact pages on the root domain.
- A Pocket ID-protected operator console at `/admin` and scoped MCP endpoint at `/mcp`.

PostgreSQL is the operational database and job queue. Separate private and public Cloudflare R2 buckets hold draft/print assets and published storefront assets respectively. The application is one Coolify/Nixpacks deployment with one process and one replica in v1.

## Sources of truth

- Shirt Darwin owns brand drafts and immutable published revisions, assets, experiments, campaign mappings, first-party attribution, normalized economics, decisions, issues, legal text, and audit history.
- Shopify owns products, variants, prices, carts, hosted checkout, payments, orders, refunds, and customer data.
- Printful owns production, fulfillment, shipping, and provider costs.
- Meta owns campaigns, delivery, spend, and Meta-attributed results.
- Pocket ID owns operator identity and MCP authorization.

The local database never stores customer names, email addresses, street addresses, or raw provider webhook bodies. It stores stable provider IDs, order numbers, region codes, item mappings, amounts, statuses, and timestamps needed for operations and economics.

## Storefront model

Every storefront uses the same typed renderer but a distinct versioned manifest. The manifest controls identity, SEO, semantic color and typography tokens, navigation, typed sections, assets, section order, and one of the `editorial`, `catalog`, or `poster` compositions. Arbitrary HTML, CSS, and scripts are rejected.

A storefront has only `draft`, `live`, or `archived` status. It has one mutable draft pointer and immutable revision records. The authenticated root-domain preview can render a selected draft revision. Creating an experiment validates the complete three-design catalog and confirmed assets, then atomically freezes a detached catalog snapshot onto the bound revision. A previously published or frozen revision is forked first. Draft and catalog mutations are blocked while a planned or running experiment owns that revision. Publishing is an explicit operator action that rechecks the frozen boundary under the storefront lock and atomically points the live storefront at the validated revision.

Frozen revisions own brand, design, product, image, and variant-assortment content. Shopify still owns operational commerce facts: a live storefront overlays only current USD prices and availability for the frozen variant IDs. Missing or unavailable provider facts fail closed. Product mappings are versioned instead of repurposed, so preparing a replacement assortment cannot change the currently published revision.

Publication readiness is derived, not a workflow state. It verifies the manifest, uploaded-and-confirmed image/mockup/print assets, exactly three design families, design provenance/rights evidence, an operator-active and provider-available US/USD T-shirt/hoodie/crewneck mapping for each design, a valid support contact, published imprint/privacy/terms/returns documents, and a planned or running experiment bound to that exact immutable draft revision and hero T-shirt.

The initial catalog is design-first. Each of three design families links separate Shopify products for:

- Gildan 5000 T-shirt
- Gildan 18500 hoodie
- Gildan 18000 crewneck sweatshirt

The operator creates those products through Printful and Shopify. Shirt Darwin imports each product from Shopify by handle and stores its stable Shopify product identity, current provider health, and a validated display snapshot. Replacing a garment mapping deactivates the working version and creates or reactivates a separate identity row; historical published revisions retain their original mapping. Printful v2 does not provide the product-import path used here; optional Printful product IDs are entered manually.

## Authentication and authorization

Better Auth connects the root admin to Pocket ID Generic OAuth. Email/password, signup, password recovery, and customer accounts are absent. Pocket ID restricts the client to the operator group and the application requires the configured subject. Every server action and admin JSON endpoint rechecks the session; route layout protection is not treated as authorization.

The stateless MCP server validates Pocket ID JWT signature, issuer, audience, expiry, subject, and scope. It advertises OAuth protected-resource metadata and supports separate read, draft-write, and asset-write scopes. It can create and revise structured drafts, issue signed uploads, validate drafts, return authenticated preview URLs, and read aggregate metrics/issues. It cannot publish, archive, expose order-level/customer data, or change Shopify, Printful, or Meta.

## Experiment and economics

An experiment binds one storefront revision, one active hero T-shirt mapping, an optional hero video, one USD budget, one UTC date window, and one Meta campaign mapping. Non-ended windows for one storefront cannot overlap, and a different revision cannot replace the storefront while an experiment is running.

Lifecycle is derived from dates:

- `planned` before the start.
- `running` inside the window.
- `ended` after the end or a manual early end.

Experiment inputs and campaign mapping are editable only while planned. A running or ended test is frozen; changed inputs require a new experiment. After it ends, the operator records `keep`, `iterate`, or `retire` with notes. That decision never pauses Meta or archives a storefront automatically.

First-party attribution uses the generated `sd` token and deterministic Meta UTMs. A paid click can receive credit for an order for seven days. The attribution token is passed to Shopify cart attributes and recovered from order data. Replacing a paid-click cookie revokes the prior browser-linked touch, and withdrawing consent prevents later Pixel/CAPI use. Meta receives browser identifiers only after consent and receives the anonymous click ID only as a SHA-256 hash. Internal last-paid-click results and Meta-reported results are displayed separately.

The append-only ledger uses positive Shopify net merchandise revenue and customer-paid shipping, then negative refunds, chargebacks, Printful product/shipping/tax costs, provider adjustments, replacements, Shopify payment/FX fees, and Meta spend. Shopify's order projection retains discounts for explanation and reconciliation, but the ledger does not subtract them again from already-net merchandise revenue. Corrections supersede earlier entries instead of overwriting them. Customer sales tax is pass-through and excluded from contribution. Shopify fees are not assumed to be universally constant: actual payment and FX effects come from balance transactions when available, while the Shopify plan, VPS, apps, and other subscriptions are manually recorded as portfolio overhead.

When synchronized records do not contain actual payment/FX fees, chargebacks, replacements, or exceptional adjustments, the operator can append a source-referenced manual entry. Re-entering that source and kind creates a superseding revision. Fixed Shopify, app, VPS, and software costs are appended by month to the separate portfolio-overhead list.

Amounts retain provider-native minor units and currency. Non-EUR facts remain pending until the operator appends the actual EUR settlement or invoice value through the audited reconciliation action. Incomplete totals display as pending rather than zero. Missing costs never silently become zero.

## Automation boundary

Automated:

- Validate typed brand manifests and signed asset uploads.
- Process verified, deduplicated Shopify and Printful webhooks.
- Reconcile Shopify orders and current/historical product health, Printful orders/costs/shipments, and Meta Insights nightly at 03:00 UTC.
- Run the same idempotent reconciliation when the operator presses “Sync now.”
- Record provider freshness and integration issues.
- Calculate first-party attribution and contribution economics.
- Derive a non-acknowledgeable “Next actions” list for budgets near or over their ceiling, ended tests without outcomes, pending ledger reconciliation, and orders more than 48 hours old without Printful fulfillment.
- Send consented Meta Pixel and Conversions API events with shared event IDs.

Manual:

- Research and select niches.
- Create and rights-review designs, product listings, mockups, prices, shipping, and legal text.
- Use hosted AI through MCP and accept or revise its structured draft.
- Publish or archive a storefront.
- Create, activate, modify, pause, and fund Meta campaigns.
- Handle customer service, cancellations, refunds, returns, replacements, and Printful holds in provider tools.
- Review evidence and record experiment outcomes.

There are no scheduled notifications, acknowledgement queues, approval roles, general workflow state machine, automatic product/campaign creation, automatic budget changes, or champion replacement. The derived dashboard list is current evidence, not a reminder system.

## Exact recurring workflow

1. On the weekend, run provider syncs and inspect data freshness, contribution, no-PII orders, and open integration issues.
2. Review ended tests and record `keep`, `iterate`, or `retire`. Manually pause or change Meta and Shopify where the decision requires it.
3. Research the next niche and create a draft with a sufficiently detailed niche brief.
4. Let the hosted AI client read the MCP schema and brief, write the structured brand draft, upload allowed assets, and return the authenticated preview URL.
5. Review the draft and assets. Create three designs and nine products manually in Printful/Shopify, then import and map each Shopify handle.
6. Select the hero T-shirt, optionally upload the externally generated MP4 hero creative, and define the experiment window and budget.
7. Create the Meta campaign manually, save its IDs, and use the generated tracking link.
8. Publish the storefront after readiness and safe-mode checkout/tracking checks, then activate Meta manually.
9. Shopify and Printful webhooks update operations while nightly reconciliation catches missed or corrected data. Repeat at the next review.

## Failure and security behavior

- Webhook signatures are verified against raw bytes before parsing; provider event keys make retries idempotent.
- Provider data is parsed through strict schemas. Incompatible responses create visible issues rather than malformed projections.
- Jobs use bounded retry/backoff and correlation IDs. Provider outages do not make application readiness fail.
- Hostnames are allowlisted; tenant context lives in request locals and never in shared SSR state.
- Draft uploads use short-lived, size/MIME-bound presigned URLs into a non-public bucket. An asset record remains unusable until a matching object-storage `HEAD` confirmation succeeds. Publication copies only confirmed storefront images/video to the separate public bucket; private PNG print files are never promoted. HTML and active SVG are not accepted.
- Admin/MCP mutations are audited with actor, client, entity, request, and revision context.
- Storefront tracking is consent-aware. Public legal text is plain text and never rendered as HTML.
- `/health/live` checks the process; `/health/ready` checks PostgreSQL and reports production configuration errors.

## Deliberately deferred

- Markets outside the contiguous US and DC, additional currencies, and translation.
- Customer accounts or a local support CRM.
- Additional commerce, POD, ad, identity, and storage providers.
- Autonomous niche research, design generation, or storefront publication.
- A free-form page builder or arbitrary theme code.
- Automatic experiment ranking, champion replacement, and 20-store scheduling.
- A separate warehouse, Redis, microservices, or multiple application replicas.
