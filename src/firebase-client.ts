import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// ============================================================================
// 1. INITIALIZE FIREBASE APP, FIRESTORE & AUTH
// ============================================================================
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ============================================================================
// 2. STARTUP CONNECTION VALIDATION & STRUCTURED ERROR HANDLING
// ============================================================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

// ============================================================================
// 3. BLUEPRINT-SYNCHRONIZED VALIDATION CONSTANTS & SANITIZERS
// ============================================================================
const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const STUDIO_NAME_MAX_LEN = 42;
const AUTHOR_NAME_MAX_LEN = 40;
const REVIEW_STUDIO_MAX_LEN = 45;
const REVIEW_QUOTE_MAX_LEN = 220;
const ITEM_SUMMARY_MAX_LEN = 240;
const WISHLIST_MAX_ITEMS = 30;
const ORDER_MAX_ITEMS = 25;

function sanitizeId(raw: string, maxLen = 64): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, maxLen);
  return VALID_ID_REGEX.test(cleaned) ? cleaned : `id_${Date.now()}`;
}

function sanitizeStudioName(raw: string): string {
  const trimmed = String(raw || '').trim().toUpperCase().slice(0, STUDIO_NAME_MAX_LEN);
  return trimmed.length >= 1 ? trimmed : 'MAISON VERITE';
}

function sanitizeBrandTheme(raw: string): 'alabaster' | 'obsidian' {
  return raw === 'obsidian' ? 'obsidian' : 'alabaster';
}

function sanitizeAccentFinish(raw: string): 'champagne' | 'contrast' {
  return raw === 'contrast' ? 'contrast' : 'champagne';
}

function sanitizeStringArray(arr: unknown[], maxItems: number, maxElemLen = 64): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const clean = item.trim().slice(0, maxElemLen);
      if (clean.length > 0 && VALID_ID_REGEX.test(clean)) {
        out.push(clean);
      }
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

// ============================================================================
// 4. REAL-TIME STOREFRONT SYNC BRIDGE
// ============================================================================
export interface StudioOrderPayload {
  orderId: string;
  studioName: string;
  status:
    | 'Preparing Studio Courier'
    | 'In Transit · Studio Courier'
    | 'Instant Vault Unlocked'
    | 'Delivered · Signed at Reception';
  total: number;
  itemSummary: string;
  itemIds: string[];
}

export interface ProductReviewPayload {
  productId: string;
  authorName: string;
  studioName: string;
  rating: number;
  quote: string;
}

interface AtelierStorefrontHooks {
  onProfileSynced?: (data: {
    studioName: string;
    brandTheme: 'alabaster' | 'obsidian';
    accentFinish: 'champagne' | 'contrast';
    wishlistIds: string[];
  }) => void;
  onOrdersSynced?: (orders: StudioOrderPayload[]) => void;
  onReviewsSynced?: (reviews: Array<ProductReviewPayload & { reviewId: string }>) => void;
  onSharedWishlistLoaded?: (data: { studioName: string; productIds: string[] }) => void;
  getInitialState?: () => {
    studioName: string;
    brandTheme: 'alabaster' | 'obsidian';
    accentFinish: 'champagne' | 'contrast';
    wishlistIds: string[];
  };
  showToast?: (msg: string) => void;
}

declare global {
  interface Window {
    AtelierFirebase?: {
      signInWithGoogle: () => Promise<void>;
      signOutStudio: () => Promise<void>;
      syncStudioProfile: (partial: {
        studioName?: string;
        brandTheme?: string;
        accentFinish?: string;
        wishlistIds?: string[];
      }) => Promise<void>;
      recordOrderToCloud: (order: StudioOrderPayload) => Promise<void>;
      publishSharedWishlistToCloud: (
        shareId: string,
        studioName: string,
        productIds: string[]
      ) => Promise<void>;
      loadSharedWishlistFromCloud: (shareId: string) => Promise<boolean>;
      submitProductReviewToCloud: (review: ProductReviewPayload) => Promise<void>;
      registerHooks: (hooks: AtelierStorefrontHooks) => void;
      getCurrentUser: () => User | null;
    };
  }
}

let currentUser: User | null = null;
let profileUnsub: Unsubscribe | null = null;
let ordersUnsub: Unsubscribe | null = null;
let reviewsUnsub: Unsubscribe | null = null;
let storefrontHooks: AtelierStorefrontHooks = {};
let profileExistsInCloud = false;
let cachedProfileState: {
  studioName: string;
  brandTheme: 'alabaster' | 'obsidian';
  accentFinish: 'champagne' | 'contrast';
  wishlistIds: string[];
} = {
  studioName: 'MAISON VERITE',
  brandTheme: 'alabaster',
  accentFinish: 'champagne',
  wishlistIds: [],
};

