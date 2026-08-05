# Shirt Darwin

Shirt Darwin is an experiment-driven print-on-demand business. It uses AI as a creative and analytical tool while one human operator discovers niche communities, creates relevant T-shirt designs, tests them with paid traffic, and invests in the ideas that produce real profit.

## The model

One shared platform powers many niche storefronts. Each niche gets its own branded subdomain, visual identity, copy, products, and designs:

```text
birdwatching.example.com
climbers.example.com
woodworkers.example.com
```

The storefronts are built from a shared SvelteKit foundation, but configurable styling and reusable layout options allow each one to feel like a distinct brand. They share Shopify commerce, fulfillment integration, analytics, and operating tools. The print-on-demand provider is deliberately undecided until the available providers have been evaluated for product quality, US fulfillment, cost, reliability, branding options, and Shopify integration.

The long-term operating model keeps twenty storefronts live at a time: 10 proven champions and 10 new challengers. The system will be built and validated with one complete storefront and experiment before scaling to that cadence.

## Initial market

The first launch market is the contiguous United States and Washington, DC. The initial storefronts use English, USD pricing, and one consistent US fulfillment route. Alaska, Hawaii, US territories, and international destinations remain disabled until their shipping costs and delivery experience have been evaluated.

The platform remains global-ready through explicit market configuration and country-level economics, but markets are enabled deliberately. Canada, the United Kingdom, Australia/New Zealand, and individual European markets can be evaluated after the US workflow is proven.

Restricting the first experiments to one market keeps Meta ad performance, pricing, production cost, shipping time, refunds, and contribution profit comparable between niches.

## Platform

- SvelteKit provides the shared storefront foundation and the central operator application.
- Shopify owns products, checkout, payments, customers, and orders.
- A print-on-demand provider fulfills Shopify orders; the provider has not been selected yet.
- Meta is the first and only paid advertising channel.
- The applications run on the operator's personal VPS and are deployed through Coolify.
- The general domain exposes the required public legal pages and a private admin login.
- Each niche storefront is selected by its domain or subdomain and rendered from versioned brand, layout, copy, catalog, and tracking configuration.

The private dashboard is the operational home for active storefronts, experiment setup, reminders, Shopify orders and economics, Meta results, fulfillment status, comparisons, and recorded decisions. Shopify remains the commerce system of record; the Shirt Darwin database stores experiment definitions, normalized metrics, workflow state, reminders, and decision history.

## Automation philosophy

The first version is intentionally manual-first. It should coordinate work, preserve data, calculate results, and make the next action obvious—not automate every task that can be performed by asking an AI.

The operator manually:

- researches and selects niches;
- uses whichever AI tools are appropriate to brainstorm designs, copy, and brand direction;
- provides approved inputs to the website-building workflow;
- reviews storefronts and products;
- configures and operates Meta campaigns;
- handles customer and fulfillment exceptions;
- decides whether to promote, iterate, or retire an experiment.

The platform automatically:

- synchronizes the Shopify, Meta, and fulfillment data needed by the dashboard;
- attributes orders and costs to experiments;
- calculates contribution profit and comparison metrics;
- tracks workflow status and preserves prior experiment versions;
- creates reminders for missing work, experiment deadlines, budget checks, unresolved orders, and decision reviews;
- alerts the operator when data is missing or an operational threshold is reached.

Publication, ad spending, refunds, budget changes, and promotion or retirement decisions remain manual. Automation can be added later only when repeated operation shows that it removes meaningful work without hiding judgment or creating uncontrolled risk.

## The loop

1. Research communities and select promising niches.
2. Create their designs, Meta ads, and branded storefronts.
3. Configure each challenger with a defined test period and budget.
4. Measure sales, costs, refunds, and contribution profit.
5. Promote challengers that clearly outperform the weakest champions.
6. Retire displaced champions and unsuccessful challengers without deleting their data.
7. Repeat manually with one challenger at first, then adopt the 10-challenger weekly cadence when the workflow is proven.

Champions are not replaced unless a challenger clearly performs better. The system uses every result to improve the next week's niche, design, pricing, copy, and advertising decisions.

## Decision metric

Experiments are judged by contribution profit, not revenue alone:

```text
revenue
- production and shipping
- payment and platform fees
- taxes
- refunds and replacements
- advertising spend
= contribution profit
```

## Principles

- AI is used interactively by the operator rather than embedded everywhere as unattended automation.
- One human operator approves and performs consequential actions.
- Every experiment has a fixed budget and a clear stopping rule.
- Niches earn more investment through evidence, not intuition.
- Designs must respect trademarks, copyright, and community norms.
- Customer experience and product quality remain consistent across storefronts.
- Failed tests produce reusable knowledge rather than silent deletion.

## Initial goal

Build the complete operating workflow around one SvelteKit niche storefront backed by Shopify: launch its initial products through the selected print-on-demand provider, attribute Meta-driven purchases, and calculate true contribution profit in the central dashboard. The operator must be able to run the workflow manually from one place and receive useful reminders before automation or multi-store scaling is added.

The detailed discovery draft is maintained in [ARCHITECTURE_AND_WORKFLOW.md](ARCHITECTURE_AND_WORKFLOW.md).
