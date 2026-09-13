# Implementation notes

Decisions taken while building the Buy More checkout prototype, why they were taken,
and what was deliberately left out.

## Approach

I configured the payment path in the Primer Dashboard first — processor connection,
payment method, workflow — and only then wrote application code. The reasoning: the
application's only job is to create a client session and hand a token to the SDK.
Everything about how a payment is actually routed and authorized lives in
configuration. Writing code first would have meant debugging two unknowns at once.

Scope was kept deliberately narrow: one store, one currency, one payment method, one
processor, guest checkout, no persistence. Each of those is a place where the
prototype could have grown without demonstrating anything new.

## Decisions

**Currency: AUD, set at Braintree signup.** Braintree defaults a sandbox's business
location to the country you sign up from, and the default merchant account gets that
region's currency. Signing up from Portugal would have produced a EUR account while
the prototype priced in AUD. That mismatch would not have failed at configuration
time — it would have surfaced later as a decline with no obvious cause. Selecting
Australia at signup produced an AUD merchant account that matches the Buy More
context.

**Prices stored in minor units.** `14900`, not `149.00`. Floating-point arithmetic on
currency accumulates rounding errors, and Primer's API expects minor units anyway, so
storing them this way means no conversion at the boundary. Division by 100 happens
only at display time.

**The server prices the order, not the browser.** The cart posts only product IDs and
quantities. The server looks up every price from its own catalogue and calculates the
total itself. If the amount came from the client, anyone could edit it in dev tools
and buy a A$149 item for one cent. Orchestration does not protect against this — it
remains the merchant's responsibility either way.

**Shopper country is selected at checkout and validated server-side.** The checkout 
offers Buy More's five markets (AU, GB, DE, SG, US) and the selection is passed to the 
client session as `countryCode`. The server validates it against a fixed allowlist 
before use — the same principle as pricing: anything crossing from the browser is 
untrusted. Country matters beyond the order record, since it is one of the inputs 
workflow routing conditions can read. Currency remains AUD throughout: supporting 
additional currencies would require merchant accounts per currency, and an Australian 
retailer selling cross-border in AUD is a realistic model.

**Card only; PayPal and Klarna deactivated.** Both were active by default in the
Checkout section. A payment method visible to a shopper but with no configured route
and no testing behind it is a liability, not a feature. They were switched off.

Worth noting what this made visible: both were one toggle away from appearing in the
checkout with no frontend change required. Adding a payment method here is dashboard
configuration plus workflow routing plus testing — not a new client-side integration
per method per store.

**No 3D Secure, no auto-capture configuration.** Both were available on the Authorize
payment block. 3DS adds an authentication step that is not required for a sandbox card
payment and would have complicated the demo. Auto-capture configuration was left off,
which is coherent with keeping the "Continue payment flow" block that signals the end
of the payment attempt. Both are scope decisions, not oversights.

**Workflow action version updates deferred.** The workflow editor offered an optional
version bump on the Primer Payments actions. Taking a version change partway through a
build, on a deadline, adds an unknown for no benefit. Noted and left.

**Least-privilege API key.** Scoped to `client_tokens:write` and `transactions:read`.
A leaked key with those scopes can create checkout sessions and read payment status —
it cannot refund or capture money. (Primer's Drop-in documentation also lists
`transactions:authorize`, which I would include on the working key.)

**Secrets never touch the repository.** `.gitignore` was committed as the first commit
in the repository, before any `.env` file existed, so there is no window in which a key
could have been committed. Braintree's credentials live only in the Primer Dashboard —
the application never sees them, which is itself a reduction in the merchant's exposure
surface.

**Single page rather than separate checkout page.** Clicking checkout reveals the
payment section rather than navigating. A separate page would require persisting the
cart across navigation, adding state management and failure modes without
demonstrating anything about Primer.

**Subresource Integrity on the Primer SDK.** The script tag carries the documented
`integrity` hash, so the browser verifies the file before executing it. Cheap to add on
a page that handles payment input.

**Web SDK v2 handles payment creation.** In v2, Universal Checkout creates and handles
the payment itself; the merchant does not call the Payments API. Manual payment
creation exists for backward compatibility and was not needed. This removed an entire
endpoint from the build.

**Errors: detailed server-side, generic client-side.** Primer's full error response is
logged on the server; the browser receives "we could not start the checkout". API error
detail should not be exposed to a page.

## The blocker

Requests to `POST https://api.sandbox.primer.io/client-session` return
`403 SecurityPolicyBlock`. The response headers show `server: CloudFront` and
`x-cache: Error from cloudfront`, meaning the request is rejected at the CDN edge
before reaching Primer's API.

How I isolated it:

1. Reproduced with an empty key, an invalid key, and a well-formed key — identical
   response each time. An authentication problem would return 401, and the error would
   differ between those cases. It did not, so authentication is not being evaluated.
2. Reproduced via `curl` directly against the API, ruling out the application code.
3. Reproduced on home broadband and on a mobile hotspot — different IPs, different
   networks, identical response. Not local.
4. Noted that API key creation in the Dashboard fails in a similar way: the form
   reports no permission selected when permissions are selected, across multiple scope
   combinations, key names, a hard refresh, and an incognito window.

Two security-policy-shaped failures on the same sandbox within the same hour is more
likely one cause than two. Escalated to Primer with CloudFront request IDs and
timestamps so the specific requests can be found in their logs.

One useful diagnostic I identified but did not need: Primer's sandbox provisions a
Primer test processor by default. Routing the workflow to it temporarily would isolate
whether a payment failure lies in the Braintree connection or upstream in the client
session. That bisection was unnecessary here, since the failure occurs before any
payment is created.

## Dashboard observations

Two places where the Dashboard held stale state, both resolved by forcing a change
rather than by anything being genuinely misconfigured:

- The workflow publish blocker counter did not clear after binding accounts to the
  action blocks. The panel's Save button only activates when something is dirty, so the
  bindings were staged but never committed. Toggling an unrelated field and back made
  Save active; saving committed the bindings and the blockers cleared.
- The API key creation dialog's validation message persisted regardless of checkbox
  state (unresolved — see above).

Neither is a complaint. Both are the kind of thing worth knowing when supporting a
customer through their first integration, because the surface symptom points away from
the real cause.

## What I would do next

In rough priority order:

1. Complete the test matrix in the README once API access is restored — successful
   payment and declined payment, verified in both the Primer and Braintree dashboards.
2. Webhooks. The client session carries an `orderId`, and payment status updates arrive
   via webhook. Any real store needs this: the browser closing mid-payment must not
   mean the order is lost.
3. Persist orders server-side. Currently there is no record of an order beyond the
   payment itself.
4. Fallback processor. The Authorize payment block supports one directly. With a single
   processor per store today, a processor outage in a market is an outage for that
   market's store.
5. A second payment method, to demonstrate that the cost is configuration and routing
   rather than a client-side rebuild.
6. Currency-based routing, which is directly relevant to consolidating separate
   regional stores while retaining per-market behaviour.

## Questions for Primer

- What is causing the `SecurityPolicyBlock` on this sandbox, and is it related to the
  API key creation failure?
- For a merchant consolidating several market-specific PSP integrations, what does a
  typical migration sequence look like — market by market, or payment method by
  payment method? What tends to go wrong?
- How do teams manage workflow versioning in production? The action version updates I
  deferred would be a real change-management question on a live workflow.
- How much of the routing logic do merchants typically drive from client session
  metadata versus dashboard conditions, and where is the practical boundary?
