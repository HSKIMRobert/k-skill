---
"k-skill-proxy": minor
---

Remove the KERIS/RISS academic search proxy route. RISS Open API keys are only issued to non-profit institutions/universities, so the `keris-academic-search` skill now calls the RISS upstream directly with the user's own `KSKILL_RISS_API_KEY` instead of routing through the hosted proxy.
