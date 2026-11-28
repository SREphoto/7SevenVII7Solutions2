# 7SEVENVII7SOLUTIONS — Project, Hosting & Partner Handoff Reference

> **Security Note:** Never commit passwords, API keys, or OAuth tokens to Git. Invite collaborators using their own Google and GitHub accounts via the console links below. `.gitignore` already excludes `.env`, `.env.local`, `.env.*.local`, `.firebase/`, `node_modules/`, `dist/`, and `product_restore/`.

---

## 1. Accounts & Logins Used

| Service / Role | Account / Identifier | Notes |
| :--- | :--- | :--- |
| **GitHub Repository Owner** | `SREphoto` | Git author config: `Samuel` (`srephotomn@gmail.com` / `SREphotoMN@gmail.com`) |
| **Firebase Hosting Project Owner** | `wellnestappdev@gmail.com` | Authenticated account in `firebase-tools` CLI that created & deploys `sevenvii7-solutions` |
| **AI Studio Backend Reference** | Project `gen-lang-client-0578607796` | Referenced in `firebase-applet-config.json` (AI Studio-managed Firestore DB `ai-studio-7sevenviisolutio-107ee1e9-4d1d-4c5f-bca4-d1b2826d6eee`). Currently disconnected from `index.html`; `wellnestappdev@gmail.com` does not have IAM access to this AI Studio project |
| **Domain (`7sevenvii7.com`) DNS Host** | 1&1 IONOS | Current `A` record points to `74.208.236.202` (IONOS placeholder, not yet pointed to Firebase Hosting) |

---

## 2. Repository & Local Workspace Locations

- **Primary GitHub Repository:** `https://github.com/SREphoto/7SevenVII7Solutions2` (default branch: `main`)
- **GitHub Settings / Add Partner Collaborator:** `https://github.com/SREphoto/7SevenVII7Solutions2/settings/access`
- **GitHub Pages Secondary Preview (`main` / `/`):** `https://srephoto.github.io/7SevenVII7Solutions2/`
- **Older Separate GitHub Repo (legacy reference only):** `https://github.com/SREphoto/7SEVENVII7SOLUTIONS`
- **Local macOS Workspace Path:** `/Users/Samuel/AGapps/7SevenVII7Solutions2`

---

## 3. Firebase Project & Hosting Configuration

- **Firebase Project Display Name:** `7SevenVII7 Solutions`
- **Firebase Project ID:** `sevenvii7-solutions` (bound in `.firebaserc`)
- **Live Hosting URLs:**
  - `https://sevenvii7-solutions.web.app`
  - `https://sevenvii7-solutions.firebaseapp.com`
- **Firebase Console Links:**
  - Project Overview: `https://console.firebase.google.com/project/sevenvii7-solutions/overview`
  - IAM & Partner Access: `https://console.firebase.google.com/project/sevenvii7-solutions/settings/iam`
  - Hosting & Custom Domain (`7sevenvii7.com`): `https://console.firebase.google.com/project/sevenvii7-solutions/hosting/sites`
- **Hosting Build Settings (`firebase.json` & `vite.config.ts`):**
  - Vite multi-page (`mpa`) build outputs production assets to `dist/`
  - `public`: `"dist"`
  - `cleanUrls`: `true` (serves `/product-audit` and `/startup-intel` without `.html`)
  - `trailingSlash`: `false`
  - Static media headers: `Cache-Control: public, max-age=31536000, immutable` for `.jpg`, `.jpeg`, `.gif`, `.png`, `.webp`, `.svg`, `.mp4`, `.woff`, `.woff2`
  - `PARTNER_HANDOFF.md`, `firestore.rules`, `firebase-blueprint.json`, `firebase-applet-config.json`, `security_spec.md`, `scripts/`, `workflows/`, `product_restore/`, and unused root `images/` are excluded from `dist/` during `vite build`
- **Cloud Auth / Firestore Status:**
  - `index.html` currently stores Studio Accounts, Curation Inquiries, Wishlist, and POS demo state in browser `localStorage` (`7vii7_founder_profile`, `7vii7_accounts_v1`, `7vii7_curation_inquiries`, `7vii7_studio_os_v1`)
  - Future Firestore schema & security rules drafts live in `firebase-blueprint.json`, `firestore.rules`, `security_spec.md`, and `src/firebase-client.ts`

---

## 4. Direct Links to Storefront Views & Internal Tools