function updateAuthUi(user: User | null): void {
  const statusBadge = document.getElementById('account-firebase-status-badge');
  const userLabel = document.getElementById('account-firebase-user-label');
  const signInBtn = document.getElementById('account-google-signin-btn');
  const signOutBtn = document.getElementById('account-google-signout-btn');
  const navAccountLabel = document.getElementById('nav-account-btn-label');

  if (user) {
    const display = user.displayName || user.email || 'Verified Studio';
    if (statusBadge) {
      statusBadge.textContent = 'FIREBASE CLOUD SYNC ACTIVE';
      statusBadge.className =
        'bg-obsidian text-champagne px-2 py-0.5 text-[9px] font-medium tracking-[0.15em] uppercase';
    }
    if (userLabel) {
      userLabel.textContent = `Signed in as ${display} · Studio Crest, Wishlist & Orders auto-saved to Firestore`;
    }
    if (signInBtn) signInBtn.classList.add('hidden');
    if (signOutBtn) signOutBtn.classList.remove('hidden');
    if (navAccountLabel) {
      const firstName = (user.displayName || 'STUDIO').split(' ')[0].toUpperCase().slice(0, 10);
      navAccountLabel.textContent = firstName;
    }
  } else {
    if (statusBadge) {
      statusBadge.textContent = 'LOCAL STUDIO SESSION';
      statusBadge.className =
        'border border-obsidian/40 text-obsidian/75 px-2 py-0.5 text-[9px] font-medium tracking-[0.15em] uppercase';
    }
    if (userLabel) {
      userLabel.textContent =
        'Sign in with Google to persist your Studio Crest, Wishlist, and Order History across all studio devices.';
    }
    if (signInBtn) signInBtn.classList.remove('hidden');
    if (signOutBtn) signOutBtn.classList.add('hidden');
    if (navAccountLabel) {
      navAccountLabel.textContent = 'ACCOUNT';
    }
  }
}

async function ensureStudioProfileDocument(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid, 128);
  const path = `studios/${uid}`;
  const profileRef = doc(db, 'studios', uid);

  try {
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      const init = storefrontHooks.getInitialState
        ? storefrontHooks.getInitialState()
        : cachedProfileState;
      cachedProfileState = {
        studioName: sanitizeStudioName(init.studioName),
        brandTheme: sanitizeBrandTheme(init.brandTheme),
        accentFinish: sanitizeAccentFinish(init.accentFinish),
        wishlistIds: sanitizeStringArray(init.wishlistIds, WISHLIST_MAX_ITEMS),
      };
      await setDoc(profileRef, {
        userId: uid,
        studioName: cachedProfileState.studioName,
        brandTheme: cachedProfileState.brandTheme,
        accentFinish: cachedProfileState.accentFinish,
        wishlistIds: cachedProfileState.wishlistIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      profileExistsInCloud = true;
    } else {
      profileExistsInCloud = true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function attachUserListeners(user: User): void {
  detachUserListeners();
  const uid = sanitizeId(user.uid, 128);
  const profilePath = `studios/${uid}`;
  const profileRef = doc(db, 'studios', uid);

  profileUnsub = onSnapshot(
    profileRef,
    (snap) => {
      if (!snap.exists()) return;
      profileExistsInCloud = true;
      const data = snap.data();
      cachedProfileState = {
        studioName: sanitizeStudioName(data.studioName),
        brandTheme: sanitizeBrandTheme(data.brandTheme),
        accentFinish: sanitizeAccentFinish(data.accentFinish),
        wishlistIds: sanitizeStringArray(data.wishlistIds || [], WISHLIST_MAX_ITEMS),
      };
      if (storefrontHooks.onProfileSynced) {
        storefrontHooks.onProfileSynced(cachedProfileState);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, profilePath);
    }
  );

  const ordersPath = `studios/${uid}/orders`;
  const ordersQuery = query(collection(db, 'studios', uid, 'orders'), where('userId', '==', uid));
  ordersUnsub = onSnapshot(
    ordersQuery,
    (snap) => {
      const list: StudioOrderPayload[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          orderId: String(d.orderId || docSnap.id),
          studioName: String(d.studioName || cachedProfileState.studioName),
          status: d.status || 'Preparing Studio Courier',
          total: Number(d.total) || 0,
          itemSummary: String(d.itemSummary || 'Drop 01 Studio Parcel'),
          itemIds: Array.isArray(d.itemIds) ? d.itemIds : [],
        });
      });
      if (storefrontHooks.onOrdersSynced && list.length > 0) {
        storefrontHooks.onOrdersSynced(list);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, ordersPath);
    }
  );
}

