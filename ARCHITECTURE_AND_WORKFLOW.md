# Shirt Darwin Architecture and Operating Workflow

Status: discovery draft; current decisions and remaining questions are listed near the end.

## Purpose

Shirt Darwin is an experiment system wrapped around a print-on-demand commerce business. Its job is not merely to publish stores. It must run comparable niche experiments, preserve the evidence from every attempt, and keep humans in control of legal, brand, budget, and promotion decisions.

The first milestone is one complete, auditable loop:

1. Select one niche.
2. Approve one or more designs.
3. Publish one storefront and product.
4. Run one paid acquisition test with a fixed budget.
5. Fulfill any orders and handle customer issues.
6. Attribute revenue and all variable costs.
7. Calculate contribution profit.
8. Record a human decision to continue, revise, or retire the experiment.

Scaling to the 10-challenger/10-champion weekly model comes only after this loop works reliably.

## Proposed operating principles

- A workflow state machine, not a collection of scripts, is the source of truth for each experiment.
- Automation may prepare or execute reversible, bounded work. A human approves legal exposure, public publication, new ad spend, and champion promotion or retirement.
- An experiment's budget, duration, products, prices, creatives, and success criteria are frozen when the test starts. Changes create a new experiment version rather than silently contaminating the result.
- Provider-specific behavior stays behind adapters so the business model does not depend on one fulfillment, payment, analytics, or advertising vendor.
- Raw provider events and normalized business records are both retained. Failed or retired experiments are archived, never deleted through normal operations.
- The operational database is sufficient for the first loop. A separate warehouse is added only when reporting volume or cross-experiment analysis justifies it.

## System boundary

The proposed system has one shared SvelteKit platform with two surfaces:

- The customer storefront renders niche-specific branding, copy, catalog, and tracking according to the request's subdomain, with Shopify providing the commerce backend and checkout.
- The general domain provides public legal pages and a private operator console for research, reminders, approvals, experiment state, products, creatives, budgets, orders, exceptions, and decisions.

Behind those surfaces are five logical parts:

1. The experiment controller enforces state transitions, approval gates, frozen test settings, and the champion/challenger rules.
2. The commerce core owns niches, storefront configuration, products, prices, customers, orders, refunds, and cost records.
3. Provider adapters communicate with print-on-demand, payments or commerce, advertising, analytics, tax, email, and AI services.
4. Background workers handle provider synchronization, webhook processing, asset generation, metric refreshes, alerts, and retries.
5. The evidence store retains research notes, prompts, generated assets, approvals, raw events, calculated metrics, and decision rationale.

These can begin as modules in one deployable application with one relational database, one job runner, and object storage. They should not begin as independently deployed microservices. The application is hosted on the operator's personal VPS through Coolify.

## Current product decisions

- The first launch market is the contiguous United States and Washington, DC, using English, USD, and one consistent domestic fulfillment route.
- The architecture remains global-ready, but each additional market must be enabled explicitly after its taxes, duties, fulfillment, delivery, support, and unit economics are validated.
- Shopify owns the commerce catalog, checkout, payments, customers, and orders.
- SvelteKit powers the central operator application and the shared storefront foundation.
- Every storefront has a distinct brand assembled from versioned configuration, design tokens, assets, and reusable layout options; storefront code is not copied into separate applications.
- Meta is the initial paid advertising channel.
- One founder is the operator and holds every approval role initially.
- The product is manual-first. The operator uses external AI tools directly for research, creative work, and website inputs instead of embedding unattended AI agents for tasks that are easy to perform interactively.
- The platform centralizes workflow status, reminders, operational data, analysis, and decision history. Public launches, campaign operation, refunds, budget changes, and final promotion or retirement decisions remain manual.
- A physical product sample is not required before the first paid test.
- Test budgets and decision thresholds are configurable by the operator rather than fixed globally.
- The print-on-demand provider is not selected and must be evaluated separately.

## Core records

The initial data model should distinguish the following records:

- A `Niche` is a community or interest being considered. It persists across multiple experiments.
- A `Storefront` is the niche-specific brand, domain mapping, theme configuration, copy, policies, and catalog presentation.
- A `Design` is a versioned creative asset with source, prompt or provenance, rights-review status, and production files.
- A `Product` joins an approved design to a garment variant, print provider blueprint, price, and production cost.
- A `Creative` is a versioned ad asset and copy combination.
- An `Experiment` freezes the tested niche, storefront version, products, creatives, audience, channel, budget, dates, and decision thresholds.
- An `Approval` records who approved which immutable version, when, and with what notes.
- An `Order` and its cost ledger record the complete economics of a purchase, refund, replacement, tax, fees, fulfillment, and shipping.
- An `AdSpendRecord` stores provider spend at the smallest practical campaign and time grain.
- A `Decision` records the calculated evidence, recommendation, human choice, and rationale.

