/**
 * 7SEVENVII7SOLUTIONS — Reusable Multi-Agent Startup Industry, Lead & Product Research CLI
 *
 * Uses @google/genai (v2.32.0+) Interactions API with Gemini 4 models (`gemini-4-hydrogen` default),
 * server-side `google_search` + `url_context` grounding, and structured JSON output schemas.
 *
 * Usage:
 *   npm run agents:research -- --dry-run
 *   npm run agents:research -- --industry-count 12 --leads-per-industry 5
 *   npm run agents:research -- --filter-industry medspas-longevity --metros "Austin, TX;Dallas, TX"
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CatalogSkuSummary {
  productCode: string;
  sampleName: string;
  category: string;
  price: number;
  industries: string[];
  subIndustries: string[];
  subtitle: string;
}

export interface IndustrySource {
  title: string;
  url: string;
}

export interface StartupIndustry {
  id: string;
  rank: number;
  name: string;
  l1Industry: string;
  l2SubIndustry: string;
  catalogCoverage: string;
  growthMetric: string;
  typicalStartupBudget: string;
  avgTeamSize: string;
  whyBooming: string;
  dayOneBuyerProfile: string;
  sources: IndustrySource[];
}

export interface NewlyOpenedLead {
  id: string;
  businessName: string;
  industryId: string;
  industryName: string;
  city: string;
  state: string;
  address: string;
  openedDate: string;
  website: string;
  phone: string;
  email: string;
  contactUrl: string;
  instagram: string;
  openingEvidence: string;
  sourceUrl: string;
  recommendedPitchAngle: string;
}

export interface ExistingSkuMatch {
  productCode: string;
  productName: string;
  category: string;
  price: number;
  fitRationale: string;
  dayOnePitchHook: string;
  estimatedBundleQty: number;
}

export interface NewProductOpportunity {
  proposedSku: string;
  name: string;
  category: string;
  suggestedPrice: number;
  estimatedGrossMarginPct: number;
  buyerPainPoint: string;
  productSpec: string;
  pomelliSceneDesc: string;
}

export interface IndustryProductResearch {
  industryId: string;
  industryName: string;
  l1Industry: string;
  l2SubIndustry: string;
  existingSkuMatches: ExistingSkuMatch[];
  newProductOpportunities: NewProductOpportunity[];
  recommendedStarterBundle: {
    bundleName: string;
    targetPrice: number;
    includedSkus: string[];
    pitchSummary: string;
  };
}

export interface CliOptions {
  metros: string[];
  industryCount: number;
  leadsPerIndustry: number;
  filterIndustry: string;
  outDir: string;
  model: string;
  concurrency: number;
  dryRun: boolean;
  help: boolean;
}

// -----------------------------------------------------------------------------
// Constants & Schemas (compatible with Interactions API TextResponseFormat_2)
// -----------------------------------------------------------------------------

const DEFAULT_METROS = [
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
];

const DEFAULT_MODEL = "gemini-4-hydrogen";

const INDUSTRY_LIST_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    industries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          rank: { type: "integer" },
          name: { type: "string" },
          l1Industry: { type: "string" },
          l2SubIndustry: { type: "string" },
          catalogCoverage: { type: "string" },
          growthMetric: { type: "string" },
          typicalStartupBudget: { type: "string" },
          avgTeamSize: { type: "string" },
          whyBooming: { type: "string" },
          dayOneBuyerProfile: { type: "string" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
              },
              required: ["title", "url"],
            },
          },
        },
        required: [
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
    },
  },
  required: ["industries"],
};

const LEAD_BATCH_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          businessName: { type: "string" },
          industryId: { type: "string" },
          industryName: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          address: { type: "string" },
          openedDate: { type: "string" },
          website: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          contactUrl: { type: "string" },
          instagram: { type: "string" },
          openingEvidence: { type: "string" },
          sourceUrl: { type: "string" },
          recommendedPitchAngle: { type: "string" },
        },
        required: [
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
    },
  },
  required: ["leads"],
};

const PRODUCT_FIT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    industryId: { type: "string" },
    industryName: { type: "string" },
    existingSkuMatches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productCode: { type: "string" },
          productName: { type: "string" },
          category: { type: "string" },
          price: { type: "number" },
          fitRationale: { type: "string" },
          dayOnePitchHook: { type: "string" },
          estimatedBundleQty: { type: "integer" },
        },
        required: [
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
    newProductOpportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          proposedSku: { type: "string" },
          name: { type: "string" },
          category: { type: "string" },
          suggestedPrice: { type: "number" },
          estimatedGrossMarginPct: { type: "number" },
          buyerPainPoint: { type: "string" },
          productSpec: { type: "string" },
          pomelliSceneDesc: { type: "string" },
        },
        required: [
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
    recommendedStarterBundle: {
      type: "object",
      properties: {
        bundleName: { type: "string" },
        targetPrice: { type: "number" },
        includedSkus: { type: "array", items: { type: "string" } },
        pitchSummary: { type: "string" },
      },
      required: ["bundleName", "targetPrice", "includedSkus", "pitchSummary"],
    },
  },
  required: [
    "industryId",
    "industryName",
    "existingSkuMatches",
    "newProductOpportunities",
    "recommendedStarterBundle",
  ],
};

// -----------------------------------------------------------------------------
// Environment & Catalog Utilities
// -----------------------------------------------------------------------------

function getRepoRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return resolve(thisDir, "..", "..");
}

function loadGeminiApiKey(repoRoot: string): string {
  if (process.env.GEMINI_API_KEY?.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  for (const filename of [".env.local", ".env"]) {
    const candidate = join(repoRoot, filename);
    if (!existsSync(candidate)) continue;
    const raw = readFileSync(candidate, "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "GEMINI_API_KEY" && val) {
        return val;
      }
    }
  }
  return "";
}

export function extractCatalogSkusFromIndexHtml(repoRoot: string): CatalogSkuSummary[] {
  const indexPath = join(repoRoot, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`Could not locate index.html at ${indexPath}`);
  }
  const html = readFileSync(indexPath, "utf-8");
  const match = html.match(/const PRODUCTS = (\[[\s\S]*?\n\s*\]);/);
  if (!match) {
    throw new Error("Could not locate `const PRODUCTS = [...]` in index.html");
  }
  const products = new Function(`return (${match[1]});`)() as Array<{
    id: string;
    name: string;
    price: number;
    category: string;
    industry?: string;
    subIndustry?: string;
    productCode?: string;
    subtitle?: string;
  }>;

  const byCode = new Map<string, CatalogSkuSummary>();
  for (const p of products) {
    const code = p.productCode || p.id;
    let entry = byCode.get(code);
    if (!entry) {
      entry = {
        productCode: code,
        sampleName: p.name,
        category: p.category,
        price: Number(p.price || 0),
        industries: [],
        subIndustries: [],
        subtitle: p.subtitle || "",
      };
      byCode.set(code, entry);
    }
    if (p.industry && !entry.industries.includes(p.industry)) {
      entry.industries.push(p.industry);
    }
    if (p.subIndustry && !entry.subIndustries.includes(p.subIndustry)) {
      entry.subIndustries.push(p.subIndustry);
    }
  }
  return Array.from(byCode.values());
}

function formatCatalogContext(skus: CatalogSkuSummary[]): string {
  return skus
    .map(
      (s) =>
        `- ${s.productCode} | ${s.sampleName} | cat=${s.category} | $${s.price} | existing=${s.subIndustries.join(",")}`
    )
    .join("\n");
}

// -----------------------------------------------------------------------------
// Grounded Two-Step Gemini Interactions Runner
// -----------------------------------------------------------------------------

interface GroundedAgentParams {
  role: string;
  model: string;
  systemInstruction: string;
  researchPrompt: string;
  schema: Record<string, unknown>;
}

/**
 * Runs a grounded research turn using Interactions API (`google_search` + `url_context`),
 * then converts the verified findings into strict JSON using `response_format`.
 */
