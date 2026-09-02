# Part B: API Discovery & Aura Response Interception

During Part B (Lead conversion flow), one of the key tasks was verifying the backend interaction triggered when clicking the **Convert** button on the UI.

Here are the notes on how the API was discovered, how it works under the hood, and how it is handled in the automation framework.

---

## 1. Why standard REST APIs couldn't be used here

When converting a Lead in Salesforce Lightning, the browser doesn't call the standard REST API (`/services/data/vXX.0/sobjects/...`). Lightning Experience is built on Salesforce's proprietary Aura/LWC component framework, which routes UI transactions through an internal RPC batch endpoint: `/aura`.

Because of this, we couldn't just intercept a clean REST URL. We had to inspect and parse the actual Aura traffic.

---

## 2. How the API was discovered in DevTools

To find the endpoint:

1. Opened a Lead record in Chrome DevTools with the **Network** tab recording.
2. Filtered by `aura` or `Fetch/XHR`.
3. Clicked **Convert**, selected Account/Contact/Opportunity options in the modal, and hit the final **Convert** button.
4. DevTools showed multiple POST requests sent to `/aura?r=...`.

### The challenge: Multiplexed requests
Salesforce sends almost all component events, telemetry, and actions to the exact same `/aura` URL. Matching by URL alone doesn't work.

To find the right request, we inspected the POST body (`postData`). Inside the JSON payload, the conversion call carries this controller descriptor:

```
serviceComponent://ui.lead.runtime.components.controllers.LeadConvertDesktopController/ACTION$convertLeadServer
```

The action name is **`convertLeadServer`**. The request params include the `leadId`, new record definitions (`newAccountRecord`, `newContactRecord`, `newOpportunityRecord`), and flags like `convertedStatus: "Closed - Converted"`.

---

## 3. Response quirks & findings

Looking at the raw response from `convertLeadServer`, there were two main quirks to solve:

### 1. The `while(1);` prefix (XSSI Defense)
The raw response body returned by Salesforce doesn't start with valid JSON. It starts with:

```javascript
while(1);
{"actions":[{"id":"1441;a","state":"SUCCESS","returnValue":{...}}]}
```

This is a classic Cross-Site Script Inclusion (XSSI) guard. If another site tries to include this endpoint via a `<script>` tag to steal sensitive data, the browser gets stuck in an infinite loop instead of exposing the JSON object.

Before passing the response to `JSON.parse()`, our code strips the `while(1);` prefix.

### 2. The HTTP 200 trap (Silent failures)
Salesforce Aura returns `HTTP 200` even when the conversion fails (for example, if duplicate rules block it, or a required validation rule fails).

Because of this, checking `response.ok()` or status 200 is useless for asserting success. Instead, the test checks:
- `envelope.actions[0].state === 'SUCCESS'`
- `returnValue.hasError === false`

### 3. Converted IDs in `returnValue`
When successful, the `returnValue` object contains the generated 18-character Salesforce IDs:
- `opportunityId` (starts with `006`)
- `accountId` (starts with `001`)
- `contactId` (starts with `003`)

These IDs are extracted and used to schedule cleanup and cross-check the database.