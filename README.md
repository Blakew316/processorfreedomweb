# Processor Freedom Sites

A branded website and online ordering builder for Processor Freedom merchants. A merchant chooses a website or
an online ordering website, types their business name, picks a template, uploads their item list, and publishes with one click.

## What is in it

- **Two kinds of site**: a website, or an online ordering website. Ordering can be switched on or off later.
- **One-step setup**: the merchant types a business name (the web address fills in as they type) and lands in the editor on a
  Get started checklist. New sites are online ordering sites; the other templates remain in the code for later.
- **Nine templates**: restaurant, café, retail, salon, professional services, home services, fitness, auto repair, and a simple start. Each ships with written content.
- **Editor with live preview**: quick styles (Clean, Soft, Bold), brand colour, page background, header layout and colour, a
  background for any section, footer layout and colour, typeface, corners, announcement bar. The preview shows true phone and tablet frames. Add, reorder, hide and edit sections. Click any section in the preview to edit it. Desktop, tablet and phone views.
- **Images**: logo, hero, item and gallery uploads, resized in the browser before upload.
- **Policies written automatically**: privacy policy, terms of service, store policies and accessibility statement, generated from the business details and editable.
- **SEO**: title, description, keywords, sharing image, sitemap, robots file and business structured data.
- **Domains**: a free address, a checker with live rules, connecting a domain the merchant owns (DNS check included), or a request for Processor Freedom to set one up.
- **Publishing**: draft and live versions are separate. Publish, republish, unpublish. QR code and share links once live.
- **Inbox**: messages from each site's contact form.
- **Menu and inventory**: upload an Excel (.xlsx, .xls) or CSV file of items (a template is provided) and the menu is built from it. Item names and prices are
  required; category, description, stock and photo link are optional. Column order and header names are flexible, and files without
  a header row work too. Each item can have a photo, be hidden, or have its stock counted down to sold out.
- **Online ordering**: pickup, curbside and delivery, each with its own settings (ready time, instructions, delivery fee, minimum and
  area), sales tax, tips and order notes. Customers get an order page with a cart and a status page that updates as the order moves.
- **Items (inventory)**: a full-width list with search, filters and totals. Clicking an item opens a pop-up editor for its photo,
  name, price, sale, category, description, quantity, tax, availability and options. Tick several items to change tax, visibility,
  quantity, sale, price or category together, or delete them. Every item has a numeric quantity; items imported without one get
  a starting quantity the merchant chooses (100 by default).
- **Item options**: sizes, add-ons and choices per item, required or optional, single or multiple, each with its own extra charge.
- **Opening hours and ordering ahead**: per-day ordering hours in the business's time zone, and optional scheduled pickup or delivery times.
- **Promo codes**: percent or dollar-off codes applied at checkout.
- **Orders**: new orders appear in the builder and refresh on their own, with a chime and browser notification. Confirm, mark ready,
  complete or cancel, print a kitchen ticket, or open the large-type kitchen screen at `/app/site/<id>/kitchen`.
- **Sales**: a full-width report for today, yesterday, this week, this month, the last 30 days or custom dates, in the business's
  time zone. Net sales, orders, average order, sales tax collected (taxable and non-taxable sales), delivery fees, tips, total
  collected, sales by hour or day, pickup/curbside/delivery split, item and category sales, and the orders behind the numbers.
  Exports to CSV and prints. Cancelled orders are listed but not counted.
- **Spanish**: a site language switch that translates the built-in words on merchant sites.
- **Editor extras**: undo and redo, drag to reorder menu items.
- **Menu categories**: rename, reorder, hide, or limit a category to certain hours (breakfast until 11).
- **Delivery zones**: optional ZIP-code zones, each with its own fee; other ZIP codes are refused.
- **Loyalty**: every Nth order by the same email earns a one-time reward code for the next order.
- **Notifications on the device**: the builder installs as an app and can send new-order notifications when it is closed.
  Keys are generated on first start and stored with the data; nothing to configure.
- **Version history**: the last 20 published versions can be restored.
- **Bulk photos**: upload many photos at once; they are matched to items by file name.
- **Light and dark**: the builder is light by default, with a switch in the top bar (Light, Dark or Auto in the account menu).
  Merchant sites carry their own light/dark switch for visitors, which the merchant can turn off.
- **Password reset**: by email when email is configured, or by a one-time link staff create from the staff dashboard.
- **Order emails**: the customer is emailed when the order is received, confirmed, ready or cancelled; the business is emailed for
  every new order. Requires `RESEND_API_KEY` and `EMAIL_FROM`.
- **Staff tools** at `/app/admin`: totals, every site, and domain requests with one-step attach.

## Run it

Requires Node 22.13 or newer. There are no dependencies to install.

