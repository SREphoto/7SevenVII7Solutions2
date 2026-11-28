---
name: startup-market-intelligence
description: >-
  Run, refresh, or customize the 3-agent startup market intelligence pipeline
  (Industry Scout, New Business Lead Finder, Product-Fit Strategist) for
  7SEVENVII7SOLUTIONS using either Antigravity run_workflow or the Gemini
  Interactions TypeScript CLI.
---

# Startup Market Intelligence Multi-Agent Skill

Use this skill whenever the user asks to refresh or expand startup industry research, discover newly opened U.S. small businesses (past 12 months) with contact information, or generate product-fit mappings and net-new SKU opportunities for **7SEVENVII7SOLUTIONS**.

## Architecture (3 Specialist Agents)

1. **`industry-scout`**: Identifies top high-growth U.S. small business startup verticals (Census BFS, SBA, Yelp New Business Openings, Gusto/Guidant reports) and maps them to `7SEVENVII7` L1/L2 taxonomy.
2. **`new-business-lead-finder`**: Discovers verifiable businesses opened in the past 12 months across target U.S. metros using local opening press (`WhatNow`, `Eater`, `CultureMap`, `Community Impact`, Business Journals, Chamber ribbon cuttings) and official business websites. Never fabricates contacts; leaves `email: ""` when unpublished.
3. **`product-fit-strategist`**: Extracts all unique `productCode` SKUs from `index.html`, maps 4 existing `7V-*` SKUs per vertical, proposes 3 net-new high-margin B2B products with Pomelli 4:3 photography prompts, and defines a turnkey Starter Bundle.

## Option A — Run via Antigravity Workflow (Recommended inside IDE)

Execute `workflows/startup_research_workflow.py` using `run_workflow`:

```text
run_workflow(
  ScriptPath="/Users/Samuel/AGapps/7SevenVII7Solutions2/workflows/startup_research_workflow.py",
  Description="Refresh startup industries, newly opened leads, and 7SEVENVII7 product fit"
)
```

Outputs generated automatically:
- `data/startup-intelligence.json` (consumed by `startup-intel.html`)
- `data/newly-opened-leads.csv`
- `data/product-fit-recommendations.csv`

## Option B — Run Standalone TypeScript CLI (Gemini Interactions API)

Requires `GEMINI_API_KEY` in environment or `.env.local`. Uses `gemini-4-hydrogen` with `google_search` + `url_context` grounding and strict JSON compilation.

```bash
# Verify catalog parsing & configuration without API calls
npm run agents:research -- --dry-run

# Full nationwide run across 12 industries
npm run agents:research -- --industry-count 12 --leads-per-industry 5

# Refresh a single industry for specific metros
npm run agents:research -- --filter-industry medspas-longevity --metros "Austin, TX;Dallas, TX;Miami, FL"
```

## Viewing & Actioning Results

- Open `startup-intel.html` to browse the 12 industries, filter the Newly Opened Businesses CRM, copy tailored outreach emails/DMs, and push net-new product ideas directly into `product-audit.html` via `localStorage['7vii7_planned_products_v1']`.
