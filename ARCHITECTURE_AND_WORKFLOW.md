# Shirt Darwin Architecture and Operating Workflow

Status: discovery draft; unresolved decisions are listed at the end.

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

The proposed system has one shared platform with two surfaces:

- The customer storefront renders niche-specific branding, copy, catalog, and tracking according to the request's subdomain.
- The operator console manages research, approvals, experiment state, products, creatives, budgets, orders, exceptions, and decisions.

Behind those surfaces are five logical parts:

1. The experiment controller enforces state transitions, approval gates, frozen test settings, and the champion/challenger rules.
2. The commerce core owns niches, storefront configuration, products, prices, customers, orders, refunds, and cost records.
3. Provider adapters communicate with print-on-demand, payments or commerce, advertising, analytics, tax, email, and AI services.
4. Background workers handle provider synchronization, webhook processing, asset generation, metric refreshes, alerts, and retries.
5. The evidence store retains research notes, prompts, generated assets, approvals, raw events, calculated metrics, and decision rationale.

These can begin as modules in one deployable application with one relational database, one job runner, and object storage. They should not begin as independently deployed microservices.

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

Automated:

- Collect candidate ideas from approved sources and existing experiment history.
- Build a research packet containing audience signals, likely product angles, seasonality, competition, estimated ad reach, known sensitivities, and initial trademark or phrase-risk checks.
- Score completeness and flag claims that lack a source.

Manual:

- An operator reviews source quality and community fit.
- An operator rejects unsafe, exploitative, highly sensitive, or legally questionable niches.
- An operator selects a niche and records the reason for testing it.

Gate: an approved niche brief, named owner, and initial risk assessment are required before production.

### 2. Offer, design, and storefront production

Automated:

- Propose product concepts, design directions, storefront copy, prices, and ad hypotheses from the approved brief.
- Generate production candidates and mockups.
- Validate file dimensions, resolution, transparency, color profile, printable area, and variant coverage.
- Assemble a storefront draft from reusable components and niche-specific configuration.

Manual:

- A creative reviewer chooses or rejects concepts and checks that the work is actually relevant to the community.
- A reviewer checks trademarks, copyright risk, prohibited content, factual claims, and provider/ad-platform policies.
- A reviewer inspects physical-product mockups and approves the exact immutable design and copy versions.
- Before meaningful scale, a human orders and approves a physical sample for each materially new garment/print configuration. Whether the first low-budget test requires that sample remains an open policy decision.

Gate: only approved versions can be attached to an experiment.

### 3. Experiment definition

Automated:

- Create a proposed test package: products, prices, ad channel, audience, creatives, attribution settings, budget, duration, minimum data requirements, stopping rules, and observation window.
- Estimate unit economics and reject a configuration whose maximum plausible margin cannot support the test.
- Run readiness checks for domain routing, checkout, payment, fulfillment mapping, policies, analytics events, consent, inventory/availability, and mobile rendering.

Manual:

- An operator approves the spend ceiling and test schedule.
- An operator approves the exact storefront, offer, audience, creatives, and stopping rules.
- An operator performs a final end-to-end test order before the first live experiment and after material checkout or fulfillment changes.

Gate: approval freezes an `ExperimentVersion`. Publication or spending against an unapproved version is forbidden.

### 4. Launch

Automated after approval:

- Publish the storefront configuration to its subdomain.
- Create or update provider products and verify variant mappings.
- Create paused ad campaigns with deterministic tracking parameters.
- Verify the live landing page and analytics events.
- At the scheduled time, activate the approved campaign and begin budget monitoring.

Manual:

- A human explicitly authorizes the first public launch and first activation of ad spend.
- If an external platform materially changes, rejects, or expands the approved setup, the experiment returns to review rather than accepting the change silently.

### 5. Running the test

Automated:

- Ingest ad spend, storefront events, orders, payment fees, taxes, fulfillment charges, refunds, replacements, and shipping costs.
- Reconcile webhook events with periodic provider polling so missed events are detected.
- Update a live operational dashboard and send exception alerts.
- Pause spend at the hard budget ceiling, on tracking failure, broken checkout, unavailable fulfillment, policy rejection, or a predefined catastrophic-loss rule.
- Record every automated pause and the data that triggered it.

Manual:

- Customer support handles questions, cancellations, returns, replacements, and escalated delivery problems.
- An operator investigates alerts and decides whether a stopped experiment can resume.
- The operator does not optimize creatives, pricing, audience, or landing pages inside the frozen test. A desired change creates an `iterate` decision and a new experiment version.

### 6. Close and reconcile

Automated:

- Pause campaigns when the approved time or spend limit is reached.
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

