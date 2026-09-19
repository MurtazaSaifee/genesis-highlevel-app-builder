const assert = require("node:assert/strict");
const {
  checkRateLimit,
  resetRateLimits,
  rateLimitCheck,
  rateLimiter,
  getClientIp,
} = require("../lib/middleware/rateLimiter");

async function runTests() {
  console.log("=== Running Rate Limiting Middleware & Utility Tests ===");

  // Reset state before tests
  resetRateLimits();

  // 1. Single user allowed within limit
  console.log("1. Testing allowed requests within limit...");
  const status1 = checkRateLimit("user:tester1", { max: 3, windowMs: 5000 });
  assert.equal(status1.allowed, true, "First request must be allowed");
  assert.equal(status1.limit, 3);
  assert.equal(status1.remaining, 2);
  assert.ok(status1.resetAt > 0);

  const status2 = checkRateLimit("user:tester1", { max: 3, windowMs: 5000 });
  assert.equal(status2.allowed, true, "Second request must be allowed");
  assert.equal(status2.remaining, 1);

  const status3 = checkRateLimit("user:tester1", { max: 3, windowMs: 5000 });
  assert.equal(status3.allowed, true, "Third request must be allowed");
  assert.equal(status3.remaining, 0);
  console.log("   ✓ Allowed quota successfully decremented");

  // 2. Request exceeding limit is blocked (429 condition)
  console.log("2. Testing rate limit exhaustion & HTTP 429 trigger...");
  const status4 = checkRateLimit("user:tester1", { max: 3, windowMs: 5000 });
  assert.equal(status4.allowed, false, "Fourth request must be blocked");
  assert.equal(status4.remaining, 0);
  assert.ok(status4.retryAfterSec > 0, "retryAfterSec must be greater than 0");
  console.log(`   ✓ Request blocked correctly (Retry-After: ${status4.retryAfterSec}s)`);

  // 3. Multi-tenant isolation between different users
  console.log("3. Testing tenant/key isolation...");
  const userBStatus = checkRateLimit("user:tester2", { max: 3, windowMs: 5000 });
  assert.equal(userBStatus.allowed, true, "Independent user must not be impacted by other user's limit");
  assert.equal(userBStatus.remaining, 2);
  console.log("   ✓ User isolation verified");

  // 4. IP resolution helper
  console.log("4. Testing client IP resolution...");
  const reqWithForwarded = {
    headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
  };
  assert.equal(getClientIp(reqWithForwarded), "203.0.113.195");

  const reqWithDirectIp = {
    headers: {},
    ip: "192.168.1.50",
  };
  assert.equal(getClientIp(reqWithDirectIp), "192.168.1.50");
  console.log("   ✓ Client IP extracted correctly from headers/socket");

  // 5. Express Request/Response rateLimitCheck integration
  console.log("5. Testing rateLimitCheck HTTP headers & 429 response...");
  resetRateLimits();

  function createMockRes() {
    const headers = {};
    let statusCode = 200;
    let jsonBody = null;
    return {
      setHeader(name, val) {
        headers[name.toLowerCase()] = val;
      },
      getHeader(name) {
        return headers[name.toLowerCase()];
      },
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        return this;
      },
      get headers() {
        return headers;
      },
      get statusCode() {
        return statusCode;
      },
      get jsonBody() {
        return jsonBody;
      },
    };
  }

  const mockReq = {
    headers: {},
    ip: "10.0.0.1",
  };

  const res1 = createMockRes();
  const ok1 = await rateLimitCheck(mockReq, res1, { max: 2, windowMs: 10000 });
  assert.equal(ok1, true);
  assert.equal(res1.getHeader("x-ratelimit-limit"), "2");
  assert.equal(res1.getHeader("x-ratelimit-remaining"), "1");

  const res2 = createMockRes();
  const ok2 = await rateLimitCheck(mockReq, res2, { max: 2, windowMs: 10000 });
  assert.equal(ok2, true);
  assert.equal(res2.getHeader("x-ratelimit-remaining"), "0");

  const res3 = createMockRes();
  const ok3 = await rateLimitCheck(mockReq, res3, { max: 2, windowMs: 10000 });
  assert.equal(ok3, false, "Third request must fail rate limit check");
  assert.equal(res3.statusCode, 429, "HTTP status must be 429");
  assert.ok(res3.getHeader("retry-after"), "Retry-After header must be set");
  assert.equal(res3.jsonBody.error, "Too Many Requests");
  console.log("   ✓ HTTP 429 and RFC headers validated");

  // 6. Middleware wrapper execution
  console.log("6. Testing Express middleware wrapper behavior...");
  resetRateLimits();
  const mw = rateLimiter({ max: 1, windowMs: 10000 });
  let nextCalled = false;
  const resMw1 = createMockRes();
  await mw(mockReq, resMw1, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true, "First request must execute next()");

  nextCalled = false;
  const resMw2 = createMockRes();
  await mw(mockReq, resMw2, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false, "Rate-limited request must NOT execute next()");
  assert.equal(resMw2.statusCode, 429);
  console.log("   ✓ Middleware execution flow verified");

  console.log("\n✓ All Rate Limiting tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
