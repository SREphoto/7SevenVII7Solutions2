"""
7SEVENVII7SOLUTIONS — Live Multi-Agent Startup Industry, Newly Opened Business & Product-Fit Workflow.

Orchestrates 3 specialized agent phases via Antigravity `run_workflow`:
1. Industry Scout: discovers the top 12 U.S. high-growth small business startup industries (2025-2026).
2. Parallel Lead Finder + Product-Fit Strategist fan-out across all 12 industries:
   - Finds real businesses opened in the past 12 months (Nov 2025 - Nov 2026) with verified contact info.
   - Maps Day-1 needs to existing 7SEVENVII7SOLUTIONS SKUs and researches net-new B2B product ideas.
3. Aggregator: exports JSON + CSV deliverables to ./data/ for startup-intel.html and product-audit.html.
"""

import csv
import datetime as dt
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(WORKSPACES[0]) if WORKSPACES else Path.cwd()
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

METROS = [
    "Austin, TX",
    "Dallas-Fort Worth, TX",
    "Houston, TX",
    "Miami, FL",
    "New York, NY",
    "Los Angeles, CA",
    "Atlanta, GA",
    "Nashville, TN",
    "Denver, CO",
    "Chicago, IL",
    "Phoenix, AZ",
    "Charlotte, NC",
]

WINDOW_LABEL = "Nov 2025 – Nov 2026"


def extract_catalog_skus() -> list[dict]:
    """Parse unique productCode SKUs from index.html using Node so JS syntax is evaluated cleanly."""
    index_path = ROOT / "index.html"
    if not index_path.exists():
        return []
    js = r"""
const fs = require("fs");
const html = fs.readFileSync(process.argv[1], "utf8");
const m = html.match(/const PRODUCTS = (\[[\s\S]*?\n\s*\]);/);
if (!m) { console.log("[]"); process.exit(0); }
const prods = new Function("return (" + m[1] + ")")();
const byCode = {};
for (const p of prods) {
  const code = p.productCode || p.id;
  if (!byCode[code]) {
    byCode[code] = {
      productCode: code,
      sampleName: p.name,
      category: p.category,
      price: Number(p.price || 0),
      industries: [],
      subIndustries: [],
      subtitle: p.subtitle || ""
    };
  }
  if (p.industry && !byCode[code].industries.includes(p.industry)) {
    byCode[code].industries.push(p.industry);
  }
  if (p.subIndustry && !byCode[code].subIndustries.includes(p.subIndustry)) {
    byCode[code].subIndustries.push(p.subIndustry);
  }
}
console.log(JSON.stringify(Object.values(byCode)));
"""
    raw = subprocess.check_output(["node", "-e", js, str(index_path)], text=True)
    return json.loads(raw)


def csv_escape(val) -> str:
    if val is None:
        return ""
    if isinstance(val, (list, dict)):
        return json.dumps(val, ensure_ascii=False)
    return str(val)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: csv_escape(row.get(k, "")) for k in fieldnames})


async def run_with_retry(
    prompt: str,
    schema: dict,
    role: str,
    agent_type: str = "industry-scout",
    retries: int = 1,
):
    last_err = None
    for attempt in range(retries + 1):
        try:
            r_name = role if attempt == 0 else f"{role} (Retry {attempt})"
            return await agent(
                prompt=prompt,
                schema=schema,
                role=r_name,
                type_name=agent_type,
                workspace="inherit",
                model="inherit",
            )
        except Exception as exc:
            last_err = exc
            log(f"[WARN] {role} attempt {attempt + 1} failed: {exc}")
    raise last_err


# --- Schemas (minimal subset: type, properties, items, required) ---

INDUSTRY_LIST_SCHEMA = {
    "type": "object",
    "properties": {
        "industries": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "rank": {"type": "integer"},
                    "name": {"type": "string"},
                    "l1Industry": {"type": "string"},
                    "l2SubIndustry": {"type": "string"},
                    "catalogCoverage": {"type": "string"},
                    "growthMetric": {"type": "string"},
                    "typicalStartupBudget": {"type": "string"},
                    "avgTeamSize": {"type": "string"},
                    "whyBooming": {"type": "string"},
                    "dayOneBuyerProfile": {"type": "string"},
                    "sources": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "url": {"type": "string"},
                            },
                            "required": ["title", "url"],
                        },
                    },
                },
                "required": [
                    "id",
                    "rank",
                    "name",
                    "l1Industry",
                    "l2SubIndustry",
                    "catalogCoverage",
                    "growthMetric",
                    "typicalStartupBudget",
                    "avgTeamSize",
                    "whyBooming",
                    "dayOneBuyerProfile",
                    "sources",
                ],
            },
        }
    },
    "required": ["industries"],
}