- A human chooses `promoted`, `iterate`, or `retired` and records rationale.
- Promotion or champion retirement is never executed only from an AI recommendation.
- A human may override the recommendation, but must record why so the policy can be improved later.

### 8. Apply the decision and retain learning

Automated after approval:

- For promotion, assign the approved champion slot and its next budget tier.
- For iteration, copy selected inputs into a new draft while preserving lineage.
- For retirement, unpublish customer access and stop future spend without deleting orders, assets, events, or analysis.
- Summarize observed successes, failures, and unresolved hypotheses into the research history used by later experiments.

Manual:

- An operator approves any increased budget tier.
- The owner periodically reviews whether the scoring and promotion rules still reflect business goals.

## Automation boundary

The system should automate work when the action is repeatable, observable, reversible, and bounded by an approved policy. Examples are assembling drafts, validating assets, synchronizing providers, publishing already approved versions, collecting events, calculating metrics, pausing at a hard ceiling, and preparing recommendations.

The system should require a person when an action creates open-ended financial exposure, legal or reputational risk, irreversible public impact, subjective community judgment, or an exception to policy. This includes niche acceptance, rights and content approval, first publication, new spend approval, recommendation overrides, champion replacement, and unresolved customer disputes.

AI output is never itself an approval. AI actions and recommendations must store the model/provider, prompt or instruction version, inputs, output, timestamp, and human disposition when a gate is involved.

## Failure and exception policy

- Provider calls must be idempotent where possible and safe to retry.
- Webhooks are authenticated, stored before processing, and deduplicated.
- No failed external action advances workflow state.
- A partial launch triggers a compensating action, such as pausing ads or unpublishing a broken product, plus an operator alert.
- The hard spend ceiling is enforced using both platform budget settings and internal monitoring, while acknowledging that ad platforms can report with delay and may overspend slightly.
- Missing cost data blocks final profit classification unless a human accepts a documented conservative estimate.
- Secrets and provider permissions follow least privilege; production actions are audit logged.

## Recommended implementation sequence

1. Define the experiment states, approvals, ledger, and one-niche data model.
2. Build one multi-tenant storefront path with manual catalog entry and a test checkout.
3. Integrate one print provider and complete a test fulfillment/refund lifecycle.
4. Integrate one ad channel and capture deterministic campaign attribution plus spend.
5. Calculate order-level and experiment-level contribution profit with reconciliation flags.
6. Build the operator approval and decision screens around the complete loop.
7. Automate draft creation, provider setup, scheduled launches, pausing, and recommendations one step at a time.
8. Add champion/challenger scheduling only after several manually supervised experiments expose the real operating rules.

## Decisions needed before implementation

The following answers materially change the architecture or operating workflow:

1. Is the commerce foundation a hosted platform such as Shopify, a custom storefront/checkout, or undecided? Who should own payments, tax calculation, customer accounts, and order administration?
2. Is Printify the initial fulfillment provider, and has its product catalog/quality been accepted? Which countries must the first experiment sell and ship to?
3. Which single paid acquisition channel should the first loop support? Is attribution platform-reported, first-party last-click, or another defined model?
4. What is the initial product scope: one garment/one color, one garment with variants, or multiple product types? Must a physical sample be approved before any paid test?
5. Who are the initial human roles? Can one founder hold all approvals, or must creative/legal, spending, customer support, and finance approvals be separated?
6. Which decisions may the system execute without a click? In particular, may it pause ads automatically, publish an already approved launch on schedule, issue refunds below a limit, or move a champion to a pre-approved budget tier?
7. What are the first test's budget, duration, attribution delay, refund observation window, and catastrophic-loss stopping rule?
8. What precisely qualifies a challenger to replace a champion: higher total contribution profit, higher contribution profit per dollar/day, a minimum statistical threshold, or a policy still to be designed?
9. Does each niche need a genuinely distinct brand and domain experience, or is a shared visual system with configurable logo/colors/copy sufficient for the first phase?
10. What customer-support promise will be offered, and who handles provider-caused delays, replacements, returns, and chargebacks?
11. Are there approved data sources for community research? May the system ingest public social/community content, or should research be manually supplied at first?
12. Are there fixed technology, hosting, budget, privacy, or compliance constraints that are not yet captured in the repository?

## Deliberately deferred

The following should not be designed in detail until the first loop supplies evidence:

- A fully autonomous niche-research agent.
- Multiple fulfillment or advertising providers.
- A data warehouse or bespoke machine-learning ranking system.
- Automatic champion replacement.
- A generalized visual page builder.
- Twenty simultaneous stores and weekly batch orchestration.
- Complex role-based approval separation for a one-person operation.

