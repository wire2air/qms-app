/**
 * Form Builder Composable
 * State management for the visual form builder
 */
import { FIELD_TYPES, FIELD_WIDTHS, FIELD_KIND_OPTIONS } from '@/constants/formBuilderConfig'
// Field factory + AI hydration live in aiFormHydrate so non-builder hosts
// (e.g. the workflow AI generator building per-step formSchemas) share them.
import {
  getDefaultFieldConfig,
  defaultFieldLabel,
  fieldNameExists,
  generateFieldName,
  hydrateAiField,
  hydrateAiFields,
  hydrateChecklistRows,
  hydrateChecklistColumns,
} from '@/utils/aiFormHydrate'

const VALID_WIDTHS = new Set(FIELD_WIDTHS.map((w) => w.value))

// The field types the AI generator can emit (mirror of FIELD_TYPE_IDS in the
// backend form.generate_schema task). In EDIT mode, a field whose current type
// is OUTSIDE this set (repeater, lookup, rca, file, photo, inputTable, …) can't
// be rebuilt from an AI descriptor, so it is always preserved wholesale by name
// rather than re-hydrated.
const AI_CURATED_TYPES = new Set([
  'input', 'textarea', 'number', 'email', 'phone', 'select', 'checkbox', 'optionGroup',
  'checklist', 'datetime', 'rating', 'toggle', 'textEditor', 'signature', 'header', 'instructions',
])

// Flatten a schema tree into a name → field-clone map (walks section children),
// so an AI edit can restore an untouched/heavy field verbatim by its name.
function indexFieldsByName(fields, map) {
  for (const field of fields) {
    if (field?.name) map.set(field.name, JSON.parse(JSON.stringify(field)))
    if (Array.isArray(field?.children)) indexFieldsByName(field.children, map)
  }
}

// EDIT mode: keep an existing field object wholesale (its exact type + all heavy
// internals: repeater templates, lookup config, options, checklist grid) and
// overlay only the lightweight edits the AI expressed. Used when the AI echoed a
// field's name without changing its type.
function overlayExistingField(existing, node) {
  const f = JSON.parse(JSON.stringify(existing))
  if (typeof node.label === 'string' && node.label.trim()) {
    f.label = node.label.trim()
    if (f.type === 'header') f.text = f.label
  }
  if (typeof node.required === 'boolean') f.required = node.required
  if (typeof node.placeholder === 'string') f.placeholder = node.placeholder
  if (typeof node.hint === 'string') f.hint = node.hint
  if (typeof node.width === 'string' && VALID_WIDTHS.has(node.width)) f.width = node.width
  // Numeric bounds — "change the range to 2-8" on a kept number field.
  if (Number.isFinite(node.min)) f.min = node.min
  if (Number.isFinite(node.max)) f.max = node.max
  // Only overlay options for types that actually use them.
  if (['select', 'optionGroup', 'checkbox'].includes(f.type) && Array.isArray(node.options)) {
    const opts = node.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim())
    if (opts.length) f.options = opts
  }
  // Checklist grid edits on a kept checklist field.
  if (f.type === 'checklist') {
    const rows = hydrateChecklistRows(node.rows)
    const columns = hydrateChecklistColumns(node.columns)
    if (rows.length) f.rows = rows
    if (columns.length) f.columns = columns
  }
  return f
}

