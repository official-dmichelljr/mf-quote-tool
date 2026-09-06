# Moving Forward Quote Tool

Internal quote calculator for Moving Forward dispatchers.

## Deployment

Cloudflare Pages deploys this repository automatically. The `main` branch is
production, and `index.html` is the active page. Read
[`DEPLOYMENT_WORKFLOW.md`](DEPLOYMENT_WORKFLOW.md) before publishing changes.

Vehicle pricing is stored in Cloudflare D1. The administrator PIN is stored as
the encrypted Cloudflare secret `ADMIN_PIN` and must never be committed.
