"Known Limitations"
 section: CDSL CAS import response
uses imported_holdings, NPS/EPF import responses use holdings_imported —
inconsistent field naming across import endpoints, cosmetic only, not
worth a breaking-change fix right now.

Resolved: useAureonData.js used to hardcode tier: 'active' for every
holding. Now derives it from pos.price_source ('manual'/'epf_estimated'
-> 'passive', else 'active'), so the "Passive" filter tab and "Manual"
badge in PfHoldingsTable reflect real state.
