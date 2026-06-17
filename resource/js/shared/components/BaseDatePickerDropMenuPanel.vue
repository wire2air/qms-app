<script setup>
import { DateTime } from 'luxon'
import { useMutationObserver } from '@vueuse/core'
import { IconChevronDown } from '@tabler/icons-vue'
import { isDark } from '@/utils/theme.js'

const props = defineProps({
  firstDayOfWeek: {
    type: Number,
    default: 2,
  },
  minDate: {
    type: [Object, undefined],
    default: undefined,
  },
  maxDate: {
    type: [Object, undefined],
    default: undefined,
  },
  showShortcuts: {
    type: Boolean,
    default: true,
  },
  close: {
    type: Function,
    default: undefined,
  },
})

const selectedDate = defineModel('selectedDate', {
  type: [Object, null],
  default: null,
})
const internalSelectedDate = shallowRef(selectedDate.value)

let calendarObserver
const calendarContainer = ref(null)

function customizeCalendarTitle() {
  const titleButton = document.querySelector('.vc-title')
  if (!titleButton || titleButton.dataset.customized) return

  titleButton.classList.remove('vc-title')
  titleButton.classList.add(
    'tw:flex',
    'tw:items-center',
    'tw:gap-2',
    'tw:shrink-0',
    'tw:h-8',
    'tw:px-2',
    'tw:rounded-lg',
    'tw:border',
    'tw:border-divider',
    'tw:bg-sidebar',
    'tw:cursor-pointer',
    'tw:disabled:cursor-default',
    'tw:hover:bg-sidebar-hover',
    'tw:hover:border-divider-hover',
    'tw:focus:ring-2',
    'tw:focus:ring-primary/20',
    'tw:focus:ring-offset-2',
    'tw:focus:outline-none',
    'tw:transition-all',
    'tw:duration-300',
  )
  titleButton.style.fontWeight = 'var(--vc-font-semibold)'

  const app = createApp({
    render: () => h(IconChevronDown, { class: 'tw:-mr-1 tw:size-3' }),
  })
  const vm = app.mount(document.createElement('div'))
  const iconEl = vm.$el
  app.unmount()

  titleButton.appendChild(iconEl)
  titleButton.dataset.customized = 'true'
}

function clickOnDay(_, event) {
  event.target.blur()
  nextTick(() => {
    if (props.close) props.close()
  })
}

function onClickShortcut(shortcut) {
  let dt = DateTime.fromJSDate(internalSelectedDate.value || new Date())
  const parts = dt.toObject()

  if (shortcut === 'TODAY') dt = DateTime.local()
  if (shortcut === 'ENDOFMONTH') dt = DateTime.local().endOf('month')
  if (shortcut.startsWith('ENDQ')) {
    if (shortcut === 'ENDQ1') dt = DateTime.local().startOf('year').endOf('quarter')
    if (shortcut === 'ENDQ2')
      dt = DateTime.local().startOf('year').plus({ months: 3 }).endOf('quarter')
    if (shortcut === 'ENDQ3')
      dt = DateTime.local().startOf('year').plus({ months: 6 }).endOf('quarter')
    if (shortcut === 'ENDQ4')
      dt = DateTime.local().startOf('year').plus({ months: 9 }).endOf('quarter')
    if (dt.diff(DateTime.local(), 'days').days < 0) {
      dt = dt.plus({ years: 1 })
    }
  }
  dt = dt.set({
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: parts.millisecond,
  })
  internalSelectedDate.value = dt.toJSDate()
  nextTick(() => {
    if (props.close) props.close()
  })
}

watch(internalSelectedDate, (newDate) => {
  newDate = typeof newDate === 'string' ? new Date(newDate) : newDate

  if (!newDate || isNaN(newDate)) {
    return
  }

  const currentDateTime = DateTime.fromJSDate(
    selectedDate.value instanceof Date && !isNaN(selectedDate.value)
      ? selectedDate.value
      : new Date(),
  )

  const newDateTime = DateTime.fromJSDate(newDate).set({
    hour: currentDateTime.hour,
    minute: currentDateTime.minute,
    second: currentDateTime.second,
    millisecond: currentDateTime.millisecond,
  })

  selectedDate.value = newDateTime.toJSDate()
})

watch(calendarContainer, (newValue) => {
  if (newValue) {
    const calendar = document.querySelector('.vc-container')
    if (calendar) {
      requestAnimationFrame(customizeCalendarTitle)

      calendarObserver = useMutationObserver(
        calendar,
        (mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              requestAnimationFrame(customizeCalendarTitle)
              break
            }
          }
        },
        {
          childList: true,
          subtree: true,
          characterData: false,
        },
      )
    }
  } else {
    calendarObserver?.stop()
  }
})

const orderedQuarters = computed(() => {
  const currentDate = DateTime.local()
  const currentQuarter = Math.ceil(currentDate.month / 3)

  const quarters = [
    { id: 'ENDQ1', label: 'End Q1' },
    { id: 'ENDQ2', label: 'End Q2' },
    { id: 'ENDQ3', label: 'End Q3' },
    { id: 'ENDQ4', label: 'End Q4' },
  ]

  const reordered = []
  for (let i = 0; i < 4; i++) {
    const index = (currentQuarter - 1 + i) % 4
    reordered.push(quarters[index])
  }

  return reordered
})
</script>

<template>
  <div ref="calendarContainer" class="tw:flex tw:gap-2 tw:p-2">
    <VDatePicker
      v-model="internalSelectedDate"
      mode="date"
      :isDark="isDark"
      :minDate="props.minDate"
      :maxDate="props.maxDate"
      :firstDayOfWeek="firstDayOfWeek"
      borderless
      transparent
      @dayclick="clickOnDay"
    />
    <div v-if="props.showShortcuts" class="tw:flex tw:flex-col tw:pr-2 tw:pt-8">
      <div class="tw:flex tw:flex-col tw:gap-2 tw:pr-2 tw:pt-4">
        <BaseButton variant="outline" @click="onClickShortcut('TODAY')"> Today </BaseButton>
        <BaseButton variant="outline" @click="onClickShortcut('ENDOFMONTH')">
          End of month
        </BaseButton>
        <template v-for="quarter in orderedQuarters" :key="quarter.id">
          <BaseButton variant="outline" @click="onClickShortcut(quarter.id)">
            {{ quarter.label }}
          </BaseButton>
        </template>
      </div>
    </div>
  </div>
</template>
