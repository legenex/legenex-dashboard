import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin only. Builds the Facebook Login dialog URL and redirects (302) the
// browser there so the user can grant ads_read + business_management.
// redirect_uri is fixed to the metaOauthCallback function. A random state
// value is sent for basic CSRF protection.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appId = Deno.env.get('META_APP_ID');
    if (!appId) {
      return Response.json({ error: 'META_APP_ID is not configured' }, { status: 500 });
    }

    const redirectUri = 'https://api.legenex.com/functions/metaOauthCallback';
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: 'ads_read,business_management',
      response_type: 'code',
      state,
    });

    const dialogUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

    return new Response(null, {
      status: 302,
      headers: { Location: dialogUrl },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});