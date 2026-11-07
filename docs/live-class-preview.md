# Live-class video preview

When a staff member schedules a new class, the form creates a nine-second,
muted square preview before the class is submitted. It uses the selected class,
subject, chapter, chapter agenda/instructions, and up to eight optional photos.

The admin browser renders the presentation directly to a 160 x 160 canvas and
records it at 10 FPS. No intermediate frames are stored. The resulting video is
normally WebM/VP9; Safari may generate MP4 when WebM recording is unavailable.
It is uploaded as one file:

```
live-class/{meetingId}/preview.webm
```

or, on the Safari fallback:

```
live-class/{meetingId}/preview.mp4
```

The meeting stores its public URL and measured video metadata in `livePreview`.
Original selected photos remain local when the generated preview is used, so the
learner app needs only the final video. The legacy `liveImages` flow remains
available for meetings that do not use a generated preview.

## Learner app contract

Use `meeting.livePreview` only while the meeting is live (`date <= now <= endAt`).
Render a muted, inline, looping `<video>` with `playsinline`, and fall back to
the regular `imageSrc` if the field is absent, the video fails to load, or the
viewer prefers reduced motion. Do not autoplay more than the cards currently
visible on screen.

The preview is intentionally temporary: it lives under `live-class/`, which may
already have a one-day storage lifecycle policy. If previews should remain after
the live session, move them to a permanent storage prefix and update the rules
and lifecycle policy accordingly.

## Storage deployment

`storage.rules` must be deployed for staff to upload `preview.webm`/`preview.mp4`.
The rule permits videos under 500 KB, which is deliberately above the expected
roughly 80–150 KB output while still protecting the bucket from large uploads.

## MP4 compatibility

The browser can create one format locally. Chrome/Edge produce WebM; Safari can
fall back to MP4. Creating both formats for every class requires a server-side
encoder (for example FFmpeg), which is not present in this frontend-only repo.
