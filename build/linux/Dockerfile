# Builder image for the Bigphant Linux .deb.
#
# Ubuntu 22.04 LTS -> webkit2gtk 4.0 (libwebkit2gtk-4.0-37 at runtime).
# Switch the base to ubuntu:24.04 and the dev/runtime libs to the 4.1
# variants if you are targeting 24.04 instead.
#
# This image is a *builder*: it compiles the Wails binary. Packaging the
# .deb is done in a `docker run` step with a bind mount (see build-deb.sh)
# so artifacts land on the host without baking them into the image.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential pkg-config ca-certificates curl git \
      libgtk-3-dev libwebkit2gtk-4.0-dev \
    && rm -rf /var/lib/apt/lists/*

# Go toolchain
ENV GO_VERSION=1.23.4
RUN curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz | tar -C /usr/local -xz
ENV PATH=/usr/local/go/bin:/root/go/bin:$PATH

# Node, for the frontend build that `wails build` invokes
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Wails CLI + nfpm packager
RUN go install github.com/wailsapp/wails/v2/cmd/wails@latest && \
    go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest

WORKDIR /src
COPY . .

# Build the Linux binary into build/bin/bigphant.
# The .deb is packaged separately (bind-mounted /out) by build-deb.sh.
RUN wails build -platform linux/amd64
