# BaseSelect

A generic, QSelect-style select primitive for the QMS app. Custom teleported
popup (`BasePopover` = `QMenu` equivalent) + virtual scroll + search. **No
Quasar.** Mirrors Quasar's architecture (custom popup, not a native `<select>`).

> Entity pickers still follow the badge triad (`XBadge → XBadgeById →
> XSelectMenu`, see CLAUDE.md). Use `BaseSelect` for non-entity lists, richly
> rendered options, or as the engine an `XSelectMenu` wraps.

Files:
- `resource/js/shared/components/BaseSelect.vue`
- `resource/js/shared/composables/useSelectOptions.js` — option/value/group normalization
- `resource/js/shared/composables/useSelectFilter.js` — local + remote (`@filter`) search
- `resource/js/shared/composables/useSelectKeyboard.js` — listbox keyboard nav

## API

### Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `modelValue` | String·Number·Object·Array | `null` | v-model; array in `multiple` |
| `options` | Array | `[]` | objects or primitives |
| `optionLabel` | String·fn | `'label'` | key or `fn(opt) => string` |
| `optionValue` | String·fn | `'value'` | key or `fn(opt) => any` |
| `optionDisabled` | String·fn | `null` | key or `fn(opt) => bool` |
| `optionGroup` | String·fn | `null` | enables grouped headers |
| `optionIcon` / `optionAvatar` / `optionDescription` | String·fn | `null` | rich-row data |
| `emitValue` | Boolean | `true` | emit option-value vs whole object |
| `multiple` `clearable` `disabled` `readonly` `required` `loading` `autofocus` | Boolean | `false` | |
| `label` `placeholder` `instructions` `errorMsg` `hint` | String | | chrome |
| `size` | `'sm'\|'md'` | `'sm'` | parity with BaseTextInput |
| `searchable` | Boolean | `true` | show in-panel search |
| `inputDebounce` | Number | `300` | ms; local + remote |
| `remote` | Boolean | `false` | force remote mode (also auto-on when `@filter` bound) |
| `rules` | Array<fn> | `[]` | `fn(val) => true \| string` |
| `virtualScroll` | Boolean·`'auto'` | `'auto'` | on past ~100 options |
| `maxValues` | Number | `null` | cap (multiple) |
| `showSelectAll` `useChips` `hideSelected` `counter` | Boolean | `false` | multi-select UX |
| `menuClass` | String | `''` | extra panel classes |

### Emits

`update:modelValue`, `focus`, `blur`, `clear`, `filter`, `popup-show`, `popup-hide`

### Slots

`label`, `selected({value, options})`, `option({opt, selected})`,
`option-prefix({opt})`, `option-suffix({opt})`, `no-option`, `loading`, `hint`,
`prepend`, `append`

### Exposed

`validate()`, `resetValidation()`

## Examples

### Basic
```vue
<BaseSelect v-model="priority" :options="priorities" label="Priority" clearable />
```

### Multiple with chips + select-all
```vue
<BaseSelect
  v-model="tags" :options="tagOptions"
  multiple use-chips counter show-select-all clearable
/>
```

### Rich options (avatar / description)
```vue
<BaseSelect
  v-model="ownerId" :options="people"
  option-label="name" option-value="id"
  option-avatar="avatarUrl" option-description="title"
/>
```

### Grouped
```vue
<BaseSelect
  v-model="assigneeId" :options="people"
  option-label="name" option-value="id" option-group="team"
/>
```

### Custom option rendering
```vue
<BaseSelect v-model="id" :options="people" option-label="name" option-value="id">
  <template #option="{ opt, selected }">
    <MyRichRow :person="opt.raw" :selected="selected" />
  </template>
</BaseSelect>
```

### Async / remote search
```vue
<BaseSelect
  v-model="userId" :options="results" :loading="loading"
  option-label="name" option-value="id"
  @filter="onFilter"
/>
```
```js
function onFilter(query) {
  loading.value = true
  results.value = await searchUsers(query)   // parent owns options + loading
  loading.value = false
}
```

### Validation
```vue
<BaseSelect
  ref="sel" v-model="v" :options="opts"
  required :rules="[v => v === 'BAD' ? 'Not allowed' : true]"
/>
<!-- this.$refs.sel.validate() -->
```

### Virtual scroll (large datasets)
`virtualScroll="auto"` (default) turns on past ~100 options; force with
`:virtual-scroll="true"`. Smoothly handles 10,000+.

## Reference migration: an XSelectMenu onto BaseSelect

`BaseSelectMenu` takes `items: [{id, name}]` + a `#button` slot. `BaseSelect`
takes generic `options` with `option-label`/`option-value`. A typical wrapper:

```vue
<!-- Before — SiteSelectMenu.vue (BaseSelectMenu) -->
<BaseSelectMenu v-model="modelValue" :items="sites" :required="required" :multiple="multiple">
  <template #button="scope">…SiteBadgeById…</template>
</BaseSelectMenu>
```

```vue
<!-- After — SiteSelectMenu.vue (BaseSelect) -->
<script setup>
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})
const modelValue = defineModel({ type: [String, Array, null], default: null })
const sites = useLiveQuery(async (db) => db.Site.where().exec(), { initial: [] })
</script>
<template>
  <BaseSelect
    v-model="modelValue"
    :options="sites"
    option-label="name"
    option-value="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
  >
    <!-- keep entity-badge rendering for parity with the triad -->
    <template #selected="{ options }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <SiteBadgeById v-for="o in options" :key="o.value" :siteId="o.value" />
      </div>
    </template>
    <template #option="{ opt }"><SiteBadgeById :siteId="opt.value" /></template>
  </BaseSelect>
</template>
```

Migrate wrappers incrementally — `BaseSelect` ships alongside `BaseSelectMenu`;
nothing breaks until each wrapper is converted.

## Accessibility checklist

- [x] Trigger `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`
- [x] Panel `role="listbox"`, `aria-multiselectable` in multiple mode
- [x] Options `role="option"` + `aria-selected`; disabled rows `aria-disabled` + unfocusable
- [x] `aria-activedescendant` tracks the active option (virtual + plain)
- [x] Keyboard: ↑ ↓ Home End Enter Escape Backspace; focus returns to trigger on close (Headless UI)
- [x] `aria-invalid` + error text wired via `BaseErrorText`
- [x] No `<form>`; clear button is a real `<button>` with `aria-label`

## Future improvements

- Favorites / pinned / recently-selected ranking (seam: `option-suffix` slot)
- Tag mode + create-new-option (`new-value` event)
- Remote pagination + infinite scroll on the `filter` event
- Variable-height virtual rows (multi-line descriptions)
- `behavior="dialog"` fullscreen sheet on mobile (Quasar parity)
