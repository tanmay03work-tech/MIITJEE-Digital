/**
 * Staging Load Test Harness for MIITJEE Digital Submission Pipeline (k6)
 *
 * CRITICAL SAFETY NOTICE:
 * - This harness is strictly designed for isolated staging/test projects.
 * - NEVER run this script against the production database.
 * - Credentials must be supplied via environment variables (never committed).
 *
 * Usage:
 *   k6 run \
 *     -e STAGING_SUPABASE_URL="https://your-staging-project.supabase.co" \
 *     -e STAGING_ANON_KEY="your-staging-anon-key" \
 *     -e STAGING_TEST_ID="00000000-0000-0000-0000-000000000000" \
 *     -e STAGING_TOKENS_PATH="./staging_tokens.json" \
 *     scripts/staging_k6_load_test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const successfulSubmissions = new Counter('successful_submissions');
const duplicateResponses = new Counter('idempotent_duplicate_responses');
const failedSubmissions = new Counter('failed_submissions');
const submissionDuration = new Trend('submission_rpc_duration_ms', true);
const errorRate = new Rate('submission_error_rate');

// Test Configuration - Staged ramp-up levels: 50, 100, 300, 500
export const options = {
  scenarios: {
    // 1. Stage: 50 concurrent submissions
    concurrency_50: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 1,
      maxDuration: '30s',
      startTime: '0s',
    },
    // 2. Stage: 100 concurrent submissions
    concurrency_100: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 1,
      maxDuration: '45s',
      startTime: '35s',
    },
    // 3. Stage: 300 concurrent submissions (if staging pool capacity allows)
    concurrency_300: {
      executor: 'per-vu-iterations',
      vus: 300,
      iterations: 1,
      maxDuration: '60s',
      startTime: '85s',
    },
    // 4. Stage: 500 concurrent submissions
    concurrency_500: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '90s',
      startTime: '150s',
    },
  },
  thresholds: {
    submission_error_rate: ['rate<0.01'], // < 1% error rate
    submission_rpc_duration_ms: ['p(95)<1500'], // P95 latency target < 1500ms
  },
};

// Load pre-seeded synthetic tokens from JSON file
let tokens = [];
try {
  const tokenFile = __ENV.STAGING_TOKENS_PATH || './staging_tokens.json';
  tokens = JSON.parse(open(tokenFile));
} catch (e) {
  // Fallback for verification/dry-run without tokens file
  tokens = [];
}

export default function () {
  const supabaseUrl = __ENV.STAGING_SUPABASE_URL;
  const anonKey = __ENV.STAGING_ANON_KEY;
  const testId = __ENV.STAGING_TEST_ID;

  if (!supabaseUrl || !anonKey || !testId) {
    throw new Error('Missing required environment variables: STAGING_SUPABASE_URL, STAGING_ANON_KEY, STAGING_TEST_ID');
  }

  // Assign distinct synthetic student token per virtual user index
  const userToken = tokens.length > 0 ? tokens[__VU % tokens.length]?.token : anonKey;
  const studentName = tokens.length > 0 ? tokens[__VU % tokens.length]?.name : `Synthetic Student ${__VU}`;

  const url = `${supabaseUrl}/rest/v1/rpc/submit_test_attempt`;

  const payload = JSON.stringify({
    p_test_id: testId,
    p_answers: {
      'q-synthetic-1': 'Option A',
      'q-synthetic-2': 'Option B',
    },
    p_student_name: studentName,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${userToken}`,
      'Prefer': 'return=representation',
    },
    timeout: '30s',
  };

  const startTime = Date.now();
  const res = http.post(url, payload, params);
  const elapsed = Date.now() - startTime;
  submissionDuration.add(elapsed);

  const isSuccess = check(res, {
    'status is 200': (r) => r.status === 200,
    'has attempt data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && (body.attempt || body.result);
      } catch {
        return false;
      }
    },
  });

  if (isSuccess) {
    successfulSubmissions.add(1);
    errorRate.add(0);

    try {
      const data = JSON.parse(res.body);
      if (data.is_existing) {
        duplicateResponses.add(1);
      }
    } catch {
      // Ignored
    }
  } else {
    failedSubmissions.add(1);
    errorRate.add(1);
  }

  // Small pacing pause between iterations
  sleep(1);
}
