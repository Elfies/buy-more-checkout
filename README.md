# Buy More — Primer checkout prototype

A minimal single-store checkout built on Primer Universal Checkout (Drop-in), with
Braintree as the processor. Built as part of the Primer Solutions Engineer assessment.

The goal is not a complete storefront. It is the smallest realistic flow that
demonstrates a card payment orchestrated through Primer: a shopper adds items to a
cart, checks out, and sees a clear outcome whether the payment succeeds or fails.

## Current status

Complete and working end to end. A card payment has been processed successfully
through Primer to Braintree in AUD, verified in both the Primer and Braintree
dashboards, and a declined payment has been verified through the same path.

Payments are created with status `AUTHORIZED` — funds are reserved but not captured.
This is the current behaviour with auto-capture configuration left off, and is a
reasonable default for a retailer, where capture typically happens at dispatch rather
than at checkout.

Note on access: the sandbox API returned `403 SecurityPolicyBlock` from CloudFront for
all requests until Primer supplied a working API key, and creating an API key through
the Dashboard still fails. See `IMPLEMENTATION_NOTES.md`.

## What works

- Product catalogue served from the backend
- Cart with quantities and a running total, priced in AUD
- Client session request built server-side from the server's own catalogue
- Drop-in mounted on a successful client session
- Success and failure result states
- Shopper country selection across Buy More's five markets, validated server-side
- Graceful handling when the client session request fails

## Running it locally

Requires Node.js 24 LTS.

```bash
npm install
```

Create a `.env` file in the project root:

```
PRIMER_API_KEY=your_sandbox_api_key
```

`.env` is gitignored and must never be committed.

```bash
node server.js
```

Then open http://localhost:3000

## Primer configuration

Configured in the Primer sandbox Dashboard before any code was written, so that the
payment path existed before the application tried to use it.

| Area | Setting |
|---|---|
| Processor | Braintree (sandbox), merchant account `primer`, AUD |
| Payment methods | Card only — PayPal and Klarna deactivated |
| Workflow | "Accept all card payments", published |
| Workflow routing | Payment created → Authorize payment (Braintree / AUD) → Continue payment flow |
| 3D Secure | Not enabled |
| API key | Supplied by Primer after Dashboard key creation failed; scopes unknown. Drop-in docs list `client_tokens:write` and `transactions:authorize`. |

Shopper country is selected at checkout from Buy More's five markets (AU, GB, DE, SG,
US) and validated server-side against a fixed allowlist. Currency remains AUD
throughout — an Australian retailer selling cross-border in AUD is a realistic model,
and supporting further currencies would require additional merchant accounts.

## Project structure

```
server.js            Express server, product endpoint, client session endpoint
products.js          Hardcoded product catalogue (prices in minor units)
public/index.html    Storefront, cart, country selector, Drop-in mount, result states
.env                 API key (gitignored, never committed)
.env.example         Template showing required variables, with blank values
.gitignore           Excludes .env and node_modules
IMPLEMENTATION_NOTES.md   Decisions, reasoning, and what I would do next    
```

## Testing

| Case | Expected | Status |
|---|---|---|
| Successful card payment | Confirmation with order reference; payment visible in Primer and Braintree | Verified |
| Declined card (A$2,000 triggers a Braintree sandbox decline) | Failure message, no charge, retry available | Verified |
| Empty cart | Checkout blocked before any Primer call | Verified |
| Unknown product ID posted directly | Rejected server-side | Verified |
| Unsupported shopper country | Rejected server-side | Verified |
| Client session failure | Generic error shown, full detail logged server-side | Verified |

Braintree's sandbox determines transaction success by amount rather than card number,
so the decline case uses a A$2,000 order rather than a specific test card.
