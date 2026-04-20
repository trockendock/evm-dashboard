import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { projectId, apiToken, action } = await req.json();
    if (!projectId) return json({ error: 'Missing projectId' }, 400);

    // Ownership via RLS sichern
    const { data: proj, error: projErr } = await userClient
      .from('projects')
      .select('id, jira_config')
      .eq('id', projectId)
      .single();
    if (projErr || !proj) return json({ error: 'Project not found' }, 404);

    const admin = createClient(supabaseUrl, serviceKey);

    if (action === 'delete') {
      await admin.from('jira_credentials').delete().eq('project_id', projectId);
      const newConfig = { ...(proj.jira_config || {}) };
      delete newConfig.tokenSet;
      await admin.from('projects').update({ jira_config: newConfig }).eq('id', projectId);
      return json({ ok: true, tokenSet: false });
    }

    if (typeof apiToken !== 'string' || apiToken.length < 4) {
      return json({ error: 'Token zu kurz' }, 400);
    }

    const { error: upsertErr } = await admin
      .from('jira_credentials')
      .upsert({ project_id: projectId, api_token: apiToken, updated_at: new Date().toISOString() });
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    const newConfig = { ...(proj.jira_config || {}), tokenSet: true };
    await admin.from('projects').update({ jira_config: newConfig }).eq('id', projectId);

    return json({ ok: true, tokenSet: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
