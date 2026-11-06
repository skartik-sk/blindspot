# Custom domain

Main site: **useblindspot.xyz**. `www.useblindspot.xyz` and **useblindspot.in** point to it. The site is GitHub Pages
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

For `useblindspot.in`, use the registrar's URL forwarding: a permanent (301) redirect to `https://useblindspot.xyz/`.

Check it from a terminal:

```sh
dig +short useblindspot.xyz A        # the four 185.199.x.153 addresses
dig +short www.useblindspot.xyz      # skartik-sk.github.io. then the same addresses
```

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

## Optional: relay at api.useblindspot.xyz (not done)

**Steps:**
1. Add an A record `api` → the relay server's IP.
2. Add a Caddy site block for `api.useblindspot.xyz` that proxies to the relay, the same way the sslip.io block does.
3. Rebuild the site with `VITE_RELAY_URL=https://api.useblindspot.xyz`.
4. Redeploy, and keep the sslip.io name working for a while.

**Risks:**
- It's a server and Caddy change on a machine shared with another team's service, and a reload is required.
- If certificate issuance fails, the app can't reach the relay at all.
- An installed PWA keeps the old relay URL until it updates.
- The gain is cosmetic. Not worth doing hours before judging.