export function useFormBuilder(initialSchema = []) {
  const schema = ref(initialSchema)
  const selectedFieldPath = ref(null)
  const isDragging = ref(false)
  const isHistoryAction = ref(false)

  const historyIndex = ref(-1)
  const history = ref([])

  // Get the currently selected field
  const selectedField = computed({
    get: () => {
      if (!selectedFieldPath.value) return null
      return getFieldByPath(schema.value, selectedFieldPath.value)
    },
    set: (newField) => {
      if (!selectedFieldPath.value) return

      // We don't need to do anything here because the object is mutated directly
      // and the deep watcher will catch the changes.
      // However, if the entire object is replaced, we need to handle it.
      setFieldByPath(schema.value, selectedFieldPath.value, newField)
    },
  })

  // Get field by path (e.g., "0.children.1")
  function getFieldByPath(fields, path) {
    if (!path && path !== 0) return null

    const parts = String(path).split('.')
    let current = fields

    for (const part of parts) {
      if (part === 'children' || part === 'template') {
        current = current[part]
      } else {
        const index = parseInt(part, 10)
        if (!current || !Array.isArray(current) || index >= current.length) {
          return null
        }
        current = current[index]
      }
    }

    return current
  }

  // Set field by path
  function setFieldByPath(fields, path, value) {
    const parts = String(path).split('.')
    let current = fields

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part === 'children' || part === 'template') {
        current = current[part]
      } else {
        current = current[parseInt(part, 10)]
      }
    }

    const lastPart = parts[parts.length - 1]
    if (lastPart === 'children' || lastPart === 'template') {
      current[lastPart] = value
    } else {
      current[parseInt(lastPart, 10)] = value
    }
  }

  // Save state to history for undo/redo
  function saveToHistory() {
    if (isHistoryAction.value) return

    // Remove any future history if we're not at the end
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }
    history.value.push(JSON.stringify(schema.value))
    historyIndex.value = history.value.length - 1

    // Limit history to 50 items
    if (history.value.length > 50) {
      history.value.shift()
      historyIndex.value--
    }
  }

  // Debounced save for history
  let debounceTimer = null
  function debouncedSaveToHistory() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      saveToHistory()
    }, 500)
  }

  // Watch for changes in schema to auto-save history
  watch(
    schema,
    () => {
      if (!isHistoryAction.value) {
        debouncedSaveToHistory()
      }
    },
    { deep: true },
  )

  // Add a new field to the schema
  function addField(type, parentPath = null, index = null) {
    saveToHistory() // Save state before adding

    const config = getDefaultFieldConfig(type)
    config.name = generateFieldName(type, schema.value)
    config.label = defaultFieldLabel(type)

    let newPath
    if (parentPath !== null) {
      const parent = getFieldByPath(schema.value, parentPath)
      if (parent) {
        // Inherit colClass from parent row if available
        if (parent.type === 'row' && parent.colClass) {
          config.class = parent.colClass
        }

        const targetArray = parent.children || parent.template
        let resultIndex
        if (targetArray) {
          if (index !== null && index >= 0 && index <= targetArray.length) {
            targetArray.splice(index, 0, config)
            resultIndex = index
          } else {
            targetArray.push(config)
            resultIndex = targetArray.length - 1
          }
          const childrenKey = parent.template ? 'template' : 'children'
          newPath = `${parentPath}.${childrenKey}.${resultIndex}`
        }
      }
    } else {
      let resultIndex
      if (index !== null && index >= 0 && index <= schema.value.length) {
        schema.value.splice(index, 0, config)
        resultIndex = index
      } else {
        schema.value.push(config)
        resultIndex = schema.value.length - 1
      }
      newPath = `${resultIndex}`
    }

    if (newPath) {
      selectedFieldPath.value = newPath
    }

    return config
  }

  // Remove a field from the schema
  function removeField(path) {
    saveToHistory()

    const parts = String(path).split('.')
    const fieldIndex = parseInt(parts.pop(), 10)

    if (parts.length === 0) {
      schema.value.splice(fieldIndex, 1)
    } else {
      const parentPath = parts.join('.')
      const parent = getFieldByPath(schema.value, parentPath)
      if (Array.isArray(parent)) {
        parent.splice(fieldIndex, 1)
      }
    }

    // Clear selection if removed field was selected
    if (selectedFieldPath.value === path) {
      selectedFieldPath.value = null
    }
  }

  // Update a field's configuration - DEPRECATED in favor of direct mutation
  function updateField(path, updates) {
    // saveToHistory() // Handled by watcher
    const field = getFieldByPath(schema.value, path)
    if (field) {
      Object.assign(field, updates)
    }
  }

  // Move a field to a new position
  function moveField(fromPath, toPath, toIndex) {
    saveToHistory()

    const fromParts = String(fromPath).split('.')
    const fromIndex = parseInt(fromParts.pop(), 10)

    // Get the field to move
    let fromParent
    if (fromParts.length === 0) {
      fromParent = schema.value
    } else {
      fromParent = getFieldByPath(schema.value, fromParts.join('.'))
    }

    if (!Array.isArray(fromParent)) return

    const [field] = fromParent.splice(fromIndex, 1)

    // Insert at new position
    let toParent
    if (toPath === null) {
      toParent = schema.value
    } else {
      toParent = getFieldByPath(schema.value, toPath)
      if (toParent && (toParent.children || toParent.template)) {
        toParent = toParent.children || toParent.template
      }
    }

    if (Array.isArray(toParent)) {
      toParent.splice(toIndex, 0, field)
    }
  }

  // Select a field for editing
  function selectField(path) {
    selectedFieldPath.value = path
  }

  // Clear field selection
  function clearSelection() {
    selectedFieldPath.value = null
  }

  // Duplicate a field
  /**
   * Convert a field to another KIND (see FIELD_KIND_OPTIONS) in place — the
   * type picker beside the label on the canvas.
   *
   * Keeps what belongs to the QUESTION (name, label, description, required,
   * width, visibility) and swaps everything that belongs to the WIDGET for
   * the new type's factory defaults. `name` in particular must survive: it's
   * the answer key, so changing it would orphan every value already captured
   * against this field.
   *
   * Options carry over between option-based kinds (Multiple choice ↔
   * Checkboxes ↔ Dropdown), which is the common switch and the one where
   * losing the list would hurt most.
   */
  const OPTION_BASED = new Set(['optionGroup', 'select'])

  function changeFieldKind(path, kindId) {
    const field = getFieldByPath(schema.value, path)
    const kind = FIELD_KIND_OPTIONS.find((k) => k.id === kindId)
    if (!field || !kind) return
    if (kind.type === field.type && (kind.groupType ?? null) === (field.groupType ?? null)) return

    saveToHistory()

    const fresh = getDefaultFieldConfig(kind.type)
    const next = {
      ...fresh,
      ...(kind.groupType ? { groupType: kind.groupType } : {}),
      // Question-level identity, preserved across the conversion.
      name: field.name,
      label: field.label,
      hint: field.hint ?? '',
      required: field.required ?? false,
      width: field.width ?? 'full',
      hidden: field.hidden ?? false,
    }
    if (OPTION_BASED.has(kind.type) && OPTION_BASED.has(field.type) && field.options?.length) {
      next.options = JSON.parse(JSON.stringify(field.options))
    }

    setFieldByPath(schema.value, path, next)
  }

  function duplicateField(path) {
    saveToHistory()

    const field = getFieldByPath(schema.value, path)
    if (!field) return

    const duplicate = JSON.parse(JSON.stringify(field))
    duplicate.name = generateFieldName(field.type, schema.value)

    const parts = String(path).split('.')
    const fieldIndex = parseInt(parts.pop(), 10)

    if (parts.length === 0) {
      schema.value.splice(fieldIndex + 1, 0, duplicate)
    } else {
      const parent = getFieldByPath(schema.value, parts.join('.'))
      if (Array.isArray(parent)) {
        parent.splice(fieldIndex + 1, 0, duplicate)
      }
    }
  }

  // Undo last action
  function undo() {
    if (historyIndex.value > 0) {
      isHistoryAction.value = true
      historyIndex.value--
      schema.value = JSON.parse(history.value[historyIndex.value])

      // Delay resetting flag to allow Vue to process updates
      nextTick(() => {
        isHistoryAction.value = false
      })
    }
  }

  // Redo last undone action
  function redo() {
    if (historyIndex.value < history.value.length - 1) {
      isHistoryAction.value = true
      historyIndex.value++
      schema.value = JSON.parse(history.value[historyIndex.value])

      nextTick(() => {
        isHistoryAction.value = false
      })
    }
  }

  // Check if undo/redo is available
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  // Export schema as JSON
  function exportSchema() {
    return JSON.parse(JSON.stringify(schema.value))
  }

  // Import schema from JSON
  function importSchema(newSchema) {
    isHistoryAction.value = true
    saveToHistory()
    schema.value = newSchema
    selectedFieldPath.value = null
    nextTick(() => {
      isHistoryAction.value = false
    })
  }

  // Build one field from an AI descriptor. In EDIT mode (existingByName given)
  // a name-matched field is preserved wholesale unless the AI genuinely retyped
  // it to another curated type; heavy/non-curated fields are always preserved.
  function buildFieldFromNode(node, root, existingByName, reservedNames) {
    const name = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : null
    const existing = name ? existingByName.get(name) : null
    if (existing && !fieldNameExists(root, name)) {
      const existingCurated = FIELD_TYPES[existing.type] && AI_CURATED_TYPES.has(existing.type)
      const nodeCurated = node.type && FIELD_TYPES[node.type] && AI_CURATED_TYPES.has(node.type)
      const typeChanged = existingCurated && nodeCurated && node.type !== existing.type
      // Preserve unless the user retyped a curated field to another curated type.
      if (!typeChanged) return overlayExistingField(existing, node)
      // Retype: rebuild fresh but keep the stable name (answers don't orphan).
    }
    return hydrateAiField(node, root, reservedNames)
  }

  // Replace the whole schema with an AI-generated / AI-edited form. Fields
  // carrying a shared `section` label are grouped into real `section` containers
  // (in first-appearance order); ungrouped fields sit at the top level.
  // Overwrites the current schema (undoable via history). When `preserveFrom` is
  // supplied (EDIT mode), fields the AI echoed by name are restored from it
  // verbatim so existing (and heavy) fields — and answers bound to them — survive.
  function applyAiSchema(aiResult, { preserveFrom = null } = {}) {
    const fields = Array.isArray(aiResult?.fields) ? aiResult.fields : []
    const existingByName = new Map()
    if (Array.isArray(preserveFrom)) indexFieldsByName(preserveFrom, existingByName)

    const newSchema = hydrateAiFields(fields, {
      buildField: (node, root, reserved) => buildFieldFromNode(node, root, existingByName, reserved),
    })

    importSchema(newSchema)
  }

  // Clear all fields
  function clearSchema() {
    saveToHistory()
    schema.value = []
    selectedFieldPath.value = null
  }

  return {
    // State
    schema,
    selectedField,
    selectedFieldPath,
    isDragging,

    // Actions
    addField,
    removeField,
    updateField, // Deprecated but kept for compatibility
    moveField,
    selectField,
    clearSelection,
    duplicateField,
    changeFieldKind,

    // History
    undo,
    redo,
    canUndo,
    canRedo,

    // Import/Export
    exportSchema,
    importSchema,
    applyAiSchema,
    clearSchema,

    // Utilities
    getFieldByPath,
    FIELD_TYPES,
  }
}