function detachUserListeners(): void {
  if (profileUnsub) {
    profileUnsub();
    profileUnsub = null;
  }
  if (ordersUnsub) {
    ordersUnsub();
    ordersUnsub = null;
  }
  profileExistsInCloud = false;
}

function attachGlobalReviewsListener(): void {
  if (reviewsUnsub) return;
  const reviewsPath = 'productReviews';
  const reviewsQuery = query(
    collection(db, 'productReviews'),
    where('rating', '>=', 1),
    where('rating', '<=', 5)
  );
  reviewsUnsub = onSnapshot(
    reviewsQuery,
    (snap) => {
      const list: Array<ProductReviewPayload & { reviewId: string }> = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          reviewId: String(d.reviewId || docSnap.id),
          productId: String(d.productId || ''),
          authorName: String(d.authorName || 'Verified Studio'),
          studioName: String(d.studioName || 'Independent Atelier'),
          rating: Number(d.rating) || 5,
          quote: String(d.quote || ''),
        });
      });
      if (storefrontHooks.onReviewsSynced && list.length > 0) {
        storefrontHooks.onReviewsSynced(list);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, reviewsPath);
    }
  );
}

async function signInWithGoogle(): Promise<void> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      await ensureStudioProfileDocument(result.user);
      if (storefrontHooks.showToast) {
        storefrontHooks.showToast(
          `Signed in as ${result.user.displayName || result.user.email} — Studio Account synced with Firebase.`
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google Sign-In was cancelled.';
    if (storefrontHooks.showToast) {
      storefrontHooks.showToast(`Sign-In notice: ${msg}`);
    }
  }
}

async function signOutStudio(): Promise<void> {
  try {
    detachUserListeners();
    await signOut(auth);
    if (storefrontHooks.showToast) {
      storefrontHooks.showToast('Signed out of Firebase Studio Cloud Sync.');
    }
  } catch (err) {
    console.error('Sign-out error:', err);
  }
}

