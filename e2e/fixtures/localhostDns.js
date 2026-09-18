/**
 * Node-side DNS shim: resolve `*.localhost` subdomains to loopback.
 *
 * Browsers resolve `foo.localhost` to 127.0.0.1 natively, but Node's
 * getaddrinfo does NOT (macOS/Linux return ENOTFOUND unless /etc/hosts has an
 * entry). The e2e fixtures hit the tenant hosts (e2elab.localhost /
 * e2ealt.localhost) from Node — plain fetch() in auth.setup plus Playwright's
 * APIRequestContext — so without this shim the suite only works on machines
 * with hand-edited hosts files.
 *
 * Imported from playwright.config.js, which every Playwright worker process
 * loads — no NODE_OPTIONS or hosts-file setup needed anywhere.
 */
import dns from 'node:dns'

const origLookup = dns.lookup.bind(dns)

function isDotLocalhost(hostname) {
  return typeof hostname === 'string' && hostname.endsWith('.localhost')
}

dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (isDotLocalhost(hostname)) {
    const family = options?.family === 6 ? 6 : 4
    const address = family === 6 ? '::1' : '127.0.0.1'
    if (options?.all) {
      process.nextTick(callback, null, [{ address, family }])
    } else {
      process.nextTick(callback, null, address, family)
    }
    return
  }
  return origLookup(hostname, options, callback)
}

const origPromisesLookup = dns.promises.lookup.bind(dns.promises)
dns.promises.lookup = async (hostname, options) => {
  if (isDotLocalhost(hostname)) {
    const family = options?.family === 6 ? 6 : 4
    const address = family === 6 ? '::1' : '127.0.0.1'
    if (options?.all) return [{ address, family }]
    return { address, family }
  }
  return origPromisesLookup(hostname, options)
}
