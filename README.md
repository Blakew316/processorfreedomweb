# Processor Freedom Sites

A branded website builder for Processor Freedom merchants. A merchant types their business name,
picks a template, adjusts the design and content with a live preview, and publishes with one click.

## What is in it

- **Guided setup**: business name (the web address fills in as you type), template, colour and typeface, contact details.
- **Nine templates**: restaurant, café, retail, salon, professional services, home services, fitness, auto repair, and a simple start. Each ships with written content.
- **Editor with live preview**: brand, logo, colour, light or dark, typeface, corners, header, announcement bar, footer. Add, reorder, hide and edit sections. Click any section in the preview to edit it. Desktop, tablet and phone views.
- **Images**: logo, hero, item and gallery uploads, resized in the browser before upload.
- **Policies written automatically**: privacy policy, terms of service, store policies and accessibility statement, generated from the business details and editable.
- **SEO**: title, description, keywords, sharing image, sitemap, robots file and business structured data.
- **Domains**: a free address, a checker with live rules, connecting a domain the merchant owns (DNS check included), or a request for Processor Freedom to set one up.
- **Publishing**: draft and live versions are separate. Publish, republish, unpublish. QR code and share links once live.
- **Inbox**: messages from each site's contact form.
- **Staff tools** at `/app/admin`: totals, every site, and domain requests with one-step attach.

## Run it

Requires Node 22.13 or newer. There are no dependencies to install.

```
npm start        # http://localhost:3000
npm test
```

Data (a SQLite database and uploaded images) is stored in `DATA_DIR`, `./data` by default.

## Deploy

**Render**: New → Blueprint → select this repository. `render.yaml` creates the service and a persistent disk.
Then set `SITES_DOMAIN`, `APP_URL` and `ADMIN_EMAILS`.

**Anywhere else**: `docker build -t pf-sites . && docker run -p 3000:3000 -v pf-data:/data pf-sites`

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
| `server/app.js` | Accounts, API, uploads, and serving published sites by hostname or path. |
| `public/` | The builder interface. Plain JavaScript modules, no build step. |
| `test/` | Unit tests and a full sign-up-to-publish flow. |

Typography uses the system font stack, which is San Francisco and New York on Apple devices and the closest
system face elsewhere. Apple does not license those fonts for embedding on the web.

## Not included yet

- Password reset and lead notifications by email (both need an email provider).
- Online ordering and checkout. Sites link to a Processor Freedom payment page instead.
- Billing for the builder itself.
