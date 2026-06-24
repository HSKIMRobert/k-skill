const crypto = require("node:crypto")

const LOVEBUG_BASE_URL = "https://xn--2i0bt2q2wd1wb.com"
const SUPABASE_URL = "https://sewrbxfawkmusnyzjoab.supabase.co"
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3JieGZhd2ttdXNueXpqb2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDAzODAsImV4cCI6MjA5MzUxNjM4MH0.jOzkBBdRPQFvAhvgc2SvSfWDnEQCouFS2AXvJoAikrY"
const DEFAULT_HISTORICAL_YEAR = 2026
const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_DEVICE_HASH_NAMESPACE = "lovebug-report"

const LEVEL_LABELS = {
  0: "잠잠해요",
  1: "살짝 보임",
  2: "많아요",
  3: "매우 많아요"
}

const SCORE_LABELS = {
  0: "지금은 조용해요",
  1: "조금 보여요",
  2: "꽤 많이 보여요",
  3: "엄청 많아요, 조심!"
}

const ADVISORY_LABELS = {
  0: "평상시 활동 OK",
  1: "베란다 조명 끄면 도움돼요",
  2: "외출 시 주의, 창문 방충망 점검",
  3: "외출/환기 자제 권장, 흰 옷 피하기"
}

const CONTEXT_LABELS = {
  indoor: "실내",
  street: "길거리",
  park: "공원",
  transit: "지하철·버스",
  shop: "상가",
  other: "기타"
}

const CONTEXT_ALIASES = new Map([
  ["indoor", "indoor"],
  ["inside", "indoor"],
  ["실내", "indoor"],
  ["집", "indoor"],
  ["건물안", "indoor"],
  ["street", "street"],
  ["road", "street"],
  ["outdoor", "street"],
  ["outside", "street"],
  ["길거리", "street"],
  ["길", "street"],
  ["실외", "street"],
  ["바깥", "street"],
  ["park", "park"],
  ["공원", "park"],
  ["transit", "transit"],
  ["subway", "transit"],
  ["bus", "transit"],
  ["지하철", "transit"],
  ["버스", "transit"],
  ["지하철버스", "transit"],
  ["지하철·버스", "transit"],
  ["지하철ㆍ버스", "transit"],
  ["shop", "shop"],
  ["store", "shop"],
  ["상가", "shop"],
  ["가게", "shop"],
  ["매장", "shop"],
  ["other", "other"],
  ["기타", "other"]
])

class LovebugRequestError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = "LovebugRequestError"
    this.status = options.status ?? null
    this.code = options.code ?? null
    this.body = options.body
  }
}

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim()
}

function normalizeToken(value) {
  return cleanText(value).replace(/[\s._-]+/g, "").toLowerCase()
}

function parseBoolean(value, defaultValue = undefined) {
  if (value == null || value === "") return defaultValue
  if (typeof value === "boolean") return value
  const token = normalizeToken(value)
  if (["true", "1", "yes", "y", "include", "포함"].includes(token)) return true
  if (["false", "0", "no", "n", "exclude", "미포함"].includes(token)) return false
  return defaultValue
}

function normalizeLevel(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3) return value
  const token = normalizeToken(value)
  if (["0", "quiet", "none", "잠잠", "잠잠해요", "없음", "안보임", "조용"].includes(token)) return 0
  if (["1", "low", "slight", "살짝", "살짝보임", "조금", "조금보여요"].includes(token)) return 1
  if (["2", "medium", "many", "많음", "많아요", "꽤많이", "꽤많이보여요"].includes(token)) return 2
  if (["3", "high", "verymany", "peak", "매우많음", "매우많아요", "엄청많음", "엄청많아요", "조심"].includes(token)) return 3
  throw new TypeError("level must be 0, 1, 2, 3 or one of the official Korean labels")
}

function normalizeContext(value = "other") {
  const token = normalizeToken(value || "other")
  const normalized = CONTEXT_ALIASES.get(token) || CONTEXT_ALIASES.get(cleanText(value))
  if (!normalized) throw new TypeError(`unsupported report context: ${value}`)
  return normalized
}

function normalizeCode(value, label) {
  const code = cleanText(value)
  if (!/^\d{5,10}$/.test(code)) throw new TypeError(`${label} must be a Korean administrative code`)
  return code
}

function normalizeLevelFromScore(score) {
  const value = Number(score)
  if (!Number.isFinite(value) || value <= 25) return 0
  if (value <= 50) return 1
  if (value <= 75) return 2
  return 3
}

