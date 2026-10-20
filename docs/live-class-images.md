# Live-class images

Admins/teachers can attach 1–4 images to a meeting (`global_meetings/{id}.liveImages: string[]`).
The student app combines/animates them client-side as the live-class thumbnail.
`imageSrc` is untouched and still used by the other app for its own purpose.

- Storage path: `live-class/{meetingId}/1.webp` … `4.webp` (fixed per meeting).
- Images are resized in the browser to ≤720px (long side) and encoded as WebP (aim <150 KB).
- Field is optional; legacy docs without it keep working. Treat `[]`/absent as "no images".

## 1. Lifecycle rule (apply yourself — not applied by the app)

Deletes objects under `live-class/` one day after creation (about a day of lag is normal).

`lifecycle.json`:

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 1, "matchesPrefix": ["live-class/"] }
    }
  ]
}
```

```bash
gcloud storage buckets update gs://authentication-785fd.firebasestorage.app --lifecycle-file=lifecycle.json
# or: gsutil lifecycle set lifecycle.json gs://authentication-785fd.firebasestorage.app
```

Caution: this **replaces** the bucket's whole lifecycle config. Check first with
`gcloud storage buckets describe gs://authentication-785fd.firebasestorage.app --format="default(lifecycle_config)"`
and merge any existing rules into the JSON.

Note: re-uploading to the same slot creates a new object, so its age restarts.

## 2. Storage rules

See [`storage.rules`](../storage.rules). Merge into the shared project's existing storage rules
(public read on `live-class/**`; write/delete only if `users/{uid}.role` is `admin` or `teacher`
via `firestore.get`; image content type; <500 KB). Not deployed. Firebase Storage rules need the
Storage→Firestore cross-service IAM grant, which the console adds on first deploy of rules using `firestore.get`.
Rules cannot restrict a teacher to their own meetings' folders without an extra Firestore lookup
(`global_meetings/{meetingId}.teacherId`); the admin UI enforces own-meetings scoping. To enforce it in rules too,
add `|| get(.../global_meetings/$(meetingId)).data.teacherId == request.auth.uid` logic in place of the plain teacher check.

## 3. Note for the other app's developer

Only show `liveImages` while the class is live: `date <= now <= endAt`
(the admin's `sessionState === 'live'`). Before the start and after the end, use the normal
thumbnail (`imageSrc`). Files may be deleted by the lifecycle rule ~1 day after upload, so an image URL can 404
for old meetings — always fall back gracefully. Order of the array is the intended animation order.
