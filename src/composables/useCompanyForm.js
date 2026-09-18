import { currentSession } from '@/utils/currentSession.js'
import { useDebounceFn } from '@vueuse/core'
import { currentCompany } from '@/utils/currentCompany.js'
import { gotoTenant } from '@/utils/tenant'
import { put, patch } from '@/api'

export function useCompanyForm(props, isEdit = false) {
  const fadeOut = ref(false)

  const getCompanyForm = () => {
    if (isEdit) {
      return currentCompany.value
    }
    return {
      name: '',
      code: '',
      defaultTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      plan: '',
      invitationCode: '',
    }
  }

  // Add form state and validation
  const companyForm = reactive({
    ...getCompanyForm(),
    submitted: false,
    isChecking: false,
    isValid: computed(() => {
      const nameValid = companyForm.name.trim().length > 0
      const codeValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companyForm.code.trim())
      // The invitation code only gates new-company signup, not edits.
      const invitationValid =
        isEdit || /^[A-Z0-9]{8}$/.test((companyForm.invitationCode || '').trim().toUpperCase())
      return nameValid && codeValid && invitationValid
    }),
  })

  // Add flag to track if code change was triggered by name change
  const isCodeChangeFromName = ref(false)

  async function checkCompanyCode(isNameCheck = false) {
    const code = companyForm.code.trim()
    const name = companyForm.name.trim()

    if (isNameCheck && !name) {
      companyForm.isAvailable = null
      return { error: 'Invalid name' }
    }

    if (!isNameCheck && (!code || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code))) {
      companyForm.isAvailable = null
      return { error: 'Invalid code format' }
    }

    companyForm.isChecking = true
    if (isEdit && code === currentCompany.value.code) {
      companyForm.isAvailable = true
      return { error: null }
    }

    try {
      const data = await put(
        '/v1/services/signup/checkcompanycode',
        {
          code,
          name,
          isNameCheck,
        },
        {
          showError: false,
        },
      )

      if (isNameCheck) {
        if (data.suggestedCode) {
          isCodeChangeFromName.value = true
          companyForm.code = data.suggestedCode
          companyForm.isAvailable = data.isSuggestedCodeAvailable
        }
      } else {
        companyForm.isAvailable = data.message === 'available'
      }

      return { error: null }
    } catch {
      companyForm.isAvailable = null
      return { error: 'Server error' }
    } finally {
      companyForm.isChecking = false
    }
  }

  // Add debounced company code check
  const checkCompanyCodeDebounced = useDebounceFn(
    (isNameCheck = false) => checkCompanyCode(isNameCheck),
    500,
  )

  // Watch for company code changes
  watch(
    () => companyForm.code,
    (newValue) => {
      if (newValue && !isCodeChangeFromName.value) {
        checkCompanyCodeDebounced(false)
      }
      isCodeChangeFromName.value = false
    },
  )

  // Watch for company name changes
  watch(
    () => companyForm.name,
    (newValue) => {
      if (newValue && !isEdit) {
        checkCompanyCodeDebounced(true)
      }
    },
  )

  // Add loading and error state
  const isSubmitting = ref(false)
  const submitError = ref(null)

  // Form submission handler
  const signup = async (e) => {
    e.preventDefault()
    companyForm.submitted = true

    if (companyForm.isValid) {
      isSubmitting.value = true
      submitError.value = null

      try {
        await put(
          '/v1/services/signup',
          {
            code: companyForm.code.trim(),
            name: companyForm.name.trim(),
            timeZone: companyForm.defaultTimeZone,
            plan: companyForm.plan,
            isClientCompany: props.isAddClient,
            invitationCode: (companyForm.invitationCode || '').trim().toUpperCase(),
          },
          { showError: false },
        )
      } catch (error) {
        // ApiError carries the backend's human-readable message (e.g. the
        // invitation-code rejection) on `.message`.
        submitError.value = error?.message || 'Failed to create organization. Please try again.'
        isSubmitting.value = false
        return
      }

      fadeOut.value = true
      setTimeout(() => {
        // Subdomain tenancy: switch into the new tenant's host (lands on
        // {code}.<domain>/?onboarding=true), not a path segment.
        gotoTenant(companyForm.code, '/?onboarding=true')
      }, 900)
    }
  }

  const updateCompany = async () => {
    await patch('/v1/services/companies', {
      code: companyForm.code.trim(),
    })
    currentCompany.value.code = companyForm.code.trim()
    currentCompany.value.save()
    // Code changed → the tenant host changed; switch into the new subdomain.
    gotoTenant(companyForm.code)
  }

  // Add function to extract company name from email domain
  const getCompanyNameFromEmail = (email) => {
    const domain = email.split('@')[1]
    if (!domain) return ''
    if (COMMON_EMAIL_PROVIDERS.includes(domain)) return ''

    const companyPart = domain
      .replace(/\.(com|org|net|edu|gov|co|io|ai|app|in)$/i, '')
      .split('.')
      .pop()

    return companyPart
      .split(/[-.]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const COMMON_EMAIL_PROVIDERS = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'aol.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
  ]

  // Add computed property
  const isPersonalEmail = computed(() => {
    const email = currentSession.value?.email
    if (!email) return false

    const emailDomain = email.split('@')[1].toLowerCase()
    return COMMON_EMAIL_PROVIDERS.includes(emailDomain)
  })

  return {
    companyForm,
    fadeOut,
    isPersonalEmail,
    isSubmitting,
    submitError,
    signup,
    getCompanyNameFromEmail,
    updateCompany,
  }
}