export async function runGroundedJsonAgent<T>(
  client: GoogleGenAI,
  params: GroundedAgentParams
): Promise<T> {
  const { role, model, systemInstruction, researchPrompt, schema } = params;

  const grounded = await client.interactions.create({
    model,
    system_instruction: systemInstruction,
    input: researchPrompt,
    tools: [{ type: "google_search" }, { type: "url_context" }],
  });

  const researchNotes = (grounded.output_text || "").trim();
  if (!researchNotes) {
    throw new Error(`[${role}] Grounded search interaction returned empty output_text.`);
  }

  const structured = await client.interactions.create({
    model,
    system_instruction:
      "You are a strict JSON compiler. Convert the grounded research notes below into valid JSON conforming exactly to the provided schema. Never invent facts, URLs, phone numbers, or email addresses not explicitly present in the notes. If a field such as email is missing in the notes, output an empty string \"\".",
    input: `Convert these grounded research notes into the exact JSON schema:\n\n${researchNotes}`,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema,
    },
  });

  const jsonText = (structured.output_text || "").trim();
  if (!jsonText) {
    throw new Error(`[${role}] Structured formatting step returned empty output_text.`);
  }
  return JSON.parse(jsonText) as T;
}

// -----------------------------------------------------------------------------
// Specialist Agent Functions
// -----------------------------------------------------------------------------

