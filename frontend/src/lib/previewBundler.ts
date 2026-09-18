/**
 * Multi-File Virtual Bundler & Sandbox Script Injector
 *
 * Compiles a project's virtual file tree (index.html, style.css, app.js, and auxiliary files)
 * into a cohesive, standalone HTML document for rendering inside a sandboxed iframe.
 *
 * Injects:
 * 1. window.highlevel runtime SDK with RPC postMessage bridge to parent host & direct fetch fallback.
 * 2. Console log interceptor (console.log, info, warn, error).
 * 3. Runtime error traps (window.onerror, window.onunhandledrejection).
 */

export interface PreviewBundleOptions {
  proxyBaseUrl?: string;
  userToken?: string;
  enableRpcBridge?: boolean;
  enableConsoleCapture?: boolean;
}

/**
 * Normalizes relative file paths for matching (e.g. "./style.css" -> "style.css", "/app.js" -> "app.js")
 */
export function normalizeFilename(path: string): string {
  return path.trim().replace(/^(\.\/|\/)/, "").trim();
}

/**
 * Generates the Console and Runtime Error Interceptor script.
 * Serializes arguments and dispatches PREVIEW_CONSOLE_LOG and PREVIEW_RUNTIME_ERROR to window.parent.
 */
export function generateConsoleCaptureScript(): string {
  return `
<script data-genesis-injected="console-interceptor">
(function() {
  function sendToParent(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, payload }, '*');
      }
    } catch (_e) {
      // Ignore serialization or postMessage dispatch errors
    }
  }

  const origConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  function serializeArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return arg.stack || (arg.name + ': ' + arg.message);
    try {
      return JSON.stringify(arg, null, 2);
    } catch (_err) {
      return String(arg);
    }
  }

  ['log', 'info', 'warn', 'error'].forEach(function(level) {
    console[level] = function() {
      var args = Array.prototype.slice.call(arguments);
      origConsole[level].apply(console, args);
      sendToParent('PREVIEW_CONSOLE_LOG', {
        level: level,
        message: args.map(serializeArg).join(' '),
        timestamp: Date.now()
      });
    };
  });

  window.onerror = function(msg, source, lineno, colno, error) {
    sendToParent('PREVIEW_RUNTIME_ERROR', {
      message: String(msg),
      source: source ? String(source) : undefined,
      line: lineno,
      column: colno,
      stack: error && error.stack ? error.stack : undefined,
      timestamp: Date.now()
    });
    return false;
  };

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var message = reason instanceof Error ? reason.message : (typeof reason === 'string' ? reason : 'Unhandled Promise Rejection');
    sendToParent('PREVIEW_RUNTIME_ERROR', {
      message: message,
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: Date.now()
    });
  });
})();
</script>`.trim();
}

/**
 * Generates the HighLevel Runtime Client SDK with dual RPC (postMessage) & direct fetch fallback.
 */
