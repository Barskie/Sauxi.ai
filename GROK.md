# Sauxi.ai integration guide

Sauxi.ai is a local Node.js application for combining an avatar identity with an image pose/scene reference or a motion-reference video. Siray is the primary generation provider. OpenAI analysis is optional.

## Download and install

Download the release ZIP, extract it, and run:

```powershell
npm install
npm start
```

The app listens on `http://127.0.0.1:4318`. Image Studio is at `/` and Video Studio is at `/video`.

Requirements:

- Node.js 22 or newer
- A Siray API key for image or video generation
- Optional OpenAI API key for automated reference analysis
- Optional yt-dlp for importing Pinterest, Instagram, Facebook, or X post links
- Optional FFmpeg for merging social-video audio and trimming Wan motion references

On Windows, yt-dlp may be placed at `tools/yt-dlp.exe`. Otherwise, yt-dlp and FFmpeg should be available on `PATH`.

## Security

Never commit provider keys. Enter keys in the local app or provide `SIRAY_API_KEY` and `OPENAI_API_KEY` as process environment variables. Keys remain in server memory and are cleared when the process stops.

Reference images and videos are sent to the provider selected by the user only after an explicit generation action. OpenAI-mode image safety fallback may send the same references to Siray when Siray is connected.

## Important source files

- `server.mjs` — HTTP server, session keys, image jobs, and routes
- `Avatar Studio.html` — Image Studio interface
- `Video Studio.html` — Video Studio interface
- `video.mjs` — Siray video model integration and job handling
- `social-video.mjs` — public social-post video importer
- `image-import.mjs` — direct public image URL importer
- `tests/` — API, UI, import, model, and duplicate-request coverage

## Provider behavior

- Image generation defaults to Siray Seedream 5.0 Pro Spicy.
- Video generation supports the Siray models shown in Video Studio.
- OpenAI image and frame analysis is optional and defaults to the lower-cost Standard mode.
- Paid generation requires an intentional button action and confirmation in the app.
- Image jobs allow three concurrent tasks; video jobs allow two.

## Validation

```powershell
npm test
```

The release ZIP is built from committed Git files, so runtime folders, API keys, dependencies, logs, saved results, and downloaded tools are excluded.

