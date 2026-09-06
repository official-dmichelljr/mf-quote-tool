# Quote Tool deployment workflow

GitHub is the source of truth for the hosted Quote Tool. Do not use a direct
Cloudflare upload for routine releases.

## Versioning rules

1. Every code change receives the next sequential version number.
2. Save the complete release under `versions/` using the name
   `moving_forward_quote_tool_v##.html`.
3. Copy the same release content to the repository-root `index.html` because
   that is the production entry point.
4. Update `_worker.js` and add a numbered SQL migration when the backend changes.
5. Never commit the administrator PIN, API credentials, `.env` files, or local
   Cloudflare development data.

## Publishing rules

1. Create a release branch, such as `quote-tool-v19`.
2. Commit and push the branch to GitHub.
3. Test Cloudflare's preview deployment on desktop and a mobile viewport.
4. Merge the verified branch into `main`.
5. Confirm the production deployment succeeds and that `/api/pricing` returns
   live shared pricing.

Cloudflare Pages automatically publishes new commits on `main`. Administrator
pricing updates are written directly to D1 and do not require a Git deployment.
