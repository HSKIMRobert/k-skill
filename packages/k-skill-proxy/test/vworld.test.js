const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isVWorldSuccessBody,
  normalizeVWorldPriceQuery,
  normalizeVWorldSearchQuery,
  proxyVWorldRequest
} = require("../src/vworld");
const { buildServer } = require("../src/server");

test("normalizes only the allowlisted VWorld search surface", () => {
  assert.deepEqual(
    normalizeVWorldSearchQuery({
      query: "강나루현대",
      type: "place",
      size: "100",
      page: "1",
      domain: "apartment-price-mcp.warmjin.com"
    }),
    {
      query: "강나루현대",
      type: "place",
      category: null,
      size: 100,
      page: 1,
      domain: "apartment-price-mcp.warmjin.com"
    }
  );

  assert.deepEqual(
    normalizeVWorldSearchQuery({ query: "서울 강서구 가양동 448-1", type: "address", category: "parcel" }),
    {
      query: "서울 강서구 가양동 448-1",
      type: "address",
      category: "parcel",
      size: 100,
      page: 1,
      domain: null
    }
  );

  assert.throws(() => normalizeVWorldSearchQuery({ query: "x", type: "road" }), /type/);
  assert.throws(() => normalizeVWorldSearchQuery({ query: "x", key: "must-not-be-in-query" }), /key/);
  assert.throws(() => normalizeVWorldSearchQuery({ query: "x", size: "101" }), /size/);
});

test("normalizes and bounds VWorld apartment-price pagination and unit filters", () => {
  assert.deepEqual(
    normalizeVWorldPriceQuery({
      pnu: "1150010400104480001",
      stdrYear: "2026",
      pageNo: "2",
      numOfRows: "1000",
      dongNm: "101",
      hoNm: "1601",
      domain: "apartment-price-mcp.warmjin.com"
    }),
    {
      pnu: "1150010400104480001",
      stdrYear: "2026",
      pageNo: 2,
      numOfRows: 1000,
      dongNm: "101",
      hoNm: "1601",
      domain: "apartment-price-mcp.warmjin.com"
    }
  );

  assert.throws(() => normalizeVWorldPriceQuery({ pnu: "115", stdrYear: "2026" }), /pnu/);
  assert.throws(
    () => normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "2026", dongNm: "101" }),
    /dongNm and hoNm/
  );
  assert.throws(
    () => normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "2026", numOfRows: "1001" }),
    /numOfRows/
  );
});

test("forwards the header credential only to the fixed VWorld host and redacts echoed secrets", async () => {
  const calls = [];
  const secret = "vworld-test-secret";
  const result = await proxyVWorldRequest({
    operation: "search",
    params: normalizeVWorldSearchQuery({ query: "강나루현대", type: "place" }),
    apiKey: secret,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(
        JSON.stringify({ response: { status: "OK", result: { items: [] }, echoed: secret } }),
        { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
      );
    }
  });

  const upstream = new URL(calls[0].url);
  assert.equal(upstream.origin, "https://api.vworld.kr");
  assert.equal(upstream.pathname, "/req/search");
  assert.equal(upstream.searchParams.get("key"), secret);
  assert.equal(calls[0].options.headers.accept, "application/json");
  assert.equal(result.statusCode, 200);
  assert.doesNotMatch(result.body, new RegExp(secret));
  assert.match(result.body, /\[REDACTED\]/);
});

test("requires a credential and recognizes only semantic VWorld successes", async () => {
  await assert.rejects(
    proxyVWorldRequest({
      operation: "prices",
      params: normalizeVWorldPriceQuery({ pnu: "1150010400104480001", stdrYear: "2026" }),
      apiKey: ""
    }),
    (error) => error.code === "upstream_not_configured" && error.statusCode === 503
  );

  assert.equal(isVWorldSuccessBody("search", '{"response":{"status":"OK"}}'), true);
  assert.equal(isVWorldSuccessBody("search", '{"response":{"status":"ERROR"}}'), false);
  assert.equal(
    isVWorldSuccessBody("prices", '{"apartHousingPrices":{"resultCode":""}}'),
    true
  );
  assert.equal(
    isVWorldSuccessBody("prices", '{"apartHousingPrices":{"resultCode":"AUTH"}}'),
    false
  );
});

test("VWorld search route delegates its header credential, caches success, and never accepts query credentials", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({ response: { status: "OK", result: { items: [{ id: "1150010400104480001" }] } } }),
      { status: 200, headers: { "content-type": "application/json;charset=UTF-8" } }
    );
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const url = "/v1/vworld/search?query=%EA%B0%95%EB%82%98%EB%A3%A8%ED%98%84%EB%8C%80&type=place&domain=apartment-price-mcp.warmjin.com";
  const first = await app.inject({
    method: "GET",
    url,
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });
  const second = await app.inject({
    method: "GET",
    url,
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });
  const missing = await app.inject({ method: "GET", url });
  const queryCredential = await app.inject({
    method: "GET",
    url: `${url}&key=query-secret`,
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  });

  assert.equal(first.statusCode, 200);
  assert.deepEqual(second.json(), first.json());
  assert.equal(calls.length, 1, "the second valid request should reuse a successful cached body");
  assert.match(calls[0], /^https:\/\/api\.vworld\.kr\/req\/search\?/);
  assert.match(calls[0], /key=delegated-secret/);
  assert.equal(missing.statusCode, 503);
  assert.equal(queryCredential.statusCode, 400);
  assert.doesNotMatch(first.body, /delegated-secret/);
  assert.doesNotMatch(missing.body, /delegated-secret/);
});

test("VWorld apartment-price route preserves JSON and does not cache semantic errors", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const body = calls === 1
      ? { apartHousingPrices: { resultCode: "AUTH", resultMsg: "invalid", field: [] } }
      : {
          apartHousingPrices: {
            resultCode: "",
            resultMsg: "",
            totalCount: "1",
            pageNo: "1",
            numOfRows: "1000",
            field: [{ pblntfPc: "587000000" }]
          }
        };
    return Response.json(body);
  };
  const app = buildServer({ env: { KSKILL_PROXY_CACHE_TTL_MS: "60000" } });
  t.after(async () => {
    global.fetch = originalFetch;
    await app.close();
  });

  const request = {
    method: "GET",
    url: "/v1/vworld/apartment-prices?pnu=1150010400104480001&stdrYear=2026&pageNo=1&numOfRows=1000&dongNm=101&hoNm=1601",
    headers: { "x-k-skill-vworld-api-key": "delegated-secret" }
  };
  const failed = await app.inject(request);
  const recovered = await app.inject(request);
  const cached = await app.inject(request);

  assert.equal(failed.statusCode, 200);
  assert.equal(failed.json().apartHousingPrices.resultCode, "AUTH");
  assert.equal(recovered.json().apartHousingPrices.field[0].pblntfPc, "587000000");
  assert.deepEqual(cached.json(), recovered.json());
  assert.equal(calls, 2, "semantic failures must not be cached, while the recovered response must be cached");
});
