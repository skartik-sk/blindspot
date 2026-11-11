# EF's tor-js gateway (Arti + KPS), built from a pinned commit. Needs ~4 GB RAM to compile.
FROM rust:1.91-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config libssl-dev libsqlite3-dev clang cmake git && rm -rf /var/lib/apt/lists/*
ARG TOR_JS_REF=main
RUN git clone https://github.com/ethereum/tor-js /src && cd /src && git checkout "$TOR_JS_REF"
RUN cargo install --locked --path /src/crates/tor-js-gateway --root /out

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 libsqlite3-0 && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/bin/tor-js-gateway /usr/local/bin/
# `init` writes the config and the KPS key once (kept in the volume); the address it prints is what clients dial.
COPY tor-gateway-start.sh /usr/local/bin/start
CMD ["start"]
EXPOSE 12298/udp
