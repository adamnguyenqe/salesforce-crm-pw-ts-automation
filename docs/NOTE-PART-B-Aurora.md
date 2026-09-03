# Aura Interception Notes: Lead Convert

Observed 2026-09-02 on `orgfarm-f2434b94ef-dev-ed` (Winter '26). Working out what the **Convert** button actually calls, so the test can assert on the backend response instead of just the UI.

### No REST endpoint to intercept

When converting a Lead in Salesforce Lightning, the browser doesn't call the standard REST API (`/services/data/vXX.0/sobjects/...`). Lightning Experience is built on Salesforce's proprietary Aura/LWC component framework, which routes UI transactions through an internal RPC batch endpoint: `/aura`.

Because of this, I couldn't just intercept a clean REST URL. I had to inspect and parse the actual Aura traffic.

### Finding it in DevTools

1. Opened a Lead record in Chrome DevTools with the **Network** tab recording.
2. Filtered by `aura` or `Fetch/XHR`.
3. Clicked **Convert**, selected Account/Contact/Opportunity options in the modal, and hit the final **Convert** button.
4. DevTools showed multiple POST requests sent to `/aura?r=...`.

**Everything is multiplexed onto one URL.** Salesforce sends almost all component events, telemetry, and actions to the exact same `/aura` URL. Matching by URL alone doesn't work.

To find the right request, I inspected the POST body (`postData`). Inside the JSON payload, the conversion call carries this controller descriptor:

```
serviceComponent://ui.lead.runtime.components.controllers.LeadConvertDesktopController/ACTION$convertLeadServer
```

The action name is **`convertLeadServer`**. The request params include the `leadId`, new record definitions (`newAccountRecord`, `newContactRecord`, `newOpportunityRecord`), and flags like `convertedStatus: "Closed - Converted"`.

### Three quirks in the response

**1. The `while(1);` prefix (XSSI defence).**
The raw response body returned by Salesforce doesn't start with valid JSON. It starts with:

```javascript
while(1);
{"actions":[{"id":"1441;a","state":"SUCCESS","returnValue":{...}}]}
```

This is a classic Cross-Site Script Inclusion (XSSI) guard. If another site tries to include this endpoint via a `<script>` tag to steal sensitive data, the browser gets stuck in an infinite loop instead of exposing the JSON object.

Before passing the response to `JSON.parse()`, my code strips the `while(1);` prefix.

**2. HTTP 200 on failure.** Salesforce Aura returns `HTTP 200` even when the conversion fails (for example, if duplicate rules block it, or a required validation rule fails).

Because of this, checking `response.ok()` or status 200 is useless for asserting success. Instead, the test checks:
- `envelope.actions[0].state === 'SUCCESS'`
- `returnValue.hasError === false`

**3. Converted IDs in `returnValue`.** When successful, the `returnValue` object contains the generated 18-character Salesforce IDs:
- `opportunityId` (starts with `006`)
- `accountId` (starts with `001`)
- `contactId` (starts with `003`)

These IDs are extracted and used to schedule cleanup and cross-check the database.

### What I tried first, and dropped

- Matching on the request URL alone (`**/aura*`). Useless — telemetry, component loads and the conversion all POST to the same path, so the route handler fired dozens of times per click.
- Matching on `?r=` sequence number. It increments per request but isn't stable across runs, so there's nothing to pin to.
- Waiting on the `/aura` response for the *first* Convert click. Wrong request: the first click only opens the modal. The conversion fires on the modal's own Convert button.

### Still open

- `convertLeadServer` is an internal controller descriptor, not a documented API. It could rename in any release — worth re-checking against the Network tab each Salesforce upgrade.
- Not yet tested what the envelope looks like when a duplicate rule *blocks* the convert vs. merely warns. Currently only the `hasError === false` success path is asserted.