export async function runIndustryScoutAgent(
  client: GoogleGenAI,
  opts: { model: string; industryCount: number }
): Promise<StartupIndustry[]> {
  const prompt = `Today is November 27, 2026. Research the top ${opts.industryCount} high-growth U.S. small business startup industries for 2025-2026 using Google Search (U.S. Census Business Formation Statistics, SBA, Yelp Local Economic Impact / New Business Openings reports, Guidant/Gusto startup reports, and trade journals).

Focus on client-facing brick-and-mortar, studio, hospitality, medical/aesthetic, advisory, and specialty trade businesses where Day-1 founders purchase custom staff uniforms/apparel, reception QR/signage hardware, print stationery, and digital client intake/SOP templates.

For each industry include:
- id (kebab-case slug), rank (1..${opts.industryCount}), name
- l1Industry (one of beauty-wellness, hospitality-culinary, professional-medical, automotive-trades, founders-launch, or a clear L1 slug)
- l2SubIndustry (kebab-case sub-industry slug)
- catalogCoverage ("existing", "planned", or "new-expansion")
- growthMetric (real verified stat with year & source), typicalStartupBudget, avgTeamSize
- whyBooming (2-3 sentences), dayOneBuyerProfile
- sources (array of {title, url} directly from search results)`;

  const res = await runGroundedJsonAgent<{ industries: StartupIndustry[] }>(client, {
    role: "Industry Scout",
    model: opts.model,
    systemInstruction:
      "You are the Industry Scout agent for 7SEVENVII7SOLUTIONS. Only cite real statistics and verified URLs observed via Google Search.",
    researchPrompt: prompt,
    schema: INDUSTRY_LIST_SCHEMA,
  });
  return res.industries || [];
}

export async function runLeadFinderAgent(
  client: GoogleGenAI,
  opts: { model: string; industry: StartupIndustry; metros: string[]; leadsPerIndustry: number }
): Promise<NewlyOpenedLead[]> {
  const { industry, metros, leadsPerIndustry, model } = opts;
  const prompt = `Today is November 27, 2026. Target opening window: November 2025 – November 2026.
Find ${leadsPerIndustry} REAL, VERIFIABLE small businesses in the industry "${industry.name}" that opened between November 2025 and November 2026 across these U.S. metros: ${metros.join(", ")}.

Search local grand-opening press (WhatNow, Eater, CultureMap, Community Impact, local Business Journals, Chamber ribbon cuttings) and then search each business's official site to verify public contact channels.

STRICT ANTI-HALLUCINATION RULES:
- Never fabricate business names, opening dates, phone numbers, email addresses, Instagram handles, or URLs.
- Only include an email if explicitly published on a verified page; otherwise set email to "".
- Always supply openedDate, openingEvidence, sourceUrl, and at least one verified contact channel (website, phone, email, contactUrl, or instagram).
- Include a 1-2 sentence recommendedPitchAngle tailored to how 7SEVENVII7SOLUTIONS products fit their launch.`;

  const res = await runGroundedJsonAgent<{ leads: NewlyOpenedLead[] }>(client, {
    role: `Lead Finder · ${industry.name}`,
    model,
    systemInstruction:
      "You are the New Business Lead Finder agent for 7SEVENVII7SOLUTIONS. Every business and contact channel must come directly from Google Search and URL Context inspection.",
    researchPrompt: prompt,
    schema: LEAD_BATCH_SCHEMA,
  });
  return (res.leads || []).map((l, idx) => ({
    ...l,
    id: l.id || `lead-${industry.id}-${idx + 1}`,
    industryId: industry.id,
    industryName: industry.name,
  }));
}

