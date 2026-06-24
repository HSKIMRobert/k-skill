const test = require("node:test")
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const path = require("node:path")

const {
  LOVEBUG_BASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_URL,
  buildAreasUrl,
  buildClustersUrl,
  buildGuScoreUrl,
  buildSubmitAnonymousReportRequest,
  buildWeeklyReportCountUrl,
  findRegion,
  listRegions,
  normalizeLevel,
  normalizeContext,
  normalizeGuScoreResponse,
  normalizeSnapshotResponse,
  reportLovebug,
  searchLovebugRegions
} = require("../src/index")

const GU_SCORE_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [127.092866673, 37.597805851] },
      properties: {
        gu_code: "11070",
        gu_name: "중랑구",
        sido: "서울특별시",
        score: 77,
        no_data: false,
        report_count: 439,
        report_count_14d: 439,
        report_count_24h: 105,
        spotted_count: 426,
        quiet_count: 13,
        low_count: 66,
        medium_count: 216,
        high_count: 144,
        intensity_score: 69,
        spotted_rate_score: 97,
        quiet_penalty: 0.993,
        historical_score: 87
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [126.955384886, 37.400327212] },
      properties: {
        gu_code: "31042",
        gu_name: "동안구",
        sido: "경기도",
        score: 70,
        no_data: false,
        report_count: 325,
        report_count_14d: 325,
        report_count_24h: 53,
        spotted_count: 319,
        quiet_count: 6,
        low_count: 85,
        medium_count: 180,
        high_count: 54
      }
    }
  ]
}

const AREAS_FIXTURE = {
  date: "2026-06-24",
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [127.081, 37.594] },
      properties: {
        code: "11070101",
        name: "면목동",
        sido: "서울특별시",
        gu_code: "11070",
        gu_name: "중랑구",
        stats: {
          date: "2026-06-24",
          intensity: 3,
          confidence: 5,
          indoor_ratio: 0.25,
          report_count: 20,
          report_count_verified: 18,
          classified_level: 3,
          hour_distribution: Array(24).fill(0)
        },
        historical: {
          year: 2026,
          mention_count: 12,
          source_count: { gov: 1, blog: 2, news: 3, academic: 0 },
          source_urls: [
            { source: "news", title: "중랑구 러브버그 방제", url: "https://example.test/news", date: "2026-06-20" }
          ]
        }
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [126.96, 37.39] },
      properties: {
        code: "31042101",
        name: "비산동",
        sido: "경기도",
        gu_code: "31042",
        gu_name: "동안구",
        stats: { classified_level: 2, report_count: 5, confidence: 2, indoor_ratio: null },
        historical: null
      }
    }
  ]
}

test("official URL builders target the discovered lovebug.com surfaces", () => {
  assert.equal(buildGuScoreUrl(), `${LOVEBUG_BASE_URL}/api/map/gu-score`)
  assert.equal(buildWeeklyReportCountUrl(), `${LOVEBUG_BASE_URL}/api/map/weekly-report-count`)
  assert.equal(buildClustersUrl({ level: "sigungu", historicalYear: 2026, historicalWeek: null }), `${LOVEBUG_BASE_URL}/api/map/clusters?level=sigungu&historicalYear=2026`)
  assert.equal(buildAreasUrl({ includePolygon: false, historicalYear: 2026, date: "2026-06-24" }), `${LOVEBUG_BASE_URL}/api/map/areas?historicalYear=2026&includePolygon=false&date=2026-06-24`)
})

test("normalizers return stable score and area summaries", () => {
  const guScores = normalizeGuScoreResponse(GU_SCORE_FIXTURE)
  assert.equal(guScores.type, "gu-score")
  assert.equal(guScores.items[0].gu_code, "11070")
  assert.equal(guScores.items[0].score_label, "엄청 많아요, 조심!")
  assert.equal(guScores.items[0].level, 3)
  assert.equal(guScores.items[0].coordinates.lat, 37.597805851)
  assert.equal(guScores.items[0].counts.high, 144)

  const areas = normalizeSnapshotResponse(AREAS_FIXTURE, { type: "areas" })
  assert.equal(areas.type, "areas")
  assert.equal(areas.date, "2026-06-24")
  assert.equal(areas.items[0].area_code, "11070101")
  assert.equal(areas.items[0].area_name, "면목동")
  assert.equal(areas.items[0].historical.source_count.news, 3)
})

