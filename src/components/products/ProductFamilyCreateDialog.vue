<script setup>
/**
 * "Add New Group" — creates a product_families row.
 *
 * P1 (2026-09-07): this dialog used to write through the syncEngine —
 *
 *     const createProductFamily = useLiveMutation(async (db, payload) => {
 *       const pf = db.ProductFamily.create(payload)
 *       await pf.save()                       // → GraphQL createProductFamily
 *     })
 *
 * — and that mutation DOES NOT EXIST. `product_families` carries
 *   COMMENT ON TABLE public.product_families IS '@behavior -insert -update -delete'
 * (20260615000011-create-product-families.js:48), so PostGraphile emits no
 * create/update/delete field for it at all, and `app_user` is granted SELECT
 * only. The button was dead for every user INCLUDING company owners — an owner
 * bypass in RLS cannot conjure a mutation that was never built.
 *
 * All four writes on this table go through REST instead
 * (routes/productFamilies.js, gated `company_settings:manage`), which is what
 * the two sibling inline-create menus already do — ItemCategorySelectMenu.vue
 * and UomSelectMenu.vue both `post('/v1/services/{itemCategories,uoms}')`. This
 * now matches them, including the `res?.x ?? res` unwrap of the
 * sendSuccess envelope.
 *
 * The dialog also has to validate `code` for the first time. The GraphQL path
 * validated nothing; the REST route runs createProductFamilySchema
 * (schemas/productFamilies.js:9-18), whose `code` is
 * /^[A-Z][A-Z0-9_]*$/ with min length 2 — and slugify() can produce codes that
 * fail it ("3M Caps" → "3M_CAPS", leading digit; "A" → one character). Catching
 * that here turns an opaque 400 into a fixable field error.
 *
 * `displayOrder` is deliberately not sent: the schema defaults it to 1000 and
 * this dialog, unlike ProductFamiliesCard, has no list to derive a position
 * from.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()

const form = ref({ name: '', code: '', description: '' })
const formRef = ref(null)
const saving = ref(false)
const saveError = ref('')
const codeDirty = ref(false)
const codeEditable = ref(false)

// Mirrors createProductFamilySchema.code exactly. Keep the two in step.
const CODE_RE = /^[A-Z][A-Z0-9_]*$/

function codeValid(value) {
  const v = (value || '').trim().toUpperCase()
  if (v.length < 2 || v.length > 100) return 'Code must be 2–100 characters'
  if (!CODE_RE.test(v)) return 'Use SCREAMING_SNAKE_CASE starting with a letter (A–Z, 0–9, _)'
  return true
}

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

watch(
  () => form.value.name,
  (newName) => {
    if (codeDirty.value) return
    form.value.code = slugify(newName)
  },
)

watch(open, (val) => {
  if (val) {
    form.value = { name: '', code: '', description: '' }
    codeDirty.value = false
    codeEditable.value = false
    saveError.value = ''
  }
})

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const res = await post('/v1/services/productFamilies', {
      code: form.value.code.trim().toUpperCase(),
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
    })
    // sendSuccess() spreads the payload at the top level and the client
    // interceptor strips `meta`, so the row arrives as { productFamily: {…} }.
    const row = res?.productFamily ?? res
    emit('created', row)
    open.value = false
    toast.success('Product family created')
  } catch (e) {
    saveError.value = e?.message || 'Failed to create product family'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Add Item Group" maxWidth="sm">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseField
          label="Name"
          required
          :value="form.name"
          :rules="[required()]"
          hint="A group of related items — a product line (Skincare, Body Lotions) or a component family (Caps, Bottles). Lets one inspection plan cover the whole group."
        >
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.name"
              placeholder="e.g. Skincare (product line) or Caps (component family)"
            />
          </template>
        </BaseField>

        <BaseField label="Code" required :value="form.code" :rules="[required(), codeValid]">
          <template #label>
            <span
              >Code <span class="tw:font-normal tw:normal-case tw:ml-1">(auto-derived)</span></span
            >
          </template>
          <template #default="field">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:flex tw:justify-end">
                <button
                  type="button"
                  class="tw:text-caption tw:text-primary tw:hover:underline"
                  @click="codeEditable = !codeEditable"
                >
                  {{ codeEditable ? 'Lock' : 'Edit' }}
                </button>
              </div>
              <BaseTextInput
                v-bind="field"
                v-model="form.code"
                placeholder="SKINCARE"
                :disabled="!codeEditable"
                @input="codeDirty = true"
              />
            </div>
          </template>
        </BaseField>

        <BaseField label="Description" :value="form.description">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.description"
              :rows="2"
              placeholder="Optional"
            />
          </template>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Add Group"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef.submit()"
      />
    </template>
  </BaseDialog>
</template>