export async function runProductStrategistAgent(
  client: GoogleGenAI,
  opts: { model: string; industry: StartupIndustry; catalogContext: string }
): Promise<IndustryProductResearch> {
  const { industry, catalogContext, model } = opts;
  const prompt = `Research Day-1 operational equipment, uniforms, front-desk signage, client onboarding templates, and hospitality touchpoints purchased by newly opened "${industry.name}" businesses.

EXISTING 7SEVENVII7SOLUTIONS CATALOG SKUS:
${catalogContext}

Deliver:
1. 4 best-fitting existing SKU matches from the list above (use exact productCode values, realistic starter bundle quantity, fitRationale, dayOnePitchHook).
2. 3 net-new high-margin B2B products (proposed 7V-* SKU, category physical/digital/packages, suggestedPrice, estimatedGrossMarginPct, buyerPainPoint, productSpec, and a rich editorial 4:3 photography scene description for Pomelli in warm alabaster, matte obsidian, champagne brass, and travertine aesthetic).
3. 1 turnkey recommendedStarterBundle for outreach to newly opened founders.`;

  const res = await runGroundedJsonAgent<IndustryProductResearch>(client, {
    role: `Product Strategist · ${industry.name}`,
    model,
    systemInstruction:
      "You are the Product-Fit Strategist agent for 7SEVENVII7SOLUTIONS. Ground your B2B product benchmarks in real industry buyer needs via Google Search.",
    researchPrompt: prompt,
    schema: PRODUCT_FIT_SCHEMA,
  });

  return {
    ...res,
    industryId: industry.id,
    industryName: industry.name,
    l1Industry: industry.l1Industry,
    l2SubIndustry: industry.l2SubIndustry,
  };
}

// -----------------------------------------------------------------------------
// Concurrency & Export Helpers
// -----------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIdx = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, () =>
    runWorker()
  );
  await Promise.all(workers);
  return results;
}

function toCsvCell(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function writeCsvFile(filePath: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => toCsvCell(row[h])).join(","));
  }
  writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

// -----------------------------------------------------------------------------
// CLI Parsing & Entrypoint
// -----------------------------------------------------------------------------