LEAD_BATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "leads": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "businessName": {"type": "string"},
                    "industryId": {"type": "string"},
                    "industryName": {"type": "string"},
                    "city": {"type": "string"},
                    "state": {"type": "string"},
                    "address": {"type": "string"},
                    "openedDate": {"type": "string"},
                    "website": {"type": "string"},
                    "phone": {"type": "string"},
                    "email": {"type": "string"},
                    "contactUrl": {"type": "string"},
                    "instagram": {"type": "string"},
                    "openingEvidence": {"type": "string"},
                    "sourceUrl": {"type": "string"},
                    "recommendedPitchAngle": {"type": "string"},
                },
                "required": [
                    "id",
                    "businessName",
                    "industryId",
                    "industryName",
                    "city",
                    "state",
                    "address",
                    "openedDate",
                    "website",
                    "phone",
                    "email",
                    "contactUrl",
                    "instagram",
                    "openingEvidence",
                    "sourceUrl",
                    "recommendedPitchAngle",
                ],
            },
        }
    },
    "required": ["leads"],
}

PRODUCT_FIT_SCHEMA = {
    "type": "object",
    "properties": {
        "industryId": {"type": "string"},
        "industryName": {"type": "string"},
        "existingSkuMatches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "productCode": {"type": "string"},
                    "productName": {"type": "string"},
                    "category": {"type": "string"},
                    "price": {"type": "number"},
                    "fitRationale": {"type": "string"},
                    "dayOnePitchHook": {"type": "string"},
                    "estimatedBundleQty": {"type": "integer"},
                },
                "required": [
                    "productCode",
                    "productName",
                    "category",
                    "price",
                    "fitRationale",
                    "dayOnePitchHook",
                    "estimatedBundleQty",
                ],
            },
        },
        "newProductOpportunities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "proposedSku": {"type": "string"},
                    "name": {"type": "string"},
                    "category": {"type": "string"},
                    "suggestedPrice": {"type": "number"},
                    "estimatedGrossMarginPct": {"type": "number"},
                    "buyerPainPoint": {"type": "string"},
                    "productSpec": {"type": "string"},
                    "pomelliSceneDesc": {"type": "string"},
                },
                "required": [
                    "proposedSku",
                    "name",
                    "category",
                    "suggestedPrice",
                    "estimatedGrossMarginPct",
                    "buyerPainPoint",
                    "productSpec",
                    "pomelliSceneDesc",
                ],
            },
        },
        "recommendedStarterBundle": {
            "type": "object",
            "properties": {
                "bundleName": {"type": "string"},
                "targetPrice": {"type": "number"},
                "includedSkus": {"type": "array", "items": {"type": "string"}},
                "pitchSummary": {"type": "string"},
            },
            "required": ["bundleName", "targetPrice", "includedSkus", "pitchSummary"],
        },
    },
    "required": [
        "industryId",
        "industryName",
        "existingSkuMatches",
        "newProductOpportunities",
        "recommendedStarterBundle",
    ],
}


catalog_skus = extract_catalog_skus()
log(f"Loaded {len(catalog_skus)} unique 7SEVENVII7 productCode SKUs from index.html")

catalog_lines = [
    f"- {c['productCode']} | {c['sampleName']} | cat={c['category']} | ${c['price']} | existing={','.join(c['subIndustries'])}"
    for c in catalog_skus
]
CATALOG_TEXT = "\n".join(catalog_lines)

# ==============================================================================
# STAGE 1: INDUSTRY SCOUT
# ==============================================================================
phase("Stage 1: Industry Scout (Top 12 Startup Industries)")

