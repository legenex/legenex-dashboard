import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin only. Builds the Facebook Login dialog URL. When called directly in the
// browser (GET) it redirects there with a 302. When called via the SDK (which
// sends the auth header) it returns the URL as JSON so the frontend can perform
// a top-level navigation itself. redirect_uri is fixed to the metaOauthCallback
// function. A random state value is sent for basic CSRF protection.
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
      scope: 'ads_read,ads_management,business_management',
      response_type: 'code',
      state,
    });

    const dialogUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

    // If the caller expects JSON (SDK invoke from the dashboard), return the URL
    // so the frontend can navigate the top-level window to Facebook itself.
    const accept = req.headers.get('accept') || '';
    if (accept.includes('application/json')) {
      return Response.json({ url: dialogUrl });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: dialogUrl },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});