```
npm start        # http://localhost:3000
npm test
```

Data (a SQLite database and uploaded images) is stored in `DATA_DIR`, `./data` by default.

The builder rides out restarts: requests retry for a few seconds, and page loads during an update show a short waiting page
instead of an error.

## Deploy

**Render**: open https://render.com/deploy?repo=https://github.com/Blakew316/processorfreedomweb and approve. `render.yaml` creates the
service and a persistent disk with nothing to fill in. It comes up working at its `onrender.com` address, with merchant sites at
`/s/theirname/`. Add `SITES_DOMAIN`, `APP_URL`, `ADMIN_EMAILS` and the email settings in the dashboard when you are ready.

**Anywhere else**: `docker build -t pf-sites . && docker run -p 3000:3000 -v pf-data:/data pf-sites`

Behind your own proxy or load balancer (anywhere but Render), set `TRUST_PROXY` so the attempt limits see each visitor's real address
and links use the right host. Without it, the forwarding headers a browser can make up (`X-Forwarded-For`, `CF-Connecting-IP`,
`X-Forwarded-Host`, `X-Forwarded-Proto`) are ignored. On Render this is automatic.

- `TRUST_PROXY=1`: one proxy in front (nginx, a load balancer). It must add the visitor's address to the end of `X-Forwarded-For`.
- `TRUST_PROXY=2` (or 3…): that many proxies in front, each adding to `X-Forwarded-For`.
- `TRUST_PROXY=cloudflare`: Cloudflare directly in front; its `CF-Connecting-IP` is used.

Set `APP_URL` too, so password reset and other emailed links always use your address.

### Domain setup

1. Pick a domain for customer sites, for example `pfsites.com`, and set `SITES_DOMAIN=pfsites.com`.
2. Point both `pfsites.com` and the wildcard `*.pfsites.com` at the service, and add both as custom domains at your host so certificates are issued.
3. Set `APP_URL=https://pfsites.com`. The builder lives there; each merchant gets `theirname.pfsites.com`.

Without `SITES_DOMAIN`, sites are served at `/s/theirname/`, which is handy for local use and trials.

Merchant-owned domains are verified by DNS and then served by hostname. The host still has to issue a certificate for
each one. On Render, set `RENDER_API_KEY` and `RENDER_SERVICE_ID` and verified domains are attached automatically.

See `.env.example` for every setting.

## How it is put together

| Path | Purpose |
| --- | --- |
| `shared/core.js` | Templates, design options, validation, policy text. Runs on the server and in the browser. |
| `shared/render.js` | Turns a site into HTML. The preview and the published site use this same code. |
| `shared/order.js` | The order page, cart and order status page. |
| `server/mail.js` | Order emails. |
| `server/sms.js` | Two-step sign-in codes by text message (Twilio). |
| `server/apns.js` | New-order notifications to the iPhone app (Apple push). |
| `server/app.js` | Accounts, API, uploads, and serving published sites by hostname or path. |
| `public/` | The builder interface. Plain JavaScript modules, no build step. |
| `ios/` | The PF Sites iPhone app (SwiftUI). See `ios/README.md` to build and sign it. |
| `test/` | Unit tests and a full sign-up-to-publish flow. |

Typography uses the system font stack, which is San Francisco and New York on Apple devices and the closest
system face elsewhere. Apple does not license those fonts for embedding on the web.

Icons are from [Ionicons](https://ionic.io/ionicons) (MIT licence), stored in `shared/icons.js`.

## Not included yet

- Card payment inside checkout. Orders are paid on receipt, or through the merchant's Processor Freedom payment link shown after ordering.
- Text-message alerts for new orders, and a built-in stock photo library.
- Contact-form notifications by email. Order emails are English only.
- Billing for the builder itself.

## Back office and website

The editor has two separate sides, switched at the top:

- **Back office** — orders, sales, customers, messages, menu, items, order settings and team. No site preview; this is for running the business.
- **Website** — look and feel, home page, business info, web address, policies, search and history, beside a live preview.

Also in the back office: daily refill per item, happy-hour prices, a cap on orders per 15 minutes, a customer list with export,
team logins (kitchen or manager), low-stock alerts and a morning summary email. Menu scanning from a photo or PDF appears when
`ANTHROPIC_API_KEY` is set.

## iPhone app

`ios/` holds the PF Sites iPhone app (SwiftUI, Xcode 27.2, iOS 26 or later); `ios/README.md` explains how to build and sign it.
It talks to the routes under `/api/app/`. Two-step codes by text message need the `TWILIO_*` settings and `APP_URL`, and
new-order notifications on the iPhone need the `APNS_*` settings; see `.env.example`. Keys go in Render's Environment page.
