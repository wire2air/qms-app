/**
 * The in-page HUD: synthetic cursor, click ripples, typed-text readout and a
 * keyboard-shortcut display. Injected with `page.addInitScript` so it survives
 * every navigation, including full reloads.
 *
 * Why this has to exist at all: Playwright drives input through CDP, so there is
 * no OS cursor in the frame. A recording without it shows fields filling
 * themselves and buttons depressing with nothing touching them, which reads as a
 * screen glitch rather than a demo. Everything here is cosmetic and must never
 * change what a test observes.
 *
 * THREE INVARIANTS, each of which broke something during development:
 *
 * 1. **Closed shadow root.** Playwright's locators pierce OPEN shadow roots, so
 *    an open one would put `getByRole('button')`-visible nodes on every page and
 *    could make a strict-mode locator resolve to two elements. `closed` is
 *    invisible to the selector engine.
 * 2. **pointer-events: none, everywhere.** Any hit-testable pixel can steal a
 *    click from the element under it and fail a test for a cosmetic reason.
 * 3. **No layout impact.** Fixed positioning only, never appended inside body
 *    flow, so `scrollHeight`/`getBoundingClientRect` assertions are untouched.
 *
 * This file exports the function as a STRING deliberately: `addInitScript`
 * serialises it into the page, so it cannot close over anything from Node.
 */

