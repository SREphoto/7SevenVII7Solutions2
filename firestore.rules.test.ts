/**
 * Phase 0 Test Runner Specification for Hardened Firestore Rules
 * Verifies that all 12 "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: string;
  description: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SECURITY_TESTS: DirtyDozenTestCase[] = [
  {
    id: 'DD-01',
    description: 'Shadow field injection (isAdmin: true) on StudioProfile',
    collectionPath: '/studios/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      userId: 'user_1',
      studioName: 'MAISON VERITE',
      brandTheme: 'alabaster',
      accentFinish: 'champagne',
      wishlistIds: ['embroidered-hoodie'],
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    description: 'Identity spoofing (mismatched userId in payload vs request.auth.uid)',
    collectionPath: '/studios/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      userId: 'user_2',
      studioName: 'MAISON VERITE',
      brandTheme: 'alabaster',
      accentFinish: 'champagne',
      wishlistIds: [],
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    description: 'Unverified email spoof attack (email_verified: false)',
    collectionPath: '/studios/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: {
      userId: 'user_1',
      studioName: 'MAISON VERITE',
      brandTheme: 'alabaster',
      accentFinish: 'champagne',
      wishlistIds: [],
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    description: 'Cross-tenant StudioProfile read attempt',
    collectionPath: '/studios/user_2',
    operation: 'get',
    auth: { uid: 'user_1', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    description: 'Orphaned order creation without parent StudioProfile document',
    collectionPath: '/studios/orphan_user/orders/7V_1042',
    operation: 'create',
    auth: { uid: 'orphan_user', email_verified: true },
    payload: {
      orderId: '7V_1042',
      userId: 'orphan_user',
      studioName: 'ORPHAN STUDIO',
      status: 'Preparing Studio Courier',
      total: 190,
      itemSummary: '1x Heavyweight Crewneck',
      itemIds: ['heavyweight-crewneck'],
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    description: 'Terminal state mutation on already delivered StudioOrder',
    collectionPath: '/studios/user_1/orders/7V_1089',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      status: 'Preparing Studio Courier',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    description: 'Immutable field tampering (modifying order total during update)',
    collectionPath: '/studios/user_1/orders/7V_1042',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      total: 1,
      status: 'In Transit · Studio Courier',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    description: 'Unbounded array exhaustion (35 items in wishlistIds, limit is 30)',
    collectionPath: '/studios/user_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      wishlistIds: Array.from({ length: 35 }, (_, i) => `item_${i}`),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    description: 'Array element type poisoning (non-string first element in wishlistIds)',
    collectionPath: '/studios/user_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      wishlistIds: [99999],
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    description: 'Oversized string resource poisoning (studioName exceeding 42 characters)',
    collectionPath: '/studios/user_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      studioName: 'A'.repeat(200),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    description: 'Unauthorized collection-wide list scraping on /sharedWishlists',
    collectionPath: '/sharedWishlists',
    operation: 'list',
    auth: { uid: 'user_1', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    description: 'Value poisoning on ProductReview update (out-of-range rating 99)',
    collectionPath: '/productReviews/rev_101',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      rating: 99,
      quote: 'Invalid rating injection attempt',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