test("searchLovebugRegions combines gu score and area fixtures", async () => {
  const calls = []
  const fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes("gu-score")) return jsonResponse(GU_SCORE_FIXTURE)
    if (String(url).includes("/areas")) return jsonResponse(AREAS_FIXTURE)
    if (String(url).includes("weekly-report-count")) return jsonResponse({ count: 11305 })
    throw new Error(`unexpected url ${url}`)
  }

  const result = await searchLovebugRegions({ query: "중랑", includeAreas: true, fetch })
  assert.equal(result.summary.weekly_report_count, 11305)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].gu_name, "중랑구")
  assert.equal(result.items[0].areas.length, 1)
  assert.equal(result.items[0].areas[0].area_name, "면목동")
  assert.ok(calls.some((url) => url.includes("/api/map/areas")))
})

test("listRegions and findRegion fetch public map data with injected fetch", async () => {
  const fetch = async (url) => {
    if (String(url).includes("gu-score")) return jsonResponse(GU_SCORE_FIXTURE)
    throw new Error(`unexpected url ${url}`)
  }

  const listed = await listRegions({ limit: 1, fetch })
  assert.equal(listed.items.length, 1)
  assert.equal(listed.items[0].gu_name, "중랑구")

  const found = await findRegion("동안", { fetch })
  assert.equal(found.gu_code, "31042")
})

test("buildSubmitAnonymousReportRequest mirrors the site's Supabase RPC contract", () => {
  const request = buildSubmitAnonymousReportRequest({
    guCode: "11070",
    lng: 127.09,
    lat: 37.59,
    accuracyM: 25,
    level: "많아요",
    context: "길거리",
    deviceHash: "device-1",
    indoor: false,
    imageUrl: "https://example.test/a.jpg"
  })

  assert.equal(request.url, `${SUPABASE_REST_URL}/rpc/submit_anonymous_report`)
  assert.equal(request.method, "POST")
  assert.equal(request.headers.apikey, SUPABASE_ANON_KEY)
  assert.deepEqual(JSON.parse(request.body), {
    p_gu_code: "11070",
    p_lng: 127.09,
    p_lat: 37.59,
    p_accuracy_m: 25,
    p_level: 2,
    p_device_hash: "device-1",
    p_context: "street",
    p_image_url: "https://example.test/a.jpg",
    p_indoor: false
  })
})
test("report submission requires a caller-provided stable device hash", async () => {
  assert.throws(
    () => buildSubmitAnonymousReportRequest({
      guCode: "11070",
      lng: 127.09,
      lat: 37.59,
      accuracyM: 25,
      level: "많아요",
      context: "길거리"
    }),
    /deviceHash is required/
  )

  await assert.rejects(
    () => reportLovebug({
      guCode: "11070",
      level: "많아요",
      context: "길거리",
      lng: 127.09,
      lat: 37.59,
      accuracyM: 25,
      fetch: async () => jsonResponse(null, { status: 204 })
    }),
    /deviceHash is required/
  )
})

test("reportLovebug submits anonymous reports and classifies official failure modes", async () => {
  const requests = []
  const okResult = await reportLovebug({
    guCode: "11070",
    level: 0,
    context: "실내",
    lng: 127.09,
    lat: 37.59,
    accuracyM: 25,
    deviceHash: "device-1",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init })
      return jsonResponse(null, { status: 204 })
    }
  })
  assert.equal(okResult.ok, true)
  assert.equal(requests.length, 1)
  assert.equal(JSON.parse(requests[0].init.body).p_context, "indoor")

  await assert.rejects(
    () => reportLovebug({
      guCode: "11070",
      level: 1,
      context: "park",
      lng: 127.09,
      lat: 37.59,
      accuracyM: 25,
      deviceHash: "device-1",
      fetch: async () => jsonResponse({ message: "ANON_DAILY_DUPLICATE" }, { ok: false, status: 400 })
    }),
    (error) => error.code === "ANON_DAILY_DUPLICATE"
  )
})

test("level and context aliases accept Korean site labels", () => {
  assert.equal(normalizeLevel("잠잠해요"), 0)
  assert.equal(normalizeLevel("살짝 보임"), 1)
  assert.equal(normalizeLevel("매우 많아요"), 3)
  assert.equal(normalizeContext("지하철·버스"), "transit")
  assert.equal(normalizeContext("상가"), "shop")
})

test("CLI prints search JSON and help", () => {
  const cli = path.join(__dirname, "..", "src", "cli.js")
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /lovebug-report search/)
  assert.match(help.stdout, /lovebug-report report/)
})

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? (options.status == null || (options.status >= 200 && options.status < 300)),
    status: options.status ?? 200,
    headers: new Map([["content-type", "application/json"]]),
    async json() {
      return body
    },
    async text() {
      return JSON.stringify(body)
    }
  }
}
