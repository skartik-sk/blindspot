# Custom domain

Site: **useblindspot.xyz** (`www.useblindspot.xyz` redirects to it). The site is GitHub Pages
(repo `skartik-sk/blindspot`, branch `gh-pages`).

## 1. DNS at the registrar (you)

For `useblindspot.xyz`:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | skartik-sk.github.io |

Check it from a terminal:

```sh
dig +short useblindspot.xyz A        # the four 185.199.x.153 addresses
dig +short www.useblindspot.xyz      # skartik-sk.github.io. then the same addresses
```

**Status (Nov 7, ~05:00 IST): live.** `https://useblindspot.xyz/` serves the app. HTTP, `www` and the old
`skartik-sk.github.io/blindspot/` all redirect to it with a 301. The Cloudflare records are Proxied (orange cloud), so
Cloudflare terminates HTTPS and fetches from GitHub. Lesson: don't point GitHub at the domain until Cloudflare's edge
certificate is issued. Before that, HTTPS failed the handshake and visitors landed on plain HTTP, where the app can't
run. Storage is per site, so a wallet made on the old github.io address stays there; move it with Send → Back up key,
then Import key.

## 2. Switch the site (only after step 1 resolves)

Do this in order. If you add the CNAME before DNS works, `skartik-sk.github.io/blindspot/` starts redirecting to a
domain that doesn't answer, and the site goes down.

1. Add `apps/web/public/CNAME` containing `useblindspot.xyz`.
2. Build with base `/`:
   `VITE_RELAY_URL=https://bina-relay.13-53-45-89.sslip.io bun run build -- --base /`
3. Publish `apps/web/dist` to `gh-pages`, keeping `.nojekyll`.
4. Set the domain:
   `gh api -X PUT repos/skartik-sk/blindspot/pages -f cname=useblindspot.xyz`
5. When GitHub has issued the certificate (`gh api repos/skartik-sk/blindspot/pages --jq .https_certificate.state`
   says `approved`), enforce HTTPS:
   `gh api -X PUT repos/skartik-sk/blindspot/pages -F https_enforced=true`
6. Check:
   - no `/blindspot/` or `/bina-pooche/` paths remain in `dist`;
   - `https://useblindspot.xyz/robots.txt` and `/sw.js` answer;
   - the app goes live on Nox.

The relay doesn't change: it allows any origin and serves only public, address-free data.

## Relay at api.useblindspot.xyz (done Nov 7)

- DNS: A `api` → `13.53.45.89`, **DNS only** (Caddy gets its own Let's Encrypt certificate, and Cloudflare stays out of
  the mixnet path).
- Caddy: `api.useblindspot.xyz` was added to the existing relay site block, next to the sslip.io name. Both names
  serve the same relay. Backup: `~/backups/Caddyfile.20261106-221623.pre-api.bak`. The config was validated, then
  reloaded (no restart, so the other service on the box was untouched).
- **The site still uses the sslip.io name.** Tested Nov 7: with `api.useblindspot.xyz`, blocks loaded, but every
  private lookup through Nox failed with `NoTunnelExitError: No exit offers TLS tunnels`, three times in a row. The
  same lookup through the sslip.io name worked (10.1 s), so we rolled back. A likely cause is mixnet exits caching
  the name as non-existent from before the record was added. Retry later; switching is one build variable.
