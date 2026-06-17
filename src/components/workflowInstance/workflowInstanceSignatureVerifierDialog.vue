<script setup>
const props = defineProps({
  actionLoading: { type: Boolean, default: false },
  email: { type: String, default: '' },
})

const emit = defineEmits(['confirm'])

const show = defineModel({ type: Boolean, default: false })

const code = ref(['', '', '', '', '', ''])
const inputs = ref([])

watch(show, (val) => {
  if (val) {
    code.value = ['', '', '', '', '', '']
    nextTick(() => {
      inputs.value[0]?.focus()
    })
  }
})

const isComplete = computed(() => code.value.every((d) => d && d.length === 1))

function setInputRef(el, index) {
  if (el) {
    inputs.value[index] = el
  }
}

function onInput(e, index) {
  let val = e.target.value
  if (val.length > 1) {
    val = val.slice(0, 1)
  }
  code.value[index] = val
  if (val && index < inputs.value.length - 1) {
    inputs.value[index + 1].focus()
  }
}

function onKeydown(e, index) {
  if (e.key === 'Backspace' && !code.value[index] && index > 0) {
    inputs.value[index - 1].focus()
  }
}

function confirm() {
  if (!isComplete.value) return
  emit('confirm', code.value.join(''))
  show.value = false
}

const maskedEmail = computed(() => {
  if (!props.email) return ''
  const parts = props.email.split('@')
  if (parts[0].length <= 2) return props.email
  return parts[0].slice(0, 2) + '***@' + parts[1]
})
</script>

<template>
  <BaseDialog v-model="show" title="Verify Signature" maxWidth="sm" persistent>
    <div class="tw-text-sm tw:text-secondary tw-mb-4">
      We've sent a 6-digit verification code to your registered email
      <span class="tw:font-medium tw:text-secondary">{{ maskedEmail }}</span
      >. Please enter it below to verify your signature.
    </div>

    <div class="tw:flex tw:justify-between tw:gap-2 sm:tw:gap-4" data-purpose="otp-input-group">
      <input
        v-for="(digit, i) in code"
        :key="i"
        :ref="(el) => setInputRef(el, i)"
        v-model="code[i]"
        maxlength="1"
        type="number"
        class="tw:w-full tw:h-14 tw:text-center tw:text-xl tw:font-bold tw:border-gray-300 tw:bg-gray-50 tw:rounded-lg tw:transition-all"
        @input="onInput($event, i)"
        @keydown="onKeydown($event, i)"
      />
    </div>

    <div class="tw-text-sm tw:mt-4">
      <p class="tw:text-gray-400">
        Didn't receive the code?
        <button
          class="tw:text-gray-400 tw:font-medium tw:cursor-not-allowed tw:ml-1"
          disabled
          type="button"
        >
          Resend code
        </button>
      </p>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Verify"
        :loading="props.actionLoading"
        :disabled="!isComplete"
        @cancel="show = false"
        @submit="confirm"
      />
    </template>
  </BaseDialog>
</template>
