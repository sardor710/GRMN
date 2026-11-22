# WhatsApp order alerts

When an order is **placed** at checkout, and again when it is **paid**, every staff number in
`WHATSAPP_NOTIFY_TO` gets a WhatsApp message from the store's business number, sent through Meta's
WhatsApp Cloud API.

## How it works

1. Checkout (`src/server/checkout/service.ts`) and payment capture (`src/server/payments/service.ts`)
   call `enqueueOrderAlerts` inside their transaction. It adds one job of kind
   `notifications.whatsapp.order` for each recipient, so a job exists only if the order change committed.
2. The outbox worker (`npm run worker`) sends each job as a template message
   (`src/server/notifications/whatsapp.ts`).
3. If Meta answers 429 or 5xx, or the network fails, the job is retried with backoff (up to 8 attempts).
   Any other 4xx (a bad token, an unknown template, a bad number) dead-letters the job, and the
   `last_error_code` column of `job_runs` shows why: `WHATSAPP_UNAUTHORIZED`, `WHATSAPP_REJECTED`,
   `WHATSAPP_NOT_CONFIGURED`.

Known limits:
- Messages go to **individual numbers**, not a WhatsApp group. Everyone on the list gets the same message.
- The Cloud API has no idempotency key. If Meta accepts a message but the response is lost, the retry
  can deliver it **twice**.
- A misconfigured `WHATSAPP_*` setup never blocks checkout. The app logs the bad field name and queues nothing.
- Orders placed before the variables were set get no alert.

## One-time setup in Meta

1. **Business account and app.** In [Meta for Developers](https://developers.facebook.com/), create
   a *Business* app and add the **WhatsApp** product. Connect your Meta Business portfolio (it must
   be verified before you can send at volume).
2. **Sender number.** In WhatsApp Manager, add the phone number that will send the alerts.
   It cannot be registered in the normal WhatsApp or WhatsApp Business phone app at the same time.
   Copy its **Phone number ID**, which goes in `WHATSAPP_PHONE_NUMBER_ID`.
3. **Permanent token.** In Business Settings → Users → **System users**, create a system user and
   assign it the app and the WhatsApp account. Generate a token with the `whatsapp_business_messaging`
   permission and no expiry. It goes in `WHATSAPP_ACCESS_TOKEN`. (The 24-hour token on the app's
   "API Setup" page is only good for a quick test.)
4. **Message template.** In WhatsApp Manager → Message templates, create:
   - Name: `order_alert`
   - Category: **Utility**
   - Language: English (`en`). Any language works if you set `WHATSAPP_TEMPLATE_LANG` to match.
   - Body, with exactly five variables in this order:

     ```
     {{1}}: order {{2}}, total {{3}}.
     Customer: {{4}}
     Items: {{5}}
     ```

   Example values for review: `New order`, `GRM-1000001`, `459 990 ₸`, `Aida K., +77011234567`,
   `1× fēnix 8 47 mm`. Wait until the template is **Approved**.
5. **Staff numbers.** Put them in `WHATSAPP_NOTIFY_TO`, comma-separated, in international format
   (`77011234567`; a leading `+` and spaces are fine). While the app is in development mode, each
   number must first be added as a test recipient on the "API Setup" page.

## Environment

Set these for **both** the Next.js app and the worker process:

| Variable | Required | Default |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | yes | |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | |
| `WHATSAPP_NOTIFY_TO` | yes (1–10 numbers) | |
| `WHATSAPP_TEMPLATE_NAME` | no | `order_alert` |
| `WHATSAPP_TEMPLATE_LANG` | no | `en` |
| `WHATSAPP_GRAPH_VERSION` | no | `v23.0` |

Leave all of them unset to turn alerts off.

## Cost

Meta charges per template message. Utility templates cost a few cents each, and the price depends
on the recipient's country. Each order sends `2 × number of recipients` messages: one when it is
placed and one when it is paid.
