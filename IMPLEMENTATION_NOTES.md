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

**No 3D Secure; auto-capture configuration left off.** Both were available on the
Authorize payment block. 3DS adds an authentication step not required for a sandbox
card payment, and would be a requirement rather than an option in the UK and Germany,
both of which are SCA jurisdictions and both of which are Buy More growth markets — so
I would enable and test it per market rather than globally.

With auto-capture configuration off, payments reach `AUTHORIZED` and are not captured,
confirmed by observing the payment status in both dashboards after a successful test.
For a retailer that is often the desired behaviour, since capture usually belongs at
dispatch rather than checkout. It is a decision to make deliberately rather than a
default to inherit.

**Workflow action version updates deferred.** The workflow editor offered an optional
version bump on the Primer Payments actions. Taking a version change partway through a
build, on a deadline, adds an unknown for no benefit. Noted and left.

**Least-privilege API key — intended, not achieved.** I selected `client_tokens:write`
and `transactions:read` when attempting to create a key, reasoning that a leaked key
with those scopes could create checkout sessions and read payment status but could not
refund or capture money. The Dashboard would not create the key (see below), so the
prototype runs on a key Primer supplied, whose scopes I do not know. Primer's Drop-in
documentation also lists `transactions:authorize`, which I would include. Confirming the
scopes on a working key is outstanding.

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

## Access problems, and a diagnosis I got partly wrong

Requests to `POST https://api.sandbox.primer.io/client-session` returned
`403 SecurityPolicyBlock`, with response headers showing `server: CloudFront` and
`x-cache: Error from cloudfront` — the rejection came from the CDN, not from Primer's
application. Separately, creating an API key in the Dashboard failed, with the dialog
reporting that no permission was selected when permissions were selected.

How I narrowed it:

1. Reproduced via `curl` directly against the API, bypassing my application — same
   result, so my code was not involved.
2. Sent a well-formed key, an invalid key, and no key — identical responses each time.
3. Reproduced on home broadband and on a mobile hotspot — different IPs and networks,
   identical response, so not local to my connection.

Steps 1 and 3 were sound and their conclusions held. Step 2 is where I went wrong. I
reasoned that identical responses across all three key states meant authentication was
never being evaluated, because an authentication failure returns 401. Primer then
supplied a working API key, and the same request succeeded immediately.

So authentication *was* being evaluated — at the edge, returning 403 rather than the
401 I expected. My test was reasonable; my inference from it was not. I had no valid
key to compare against, which is precisely the comparison that would have falsified it,
and I treated an absence of evidence as evidence.

What I would do differently: treat a 403 from a CDN as a possible authentication
outcome rather than assuming 401 is the only signal, and state the conclusion as a
hypothesis with a named test that would disprove it, rather than as a finding.

The Dashboard key creation failure remains unresolved and is still worth investigating,
since a merchant's team would hit it on day one.

One diagnostic I identified but did not need: Primer's sandbox provisions a test
processor by default, and routing the workflow to it would isolate whether a payment
failure sits in the Braintree connection or upstream. Unnecessary here, since the 
requests were failing authentication rather than processing.

## Dashboard observations

Two places where the Dashboard held stale state, both resolved by forcing a change
rather than by anything being genuinely misconfigured:

- The workflow publish blocker counter did not clear after binding accounts to the
  action blocks. The panel's Save button only activates when something is dirty, so the
  bindings were staged but never committed. Toggling an unrelated field and back made
  Save active; saving committed the bindings and the blockers cleared.
- The API key creation dialog's validation message persisted regardless of checkbox
  state (unresolved — see above).

## What I would do next

In rough priority order:

1. Webhooks. The client session carries an `orderId`, and payment status updates arrive
   via webhook. Any real store needs this: the browser closing mid-payment must not
   mean the order is lost.
2. Persist orders server-side. Currently there is no record of an order beyond the
   payment itself.
3. Fallback processor. The Authorize payment block supports one directly. With a single
   processor per store today, a processor outage in a market is an outage for that
   market's store.
4. A second payment method, to demonstrate that the cost is configuration and routing
   rather than a client-side rebuild.
5. Currency-based routing, which is directly relevant to consolidating separate
   regional stores while retaining per-market behaviour.

## Questions for Primer

- The Dashboard would not let me create an API key — the permission validation failed
  regardless of what was selected. The `SecurityPolicyBlock` resolved once a key was
  supplied, but key creation itself is still broken. Is this specific to my sandbox?
- For a merchant consolidating several market-specific PSP integrations, what does a
  typical migration sequence look like — market by market, or payment method by
  payment method? What tends to go wrong?
- How do teams manage workflow versioning in production? The action version updates I
  deferred would be a real change-management question on a live workflow.
- How much of the routing logic do merchants typically drive from client session
  metadata versus dashboard conditions, and where is the practical boundary?