function coordinatesFromGeometry(geometry) {
  const coordinates = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : []
  if (coordinates.length < 2) return null
  const [lng, lat] = coordinates
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null
  return { lng: Number(lng), lat: Number(lat) }
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""))
}

function createTimeoutSignal(timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) }
}

async function requestJson(url, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is not available; pass options.fetch or use Node.js 18+")
  const timeout = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal || timeout?.signal
  try {
    const response = await fetchImpl(url, { ...options.init, signal })
    const text = await response.text()
    let body = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    if (!response.ok) {
      throw new LovebugRequestError(`lovebug request failed: ${response.status}`, {
        status: response.status,
        body,
        code: classifyReportError(body)
      })
    }
    return body
  } finally {
    timeout?.cancel()
  }
}

function buildUrl(path, params) {
  const url = new URL(path, LOVEBUG_BASE_URL)
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function buildGuScoreUrl() {
  return buildUrl("/api/map/gu-score")
}

function buildWeeklyReportCountUrl() {
  return buildUrl("/api/map/weekly-report-count")
}

function buildClustersUrl(options = {}) {
  return buildUrl("/api/map/clusters", {
    level: options.level || "sigungu",
    historicalYear: options.historicalYear ?? DEFAULT_HISTORICAL_YEAR,
    historicalWeek: options.historicalWeek,
    date: options.date
  })
}

function buildAreasUrl(options = {}) {
  return buildUrl("/api/map/areas", {
    historicalYear: options.historicalYear ?? DEFAULT_HISTORICAL_YEAR,
    includePolygon: options.includePolygon === true ? "true" : "false",
    historicalWeek: options.historicalWeek,
    date: options.date
  })
}

function buildBoundariesUrl(options = {}) {
  return buildUrl("/api/map/boundaries", { level: options.level || "sigungu" })
}

function normalizeGuScoreFeature(feature, rank = null) {
  const properties = feature?.properties || {}
  const level = properties.no_data ? 0 : normalizeLevelFromScore(properties.score)
  return compactObject({
    rank,
    gu_code: cleanText(properties.gu_code),
    gu_name: cleanText(properties.gu_name),
    sido: cleanText(properties.sido),
    score: Number(properties.score ?? 0),
    score_label: properties.no_data ? "아직 정보가 부족해요" : SCORE_LABELS[level],
    advisory: ADVISORY_LABELS[level],
    level,
    level_label: LEVEL_LABELS[level],
    no_data: Boolean(properties.no_data),
    coordinates: coordinatesFromGeometry(feature.geometry),
    counts: compactObject({
      report: numberOrNull(properties.report_count ?? properties.report_count_14d),
      report_14d: numberOrNull(properties.report_count_14d),
      report_24h: numberOrNull(properties.report_count_24h),
      verified_14d: numberOrNull(properties.report_count_verified_14d),
      spotted: numberOrNull(properties.spotted_count),
      quiet: numberOrNull(properties.quiet_count ?? properties.quiet_count_14d),
      low: numberOrNull(properties.low_count),
      medium: numberOrNull(properties.medium_count),
      high: numberOrNull(properties.high_count)
    }),
    metrics: compactObject({
      intensity_score: numberOrNull(properties.intensity_score),
      spotted_rate_score: numberOrNull(properties.spotted_rate_score),
      quiet_penalty: numberOrNull(properties.quiet_penalty),
      historical_score: numberOrNull(properties.historical_score),
      confidence_cap: numberOrNull(properties.confidence_cap)
    }),
    source_url: buildGuScoreUrl()
  })
}

function normalizeSnapshotFeature(feature) {
  const properties = feature?.properties || {}
  const stats = properties.stats || {}
  const classifiedLevel = clampLevel(stats.classified_level)
  return compactObject({
    area_code: cleanText(properties.code || properties.area_code),
    area_name: cleanText(properties.name || properties.label),
    gu_code: cleanText(properties.gu_code || properties.code),
    gu_name: cleanText(properties.gu_name || properties.label),
    sido: cleanText(properties.sido),
    coordinates: coordinatesFromGeometry(feature.geometry),
    centroid: properties.centroid ? { lng: Number(properties.centroid.lng), lat: Number(properties.centroid.lat) } : undefined,
    stats: compactObject({
      date: cleanText(stats.date),
      level: classifiedLevel,
      level_label: LEVEL_LABELS[classifiedLevel],
      intensity: numberOrNull(stats.intensity),
      confidence: numberOrNull(stats.confidence),
      indoor_ratio: numberOrNull(stats.indoor_ratio),
      report_count: numberOrNull(stats.report_count),
      report_count_verified: numberOrNull(stats.report_count_verified),
      hour_distribution: Array.isArray(stats.hour_distribution) ? stats.hour_distribution : undefined
    }),
    historical: normalizeHistorical(properties.historical)
  })
}

function normalizeHistorical(value) {
  if (!value) return null
  return compactObject({
    year: numberOrNull(value.year),
    week: numberOrNull(value.week),
    updated_at: cleanText(value.updated_at),
    mention_count: numberOrNull(value.mention_count),
    classified_level: clampLevel(value.classified_level),
    source_count: value.source_count || undefined,
    source_urls: Array.isArray(value.source_urls)
      ? value.source_urls.map((item) => compactObject({
          source: cleanText(item.source),
          title: cleanText(item.title),
          url: cleanText(item.url),
          date: cleanText(item.date)
        }))
      : undefined
  })
}

function normalizeGuScoreResponse(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : []
  const items = features.map((feature, index) => normalizeGuScoreFeature(feature, index + 1))
  return { type: "gu-score", source_url: buildGuScoreUrl(), items }
}

function normalizeSnapshotResponse(payload, options = {}) {
  const features = Array.isArray(payload?.features) ? payload.features : []
  return {
    type: options.type || payload?.level || "snapshot",
    date: payload?.date || null,
    level: payload?.level || null,
    source_url: options.sourceUrl || null,
    items: features.map(normalizeSnapshotFeature)
  }
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clampLevel(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(3, Math.round(number)))
}

async function getGuScores(options = {}) {
  const payload = await requestJson(buildGuScoreUrl(), options)
  return normalizeGuScoreResponse(payload)
}

async function getWeeklyReportCount(options = {}) {
  const payload = await requestJson(buildWeeklyReportCountUrl(), options)
  return { count: Number(payload?.count ?? 0), source_url: buildWeeklyReportCountUrl() }
}

async function getClusters(options = {}) {
  const sourceUrl = buildClustersUrl(options)
  const payload = await requestJson(sourceUrl, options)
  return normalizeSnapshotResponse(payload, { type: "clusters", sourceUrl })
}

async function getAreas(options = {}) {
  const sourceUrl = buildAreasUrl(options)
  const payload = await requestJson(sourceUrl, options)
  return normalizeSnapshotResponse(payload, { type: "areas", sourceUrl })
}

async function listRegions(options = {}) {
  const result = await getGuScores(options)
  const limit = parsePositiveInteger(options.limit, { defaultValue: 20, max: 100 })
  return { ...result, items: result.items.slice(0, limit) }
}

async function findRegion(query, options = {}) {
  const result = await searchLovebugRegions({ ...options, query, includeAreas: false })
  return result.items[0] || null
}

async function searchLovebugRegions(options = {}) {
  const query = cleanText(options.query)
  const limit = parsePositiveInteger(options.limit, { defaultValue: 10, max: 100 })
  const includeAreas = parseBoolean(options.includeAreas, true)
  const [guScores, weeklyReportCount, areas] = await Promise.all([
    getGuScores(options),
    getWeeklyReportCount(options).catch((error) => ({ count: null, warning: error.message })),
    includeAreas ? getAreas({ ...options, includePolygon: false }).catch((error) => ({ items: [], warning: error.message })) : Promise.resolve({ items: [] })
  ])
  const areaGroups = groupAreasByGu(areas.items || [], query)
  const items = guScores.items
    .filter((item) => regionMatches(item, query) || areaGroups.has(item.gu_code))
    .slice(0, limit)
    .map((item) => ({ ...item, areas: includeAreas ? areaGroups.get(item.gu_code) || [] : undefined }))
  return {
    type: "region-search",
    query,
    summary: {
      matched_count: items.length,
      weekly_report_count: weeklyReportCount.count,
      source_urls: [buildGuScoreUrl(), buildWeeklyReportCountUrl(), includeAreas ? buildAreasUrl({ includePolygon: false }) : null].filter(Boolean),
      warnings: [weeklyReportCount.warning, areas.warning].filter(Boolean)
    },
    items
  }
}

function regionMatches(item, query) {
  if (!query) return true
  const token = normalizeToken(query)
  return [item.gu_code, item.gu_name, item.sido].some((value) => normalizeToken(value).includes(token))
}

function groupAreasByGu(areas, query) {
  const token = normalizeToken(query)
  const groups = new Map()
  for (const area of areas) {
    if (token && ![area.area_code, area.area_name, area.gu_code, area.gu_name, area.sido].some((value) => normalizeToken(value).includes(token))) continue
    const list = groups.get(area.gu_code) || []
    list.push(area)
    groups.set(area.gu_code, list)
  }
  return groups
}

function buildSubmitAnonymousReportRequest(options = {}) {
  const guCode = normalizeCode(options.guCode || options.gu_code, "guCode")
  const level = normalizeLevel(options.level)
  const context = normalizeContext(options.context || "other")
  const lng = Number(options.lng)
  const lat = Number(options.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new TypeError("lng and lat are required numeric coordinates")
  const accuracyM = options.accuracyM == null || options.accuracyM === "" ? null : Number(options.accuracyM)
  if (accuracyM != null && !Number.isFinite(accuracyM)) throw new TypeError("accuracyM must be numeric when provided")
  const deviceHash = cleanText(options.deviceHash || options.device_hash)
  if (!deviceHash) throw new TypeError("deviceHash is required for report submission")
  const indoor = options.indoor == null ? context === "indoor" : Boolean(parseBoolean(options.indoor, options.indoor))
  const body = {
    p_gu_code: guCode,
    p_lng: lng,
    p_lat: lat,
    p_accuracy_m: accuracyM,
    p_level: level,
    p_device_hash: deviceHash,
    p_context: context,
    p_image_url: options.imageUrl || options.image_url || null,
    p_indoor: indoor
  }
  return {
    url: `${SUPABASE_REST_URL}/rpc/submit_anonymous_report`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(body)
  }
}

async function reportLovebug(options = {}) {
  const request = buildSubmitAnonymousReportRequest(options)
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is not available; pass options.fetch or use Node.js 18+")
  const timeout = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: options.signal || timeout?.signal
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
    if (!response.ok) {
      const code = classifyReportError(payload) || `HTTP_${response.status}`
      throw new LovebugRequestError(reportErrorMessage(code), { status: response.status, code, body: payload })
    }
    return {
      ok: true,
      status: response.status,
      report: JSON.parse(request.body),
      response: payload,
      source_url: request.url
    }
  } finally {
    timeout?.cancel()
  }
}

function classifyReportError(payload) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload || {})
  if (text.includes("ANON_DAILY_DUPLICATE")) return "ANON_DAILY_DUPLICATE"
  if (text.includes("OUTSIDE_GU_AREA")) return "OUTSIDE_GU_AREA"
  if (text.includes("ACCURACY_TOO_LOW")) return "ACCURACY_TOO_LOW"
  return null
}

