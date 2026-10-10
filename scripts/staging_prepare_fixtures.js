/**
 * Staging Test Fixture Provisioner & Cleanup Script
 *
 * CRITICAL SAFETY RULES:
 * - Reads all credentials strictly from environment variables:
 *     STAGING_SUPABASE_URL
 *     STAGING_SERVICE_ROLE_KEY
 * - NEVER prints secret keys or tokens.
 * - Confirms staging environment to prevent running against production.
 *
 * Usage:
 *   # 1. Provision 500 synthetic students and create isolated test fixture:
 *   node scripts/staging_prepare_fixtures.js --provision --count=500
 *
 *   # 2. Clean up all synthetic students and test fixtures:
 *   node scripts/staging_prepare_fixtures.js --cleanup
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const STAGING_URL = process.env.STAGING_SUPABASE_URL;
const STAGING_KEY = process.env.STAGING_SERVICE_ROLE_KEY;

if (!STAGING_URL || !STAGING_KEY) {
  console.error('Error: STAGING_SUPABASE_URL and STAGING_SERVICE_ROLE_KEY environment variables are required.');
  console.error('Do not paste credentials into scripts or commit them.');
  process.exit(1);
}

// Safety check: prohibit running if URL contains known production references without explicit staging flag
if (STAGING_URL.includes('uwuzdggimbbbfgcauzho') && !process.env.CONFIRM_IS_STAGING_REPLICA) {
  console.error('CRITICAL SAFETY ABORT: Target URL matches production project ref.');
  console.error('This script must ONLY be executed on an isolated staging/replica environment.');
  process.exit(1);
}

function request(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, STAGING_URL);
    const postData = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': STAGING_KEY,
      'Authorization': `Bearer ${STAGING_KEY}`,
      'Content-Type': 'application/json',
    };
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(url, { method, headers, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function provision(count = 500) {
  console.log(`[STAGING] Provisioning ${count} synthetic student accounts...`);
  const tokens = [];
  const outputFile = path.resolve(process.cwd(), 'staging_tokens.json');

  // 1. Create Isolated Benchmark Test
  const testRes = await request('/rest/v1/tests', 'POST', {
    title: '[STAGING BENCHMARK] Multi-Cohort Concurrency Target',
    description: 'Automated staging performance validation fixture',
    duration_minutes: 180,
    type: 'weekly',
    subject: 'Full Syllabus',
    scheduled_at: new Date(Date.now() - 3600000).toISOString(),
    is_started: true,
    is_open_for_all: true,
  });

  const getTest = await request('/rest/v1/tests?title=eq.[STAGING BENCHMARK] Multi-Cohort Concurrency Target&select=id');
  const testId = getTest.data?.[0]?.id;
  console.log(`[STAGING] Created benchmark test fixture ID: ${testId}`);

  // 2. Provision synthetic users in bounded batches
  for (let i = 1; i <= count; i++) {
    const email = `synthetic_student_${Date.now()}_${i}@miitjee-staging.test`;
    const password = 'StagingSyntheticPassword2026!';
    const userRes = await request('/auth/v1/admin/users', 'POST', {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Synthetic Candidate ${i}` },
    });

    const uid = userRes.data?.id;
    if (uid) {
      // Set role in profiles
      await request('/rest/v1/profiles', 'POST', {
        id: uid,
        full_name: `Synthetic Candidate ${i}`,
        email,
        role: 'student',
      });

      tokens.push({
        id: uid,
        name: `Synthetic Candidate ${i}`,
        email,
        // In staging setup, tokens are populated via password grant
      });
    }

    if (i % 25 === 0 || i === count) {
      console.log(`[STAGING] Provisioned ${i}/${count} synthetic students...`);
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(tokens, null, 2));
  console.log(`[STAGING] Written synthetic token manifest to ${outputFile}`);
  console.log(`[STAGING] Export environment variables before running k6:`);
  console.log(`  export STAGING_TEST_ID="${testId}"`);
  console.log(`  export STAGING_TOKENS_PATH="${outputFile}"`);
}

async function cleanup() {
  console.log('[STAGING] Cleaning up synthetic test fixtures and users...');
  const manifestPath = path.resolve(process.cwd(), 'staging_tokens.json');

  if (fs.existsSync(manifestPath)) {
    const users = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`[STAGING] Deleting ${users.length} synthetic users...`);
    for (const u of users) {
      if (u.id) {
        await request(`/auth/v1/admin/users/${u.id}`, 'DELETE');
      }
    }
    fs.unlinkSync(manifestPath);
    console.log('[STAGING] Removed staging_tokens.json.');
  }

  // Delete test fixtures
  const testsRes = await request('/rest/v1/tests?title=eq.[STAGING BENCHMARK] Multi-Cohort Concurrency Target&select=id');
  const testIds = (testsRes.data || []).map((t) => t.id);
  for (const tId of testIds) {
    await request(`/rest/v1/test_attempts?test_id=eq.${tId}`, 'DELETE');
    await request(`/rest/v1/tests?id=eq.${tId}`, 'DELETE');
  }

  console.log('[STAGING] Cleanup complete.');
}

const args = process.argv.slice(2);
if (args.includes('--cleanup')) {
  cleanup().catch(console.error);
} else {
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 500;
  provision(count).catch(console.error);
}
