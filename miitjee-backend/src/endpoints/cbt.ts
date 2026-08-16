/**
 * CBT Windows & Desktop Engine Backend Endpoints
 * Cloudflare Workers Hono Framework Implementation
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

function getSupabaseHeaders(env: Env) {
  return {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Prefer': 'return=representation'
  };
}

async function supabaseFetch(env: Env, path: string, method = 'GET', body?: unknown) {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const options: RequestInit = {
    method,
    headers: getSupabaseHeaders(env)
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const responseText = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = responseText;
  }
  return { status: response.status, ok: response.ok, data };
}

// 1. Device Registration & Single Device Binding Handler
export async function registerDeviceHandler(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as {
      user_id: string;
      device_fingerprint: string;
      device_name?: string;
      os_version?: string;
    };

    if (!body.user_id || !body.device_fingerprint) {
      return Response.json({ error: 'user_id and device_fingerprint are required' }, { status: 400 });
    }

    // Check existing bound device for student
    const checkRes = await supabaseFetch(
      env,
      `/student_devices?user_id=eq.${body.user_id}&is_active=eq.true`
    );

    const existingDevices = Array.isArray(checkRes.data) ? checkRes.data : [];

    if (existingDevices.length > 0) {
      const boundDevice = existingDevices[0];
      if (boundDevice.device_fingerprint !== body.device_fingerprint) {
        return Response.json({
          error: 'DEVICE_MISMATCH',
          message: 'This account is already registered on another computer. Contact Super Admin to reset device registration.',
          registered_device: boundDevice.device_name || 'Registered PC'
        }, { status: 403 });
      }
      // Update last_used_at timestamp
      await supabaseFetch(
        env,
        `/student_devices?id=eq.${boundDevice.id}`,
        'PATCH',
        { last_used_at: new Date().toISOString() }
      );
      return Response.json({ success: true, status: 'RE_VERIFIED', device: boundDevice });
    }

    // Register new device
    const insertRes = await supabaseFetch(
      env,
      '/student_devices',
      'POST',
      {
        user_id: body.user_id,
        device_fingerprint: body.device_fingerprint,
        device_name: body.device_name || 'Windows Desktop',
        os_version: body.os_version || 'Windows 10/11',
        is_active: true
      }
    );

    if (!insertRes.ok) {
      return Response.json({ error: 'Failed to bind device', details: insertRes.data }, { status: 500 });
    }

    return Response.json({ success: true, status: 'NEWLY_BOUND', device: insertRes.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

// 2. Start / Resume CBT Exam Session Handler
export async function startCbtSessionHandler(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as {
      user_id: string;
      test_id: string;
      device_fingerprint: string;
      duration_minutes: number;
    };

    if (!body.user_id || !body.test_id || !body.device_fingerprint) {
      return Response.json({ error: 'user_id, test_id, and device_fingerprint required' }, { status: 400 });
    }

    // Verify Device Binding First
    const deviceRes = await supabaseFetch(
      env,
      `/student_devices?user_id=eq.${body.user_id}&device_fingerprint=eq.${body.device_fingerprint}&is_active=eq.true`
    );
    const devices = Array.isArray(deviceRes.data) ? deviceRes.data : [];
    if (devices.length === 0) {
      return Response.json({ error: 'DEVICE_UNAUTHORIZED', message: 'Device not authorized for this student.' }, { status: 403 });
    }

    // Check existing active session
    const sessionRes = await supabaseFetch(
      env,
      `/cbt_exam_sessions?user_id=eq.${body.user_id}&test_id=eq.${body.test_id}`
    );
    const sessions = Array.isArray(sessionRes.data) ? sessionRes.data : [];

    if (sessions.length > 0) {
      const activeSession = sessions[0];
      if (activeSession.status === 'LOCKED' && !activeSession.is_unlocked_by_admin) {
        return Response.json({
          error: 'SESSION_LOCKED',
          message: 'Exam session is locked due to security violation or crash. Request admin unlock.'
        }, { status: 423 });
      }
      return Response.json({ success: true, status: 'RESUMED', session: activeSession });
    }

    // Create new session
    const duration = body.duration_minutes || 180;
    const newSession = {
      test_id: body.test_id,
      user_id: body.user_id,
      device_fingerprint: body.device_fingerprint,
      status: 'IN_PROGRESS',
      duration_minutes: duration,
      time_remaining_seconds: duration * 60,
      is_unlocked_by_admin: true
    };

    const createRes = await supabaseFetch(env, '/cbt_exam_sessions', 'POST', newSession);
    if (!createRes.ok) {
      return Response.json({ error: 'Failed to create exam session', details: createRes.data }, { status: 500 });
    }

    return Response.json({ success: true, status: 'STARTED', session: createRes.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

// 3. Batched 10-Second Queue Sync Handler
export async function syncBatchHandler(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as {
      session_id: string;
      user_id: string;
      test_id: string;
      version_id: number;
      time_remaining_seconds: number;
      answers_json: Record<string, unknown>;
      client_timestamp: string;
    };

    if (!body.session_id || !body.answers_json) {
      return Response.json({ error: 'session_id and answers_json required' }, { status: 400 });
    }

    // Save snapshot delta
    const snapshotPayload = {
      session_id: body.session_id,
      user_id: body.user_id,
      test_id: body.test_id,
      snapshot_type: 'DELTA_10S',
      answers_json: body.answers_json,
      version_id: body.version_id || 1,
      client_timestamp: body.client_timestamp || new Date().toISOString()
    };

    const snapRes = await supabaseFetch(env, '/cbt_answer_snapshots', 'POST', snapshotPayload);

    // Update active session time & last_synced_at
    await supabaseFetch(
      env,
      `/cbt_exam_sessions?id=eq.${body.session_id}`,
      'PATCH',
      {
        time_remaining_seconds: body.time_remaining_seconds,
        last_synced_at: new Date().toISOString()
      }
    );

    return Response.json({
      success: true,
      synced_version: body.version_id,
      server_timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

// 4. CBT Security Audit Event Logger
export async function auditLogHandler(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as {
      session_id?: string;
      user_id: string;
      event_type: string;
      details_json?: Record<string, unknown>;
    };

    if (!body.user_id || !body.event_type) {
      return Response.json({ error: 'user_id and event_type required' }, { status: 400 });
    }

    await supabaseFetch(env, '/cbt_audit_logs', 'POST', {
      session_id: body.session_id || null,
      user_id: body.user_id,
      event_type: body.event_type,
      details_json: body.details_json || {}
    });

    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

// 5. Admin CBT Recovery Operations Handler
export async function adminRecoveryHandler(req: Request, env: Env): Promise<Response> {
  try {
    const body = await req.json() as {
      action: 'UNBIND_DEVICE' | 'UNLOCK_SESSION' | 'EXTEND_TIMER' | 'FORCE_SUBMIT' | 'VIEW_SNAPSHOTS';
      user_id: string;
      test_id?: string;
      session_id?: string;
      extra_minutes?: number;
    };

    if (!body.action || !body.user_id) {
      return Response.json({ error: 'action and user_id required' }, { status: 400 });
    }

    switch (body.action) {
      case 'UNBIND_DEVICE': {
        await supabaseFetch(
          env,
          `/student_devices?user_id=eq.${body.user_id}`,
          'PATCH',
          { is_active: false }
        );
        return Response.json({ success: true, message: 'Device unbound successfully' });
      }

      case 'UNLOCK_SESSION': {
        if (!body.session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
        await supabaseFetch(
          env,
          `/cbt_exam_sessions?id=eq.${body.session_id}`,
          'PATCH',
          { status: 'IN_PROGRESS', is_unlocked_by_admin: true }
        );
        return Response.json({ success: true, message: 'Session unlocked successfully' });
      }

      case 'EXTEND_TIMER': {
        if (!body.session_id || !body.extra_minutes) {
          return Response.json({ error: 'session_id and extra_minutes required' }, { status: 400 });
        }
        const extraSecs = body.extra_minutes * 60;
        await supabaseFetch(
          env,
          `/cbt_exam_sessions?id=eq.${body.session_id}`,
          'PATCH',
          { extra_time_minutes: body.extra_minutes }
        );
        return Response.json({ success: true, message: `Added ${body.extra_minutes} mins to session` });
      }

      case 'FORCE_SUBMIT': {
        if (!body.session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
        await supabaseFetch(
          env,
          `/cbt_exam_sessions?id=eq.${body.session_id}`,
          'PATCH',
          { status: 'FORCE_SUBMITTED' }
        );
        return Response.json({ success: true, message: 'Session force submitted by admin' });
      }

      case 'VIEW_SNAPSHOTS': {
        if (!body.session_id) return Response.json({ error: 'session_id required' }, { status: 400 });
        const snapRes = await supabaseFetch(
          env,
          `/cbt_answer_snapshots?session_id=eq.${body.session_id}&order=version_id.desc`
        );
        return Response.json({ success: true, snapshots: snapRes.data });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
