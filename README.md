# Buy More — Primer checkout prototype

A minimal single-store checkout built on Primer Universal Checkout (Drop-in), with
Braintree as the processor. Built as part of the Primer Solutions Engineer assessment.

The goal is not a complete storefront. It is the smallest realistic flow that
demonstrates a card payment orchestrated through Primer: a shopper adds items to a
cart, checks out, and sees a clear outcome whether the payment succeeds or fails.

## Current status

The integration is complete and the storefront works end to end locally. **Payments
cannot currently be completed** because requests to Primer's sandbox API are being
rejected at the network edge before authentication:

```
POST https://api.sandbox.primer.io/client-session
→ HTTP 403  {"error":{"errorId":"SecurityPolicyBlock", ...}}
   server: CloudFront
```

The same response is returned with a well-formed API key, an invalid key, and no key
at all, and was reproduced on two separate networks. Creating an API key in the Primer
Dashboard also fails, with the dialog reporting that no permission is selected when
permissions are in fact selected. Both failures look like account or policy
configuration rather than credentials. This has been raised with Primer, including
CloudFront request IDs.

See `IMPLEMENTATION_NOTES.md` for the full diagnostic trail.

Everything downstream of obtaining a client token is built but has not been exercised
against a live payment. That is stated plainly rather than glossed over: an untested
payment path is not a working payment path.

## What works

- Product catalogue served from the backend
- Cart with quantities and a running total, priced in AUD
- Client session request built server-side from the server's own catalogue
- Drop-in mounted on a successful client session
- Success and failure result states
- Graceful handling when the client session request fails (currently exercised by the
  403 above)

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
| API key scopes | `client_tokens:write`, `transactions:read` (`transactions:authorize` also required per Drop-in docs) |

## Project structure

```
server.js          Express server, product endpoint, client session endpoint
products.js        Hardcoded product catalogue (prices in minor units)
public/index.html  Storefront, cart, Drop-in mount point, result states
.env               API key (gitignored)
```

## Testing

Once API access is restored, the intended test matrix is:

| Case | Expected |
|---|---|
| Successful card payment | Confirmation with order reference; payment visible in Primer Dashboard and Braintree |
| Declined card | Failure message, no charge, shopper able to retry |
| Empty cart | Checkout blocked before any Primer call |
| Unknown product ID posted directly | Rejected server-side |
| Client session failure | Generic error shown, full detail logged server-side |

Cases 3, 4 and 5 have been verified. Cases 1 and 2 are blocked.
