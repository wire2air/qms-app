import { ref } from 'vue'

// Step-up flow helper. Wrap a privileged action in `run(fn)`. If the server
// replies 403 STEP_UP_REQUIRED, the step-up dialog opens; once the operator
// re-authenticates (@verified → onVerified), the SAME action is retried
// automatically. Any other error propagates.
//
// Usage in a component:
//   const { stepUpOpen, run, onVerified } = useStepUp()
//   run(async () => { await approve(id); await reload() })
//   <StepUpDialog v-model="stepUpOpen" @verified="onVerified" />
export function useStepUp() {
  const stepUpOpen = ref(false)
  let pending = null

  async function run(fn) {
    try {
      return await fn()
    } catch (e) {
      if (e?.code === 'STEP_UP_REQUIRED') {
        pending = fn
        stepUpOpen.value = true
        return undefined
      }
      throw e
    }
  }

  async function onVerified() {
    stepUpOpen.value = false
    const fn = pending
    pending = null
    if (fn) await run(fn)
  }

  return { stepUpOpen, run, onVerified }
}
