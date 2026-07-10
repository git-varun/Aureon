"Known Limitations"
 section: CDSL CAS import response
uses imported_holdings, NPS/EPF import responses use holdings_imported —
inconsistent field naming across import endpoints, cosmetic only, not
worth a breaking-change fix right now.

"Known Limitations"
 section: useAureonData.js hardcodes
tier: 'active' for every holding — the "Passive" filter tab and "Manual"
badge in PfHoldingsTable don't reflect real state today. Pre-existing,
not caused by any recent change.
