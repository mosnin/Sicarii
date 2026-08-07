# Production image for the Scalar voice agent worker.
#
# Build context is this directory (agents/voice), not the repo root: the worker
# shares no code with the Next.js app on purpose, so it should not be able to
# accidentally import it.
#
#   docker build -t scalar-voice-agent agents/voice
#
# Debian slim rather than Alpine: @livekit/rtc-node and the Silero VAD binding
# are native modules shipped as glibc prebuilds, and musl sends you into
# building them from source for no benefit.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# ── Build ───────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Bake the model weights (Silero VAD, the turn detector) into the image. Without
# this the first call on every fresh container pays a cold download while
# somebody is already on the line.
RUN node dist/agent.js download-files

# The worker holds a long lived WebSocket and forks a child process per job. It
# never needs to write to its own filesystem at runtime.
USER node

# `start` is the production mode of the LiveKit agents CLI: register with the
# server, keep the socket up through its reconnect loop, accept dispatched jobs.
CMD ["node", "dist/agent.js", "start"]