| Feature / Tool | Live Firebase Hosting URL | Local Dev URL (`npm run dev`) | Source / Entry |
| :--- | :--- | :--- | :--- |
| **Storefront Home** | `https://sevenvii7-solutions.web.app/` | `http://localhost:3000/` | `index.html` (`#view-home`) |
| **60-Frame Overhaul Scrolling Animation** | `https://sevenvii7-solutions.web.app/#/landing` | `http://localhost:3000/#/landing` | `index.html` (`#overhaul-scroll-stage`, frames in `public/assets/aistudio/frame_*.webp`) |
| **Interactive Product Curator & Suite Builder** | `https://sevenvii7-solutions.web.app/#/curator` | `http://localhost:3000/#/curator` | `index.html` (`#curation` inside `#view-landing`) |
| **Business Packages** | `https://sevenvii7-solutions.web.app/#/packages` | `http://localhost:3000/#/packages` | `index.html` (`#view-packages`) |
| **Physical Catalog (70 Items)** | `https://sevenvii7-solutions.web.app/#/physical` | `http://localhost:3000/#/physical` | `index.html` (`#view-physical`) |
| **Digital & Printable Vault (12 Items)** | `https://sevenvii7-solutions.web.app/#/digital` | `http://localhost:3000/#/digital` | `index.html` (`#view-digital`) |
| **3D Storefront & 7VII7 StudioOS POS App** | `https://sevenvii7-solutions.web.app/#/pos` | `http://localhost:3000/#/pos` | `index.html` (`#view-pos`, Three.js GLB scene) |
| **Product & Asset Audit Tool** | `https://sevenvii7-solutions.web.app/product-audit` | `http://localhost:3000/product-audit.html` | `product-audit.html` (live-parses `PRODUCTS` from `index.html`) |
| **Startup Industry, Lead & Product Intel Hub** | `https://sevenvii7-solutions.web.app/startup-intel` | `http://localhost:3000/startup-intel.html` | `startup-intel.html` + `data/startup-intelligence.json` |

> Inside the storefront itself, **Overhaul** (`#/landing`), **Curator** (`#/curator`), and **3D POS** (`#/pos`) are in the top navigation bar, mobile menu, and hero CTA, while **Product & Asset Audit Tool** and **Startup & Lead Intelligence** are linked under **Partner & Ops Tools** in the site footer (and mobile menu).

---

## 5. Partner Onboarding & Workflow Commands

### A. Granting Access to Your Partner
1. **GitHub:** Open `https://github.com/SREphoto/7SevenVII7Solutions2/settings/access` -> **Add people** -> invite your partner's GitHub username with **Write** or **Admin** access.
2. **Firebase Console:** Sign in as `wellnestappdev@gmail.com` -> open `https://console.firebase.google.com/project/sevenvii7-solutions/settings/iam` -> **Add member** -> enter your partner's Google email with **Editor** (or **Firebase Hosting Admin**) role.

### B. Local Development & Verification
```bash
git clone https://github.com/SREphoto/7SevenVII7Solutions2.git
cd 7SevenVII7Solutions2
npm install          # or: bun install
npm run dev          # Starts Vite MPA server on http://localhost:3000
npm run lint         # Runs TypeScript check (tsc --noEmit)
npm run build        # Builds production bundle into dist/
```

### C. Deploying Updates to Firebase Hosting
```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use sevenvii7-solutions
npm run build && npx -y firebase-tools@latest deploy --only hosting
```

### D. Connecting Custom Domain (`7sevenvii7.com`)
1. Open `https://console.firebase.google.com/project/sevenvii7-solutions/hosting/sites` while signed in as `wellnestappdev@gmail.com`.
2. Click **Add custom domain** and enter `7sevenvii7.com` (and optionally `www.7sevenvii7.com`).
3. Copy the verification `TXT` record and Firebase Hosting `A` records into your **1&1 IONOS** DNS panel (replacing the existing `74.208.236.202` `A` record once verified).

### E. Refreshing the Startup & Lead Intelligence Dataset
- **Via Node / Bun CLI (`scripts/agents/startup-research-agents.ts`):**
  ```bash
  export GEMINI_API_KEY="your-gemini-api-key"
  npm run agents:research
  ```
- **Via Antigravity Workflow:** Run `workflows/startup_research_workflow.py` (uses `.agents/skills/startup-market-intelligence/SKILL.md`), which updates:
  - `data/startup-intelligence.json`
  - `data/newly-opened-leads.csv`
  - `data/product-fit-recommendations.csv`
- After updating `data/startup-intelligence.json`, run `npm run build && npx -y firebase-tools@latest deploy --only hosting` to publish the refreshed dataset to `/startup-intel`.
