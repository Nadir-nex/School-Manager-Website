"use strict";

const INSTALLER_PATH = "/School-Manager-Setup.exe";
const INSTALLER_KEY = "School-Manager-Setup.exe";
const INSTALLER_NAME = "School-Manager-Setup.exe";

function installerHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("content-type", "application/vnd.microsoft.portable-executable");
  headers.set("content-disposition", `attachment; filename="${INSTALLER_NAME}"`);
  headers.set("cache-control", "public, max-age=3600");
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === INSTALLER_PATH) {
      if (request.method === "HEAD") {
        const object = await env.SCHOOL_MANAGER_APP.head(INSTALLER_KEY);
        if (!object) return new Response("Installer not found", { status: 404 });

        const headers = installerHeaders(object);
        headers.set("content-length", String(object.size));
        return new Response(null, { status: 200, headers });
      }

      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }

      const object = await env.SCHOOL_MANAGER_APP.get(INSTALLER_KEY, {
        onlyIf: request.headers,
      });

      if (!object) return new Response("Installer not found", { status: 404 });

      const headers = installerHeaders(object);

      // A conditional request can return metadata without a body.
      if (!("body" in object)) {
        return new Response(null, { status: 304, headers });
      }

      headers.set("content-length", String(object.size));
      return new Response(object.body, { status: 200, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
