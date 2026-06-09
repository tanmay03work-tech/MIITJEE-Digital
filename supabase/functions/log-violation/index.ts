import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ViolationType = 'app_background' | 'app_inactive' | 'auto_submit';

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Invalid user session.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { testId, violationType } = (await request.json()) as {
      testId?: string;
      violationType?: ViolationType;
    };

    if (!testId || !violationType) {
      return new Response(JSON.stringify({ error: 'testId and violationType are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['app_background', 'app_inactive', 'auto_submit'].includes(violationType)) {
      return new Response(JSON.stringify({ error: 'Unsupported violation type.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: test, error: testError } = await supabase
      .from('tests')
      .select('type')
      .eq('id', testId)
      .maybeSingle();

    if (testError) {
      throw testError;
    }

    if (!test || test.type !== 'weekly') {
      return new Response(JSON.stringify({ success: true, ignored: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    now.setSeconds(0, 0);

    const { error: insertError } = await supabase.from('rate_limit_events').insert({
      actor_id: authData.user.id,
      test_id: testId,
      action: violationType,
      window_bucket: now.toISOString(),
    });

    if (insertError) {
      throw insertError;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected violation logging failure.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
