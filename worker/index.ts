import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { handleCloudApi } from '../cloud/api.mjs';
import { protectAdminPage } from '../cloud/admin-access.mjs';
import { authorizeSite } from '../cloud/guest-access.mjs';
import protectedAssets from '../.sites-build/protected-assets.mjs';
import { serveProtectedAsset } from '../cloud/protected-assets.mjs';

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
      const { response: gateResponse, access } = await authorizeSite(request, env);
      if (gateResponse) return gateResponse;
      const apiResponse = await handleCloudApi(request, env, access);
      if (apiResponse) return apiResponse;
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return new Response('Not found', {status:404});
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405});
      const adminResponse = protectAdminPage(request, env, access);
      if (adminResponse) return adminResponse;
      const protectedAsset = serveProtectedAsset(request, protectedAssets);
      if (protectedAsset) return protectedAsset;
      if (env.ASSETS) {
        // The asset binding maps directory index files to clean URLs.
        const asset = await env.ASSETS.fetch(new Request(url, request));
        const response = new Response(asset.body, asset);
        response.headers.set('X-Content-Type-Options','nosniff');
        response.headers.set('X-Robots-Tag','noindex, nofollow');
        response.headers.set('Referrer-Policy','no-referrer');
        response.headers.set('X-Frame-Options','DENY');
        // Every asset is behind the same invitation/owner gate. Never reuse an
        // authenticated response from the browser cache after expiry or logout.
        response.headers.set('Cache-Control','private, no-store');
        if (response.headers.get('Content-Type')?.includes('text/html')) response.headers.set('Cache-Control','private, no-store');
        return response;
      }
      return handler.fetch(request, env, ctx);
    });
  },
};

export default worker;