export const CURSOR_OVERLAY_SOURCE = function installQaDemoOverlay() {
  // Guard against double-injection across same-document navigations.
  if (window.__qaDemoOverlayInstalled) return
  window.__qaDemoOverlayInstalled = true

  const install = () => {
    if (!document.body) return requestAnimationFrame(install)

    const host = document.createElement('div')
    host.setAttribute('aria-hidden', 'true')
    // Fixed + full viewport + no hit testing. Never inside the document flow.
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;' +
      'contain:layout style size;'
    // CLOSED: Playwright pierces open roots, which would leak these nodes into
    // the selector engine and can trip strict-mode locators.
    const root = host.attachShadow({ mode: 'closed' })
    document.documentElement.appendChild(host)

    root.innerHTML = `
      <style>
        :host, * { pointer-events: none !important; box-sizing: border-box; }
        .cursor {
          position: fixed; left: 0; top: 0; width: 26px; height: 26px;
          margin: -3px 0 0 -3px; opacity: 0;
          transition: transform 140ms cubic-bezier(.22,.61,.36,1), opacity 180ms linear;
          will-change: transform;
        }
        .cursor svg { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
        .ring {
          position: fixed; left: 0; top: 0; width: 46px; height: 46px;
          margin: -23px 0 0 -23px; border-radius: 50%;
          border: 3px solid rgba(56,189,248,.95); opacity: 0;
          transform: scale(.35); will-change: transform, opacity;
        }
        .ring.fire { animation: ripple 620ms cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes ripple {
          0%   { opacity: .95; transform: scale(.35); }
          70%  { opacity: .35; }
          100% { opacity: 0;   transform: scale(1.9); }
        }
        .dot {
          position: fixed; left: 0; top: 0; width: 16px; height: 16px;
          margin: -8px 0 0 -8px; border-radius: 50%;
          background: rgba(56,189,248,.55); opacity: 0; transform: scale(0);
        }
        .dot.fire { animation: press 420ms ease-out forwards; }
        @keyframes press {
          0%   { opacity: .9; transform: scale(0); }
          100% { opacity: 0;  transform: scale(1.6); }
        }
        .hud {
          position: fixed; left: 50%; bottom: 104px; transform: translateX(-50%);
          display: flex; gap: 8px; align-items: center; max-width: 76vw;
          padding: 10px 16px; border-radius: 10px;
          background: rgba(11,18,32,.92); border: 1px solid rgba(148,163,184,.3);
          box-shadow: 0 10px 30px rgba(0,0,0,.45);
          font: 500 17px/1.25 -apple-system, 'Helvetica Neue', Arial, 'DejaVu Sans', sans-serif;
          color: #F8FAFC; opacity: 0; transition: opacity 140ms linear;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .hud.show { opacity: 1; }
        .hud .tag {
          font-size: 12px; letter-spacing: .09em; text-transform: uppercase;
          color: #94A3B8; margin-right: 2px;
        }
        .hud .val { color: #F8FAFC; font-weight: 600; }
        .hud .caret {
          display: inline-block; width: 2px; height: 18px; background: #38BDF8;
          margin-left: 1px; vertical-align: -3px; animation: blink 1s steps(2) infinite;
        }
        @keyframes blink { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }
        .keys { display: flex; gap: 6px; }
        .key {
          padding: 4px 9px; border-radius: 6px; background: #1E293B;
          border: 1px solid rgba(148,163,184,.42); border-bottom-width: 3px;
          font: 600 15px/1 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
          color: #E2E8F0;
        }
      </style>
      <div class="cursor" part="cursor">
        <svg viewBox="0 0 26 26" width="26" height="26">
          <path d="M5 2 L5 20 L10 15.4 L13.2 22.6 L16.6 21 L13.4 14 L20 14 Z"
                fill="#FFFFFF" stroke="#0B1220" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="ring"></div>
      <div class="dot"></div>
      <div class="hud"><span class="tag"></span><span class="val"></span></div>
    `

    const cursor = root.querySelector('.cursor')
    const ring = root.querySelector('.ring')
    const dot = root.querySelector('.dot')
    const hud = root.querySelector('.hud')
    const hudTag = root.querySelector('.tag')
    const hudVal = root.querySelector('.val')

    let hudTimer = 0
    let last = { x: -1, y: -1 }

    function moveTo(x, y) {
      if (x === last.x && y === last.y) return
      last = { x, y }
      // translate3d keeps this on the compositor; `left/top` would invalidate
      // layout on every mousemove and visibly slow the page under recording.
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`
      cursor.style.opacity = '1'
    }

    function showHud(tag, value, { ttl = 1500, html = false } = {}) {
      hudTag.textContent = tag
      if (html) hudVal.innerHTML = value
      else hudVal.textContent = value
      hud.classList.add('show')
      clearTimeout(hudTimer)
      hudTimer = setTimeout(() => hud.classList.remove('show'), ttl)
    }

    function fire(el, cls) {
      el.classList.remove(cls)
      // Force reflow so the animation restarts on rapid repeat clicks.
      void el.offsetWidth
      el.classList.add(cls)
    }

    // --- pointer -----------------------------------------------------------
    addEventListener('mousemove', (e) => moveTo(e.clientX, e.clientY), true)

    addEventListener(
      'pointerdown',
      (e) => {
        moveTo(e.clientX, e.clientY)
        const t = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`
        ring.style.transform = t
        dot.style.transform = t
        fire(ring, 'fire')
        fire(dot, 'fire')
        const el = e.target instanceof Element ? e.target : null
        const label =
          el?.getAttribute?.('aria-label') ||
          el?.textContent?.trim?.().slice(0, 60) ||
          el?.tagName?.toLowerCase?.() ||
          ''
        if (label) showHud('Click', label, { ttl: 1100 })
      },
      true,
    )

    // --- typing ------------------------------------------------------------
    // `input` rather than keypress: it catches fill() (which sets value
    // directly) as well as real per-character typing.
    addEventListener(
      'input',
      (e) => {
        const el = e.target
        if (!el || !('value' in el)) return
        const type = (el.getAttribute?.('type') || '').toLowerCase()
        const isSecret = type === 'password' || el.getAttribute?.('data-qa-secret') === 'true'
        const raw = String(el.value ?? '')
        const shown = isSecret ? '•'.repeat(Math.min(raw.length, 24)) : raw.slice(-56)
        showHud('Typing', `${escapeHtml(shown)}<span class="caret"></span>`, {
          ttl: 1400,
          html: true,
        })
      },
      true,
    )

    // --- keyboard ----------------------------------------------------------
    const PRINTABLE = /^[\w\W]$/
    const PRETTY = {
      Control: 'Ctrl', Meta: '⌘', Alt: '⌥', Shift: '⇧', Enter: '↵ Enter',
      Escape: 'Esc', Tab: '⇥ Tab', Backspace: '⌫', Delete: 'Del',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Space',
    }

    addEventListener(
      'keydown',
      (e) => {
        const mods = []
        if (e.ctrlKey && e.key !== 'Control') mods.push('Ctrl')
        if (e.metaKey && e.key !== 'Meta') mods.push('⌘')
        if (e.altKey && e.key !== 'Alt') mods.push('⌥')
        if (e.shiftKey && e.key !== 'Shift') mods.push('⇧')

        const isPlainPrintable = PRINTABLE.test(e.key) && !mods.length && e.key !== ' '
        // Plain characters are already narrated by the `input` handler above;
        // showing them twice makes the HUD flicker between two panels.
        if (isPlainPrintable) return

        if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Shift') return

        const label = PRETTY[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key)
        const chips = [...mods, label].map((k) => `<span class="key">${escapeHtml(k)}</span>`)
        showHud('Key', `<span class="keys">${chips.join('')}</span>`, { ttl: 1300, html: true })
      },
      true,
    )

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    // Keep the host last in the DOM: apps that append modals to <html> would
    // otherwise paint over the cursor.
    const keepOnTop = new MutationObserver(() => {
      if (document.documentElement.lastElementChild !== host) {
        document.documentElement.appendChild(host)
      }
    })
    keepOnTop.observe(document.documentElement, { childList: true })
  }

  install()
}
