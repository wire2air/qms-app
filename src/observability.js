/**
 * Faro Web SDK bootstrap — frontend RUM (errors, Web Vitals, browser traces).
 *
 * Imported and initialized from main.js BEFORE the Vue app mounts so that
 * unhandled errors during boot are captured. Skipped entirely when
 * VITE_FARO_URL is unset (e.g. local dev without the Grafana stack running).
 *
 * Telemetry destination: a Faro receiver hosted by Alloy. See infra/alloy/config.alloy.
 */
import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk'
import { TracingInstrumentation } from '@grafana/faro-web-tracing'

let faroInstance = null

export function initFaro() {
  const url = import.meta.env.VITE_FARO_URL
  if (!url) return null
  if (faroInstance) return faroInstance

  faroInstance = initializeFaro({
    url,
    app: {
      name: 'qability-app',
      version: import.meta.env.VITE_APP_VERSION || '0.0.0',
      environment: import.meta.env.MODE,
    },
    instrumentations: [
      // Errors, Web Vitals, console capture, view changes.
      ...getWebInstrumentations({ captureConsole: false }),
      // Browser-side OpenTelemetry — fetch/XHR spans correlate with backend
      // traces in Tempo (matched by traceparent propagation).
      new TracingInstrumentation(),
    ],
    // Keep errors but drop large payload bodies to stay under the receiver's
    // 10 MiB limit on slow networks.
    isolate: true,
  })
  return faroInstance
}

/** Attach a handler that pushes Vue component errors to Faro. */
export function installVueErrorHandler(app) {
  if (!faroInstance) return
  app.config.errorHandler = (err, instance, info) => {
    faroInstance.api.pushError(err, { context: { vueInfo: info || '' } })
    if (import.meta.env.DEV) {
      console.error(err)
    }
  }
}