async function syncStudioProfile(partial: {
  studioName?: string;
  brandTheme?: string;
  accentFinish?: string;
  wishlistIds?: string[];
}): Promise<void> {
  if (partial.studioName !== undefined) {
    cachedProfileState.studioName = sanitizeStudioName(partial.studioName);
  }
  if (partial.brandTheme !== undefined) {
    cachedProfileState.brandTheme = sanitizeBrandTheme(partial.brandTheme);
  }
  if (partial.accentFinish !== undefined) {
    cachedProfileState.accentFinish = sanitizeAccentFinish(partial.accentFinish);
  }
  if (partial.wishlistIds !== undefined) {
    cachedProfileState.wishlistIds = sanitizeStringArray(partial.wishlistIds, WISHLIST_MAX_ITEMS);
  }

  if (!currentUser || !currentUser.emailVerified) return;
  const uid = sanitizeId(currentUser.uid, 128);
  const path = `studios/${uid}`;
  const profileRef = doc(db, 'studios', uid);

  try {
    if (!profileExistsInCloud) {
      await ensureStudioProfileDocument(currentUser);
    }
    await updateDoc(profileRef, {
      studioName: cachedProfileState.studioName,
      brandTheme: cachedProfileState.brandTheme,
      accentFinish: cachedProfileState.accentFinish,
      wishlistIds: cachedProfileState.wishlistIds,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function recordOrderToCloud(order: StudioOrderPayload): Promise<void> {
  if (!currentUser || !currentUser.emailVerified) return;
  const uid = sanitizeId(currentUser.uid, 128);
  if (!profileExistsInCloud) {
    await ensureStudioProfileDocument(currentUser);
  }

  const cleanOrderId = sanitizeId(order.orderId, 32);
  const path = `studios/${uid}/orders/${cleanOrderId}`;
  const orderRef = doc(db, 'studios', uid, 'orders', cleanOrderId);

  const validStatuses = [
    'Preparing Studio Courier',
    'In Transit · Studio Courier',
    'Instant Vault Unlocked',
    'Delivered · Signed at Reception',
  ] as const;
  const cleanStatus = validStatuses.includes(order.status)
    ? order.status
    : 'Preparing Studio Courier';

  const cleanItemIds = sanitizeStringArray(order.itemIds, ORDER_MAX_ITEMS);
  if (cleanItemIds.length === 0) {
    cleanItemIds.push('embroidered-hoodie');
  }

  const cleanTotal = Math.max(0, Math.min(100000, Number(order.total) || 0));
  const cleanSummary =
    String(order.itemSummary || 'Drop 01 Studio Parcel')
      .trim()
      .slice(0, ITEM_SUMMARY_MAX_LEN) || 'Drop 01 Studio Parcel';

  try {
    await setDoc(orderRef, {
      orderId: cleanOrderId,
      userId: uid,
      studioName: sanitizeStudioName(order.studioName || cachedProfileState.studioName),
      status: cleanStatus,
      total: cleanTotal,
      itemSummary: cleanSummary,
      itemIds: cleanItemIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

async function publishSharedWishlistToCloud(
  shareId: string,
  studioName: string,
  productIds: string[]
): Promise<void> {
  if (!currentUser || !currentUser.emailVerified) return;
  const uid = sanitizeId(currentUser.uid, 128);
  if (!profileExistsInCloud) {
    await ensureStudioProfileDocument(currentUser);
  }

  const cleanShareId = sanitizeId(shareId, 64);
  if (cleanShareId.length < 4) return;
  const cleanIds = sanitizeStringArray(productIds, WISHLIST_MAX_ITEMS);
  if (cleanIds.length === 0) return;

  const path = `sharedWishlists/${cleanShareId}`;
  const shareRef = doc(db, 'sharedWishlists', cleanShareId);

  try {
    const existingSnap = await getDoc(shareRef);
    if (!existingSnap.exists()) {
      await setDoc(shareRef, {
        shareId: cleanShareId,
        ownerId: uid,
        studioName: sanitizeStudioName(studioName),
        productIds: cleanIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (existingSnap.data().ownerId === uid) {
      await updateDoc(shareRef, {
        studioName: sanitizeStudioName(studioName),
        productIds: cleanIds,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function loadSharedWishlistFromCloud(shareId: string): Promise<boolean> {
  const cleanShareId = sanitizeId(shareId, 64);
  if (cleanShareId.length < 4) return false;
  const path = `sharedWishlists/${cleanShareId}`;
  try {
    const snap = await getDoc(doc(db, 'sharedWishlists', cleanShareId));
    if (!snap.exists()) return false;
    const data = snap.data();
    const productIds = sanitizeStringArray(data.productIds || [], WISHLIST_MAX_ITEMS);
    if (productIds.length > 0 && storefrontHooks.onSharedWishlistLoaded) {
      storefrontHooks.onSharedWishlistLoaded({
        studioName: sanitizeStudioName(data.studioName),
        productIds,
      });
      return true;
    }
    return false;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function submitProductReviewToCloud(review: ProductReviewPayload): Promise<void> {
  if (!currentUser || !currentUser.emailVerified) return;
  const uid = sanitizeId(currentUser.uid, 128);
  if (!profileExistsInCloud) {
    await ensureStudioProfileDocument(currentUser);
  }

  const cleanProductId = sanitizeId(review.productId, 64);
  const reviewId = sanitizeId(`rev_${cleanProductId}_${Date.now()}`, 64);
  const path = `productReviews/${reviewId}`;
  const reviewRef = doc(db, 'productReviews', reviewId);

  const cleanAuthor =
    String(review.authorName || currentUser.displayName || 'Verified Studio')
      .trim()
      .slice(0, AUTHOR_NAME_MAX_LEN) || 'Verified Studio';
  const cleanStudio =
    String(review.studioName || cachedProfileState.studioName || 'Independent Studio')
      .trim()
      .slice(0, REVIEW_STUDIO_MAX_LEN) || 'Independent Studio';
  const cleanRating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));
  const cleanQuote = String(review.quote || '')
    .trim()
    .slice(0, REVIEW_QUOTE_MAX_LEN);
  if (cleanQuote.length < 2) return;

  try {
    await setDoc(reviewRef, {
      reviewId,
      productId: cleanProductId,
      authorId: uid,
      authorName: cleanAuthor,
      studioName: cleanStudio,
      rating: cleanRating,
      quote: cleanQuote,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ============================================================================
// 5. AUTH STATE LISTENER & GLOBAL REGISTRATION
// ============================================================================
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateAuthUi(user);
  if (user) {
    await ensureStudioProfileDocument(user);
    attachUserListeners(user);
  } else {
    detachUserListeners();
  }
});

attachGlobalReviewsListener();

window.AtelierFirebase = {
  signInWithGoogle,
  signOutStudio,
  syncStudioProfile,
  recordOrderToCloud,
  publishSharedWishlistToCloud,
  loadSharedWishlistFromCloud,
  submitProductReviewToCloud,
  registerHooks(hooks: AtelierStorefrontHooks) {
    storefrontHooks = { ...storefrontHooks, ...hooks };
    updateAuthUi(currentUser);
  },
  getCurrentUser() {
    return currentUser;
  },
};
