#!/bin/sh
# First start: write the config and the KPS key (kept in volumes). Then advertise PUBLIC_IP if given, and run.
set -e
CFG=/root/.config/tor-js-gateway/config.json5
[ -f "$CFG" ] || tor-js-gateway init
if [ -n "$PUBLIC_IP" ]; then
  sed -i "s|\"advertised_addresses\": \[[^]]*\]|\"advertised_addresses\": [\"$PUBLIC_IP\"]|" "$CFG"
fi
exec tor-js-gateway
