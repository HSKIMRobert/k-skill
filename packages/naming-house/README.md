# naming-house

Deterministic Korean naming recommendation helper for k-skill. It combines `saju-fortune` birth-based five-element context, `namefyi` Hanja/CJK stroke helpers, `korean-stroke` Hangul fallback strokes, and explicit local scoring weights.

## Install

```bash
npm install -g naming-house
```

Repository development:

```bash
npm install
npm run test --workspace naming-house
```

## API

```js
const { recommendNames, scoreNameCandidate, buildNamingContext } = require("naming-house")

const result = await recommendNames({
  surname: "김",
  surnameHanja: "金",
  birthDate: "2024-05-18",
  birthTime: "09:20",
  calendar: "solar",
  gender: "female",
  candidates: [
    { givenName: "서아", hanjaName: "瑞雅", tags: ["modern"] },
    { givenName: "하린", hanjaName: "河潾" },
    { givenName: "지유" }
  ]
})
```

Exports:

- `getMissingNamingFields(input)`
- `normalizeNamingInput(input)`
- `buildNamingContext(input)`
- `scoreNameCandidate(candidate, context, options)`
- `recommendNames(input, options)`
- `callNamingHouseTool(name, args)`
- `adapters`

## CLI

```bash
naming-house --tool recommend_names --input-json '{"surname":"김","birthDate":"2024-05-18","birthTime":"09:20","calendar":"solar","gender":"female","candidates":[{"givenName":"서아","hanjaName":"瑞雅"}]}'
```

## Scoring

| Component | Range | Meaning |
| --- | --- | --- |
| `elementBalance` | 0-40 | Saju needed elements matched by name elements |
| `strokeHarmony` | 0-30 | Adjacent stroke-element relationships and stroke profile |
| `soundFlow` | 0-20 | Hangul length, repeated syllables, romanization flow |
| `preferenceFit` | 0-10 | Preferred/avoided syllables, style tags, meaning notes |

Grades: `excellent` 85-100, `good` 70-84, `fair` 50-69, `weak` 0-49.

## Provenance

- `saju-fortune`: saju pillars, five-element distribution, weak/useful elements, time/lunar limitations.
- `namefyi`: Hanja/CJK stroke count, stroke-to-element mapping, element compatibility, Korean romanization. The npm package is ESM-only, so `naming-house` loads it with dynamic `import()` from a CommonJS package. If the installed package cannot provide the Hanja stroke functions, Hanja stroke scoring fails closed with `hanja-stroke-unavailable`; only romanization may use a local compatibility fallback.
- `korean-stroke`: Hangul stroke fallback when Hanja is not supplied.

## Limitations

This package is cultural/reference guidance. It does not certify official 인명용 한자, legal name validity, 불용문자, fate, health, finance, or legal outcomes. Lunar dates must be converted with a verified 만세력 before calling with `calendar: "solar"`; unsupported lunar input follows `saju-fortune` rejection behavior.

`naming-house` runs as a local or global npm package. It does not serve an MCP server or proxy.
