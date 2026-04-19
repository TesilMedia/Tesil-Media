# Tesil Media

A Twitch / YouTube–style streaming site for **VOD and live streams**, powered by the [Tesil Video Player](https://github.com/TesilMedia/Tesil-Video-Player).

Built with **Next.js 15** (App Router), **Prisma + SQLite**, **Auth.js v5**, and **Tailwind CSS**. Runs entirely on your machine for local testing — no cloud services required.

## Features (v1)

- **Home** — Live now + Recommended video grids
- **Watch page** — embeds the Tesil Video Player (supports direct `mp4/webm/hls`, YouTube, Vimeo, Twitch)
- **Live page** — same player with a live badge + viewer count
- **Channel pages** — banner, avatar, bio, video list, live-now badge
- **Auth** — sign up, sign in, sign out (email + password, hashed with bcrypt)
- **Upload** — signed-in users can upload videos (mp4/webm/mkv/mov/m4v/ogv/ogg up to 500 MB) with an optional thumbnail; files are stored on disk at `public/uploads/`
- **Profile dashboard** (`/me`) — edit channel info (name, description, avatar, banner) and manage your uploads (edit title/description/category/thumbnail, delete)
- **Categories** — videos and live streams belong to a fixed set of categories (Gaming, Music, Tech, Film & Animation, Sports, News & Politics, Education, Comedy, Entertainment, Vlogs, Ambient, Art & Design, Other). Browse any at `/category/<slug>`
- **Search** — searches channel names / video titles / descriptions, and matches category aliases ("games" → gaming, etc.)

The Tesil Video Player source lives in `public/video-player/` so you can customize it directly.

## Quick start

### 1. Install

```bash
npm install
```

### 2. Initialize the local database

SQLite file is created at `prisma/dev.db`.

```bash
npm run db:push
npm run db:seed
```

### 3. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>.

Other devices on your local network can reach the site at the **Network** URL that Next.js prints (e.g. `http://192.168.1.x:3000`) — that's your "local server for the PC to test" setup.

### Demo login

```
email:    becknerd@tesil.media
password: password123
```

## Project layout

```
.
├── prisma/
│   ├── schema.prisma          # User, Channel, Video, LiveStream (+ Auth.js tables)
│   └── seed.ts                # Demo channels, videos, and live streams
├── public/
│   └── video-player/          # Copy of the Tesil Video Player (vanilla JS + HTML + CSS)
│       ├── embed.html         # Minimal player shell (this is what Watch/Live pages iframe)
│       ├── player.js
│       ├── styles.css
│       └── icons/
└── src/
    ├── app/
    │   ├── layout.tsx         # Root layout (TopNav + Sidebar)
    │   ├── page.tsx           # Home
    │   ├── watch/[id]/page.tsx    # VOD watch page
    │   ├── live/[slug]/page.tsx   # Live page
    │   ├── c/[slug]/page.tsx      # Channel page
    │   ├── signin/ signup/        # Auth pages
    │   ├── search/page.tsx
    │   └── api/
    │       ├── auth/[...nextauth]/route.ts  # Auth.js handler
    │       └── signup/route.ts              # Custom sign-up endpoint
    ├── components/
    │   ├── TopNav.tsx
    │   ├── Sidebar.tsx
    │   ├── VideoCard.tsx
    │   ├── LiveCard.tsx
    │   └── VideoPlayer.tsx    # <iframe src="/video-player/embed.html?src=..."/>
    └── lib/
        ├── prisma.ts
        ├── auth.ts
        └── format.ts
```

## How the player is integrated

The site embeds the player with a tiny React wrapper:

```tsx
<VideoPlayer src={video.sourceUrl} />
```

which renders:

```html
<iframe src="/video-player/embed.html?src=<url>" allow="fullscreen; picture-in-picture" />
```

Because the player is copied into `public/video-player/`, you can edit it directly — change styles, add buttons, wire up events — and it will ship with the site.

## Data model

All content URLs (VOD `sourceUrl` and live `streamUrl`) are just strings. The player accepts:

- Direct files: `.mp4`, `.webm`, `.mkv`, `.mov`, `.m4v`, `.ogv`, `.ogg`, `.avi`, `.3gp`, `.3g2`
- HLS: `.m3u8` (works well for live)
- YouTube (`watch?v=`, `youtu.be`, `shorts`, `live`, embed)
- Vimeo
- Twitch (VODs, live channels, clips)

So "going live" in this MVP is just: `LiveStream { isLive: true, streamUrl: "..." }` with any of the above. A real RTMP ingest server (Nginx-RTMP, Mux, LiveKit, etc.) is a later step.

## Scripts

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Dev server at <http://localhost:3000>     |
| `npm run build`      | Production build                          |
| `npm run start`      | Run the production build                  |
| `npm run db:push`    | Sync Prisma schema to SQLite              |
| `npm run db:seed`    | Reset & reseed the DB with demo content   |
| `npm run db:migrate-categories` | One-shot: coerce legacy free-text `category` values to canonical slugs (non-destructive) |
| `npm run db:studio`  | Open Prisma Studio (DB browser)           |
| `npm run lint`       | ESLint                                    |

## Environment

Copy `.env.example` to `.env` and adjust:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<32+ random chars>"
NEXTAUTH_URL="http://localhost:3000"
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Uploads

Every signed-in user gets their own channel (auto-created on sign up). Click
**Upload** in the top-right of any page:

1. Enter a title, optional description + category.
2. Pick a video file (mp4, webm, mkv, mov, m4v, ogv, ogg — up to 500 MB).
3. Optionally pick a thumbnail image.
4. You'll be redirected to the new watch page as soon as the upload finishes.

Uploaded files are saved to `public/uploads/videos/` and thumbnails to
`public/uploads/thumbnails/`, keyed by a UUID that is also stored on the
`Video.sourceUrl` / `Video.thumbnail` fields. These directories are git-ignored
so your test content never gets committed. For production you'd swap this for
S3 / R2 / Supabase Storage and a streaming multipart parser.

## Roadmap

- [ ] Swap local disk for S3 / R2 + streaming multipart + transcoding (HLS)
- [ ] Real live ingest (RTMP → HLS, via Nginx-RTMP or Mux/LiveKit/Cloudflare Stream)
- [ ] Live chat (WebSocket)
- [ ] Comments + likes
- [ ] Follow / subscriptions
- [ ] Creator dashboard
- [ ] OAuth providers (Google / GitHub)
- [ ] Switch SQLite → Postgres for deploy

## License

Same license as the Tesil Video Player (MIT-style; update as needed).