scout_prompt = f"""You are the Industry Scout agent for 7SEVENVII7SOLUTIONS (luxury operational systems, 480gsm studio uniforms, engraved brass/stone reception hardware, cotton print stationery, and digital client vaults).
Today's date is November 27, 2026.

TASK:
Use `search_web` to research the top 12 high-growth U.S. small business startup industries across 2025-2026 (checking U.S. Census Business Formation Statistics, SBA, Yelp Local Economic Impact / New Business Openings reports, Gusto/Guidant small business trends, and industry trade data).

Focus on independent, client-facing brick-and-mortar, studio, hospitality, medical/aesthetic, advisory, and specialty trade categories where new founders purchase staff uniforms/apparel, reception signage/QR hardware, stationery, and digital client onboarding/SOP systems.

Aim for 12 distinct, high-momentum industries covering:
1. Existing 7SEVENVII7 verticals (beauty-wellness: lash-brow-esthetics, fitness-pilates, hair-salons, nail-salons; hospitality-culinary: restaurants, bakeries; professional-medical: doctors, lawyers; automotive-trades: mechanics; founders-launch: starting-owners)
2. Planned/adjacent fast-growing startup niches (e.g., medspas / IV & longevity clinics, specialty coffee & matcha bars, luxury pet grooming & boutique vet clinics, exotic auto detailing / PPF studios, modern barber lounges, fine-line tattoo & piercing ateliers, boutique wealth/real estate advisory, residential smart-home/specialty trades).

For each of the 12 industries provide:
- `id`: kebab-case slug (unique)
- `rank`: 1 through 12
- `name`: Clear industry name
- `l1Industry`: Level-1 category slug (`beauty-wellness`, `hospitality-culinary`, `professional-medical`, `automotive-trades`, `founders-launch`, or a clear new L1 slug)
- `l2SubIndustry`: Level-2 sub-industry slug
- `catalogCoverage`: `"existing"`, `"planned"`, or `"new-expansion"`
- `growthMetric`: Real, verifiable growth/opening metric with year and source name observed in search_web
- `typicalStartupBudget`: Realistic startup buildout range (e.g. "$120K - $450K")
- `avgTeamSize`: Typical Day-1 staff count (e.g. "4-8 staff")
- `whyBooming`: 2-3 crisp sentences grounded in search findings
- `dayOneBuyerProfile`: Who buys & what operational image they need on opening day
- `sources`: 2+ objects with real `title` and `url` returned by search_web (never invent URLs)

CRITICAL: End your run by calling the `finish` tool with JSON matching the schema (`{{"industries": [...]}}`) containing all 12 industries. Do not finish without calling `finish`."""

scout_res = await run_with_retry(
    prompt=scout_prompt,
    schema=INDUSTRY_LIST_SCHEMA,
    role="Industry Scout — Top 12 Startup Sectors",
    agent_type="industry-scout",
    retries=1,
)
industries = scout_res.get("industries", [])
log(f"Stage 1 complete: identified {len(industries)} top startup industries.")

# ==============================================================================
# STAGE 2: PARALLEL LEAD DISCOVERY & PRODUCT-FIT RESEARCH (WAVES OF 4)
# ==============================================================================
phase("Stage 2: Parallel Lead Discovery & Product-Fit Research")

METRO_STR = "; ".join(METROS)