function parseCliArgs(argv: string[], repoRoot: string): CliOptions {
  const opts: CliOptions = {
    metros: [...DEFAULT_METROS],
    industryCount: 12,
    leadsPerIndustry: 5,
    filterIndustry: "",
    outDir: join(repoRoot, "data"),
    model: DEFAULT_MODEL,
    concurrency: 4,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--metros" && argv[i + 1]) {
      opts.metros = argv[++i]
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--industry-count" && argv[i + 1]) {
      opts.industryCount = Math.max(1, Number.parseInt(argv[++i], 10) || 12);
    } else if (arg === "--leads-per-industry" && argv[i + 1]) {
      opts.leadsPerIndustry = Math.max(1, Number.parseInt(argv[++i], 10) || 5);
    } else if (arg === "--filter-industry" && argv[i + 1]) {
      opts.filterIndustry = argv[++i].trim();
    } else if (arg === "--out-dir" && argv[i + 1]) {
      opts.outDir = resolve(repoRoot, argv[++i]);
    } else if (arg === "--model" && argv[i + 1]) {
      opts.model = argv[++i].trim();
    } else if (arg === "--concurrency" && argv[i + 1]) {
      opts.concurrency = Math.max(1, Number.parseInt(argv[++i], 10) || 4);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`7SEVENVII7SOLUTIONS Multi-Agent Startup Research CLI

Usage:
  npm run agents:research -- [options]

Options:
  --metros "Austin, TX;Miami, FL"   Semicolon-separated U.S. metros (default: top 12 growth metros)
  --industry-count <n>              Number of startup industries to scout (default: 12)
  --leads-per-industry <n>          Verified newly opened businesses per industry (default: 5)
  --filter-industry <slug|name>     Refresh only a matching industry from existing JSON
  --out-dir <path>                  Output directory for JSON and CSVs (default: ./data)
  --model <gemini-model>            Gemini 4 model ID (default: gemini-4-hydrogen)
  --concurrency <n>                 Max parallel industry pipelines (default: 4)
  --dry-run                         Validate catalog parsing & print execution plan without API calls
  --help, -h                        Show this help text`);
}