function reportErrorMessage(code) {
  if (code === "ANON_DAILY_DUPLICATE") return "anonymous device already submitted a report for this region today"
  if (code === "OUTSIDE_GU_AREA") return "coordinates are outside the requested gu_code"
  if (code === "ACCURACY_TOO_LOW") return "location accuracy is too low for the lovebug.com report surface"
  return `lovebug report failed: ${code}`
}

function createDeviceHash(options = {}) {
  const seed = cleanText(options.seed || DEFAULT_DEVICE_HASH_NAMESPACE)
  return crypto.createHash("sha256").update(seed).digest("hex")
}

function parsePositiveInteger(value, { defaultValue, max = 100 } = {}) {
  if (value == null || value === "") return defaultValue
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new TypeError("value must be a positive integer")
  return Math.min(number, max)
}

module.exports = {
  ADVISORY_LABELS,
  CONTEXT_LABELS,
  LEVEL_LABELS,
  LOVEBUG_BASE_URL,
  SCORE_LABELS,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_URL,
  SUPABASE_URL,
  LovebugRequestError,
  buildAreasUrl,
  buildBoundariesUrl,
  buildClustersUrl,
  buildGuScoreUrl,
  buildSubmitAnonymousReportRequest,
  buildWeeklyReportCountUrl,
  createDeviceHash,
  findRegion,
  getAreas,
  getClusters,
  getGuScores,
  getWeeklyReportCount,
  listRegions,
  normalizeContext,
  normalizeGuScoreResponse,
  normalizeLevel,
  normalizeSnapshotResponse,
  reportLovebug,
  searchLovebugRegions
}