async def research_industry_bundle(ind: dict) -> dict:
    ind_id = ind["id"]
    ind_name = ind["name"]
    ind_idx = int(ind.get("rank", 1))
    # Rotate primary metro focus per industry so nationwide coverage spans all 12 metros
    rotated = METROS[(ind_idx - 1) % len(METROS) :] + METROS[: (ind_idx - 1) % len(METROS)]
    focus_metros = ", ".join(rotated[:6])

    lead_prompt = f"""You are the New Business Lead Finder agent for 7SEVENVII7SOLUTIONS.
Today's date is November 27, 2026. Target window ("past year"): **November 2025 – November 2026**.

TARGET INDUSTRY: {ind_name} (`{ind_id}`)
PRIORITY U.S. METROS TO SEARCH: {focus_metros} (or any of: {METRO_STR})

TASK:
Use `search_web` (run multiple targeted searches such as `"grand opening" 2026`, `"now open" 2026`, `WhatNow`, `Eater`, `CultureMap`, `Community Impact`, `Business Journal`, Chamber ribbon cuttings, and official business websites) to discover **4 to 5 REAL, VERIFIABLE small businesses** in `{ind_name}` that **opened between November 2025 and November 2026**.

STRICT VERIFICATION & ANTI-HALLUCINATION RULES:
1. NEVER invent, guess, or fabricate business names, opening dates, phone numbers, email addresses, Instagram handles, street addresses, or URLs.
2. Every business MUST be verified in search results as having opened (or held grand opening / launched first location) between **Nov 2025 and Nov 2026**.
3. For each business found, run a follow-up `search_web` query for the exact business name + city to find its official website, public phone number, public email (if listed), contact page URL (`contactUrl`), physical address, and Instagram handle.
4. If an email address is NOT publicly displayed in search results, set `"email": ""` (empty string) — DO NOT guess `info@...` or `hello@...`! Ensure at least one verified direct channel (`website`, `phone`, `email`, `contactUrl`, or `instagram`) is populated for every lead.
5. Do not use placeholder values or `example.com`.

OUTPUT FIELDS PER LEAD:
- `id`: unique slug e.g. `lead-{ind_id}-1`
- `businessName`: exact official name
- `industryId`: `"{ind_id}"`
- `industryName`: `"{ind_name}"`
- `city`: city name
- `state`: 2-letter U.S. state abbreviation
- `address`: verified street address or neighborhood/suite (empty string if unpublished)
- `openedDate`: Month & Year opened e.g. `"March 2026"` or `"Late 2025"`
- `website`: verified official URL (or `""` if none)
- `phone`: verified public phone (or `""` if none)
- `email`: verified public email ONLY if explicitly seen (else `""`)
- `contactUrl`: verified contact/booking page URL (or `""`)
- `instagram`: verified handle like `@studioname` (or `""`)
- `openingEvidence`: 1 sentence stating the exact press/launch evidence confirming Nov 2025–Nov 2026 opening
- `sourceUrl`: exact URL of the opening announcement or official site from search_web
- `recommendedPitchAngle`: 1-2 sentences tailored to this business's aesthetic/city explaining how 7SEVENVII7 fits their launch

CRITICAL: End by calling the `finish` tool with JSON `{{"leads": [...]}}`."""

    product_prompt = f"""You are the Product-Fit Strategist agent for 7SEVENVII7SOLUTIONS (luxury architectural aesthetic: warm alabaster, matte obsidian, champagne gold; 480gsm heavy cotton uniforms, engraved brass/stone QR & reception hardware, 600gsm cotton stationery, and digital studio client vaults/SOPs).

TARGET INDUSTRY: {ind_name} (`{ind_id}`)
L1 / L2 TAXONOMY: `{ind.get('l1Industry')}` > `{ind.get('l2SubIndustry')}`
DAY-1 BUYER PROFILE: {ind.get('dayOneBuyerProfile')}

EXISTING 7SEVENVII7SOLUTIONS CATALOG (48 unique productCodes):
{CATALOG_TEXT}

TASK:
1. Use `search_web` to research what newly opened `{ind_name}` owners purchase during buildout & Month 1 (front-desk check-in hardware, client onboarding/waiver tools, staff attire/aprons/scrubs/jackets, hospitality mugs/towels, branded print/packaging, SOP kits, pricing benchmarks).
2. Select **4 existing `productCode` SKUs** from the catalog list above that best fit `{ind_name}` on Day 1 (mix of physical, digital, and/or package SKUs). Use the EXACT `productCode` string from the list above.
3. Propose **3 net-new high-margin B2B products** (`7V-*` proposed SKUs) that 7SEVENVII7SOLUTIONS should launch specifically to capture `{ind_name}` startups (covering physical uniforms/hardware and/or digital vaults/SOPs). Include realistic retail price, estimated gross margin %, buyer pain point, exact material/spec details, and a rich editorial 4:3 photography scene description (`pomelliSceneDesc`) matching 7SEVENVII7's warm alabaster, matte obsidian, brushed champagne brass, and travertine aesthetic.
4. Design 1 turnkey `recommendedStarterBundle` combining existing + new or core SKUs for cold outreach to newly opened `{ind_name}` owners.

CRITICAL: End by calling the `finish` tool with JSON matching the schema (`industryId`, `industryName`, `existingSkuMatches`, `newProductOpportunities`, `recommendedStarterBundle`)."""

    lead_res, prod_res = await parallel(
        [lead_prompt, product_prompt],
        lambda item: run_with_retry(
            prompt=item,
            schema=LEAD_BATCH_SCHEMA if item is lead_prompt else PRODUCT_FIT_SCHEMA,
            role=f"{'Lead Finder' if item is lead_prompt else 'Product Fit'} · {ind_name}",
            agent_type="new-business-lead-finder" if item is lead_prompt else "product-fit-strategist",
            retries=1,
        ),
    )
    prod_res["industryId"] = ind_id
    prod_res["industryName"] = ind_name
    prod_res["l1Industry"] = ind.get("l1Industry", "")
    prod_res["l2SubIndustry"] = ind.get("l2SubIndustry", "")
    return {
        "industryId": ind_id,
        "leads": lead_res.get("leads", []),
        "productResearch": prod_res,
    }


all_leads: list[dict] = []
all_product_research: list[dict] = []