Contribution profit should be derived from ledger entries rather than stored as a manually editable number.

## Experiment state machine

Every experiment follows one forward-moving workflow:

```text
idea
  -> researching
  -> niche_review
  -> producing
  -> compliance_review
  -> launch_review
  -> scheduled
  -> running
  -> observation_window
  -> analysis_ready
  -> decision_review
  -> promoted | iterate | retired
```

An experiment may also enter `blocked` from an active preparation state or `stopped` from `scheduled`/`running`. Those states require a reason. Resuming creates an explicit transition; it does not erase the interruption.

The difference between `running` and `observation_window` is important: paid acquisition has ended, but late attribution, payment settlement, refunds, and fulfillment costs may still arrive. A result is not final until the agreed observation window closes.

## Exact proposed workflow

### 1. Niche intake and research

System-assisted:

- Present a structured niche brief and retain links, notes, AI outputs, and previous experiment history supplied by the operator.
- Track brief completeness and surface unresolved risk-review items.

Manual:

- The operator researches candidate ideas, including by using external AI tools directly, and enters the useful results.
- The operator reviews source quality and community fit.
- An operator rejects unsafe, exploitative, highly sensitive, or legally questionable niches.
- An operator selects a niche and records the reason for testing it.

Gate: an approved niche brief, named owner, and initial risk assessment are required before production.

### 2. Offer, design, and storefront production

System-assisted:

- Provide structured inputs and reusable templates for approved product concepts, design directions, storefront copy, prices, and ad hypotheses.
- Validate file dimensions, resolution, transparency, color profile, printable area, and variant coverage.
- Assemble a storefront draft from reusable components and niche-specific configuration.

Manual:

- The operator uses external AI tools where useful and supplies the selected creative and brand inputs.
- The operator chooses or rejects concepts and checks that the work is actually relevant to the community.
- The operator checks trademarks, copyright risk, prohibited content, factual claims, and provider/ad-platform policies.
- The operator inspects product mockups and approves the exact immutable design and copy versions.
- A physical sample is optional for the first test, although the operator may require one before meaningful scale or for a materially new garment/print configuration.

Gate: only approved versions can be attached to an experiment.

### 3. Experiment definition

Automated:

- Provide a form for the operator to define products, prices, Meta audience, creatives, attribution settings, budget, duration, minimum data requirements, stopping rules, and observation window.
- Estimate unit economics and reject a configuration whose maximum plausible margin cannot support the test.
- Run readiness checks for domain routing, checkout, payment, fulfillment mapping, policies, analytics events, consent, inventory/availability, and mobile rendering.

Manual:

- The operator approves the spend ceiling and test schedule.
- The operator approves the exact storefront, offer, audience, creatives, and stopping rules.
- The operator performs a final end-to-end test order before the first live experiment and after material checkout or fulfillment changes.

Gate: approval freezes an `ExperimentVersion`. Publication or spending against an unapproved version is forbidden.

### 4. Launch

System-assisted after approval:

- Prepare the storefront configuration and expose a deliberate publish control.
- Create or update provider products and verify variant mappings.
- Generate deterministic tracking parameters and record the Meta campaign identifiers configured by the operator.
- Verify the live landing page and analytics events.

Manual:

- The operator publishes the storefront and creates, schedules, activates, and pauses Meta campaigns.
- If an external platform materially changes, rejects, or expands the approved setup, the experiment returns to review rather than accepting the change silently.

### 5. Running the test

Automated:

- Ingest ad spend, storefront events, orders, payment fees, taxes, fulfillment charges, refunds, replacements, and shipping costs.
- Reconcile webhook events with periodic provider polling so missed events are detected.
- Update a live operational dashboard and send exception alerts.
- Create urgent reminders when the budget ceiling, tracking failure, broken checkout, unavailable fulfillment, policy rejection, or a predefined catastrophic-loss rule needs operator action.
- Record the operator's response and the data that triggered the reminder.

Manual:

- The operator handles customer questions, cancellations, returns, replacements, and escalated delivery problems.
- The operator investigates alerts, operates the campaign, and decides whether a stopped experiment can resume.
- The operator does not optimize creatives, pricing, audience, or landing pages inside the frozen test. A desired change creates an `iterate` decision and a new experiment version.

### 6. Close and reconcile

Automated:

- Create an urgent close reminder when the approved time or spend limit is reached.
- Enter the observation window and continue ingesting late conversions and costs.
- Reconcile orders, provider charges, refunds, and ad invoices.
- Flag missing or conflicting costs; do not silently substitute zero.
- Mark analysis ready only when required data is complete or an authorized operator accepts documented data limitations.

Manual:

