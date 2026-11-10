# Live-class video preview

When a staff member schedules a new class, the form creates a 36-second,
muted square preview before the class is submitted. It uses the selected class,
subject, chapter, chapter agenda/instructions, and up to eight optional photos.
Each video contains exactly eight visual scenes: every selected photo is included,
then locally rendered lesson cards fill the remaining scenes. The agenda/photo
sequence is shuffled, so “Generate another version” looks different.

The admin browser renders the presentation directly to a 160 x 160 canvas and
records it at 10 FPS. No intermediate frames are stored. The resulting video is
normally WebM/VP9; Safari may generate MP4 when WebM recording is unavailable.
It is uploaded via the `content-api` Cloudflare Worker's `PUT /thumbnail` route
(see `C:\tmp\free-online-tutor\content-api`), which verifies the staff member's
Firebase ID token and writes to the `scholo-content` R2 bucket as one object:

```
thumbnails/classes/{meetingId}.webm
```

or, on the Safari fallback:

```
thumbnails/classes/{meetingId}.mp4
```

It is then served publicly from `https://content.scholo.co.in/thumbnails/classes/{meetingId}.{webm|mp4}`
(the same CDN custom domain already used for syllabus content), with no
separate download-URL step. The meeting stores that public URL and measured
video metadata in `livePreview`. Original selected photos remain local when
the generated preview is used, so the learner app needs only the final video.
The legacy `liveImages` flow (Firebase Storage, `live-class/{meetingId}/{slot}.webp`)
remains available for meetings that do not use a generated preview.

## Learner app contract

Use `meeting.livePreview` only while the meeting is live (`date <= now <= endAt`).
Render a muted, inline, looping `<video>` with `playsinline`, and fall back to
the regular `imageSrc` if the field is absent, the video fails to load, or the
viewer prefers reduced motion. Do not autoplay more than the cards currently
visible on screen.

If the card needs a slower, calmer feel without creating a larger upload, set
the video element's `playbackRate` after its metadata has loaded. Use `0.75` as
the default; do not go below `0.5` for a live-card loop.

The preview is intentionally temporary: thumbnails under `thumbnails/classes/`
are deleted manually (no automatic expiry/lifecycle rule or cron job). If
previews should persist, add an explicit retention/versioning scheme rather
than relying on same-name overwrite.

## Upload authorization

The `content-api` Worker's `PUT /thumbnail` route requires a valid Firebase
ID token for a user whose Firestore `users/{uid}.role` is `admin` or `teacher`
(checked via an authenticated Firestore REST read using that same token — no
separate service-account credential). It also enforces the 500 KB cap and
`video/webm`/`video/mp4` content type server-side, deliberately above the
expected roughly 80–150 KB output while still protecting the bucket from large
uploads.

## MP4 compatibility

The browser can create one format locally. Chrome/Edge produce WebM; Safari can
fall back to MP4. Creating both formats for every class requires a server-side
encoder (for example FFmpeg), which is not present in this frontend-only repo.