wave_size = 4
for wave_idx in range(0, len(industries), wave_size):
    batch = industries[wave_idx : wave_idx + wave_size]
    wave_num = (wave_idx // wave_size) + 1
    log(f"Running Stage 2 Wave {wave_num} ({len(batch)} industries = {len(batch) * 2} agents)...")
    batch_results = await parallel(batch, research_industry_bundle)
    for res in batch_results:
        for idx, lead in enumerate(res.get("leads", []), start=1):
            lead["industryId"] = res["industryId"]
            if not lead.get("id"):
                lead["id"] = f"lead-{res['industryId']}-{idx}"
            all_leads.append(lead)
        if res.get("productResearch"):
            all_product_research.append(res["productResearch"])
    log(
        f"Wave {wave_num} done. Cumulative: {len(all_leads)} leads, "
        f"{len(all_product_research)} industry product matrices."
    )

# ==============================================================================
# STAGE 3: AGGREGATION & EXPORT
# ==============================================================================
phase("Stage 3: Aggregate & Export Deliverables")

existing_matches_count = sum(len(pr.get("existingSkuMatches", [])) for pr in all_product_research)
new_ideas_count = sum(len(pr.get("newProductOpportunities", [])) for pr in all_product_research)

summary_stats = {
    "industriesCount": len(industries),
    "leadsCount": len(all_leads),
    "leadsWithEmail": sum(1 for l in all_leads if str(l.get("email", "")).strip()),
    "leadsWithPhone": sum(1 for l in all_leads if str(l.get("phone", "")).strip()),
    "leadsWithWebsite": sum(1 for l in all_leads if str(l.get("website", "")).strip()),
    "leadsWithInstagram": sum(1 for l in all_leads if str(l.get("instagram", "")).strip()),
    "existingSkuMatchesCount": existing_matches_count,
    "newProductOpportunitiesCount": new_ideas_count,
}

payload = {
    "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    "window": WINDOW_LABEL,
    "geosCovered": METROS,
    "summaryStats": summary_stats,
    "industries": industries,
    "leads": all_leads,
    "productResearch": all_product_research,
}

json_path = DATA_DIR / "startup-intelligence.json"
json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

leads_csv_path = DATA_DIR / "newly-opened-leads.csv"
write_csv(
    leads_csv_path,
    [
        "id",
        "businessName",
        "industryId",
        "industryName",
        "city",
        "state",
        "address",
        "openedDate",
        "website",
        "phone",
        "email",
        "contactUrl",
        "instagram",
        "openingEvidence",
        "sourceUrl",
        "recommendedPitchAngle",
    ],
    all_leads,
)

product_rows: list[dict] = []
for pr in all_product_research:
    ind_id = pr.get("industryId", "")
    ind_name = pr.get("industryName", "")
    bundle_name = pr.get("recommendedStarterBundle", {}).get("bundleName", "")
    for m in pr.get("existingSkuMatches", []):
        product_rows.append(
            {
                "industryId": ind_id,
                "industryName": ind_name,
                "recommendationType": "existing-sku-match",
                "sku": m.get("productCode", ""),
                "name": m.get("productName", ""),
                "category": m.get("category", ""),
                "priceUsd": m.get("price", ""),
                "estimatedGrossMarginPct": "",
                "estimatedBundleQty": m.get("estimatedBundleQty", ""),
                "rationaleOrPainPoint": m.get("fitRationale", ""),
                "pitchHookOrSpec": m.get("dayOnePitchHook", ""),
                "pomelliSceneDesc": "",
                "starterBundle": bundle_name,
            }
        )
    for n in pr.get("newProductOpportunities", []):
        product_rows.append(
            {
                "industryId": ind_id,
                "industryName": ind_name,
                "recommendationType": "net-new-opportunity",
                "sku": n.get("proposedSku", ""),
                "name": n.get("name", ""),
                "category": n.get("category", ""),
                "priceUsd": n.get("suggestedPrice", ""),
                "estimatedGrossMarginPct": n.get("estimatedGrossMarginPct", ""),
                "estimatedBundleQty": "",
                "rationaleOrPainPoint": n.get("buyerPainPoint", ""),
                "pitchHookOrSpec": n.get("productSpec", ""),
                "pomelliSceneDesc": n.get("pomelliSceneDesc", ""),
                "starterBundle": bundle_name,
            }
        )

products_csv_path = DATA_DIR / "product-fit-recommendations.csv"
write_csv(
    products_csv_path,
    [
        "industryId",
        "industryName",
        "recommendationType",
        "sku",
        "name",
        "category",
        "priceUsd",
        "estimatedGrossMarginPct",
        "estimatedBundleQty",
        "rationaleOrPainPoint",
        "pitchHookOrSpec",
        "pomelliSceneDesc",
        "starterBundle",
    ],
    product_rows,
)

log(f"Exported JSON: {json_path}")
log(f"Exported Leads CSV: {leads_csv_path}")
log(f"Exported Products CSV: {products_csv_path}")
print(json.dumps(summary_stats, indent=2))