export function generateHighLevelRuntimeScript(options: PreviewBundleOptions = {}): string {
  const proxyBase = options.proxyBaseUrl || "/hlProxy";
  const userTokenStr = options.userToken ? `"${options.userToken}"` : "null";

  return `
<script data-genesis-injected="highlevel-runtime">
(function() {
  var PROXY_BASE = "${proxyBase}";
  var USER_TOKEN = ${userTokenStr};
  var pendingRequests = new Map();

  // Listen for RPC responses from parent Genesis host
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || data.type !== 'HL_API_RESPONSE' || !data.reqId) return;

    var req = pendingRequests.get(data.reqId);
    if (req) {
      pendingRequests.delete(data.reqId);
      if (data.success) {
        req.resolve(data.data);
      } else {
        req.reject(new Error(data.error || 'HighLevel API request failed'));
      }
    }
  });

  // Direct HTTP Fetch Fallback (used when running in external popup tab without parent bridge)
  async function directFetchRequest(endpoint, method, params, body) {
    var url = new URL(PROXY_BASE + (endpoint.startsWith('/') ? endpoint : '/' + endpoint), window.location.origin);
    if (params) {
      Object.entries(params).forEach(function(entry) {
        var k = entry[0], v = entry[1];
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
    }
    var headers = { 'Accept': 'application/json' };
    if (USER_TOKEN) headers['Authorization'] = 'Bearer ' + USER_TOKEN;
    if (body) headers['Content-Type'] = 'application/json';

    var res = await fetch(url.toString(), {
      method: method || 'GET',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      throw new Error(errData.message || errData.error || ('HighLevel API error (' + res.status + ')'));
    }
    return res.json();
  }

  // ARCHITECTURE DECISION: postMessage RPC bridge isolates auth tokens from guest DOM and avoids Origin: null CORS hurdles
  // Unified Request Dispatcher: Uses Parent RPC Bridge when inside iframe; falls back to direct fetch
  function dispatchHlRequest(service, action, endpoint, method, params, body) {
    return new Promise(function(resolve, reject) {
      if (window.parent && window.parent !== window) {
        var reqId = 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
        var timeoutId = setTimeout(function() {
          if (pendingRequests.has(reqId)) {
            pendingRequests.delete(reqId);
            reject(new Error('HighLevel API request timed out (20s)'));
          }
        }, 20000);

        pendingRequests.set(reqId, {
          resolve: function(data) {
            clearTimeout(timeoutId);
            resolve(data);
          },
          reject: function(err) {
            clearTimeout(timeoutId);
            reject(err);
          }
        });

        window.parent.postMessage({
          type: 'HL_API_REQUEST',
          reqId: reqId,
          service: service,
          action: action,
          endpoint: endpoint,
          method: method || 'GET',
          params: params,
          body: body
        }, '*');
      } else {
        directFetchRequest(endpoint, method, params, body)
          .then(resolve)
          .catch(reject);
      }
    });
  }

  // Expose HighLevel SDK runtime on window.highlevel
  window.highlevel = {
    contacts: {
      list: function(params) {
        return dispatchHlRequest('contacts', 'list', '/contacts', 'GET', params);
      },
      get: function(id) {
        return dispatchHlRequest('contacts', 'get', '/contacts/' + encodeURIComponent(id), 'GET');
      },
      create: function(data) {
        return dispatchHlRequest('contacts', 'create', '/contacts', 'POST', null, data);
      },
      update: function(id, data) {
        return dispatchHlRequest('contacts', 'update', '/contacts/' + encodeURIComponent(id), 'PUT', null, data);
      }
    },
    conversations: {
      list: function(params) {
        return dispatchHlRequest('conversations', 'list', '/conversations', 'GET', params);
      },
      getMessages: function(id, params) {
        return dispatchHlRequest('conversations', 'getMessages', '/conversations/' + encodeURIComponent(id) + '/messages', 'GET', params);
      },
      sendMessage: function(data) {
        return dispatchHlRequest('conversations', 'sendMessage', '/conversations/messages', 'POST', null, data);
      }
    },
    calendars: {
      list: function() {
        return dispatchHlRequest('calendars', 'list', '/calendars', 'GET');
      },
      getAppointments: function(params) {
        return dispatchHlRequest('calendars', 'getAppointments', '/calendars/events', 'GET', params);
      },
      getFreeSlots: function(id, params) {
        return dispatchHlRequest('calendars', 'getFreeSlots', '/calendars/' + encodeURIComponent(id) + '/free-slots', 'GET', params);
      }
    },
    // Raw proxy escape hatch for arbitrary HighLevel V2 endpoints
    raw: function(endpoint, method, params, body) {
      return dispatchHlRequest('raw', 'raw', endpoint, method || 'GET', params, body);
    }
  };

  console.info('[Genesis Sandbox] window.highlevel runtime client initialized');
})();
</script>`.trim();
}

/**
 * Bundles a multi-file project into a single executable HTML document.
 *
 * @param files Key-value record of filenames to contents (e.g. index.html, style.css, app.js)
 * @param options Bundler configuration options
 */
