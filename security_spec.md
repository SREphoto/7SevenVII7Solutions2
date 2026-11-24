# Phase 0: Payload-First Security TDD Specification (`security_spec.md`)

## 1. Data Invariants

1. **Master Gate & Relational Ownership (`/studios/{userId}/orders/{orderId}`)**:
   - An order document in `/studios/{userId}/orders/{orderId}` cannot be created, read, or updated unless the parent studio profile `/studios/{userId}` exists and its `userId` matches `request.auth.uid`.
2. **Strict Schema & Anti-Update-Gap (`isValidStudioProfile`, `isValidStudioOrder`, `isValidSharedWishlist`, `isValidProductReview`)**:
   - Every `create` and `update` rule invokes the standalone `isValid[Entity](incoming())` helper first, enforcing `keys().hasAll(...)` and `keys().hasOnly(...)` so shadow/ghost fields are always rejected.
3. **Path Variable Hardening (`isValidId`)**:
   - Every single-document target operation (`get`, `create`, `update`, `delete`) validates `{userId}`, `{orderId}`, `{shareId}`, and `{reviewId}` with `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Verified Identity & Immutability**:
   - All writes require `isSignedIn() && isVerified()` (`request.auth.token.email_verified == true`).
   - Ownership fields (`userId`, `ownerId`, `authorId`) and `createdAt` are immutable across updates, and timestamps (`createdAt`, `updatedAt`) must equal `request.time`.
5. **Terminal State Locking**:
   - Once a `StudioOrder` reaches `status == 'Delivered · Signed at Reception'`, no further updates are permitted.
6. **No Blanket Reads & Secure List Queries**:
   - `/studios/{userId}` is strictly isolated to `request.auth.uid == userId` (`allow list: if false`).
   - `/studios/{userId}/orders/{orderId}` enforces `allow list: if isSignedIn() && request.auth.uid == userId && resource.data.userId == request.auth.uid` without `get()`/`exists()` inside `list`.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 01 — Shadow Field Injection on `StudioProfile`**:
   `{ "userId": "user_1", "studioName": "MAISON VERITE", "brandTheme": "alabaster", "accentFinish": "champagne", "wishlistIds": ["embroidered-hoodie"], "isAdmin": true, "createdAt": "SERVER_TIME", "updatedAt": "SERVER_TIME" }` -> `PERMISSION_DENIED` (blocked by `hasOnly`).
2. **Payload 02 — Identity Spoofing on `StudioProfile` Creation**:
   Authenticated as `user_1`, writing to `/studios/user_1` with `{ "userId": "user_2", ... }` -> `PERMISSION_DENIED`.
3. **Payload 03 — Unverified Email Spoof Attack**:
   Authenticated user with `request.auth.token.email_verified == false` attempting to create `/studios/user_1` -> `PERMISSION_DENIED`.
4. **Payload 04 — Cross-Tenant Profile Read (`get` `/studios/user_2` as `user_1`)**:
   Authenticated as `user_1` reading `/studios/user_2` -> `PERMISSION_DENIED`.
5. **Payload 05 — Orphaned Subcollection Order Without Parent `/studios/{userId}`**:
   Creating `/studios/user_no_profile/orders/7V-1042` when `/studios/user_no_profile` does not exist -> `PERMISSION_DENIED` (blocked by Master Gate `exists()`/`get()`).
6. **Payload 06 — Terminal State Mutation on Delivered `StudioOrder`**:
   Updating `/studios/user_1/orders/7V-1089` when `existing().status == 'Delivered · Signed at Reception'` -> `PERMISSION_DENIED`.
7. **Payload 07 — Immutable Field Tampering (`createdAt` or `total` on `StudioOrder` Update)**:
   Updating `total` from `300` to `1` on `/studios/user_1/orders/7V-1042` -> `PERMISSION_DENIED`.
8. **Payload 08 — Unbounded Array Exhaustion (`wishlistIds` > 30 elements)**:
   Writing 35 items to `wishlistIds` in `/studios/user_1` -> `PERMISSION_DENIED`.
9. **Payload 09 — Type Poisoning inside Array (`wishlistIds: [12345]`)**:
   Writing a non-string first element in `wishlistIds` -> `PERMISSION_DENIED`.
10. **Payload 10 — Oversized String Resource Poisoning (`studioName` > 42 chars)**:
    Writing a 500-character string to `studioName` -> `PERMISSION_DENIED`.
11. **Payload 11 — Unauthorized Shared Wishlist Enumeration (`list` `/sharedWishlists`)**:
    Running a collection-wide `list` query on `/sharedWishlists` -> `PERMISSION_DENIED`.
12. **Payload 12 — Value Poisoning on `ProductReview` Update (`rating: 99`)**:
    Updating `rating` to `99` on `/productReviews/rev_1` -> `PERMISSION_DENIED` (blocked by `isValidProductReview(incoming())`).
