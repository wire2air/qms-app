// Shared e-signature helper for the workflow step-action dialogs.
//
// Why this exists as a helper rather than four inline copies: the PIN dialog
// (workflowInstanceEsignAuthDialog.vue) **clears `pin` on open** — `pin.value = ''`
// in its open handler — and its Sign button is `:disabled="!pin"`. When the dialog
// is opened from a flow that is simultaneously CLOSING another dialog (the reject
// flow closes the comment dialog and opens this one in the same tick), a `fill()`
// can land before that reset runs. The value is wiped, Sign stays disabled, and
// the test times out on a button that never enables — with the misleading
// "element is not stable" in the call log, because both dialogs are mid-transition.
//
// So: fill, then PROVE the value stuck, retrying the fill if it did not. Only then
// click Sign, and only once it is actually enabled.
import { expect } from '@playwright/test'
import { ESIGN_PIN } from './cast.js'

/**
 * Complete the e-signature prompt. Assumes the dialog is opening or open.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ pin?: string, timeout?: number }} [opts]
 */
export async function signWithPin(page, { pin = ESIGN_PIN, timeout = 30_000 } = {}) {
  const input = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(input).toBeVisible({ timeout })

  // Re-fill until the bound value survives the dialog's own reset.
  await expect(async () => {
    await input.fill(pin)
    await expect(input).toHaveValue(pin, { timeout: 1_000 })
  }).toPass({ timeout })

  const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(signBtn).toBeEnabled({ timeout: 10_000 })
  await signBtn.click()

  // The dialog closes on success. If it is still up, the PIN was rejected and the
  // caller's downstream barrier would otherwise fail with a confusing timeout.
  await expect(input).toBeHidden({ timeout })
}