export function bundlePreviewHtml(
  files: Record<string, string>,
  options: PreviewBundleOptions = {}
): string {
  // 1. Locate entry HTML file (index.html, index.htm, or first .html file)
  let htmlFileKey = Object.keys(files).find(
    (k) => k.toLowerCase() === "index.html" || k.toLowerCase() === "index.htm"
  );

  if (!htmlFileKey) {
    htmlFileKey = Object.keys(files).find((k) => k.toLowerCase().endsWith(".html"));
  }

  let htmlContent = htmlFileKey
    ? files[htmlFileKey]
    : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Genesis Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 p-6 font-sans">
  <div id="app"></div>
</body>
</html>`;

  // Set of files that have been inlined into the HTML
  const embeddedFiles = new Set<string>();
  if (htmlFileKey) embeddedFiles.add(htmlFileKey);

  // 2. Inline Local Stylesheets: <link rel="stylesheet" href="...">
  htmlContent = htmlContent.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*>|<link\s+[^>]*href=["'][^"']+["'][^>]*rel=["']stylesheet["'][^>]*>/gi,
    (match) => {
      const hrefMatch = match.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) return match;

      const href = hrefMatch[1];
      // Keep external CDNs (http://, https://, //)
      if (/^(https?:)?\/\//i.test(href)) {
        return match;
      }

      const normalizedHref = normalizeFilename(href);
      const matchedKey = Object.keys(files).find((k) => normalizeFilename(k) === normalizedHref);

      if (matchedKey && files[matchedKey] !== undefined) {
        embeddedFiles.add(matchedKey);
        return `<style data-filename="${matchedKey}">\n/* ${matchedKey} */\n${files[matchedKey]}\n</style>`;
      }

      return match;
    }
  );

  // 3. Inline Local Scripts: <script src="..."></script>
  htmlContent = htmlContent.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*>(\s*<\/script>)?/gi,
    (match, src) => {
      // Keep external scripts (http://, https://, //)
      if (/^(https?:)?\/\//i.test(src)) {
        return match;
      }

      const normalizedSrc = normalizeFilename(src);
      const matchedKey = Object.keys(files).find((k) => normalizeFilename(k) === normalizedSrc);

      if (matchedKey && files[matchedKey] !== undefined) {
        embeddedFiles.add(matchedKey);
        return `<script data-filename="${matchedKey}">\n/* ${matchedKey} */\n${files[matchedKey]}\n</script>`;
      }

      return match;
    }
  );

  // 4. Gather unreferenced CSS files and auto-inject into <head>
  const unreferencedCss: string[] = [];
  for (const [filename, content] of Object.entries(files)) {
    if (filename.toLowerCase().endsWith(".css") && !embeddedFiles.has(filename)) {
      unreferencedCss.push(`<style data-filename="${filename}">\n/* ${filename} */\n${content}\n</style>`);
      embeddedFiles.add(filename);
    }
  }

  // 5. Gather unreferenced JS files and auto-inject before </body>
  const unreferencedJs: string[] = [];
  for (const [filename, content] of Object.entries(files)) {
    if (
      (filename.toLowerCase().endsWith(".js") || filename.toLowerCase().endsWith(".mjs")) &&
      !embeddedFiles.has(filename)
    ) {
      unreferencedJs.push(`<script data-filename="${filename}">\n/* ${filename} */\n${content}\n</script>`);
      embeddedFiles.add(filename);
    }
  }

  // 6. Assemble injected scripts
  const injectedHeadParts: string[] = [];
  if (options.enableConsoleCapture !== false) {
    injectedHeadParts.push(generateConsoleCaptureScript());
  }
  injectedHeadParts.push(generateHighLevelRuntimeScript(options));
  if (unreferencedCss.length > 0) {
    injectedHeadParts.push(unreferencedCss.join("\n"));
  }

  const injectedHeadBlock = injectedHeadParts.join("\n");
  const injectedBodyBlock = unreferencedJs.length > 0 ? unreferencedJs.join("\n") : "";

  // 7. Inject into HTML document
  if (/<head[^>]*>/i.test(htmlContent)) {
    htmlContent = htmlContent.replace(/<head[^>]*>/i, (m) => `${m}\n${injectedHeadBlock}`);
  } else if (/<html[^>]*>/i.test(htmlContent)) {
    htmlContent = htmlContent.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n${injectedHeadBlock}\n</head>`);
  } else {
    htmlContent = `<head>\n${injectedHeadBlock}\n</head>\n${htmlContent}`;
  }

  if (injectedBodyBlock) {
    if (/<\/body>/i.test(htmlContent)) {
      htmlContent = htmlContent.replace(/<\/body>/i, `${injectedBodyBlock}\n</body>`);
    } else {
      htmlContent = `${htmlContent}\n${injectedBodyBlock}`;
    }
  }

  return htmlContent;
}
