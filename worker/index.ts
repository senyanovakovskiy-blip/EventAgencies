import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { handleCloudApi } from '../cloud/api.mjs';

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, async () => {
      const apiResponse = await handleCloudApi(request, env);
      if (apiResponse) return apiResponse;
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return new Response('Not found', {status:404});
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405});
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        if (!request.headers.get('oai-authenticated-user-id')) {
          return Response.redirect(url.origin + '/signin-with-chatgpt?return_to=/admin', 302);
        }
      }
      if (env.ASSETS) {
        // The asset binding maps directory index files to clean URLs.
        const asset = await env.ASSETS.fetch(new Request(url, request));
        const response = new Response(asset.body, asset);
        response.headers.set('X-Content-Type-Options','nosniff');
        response.headers.set('X-Robots-Tag','noindex, nofollow');
        if (response.headers.get('Content-Type')?.includes('text/html')) response.headers.set('Cache-Control','private, no-store');
        return response;
      }
      return handler.fetch(request, env, ctx);
    });
  },
};

export default worker;
