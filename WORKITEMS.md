# FilterCart — Work Items

MV3 extension, plain JS, no build. Filters = URL state. See `PLAN.md` and `PROJECT.md` for detail.

| ID    | Work Item                          | Depends on            |
| ----- | ---------------------------------- | --------------------- |
| WI-01 | Repo & tracking setup              | —                     |
| WI-02 | Manifest & skeleton                | WI-01                 |
| WI-03 | Storage layer (`core/storage.js`)  | WI-02                 |
| WI-04 | Adapter contract + registry        | WI-02                 |
| WI-05 | Flipkart adapter                   | WI-04                 |
| WI-06 | Amazon adapter                     | WI-04                 |
| WI-07 | Myntra adapter                     | WI-04                 |
| WI-08 | Ajio adapter                       | WI-04                 |
| WI-09 | Matcher (normalizer + similarity)  | WI-02                 |
| WI-10 | Background worker                  | WI-03, WI-04          |
| WI-11 | Popup UI                           | WI-10, WI-03, WI-09   |
| WI-12 | Content script (in-page button)    | WI-11                 |
| WI-13 | Manual test pass & docs (README)   | all                   |

## Details

- **WI-01** — `git init`, `.gitignore`, `WORKITEMS.md`, `STATUS.md`. Initial commit.
- **WI-02** — MV3 `manifest.json`, `src/` skeleton, placeholder icons, background registration.
- **WI-03** — preset CRUD on `chrome.storage.sync`; preset schema; id generation.
- **WI-04** — `{ id, matches, parse, build }` contract; resolve adapter by URL.
- **WI-05** — Flipkart: `p[]=facets.<facet>[]=<value>` + `q=`.
- **WI-06** — Amazon: single `rh=` (facets comma-joined, values pipe-joined) + `k=`.
- **WI-07** — Myntra: `f=<Facet>:<v1>,<v2>::…` + `rf=Price:…`; category in path.
- **WI-08** — Ajio: `query=:relevance:<key>:<value>:…` + `text=`.
- **WI-09** — `SearchNormalizer` + rule-based `SimilarityProvider` (token overlap), swappable.
- **WI-10** — message handlers save/list/apply/delete; read active tab URL; navigate tab.
- **WI-11** — detect site/search; Save (+name); list matching presets; Apply; rename/delete.
- **WI-12** — optional in-page Save/Apply button on supported result pages.
- **WI-13** — load-unpacked test on all four sites; `README.md`; final status update.