- An operator resolves reconciliation exceptions and records unavoidable uncertainty.
- Finance or the owner periodically verifies provider statements against the internal ledger.

### 7. Evaluate and decide

Automated:

- Calculate contribution profit, contribution margin, acquisition cost, conversion rate, refund/replacement rate, and confidence/data-quality indicators.
- Compare a challenger with the weakest eligible champion using the same normalized decision window and cost policy.
- Produce a recommendation with the evidence and threshold that caused it.

Manual:

- The operator chooses `promoted`, `iterate`, or `retired` and records rationale.
- Promotion or champion retirement is never executed only from an AI recommendation.
- A human may override the recommendation, but must record why so the policy can be improved later.

### 8. Apply the decision and retain learning

System-assisted after approval:

- For promotion, prepare the champion assignment and next configurable budget tier for the operator.
- For iteration, copy selected inputs into a new draft while preserving lineage.
- For retirement, preserve orders, assets, events, and analysis while reminding the operator to unpublish customer access and stop future spend.
- Provide the evidence and structured fields for the operator to record successes, failures, and unresolved hypotheses for later experiments.

Manual:

- An operator approves any increased budget tier.
- The owner periodically reviews whether the scoring and promotion rules still reflect business goals.

## Automation boundary

The system should automate background data work when the action is repeatable, observable, reversible, and bounded by an approved policy. Examples are validating assets, synchronizing providers, collecting events, calculating metrics, tracking deadlines, creating reminders, and preparing comparisons.

The system should require the operator when an action creates financial exposure, changes a public storefront or campaign, affects a customer, carries legal or reputational risk, requires subjective community judgment, or makes an exception to policy. This includes niche acceptance, rights and content approval, publication, campaign operation, refunds, budget changes, champion replacement, and unresolved customer disputes.

AI output is never itself an approval. The platform should let the operator attach relevant AI-derived inputs and outputs to an experiment without trying to capture or automate every external AI conversation.

## Failure and exception policy

- Provider calls must be idempotent where possible and safe to retry.
- Webhooks are authenticated, stored before processing, and deduplicated.
- No failed external action advances workflow state.
- A partial launch triggers an urgent operator alert with the required recovery actions, such as pausing ads or unpublishing a broken product.
- The operator configures Meta's own budget limit, while internal monitoring supplies an additional reminder. Ad platforms can report with delay and may overspend slightly.
- Missing cost data blocks final profit classification unless a human accepts a documented conservative estimate.
- Secrets and provider permissions follow least privilege; production actions are audit logged.

## Recommended implementation sequence

1. Define the experiment states, approvals, ledger, and one-niche data model.
2. Build one multi-tenant storefront path with manual catalog entry and a test checkout.
3. Integrate the selected print provider and complete a test fulfillment/refund lifecycle using one consistent US fulfillment route.
4. Integrate Meta reporting and capture deterministic campaign attribution plus spend while campaign operation remains manual.
5. Calculate order-level and experiment-level contribution profit with reconciliation flags.
6. Build the operator approval and decision screens around the complete loop.
7. Add reminders and safe background synchronization one step at a time, automating operational actions only if repeated use proves it worthwhile.
8. Add champion/challenger scheduling only after several manually supervised experiments expose the real operating rules.

## Decisions still needed before implementation

The following answers materially change the architecture or operating workflow:

1. Which print-on-demand provider and exact US product/fulfillment route best meet the quality, cost, delivery, reliability, branding, returns, and Shopify integration requirements?
2. How will SvelteKit use Shopify: a headless Storefront API implementation with Shopify Checkout, or a Shopify-hosted storefront with SvelteKit limited to the operator application?
3. What is the first product assortment, including garment models, colors, sizes, print placements, and pricing policy?
4. Is attribution based on first-party last-click, Meta-reported results, or both shown separately without pretending they are identical?
5. Which reminders are merely informational, which are urgent, and which require acknowledgement before workflow can continue?
6. What customer-support promise will be offered for response time, cancellations, returns, provider-caused delays, replacements, and chargebacks?
7. What precisely qualifies a challenger to replace a champion: total contribution profit, profit per dollar or day, minimum sample requirements, or another configurable policy?
8. Which storefront design properties are configuration, which reusable layout variants are allowed, and when does a brand require new code?
9. What privacy/consent tooling and retention policy will cover Shopify, Meta Pixel/Conversions API, and the operator dashboard?

## Deliberately deferred

The following should not be designed in detail until the first loop supplies evidence:

- A fully autonomous niche-research agent.
- Multiple fulfillment or advertising providers.
- A data warehouse or bespoke machine-learning ranking system.
- Automatic champion replacement.
- A generalized visual page builder.
- Twenty simultaneous stores and weekly batch orchestration.
- Complex role-based approval separation for a one-person operation.