async function main(): Promise<void> {
  const repoRoot = getRepoRoot();
  const opts = parseCliArgs(process.argv.slice(2), repoRoot);
  if (opts.help) {
    printHelp();
    return;
  }

  const catalogSkus = extractCatalogSkusFromIndexHtml(repoRoot);
  const catalogContext = formatCatalogContext(catalogSkus);

  if (opts.dryRun) {
    console.log("7SEVENVII7 Multi-Agent Research CLI — DRY RUN");
    console.log(
      JSON.stringify(
        {
          repoRoot,
          parsedUniqueProductCodes: catalogSkus.length,
          sampleProductCodes: catalogSkus.slice(0, 6).map((c) => c.productCode),
          model: opts.model,
          industryCount: opts.industryCount,
          leadsPerIndustry: opts.leadsPerIndustry,
          filterIndustry: opts.filterIndustry || "(all)",
          metros: opts.metros,
          concurrency: opts.concurrency,
          outDir: opts.outDir,
          geminiApiKeyConfigured: Boolean(loadGeminiApiKey(repoRoot)),
        },
        null,
        2
      )
    );
    return;
  }

  const apiKey = loadGeminiApiKey(repoRoot);
  if (!apiKey) {
    console.error(
      "Missing GEMINI_API_KEY. Set GEMINI_API_KEY in your environment or .env.local (https://aistudio.google.com/app/api-keys)."
    );
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });
  mkdirSync(opts.outDir, { recursive: true });
  const jsonPath = join(opts.outDir, "startup-intelligence.json");

  let industries: StartupIndustry[] = [];
  let existingLeads: NewlyOpenedLead[] = [];
  let existingProductResearch: IndustryProductResearch[] = [];

  if (opts.filterIndustry && existsSync(jsonPath)) {
    const prev = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
      industries?: StartupIndustry[];
      leads?: NewlyOpenedLead[];
      productResearch?: IndustryProductResearch[];
    };
    industries = prev.industries || [];
    existingLeads = prev.leads || [];
    existingProductResearch = prev.productResearch || [];
  }

  if (industries.length === 0) {
    console.log(`[Stage 1] Running Industry Scout (${opts.model}, top ${opts.industryCount})...`);
    industries = await runIndustryScoutAgent(client, {
      model: opts.model,
      industryCount: opts.industryCount,
    });
  }

  const targetIndustries = opts.filterIndustry
    ? industries.filter(
        (ind) =>
          ind.id.toLowerCase() === opts.filterIndustry.toLowerCase() ||
          ind.name.toLowerCase().includes(opts.filterIndustry.toLowerCase())
      )
    : industries;

  if (targetIndustries.length === 0) {
    throw new Error(`No industries matched --filter-industry="${opts.filterIndustry}"`);
  }

  console.log(
    `[Stage 2] Running Lead Finder + Product Strategist across ${targetIndustries.length} industries (concurrency=${opts.concurrency})...`
  );

  const bundleResults = await mapWithConcurrency(
    targetIndustries,
    opts.concurrency,
    async (ind, idx) => {
      const rotated = [
        ...opts.metros.slice(idx % opts.metros.length),
        ...opts.metros.slice(0, idx % opts.metros.length),
      ].slice(0, 6);

      const [leads, productResearch] = await Promise.all([
        runLeadFinderAgent(client, {
          model: opts.model,
          industry: ind,
          metros: rotated,
          leadsPerIndustry: opts.leadsPerIndustry,
        }),
        runProductStrategistAgent(client, {
          model: opts.model,
          industry: ind,
          catalogContext,
        }),
      ]);

      console.log(
        `  -> ${ind.name}: ${leads.length} leads, ${productResearch.existingSkuMatches.length} SKU matches, ${productResearch.newProductOpportunities.length} new product ideas`
      );
      return { industryId: ind.id, leads, productResearch };
    }
  );

  const refreshedIds = new Set(targetIndustries.map((i) => i.id));
  const mergedLeads = [
    ...existingLeads.filter((l) => !refreshedIds.has(l.industryId)),
    ...bundleResults.flatMap((r) => r.leads),
  ];
  const mergedProductResearch = [
    ...existingProductResearch.filter((p) => !refreshedIds.has(p.industryId)),
    ...bundleResults.map((r) => r.productResearch),
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    window: "Nov 2025 – Nov 2026",
    geosCovered: opts.metros,
    summaryStats: {
      industriesCount: industries.length,
      leadsCount: mergedLeads.length,
      leadsWithEmail: mergedLeads.filter((l) => l.email.trim().length > 0).length,
      leadsWithPhone: mergedLeads.filter((l) => l.phone.trim().length > 0).length,
      leadsWithWebsite: mergedLeads.filter((l) => l.website.trim().length > 0).length,
      leadsWithInstagram: mergedLeads.filter((l) => l.instagram.trim().length > 0).length,
      existingSkuMatchesCount: mergedProductResearch.reduce(
        (acc, p) => acc + p.existingSkuMatches.length,
        0
      ),
      newProductOpportunitiesCount: mergedProductResearch.reduce(
        (acc, p) => acc + p.newProductOpportunities.length,
        0
      ),
    },
    industries,
    leads: mergedLeads,
    productResearch: mergedProductResearch,
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf-8");

  writeCsvFile(
    join(opts.outDir, "newly-opened-leads.csv"),
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
    mergedLeads as unknown as Array<Record<string, unknown>>
  );

  const productRows: Array<Record<string, unknown>> = [];
  for (const pr of mergedProductResearch) {
    const bundleName = pr.recommendedStarterBundle?.bundleName || "";
    for (const m of pr.existingSkuMatches) {
      productRows.push({
        industryId: pr.industryId,
        industryName: pr.industryName,
        recommendationType: "existing-sku-match",
        sku: m.productCode,
        name: m.productName,
        category: m.category,
        priceUsd: m.price,
        estimatedGrossMarginPct: "",
        estimatedBundleQty: m.estimatedBundleQty,
        rationaleOrPainPoint: m.fitRationale,
        pitchHookOrSpec: m.dayOnePitchHook,
        pomelliSceneDesc: "",
        starterBundle: bundleName,
      });
    }
    for (const n of pr.newProductOpportunities) {
      productRows.push({
        industryId: pr.industryId,
        industryName: pr.industryName,
        recommendationType: "net-new-opportunity",
        sku: n.proposedSku,
        name: n.name,
        category: n.category,
        priceUsd: n.suggestedPrice,
        estimatedGrossMarginPct: n.estimatedGrossMarginPct,
        estimatedBundleQty: "",
        rationaleOrPainPoint: n.buyerPainPoint,
        pitchHookOrSpec: n.productSpec,
        pomelliSceneDesc: n.pomelliSceneDesc,
        starterBundle: bundleName,
      });
    }
  }

  writeCsvFile(
    join(opts.outDir, "product-fit-recommendations.csv"),
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
    productRows
  );

  console.log("[Stage 3] Export complete:", payload.summaryStats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
