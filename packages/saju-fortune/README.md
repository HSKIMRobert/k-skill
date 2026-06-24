# saju-fortune

Local Node.js helper for Korean 사주팔자 interview-style fortune readings in k-skill.

It mirrors the public tool model from `hjsh200219/fortuneteller` without starting or serving an MCP server. The package provides deterministic local four-pillar calculation, element balance summaries, fortune-topic guidance, and compatibility comparison for agent workflows.

```js
const { analyzeSaju } = require("saju-fortune")

const result = analyzeSaju({
  birthDate: "1990-03-15",
  birthTime: "10:30",
  gender: "male"
}, { analysisType: "fortune", fortuneType: "wealth" })
```

The result is a reading aid, not a deterministic guarantee or professional advice.

Lunar birth dates are not converted locally. Pass a solar/Gregorian `birthDate`, or pre-convert an 음력/윤달 date with a verified manse calendar before calling `analyzeSaju`.

## CLI

```bash
saju-fortune --tool analyze_saju --birth-date 1990-03-15 --birth-time 10:30 --gender male --analysis-type fortune --fortune-type love
saju-fortune --tool convert_calendar --date 1990-03-15 --from-calendar solar --to-calendar solar
saju-fortune --tool check_compatibility --person1-json '{"birthDate":"1990-03-15","birthTime":"10:30","gender":"male"}' --person2-json '{"birthDate":"1992-07-20","birthTime":"14:30","gender":"female"}'
```

Solar↔lunar conversion remains unsupported without a verified manse calendar table; same-calendar conversion is an explicit identity operation.
