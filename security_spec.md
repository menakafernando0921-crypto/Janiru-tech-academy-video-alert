# Security Specification — Janiru Tech Academy Video Alerts

## 1. Data Invariants
1. **Scheduled Post Confidentiality**: Messages with `publishAt > request.time.toMillis()` must NEVER be readable (`get` or `list`) by non-admin visitors.
2. **Admin-Only Broadcast Authority**: Only verified admins (`menakafernando0921@gmail.com` with `email_verified == true` or listed in `/admins/{uid}`) may create, edit, or delete messages, or publish scheduled posts early.
3. **Immutable Audit & Ownership**: `authorId` and `createdAt` on `/messages/{messageId}` are immutable after creation, and `createdAt` / `updatedAt` must equal `request.time`.
4. **Atomic Reaction Integrity**: Verified users may only toggle their own reaction document (`/messages/{messageId}/reactions/{uid}_{type}`) in an atomic batch that increments/decrements `likesCount` or `heartsCount` on the parent message by exactly `1`. They cannot modify `text`, `imageData`, `publishAt`, or jump counts by `> 1`.
5. **Atomic Follow Integrity**: Verified users may only create/delete `/channel/meta/followers/{uid}` in an atomic batch that increments/decrements `followersCount` on `/channel/meta` by exactly `1`.
6. **Payload Bounds**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), `text` is `<= 4000` chars, and `imageData` (when present) is `<= 450000` chars.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Message Creation**: Guest attempts `create` on `/messages/msg1` -> `PERMISSION_DENIED`.
2. **Non-Admin Message Creation**: Verified non-admin user attempts `create` on `/messages/msg1` -> `PERMISSION_DENIED`.
3. **Unverified Email Spoof**: User with `email == 'menakafernando0921@gmail.com'` and `email_verified == false` attempts `create` on `/messages/msg1` -> `PERMISSION_DENIED`.
4. **Scheduled Post Scraping**: Guest or non-admin attempts `get` or `list` without `publishAt <= now` filter on future scheduled message -> `PERMISSION_DENIED`.
5. **Shadow Ghost Field Injection**: Admin or user sends extra field `isOfficial: true` in `/messages/msg1` -> `PERMISSION_DENIED`.
6. **Reaction Count Inflation**: Non-admin user updates `likesCount` from `5` to `500` -> `PERMISSION_DENIED`.
7. **Orphaned Reaction Increment**: Non-admin user updates `likesCount` by `+1` without creating `/messages/{messageId}/reactions/{uid}_likes` in the same batch -> `PERMISSION_DENIED`.
8. **Cross-User Reaction Deletion**: User A attempts to delete `/messages/msg1/reactions/userB_likes` -> `PERMISSION_DENIED`.
9. **Reaction Modifying Message Body**: Non-admin user updates `likesCount` AND `text` in the same update -> `PERMISSION_DENIED`.
10. **Self-Assigned Admin Escalation**: Non-admin user attempts `create` on `/admins/{theirUid}` -> `PERMISSION_DENIED`.
11. **ID Poisoning**: Attacker attempts `get` or `create` with 500-char invalid document ID containing `$` or `/` -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Admin attempts `create` with backdated `createdAt` (`!= request.time`) -> `PERMISSION_DENIED`.
