<script setup>
import {
  IconClipboardCheck,
  IconAlertCircle,
  IconCircleCheck,
  IconClock,
  IconDownload,
  IconPlus,
  IconTrendingUp,
  IconTrendingDown,
  IconBuilding,
  IconCalendar,
  IconDotsVertical,
  IconEye,
  IconPencil,
  IconHourglass,
  IconFolderOpen,
  IconSchool,
  IconAlertTriangle,
} from '@tabler/icons-vue'
import { provideUsers } from '@/composables/useUsers.js'
import { currentSession } from '@/utils/currentSession'

defineOptions({
  name: 'CompanyDashboard',
})

const route = useRoute()
// Subdomain tenancy: the tenant is the host, not a route param. Use the active
// company's name/code from the session for display.
const companyCode = computed(() => currentSession.value?.name || currentSession.value?.code || '')

const showOnboarding = ref(route.query.onboarding === 'true')
provideUsers()

const stats = ref([
  {
    title: 'Total Audits',
    value: '124',
    trend: 12,
    icon: IconClipboardCheck,
    colorClass: 'tw:bg-primary/10 tw:text-primary',
  },
  {
    title: 'Open Issues',
    value: '18',
    trend: -8,
    icon: IconAlertCircle,
    colorClass: 'tw:bg-warn/10 tw:text-warn',
  },
  {
    title: 'Completed',
    value: '98',
    trend: 15,
    icon: IconCircleCheck,
    colorClass: 'tw:bg-good/10 tw:text-good',
  },
  {
    title: 'Overdue',
    value: '6',
    trend: -3,
    icon: IconClock,
    colorClass: 'tw:bg-bad/10 tw:text-bad',
  },
])

const complianceScore = ref(87)

const recentAudits = ref([
  {
    id: 1,
    title: 'ISO 9001 Internal Audit',
    department: 'Production',
    date: 'Jan 20, 2026',
    status: 'Completed',
  },
  {
    id: 2,
    title: 'Safety Compliance Review',
    department: 'Operations',
    date: 'Jan 18, 2026',
    status: 'In Progress',
  },
  {
    id: 3,
    title: 'Supplier Quality Assessment',
    department: 'Procurement',
    date: 'Jan 15, 2026',
    status: 'Pending',
  },
  {
    id: 4,
    title: 'Process Documentation Audit',
    department: 'Quality',
    date: 'Jan 12, 2026',
    status: 'Completed',
  },
])

const quickActions = ref([
  {
    label: 'Create New Audit',
    icon: IconPlus,
    colorClass: 'tw:bg-primary tw:text-white tw:hover:bg-primary/90',
  },
  {
    label: 'Report an Issue',
    icon: IconAlertTriangle,
    colorClass: 'tw:bg-warn tw:text-white tw:hover:bg-warn/90',
  },
  {
    label: 'View Documents',
    icon: IconFolderOpen,
    colorClass: 'tw:bg-blue-500 tw:text-white tw:hover:bg-blue-600',
  },
  {
    label: 'Schedule Training',
    icon: IconSchool,
    colorClass: 'tw:bg-good tw:text-white tw:hover:bg-good/90',
  },
])

const pendingTasks = ref([
  {
    id: 1,
    task: 'Complete CAPA #2024-015',
    assignee: 'John Doe',
    dueDate: 'Jan 25, 2026',
    priority: 'High',
  },
  {
    id: 2,
    task: 'Review Document Changes',
    assignee: 'Jane Smith',
    dueDate: 'Jan 26, 2026',
    priority: 'Medium',
  },
  {
    id: 3,
    task: 'Supplier Audit Follow-up',
    assignee: 'Mike Johnson',
    dueDate: 'Jan 28, 2026',
    priority: 'Low',
  },
  {
    id: 4,
    task: 'Training Assessment',
    assignee: 'Sarah Wilson',
    dueDate: 'Jan 30, 2026',
    priority: 'High',
  },
])

function getStatusIcon(status) {
  const icons = { Completed: IconCircleCheck, 'In Progress': IconHourglass, Pending: IconClock }
  return icons[status] || IconAlertCircle
}

function getStatusColor(status) {
  const colors = {
    Completed: 'tw:bg-good/10 tw:text-good tw:border-good/20',
    'In Progress': 'tw:bg-blue-100 tw:text-blue-600 tw:border-blue-200',
    Pending: 'tw:bg-warn/10 tw:text-warn tw:border-warn/20',
  }
  return colors[status] || 'tw:bg-gray-100 tw:text-gray-600 tw:border-gray-200'
}

function getStatusBgIcon(status) {
  const colors = {
    Completed: 'tw:bg-good/10 tw:text-good',
    'In Progress': 'tw:bg-blue-100 tw:text-blue-600',
    Pending: 'tw:bg-warn/10 tw:text-warn',
  }
  return colors[status] || 'tw:bg-gray-100 tw:text-gray-600'
}

function getPriorityColor(priority) {
  const colors = {
    High: 'tw:bg-bad/10 tw:text-bad',
    Medium: 'tw:bg-warn/10 tw:text-warn',
    Low: 'tw:bg-good/10 tw:text-good',
  }
  return colors[priority] || 'tw:bg-gray-100 tw:text-gray-600'
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:min-h-screen tw:bg-main tw:p-5">
    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-5">
      <div>
        <div class="tw:text-3xl tw:font-bold tw:text-on-main">Dashboard</div>
        <div class="tw:text-base tw:text-secondary">
          Welcome back! Here's what's happening with {{ companyCode }} today.
        </div>
      </div>
      <div class="tw:flex tw:gap-2">
        <button
          class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:border tw:border-divider tw:rounded-lg tw:cursor-pointer tw:hover:bg-sidebar tw:transition-colors"
        >
          <IconDownload :size="16" />
          Export
        </button>
        <button
          class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0"
        >
          <IconPlus :size="16" />
          New Audit
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="tw:grid tw:grid-cols-1 sm:tw:grid-cols-2 lg:tw:grid-cols-4 tw:gap-4 tw:mb-5">
      <div
        v-for="stat in stats"
        :key="stat.title"
        class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-4 tw:transition-all tw:hover:-translate-y-0.5 tw:hover:shadow-md"
      >
        <div class="tw:flex tw:items-start tw:justify-between tw:mb-3">
          <div
            class="tw:size-12 tw:rounded-xl tw:flex tw:items-center tw:justify-center"
            :class="stat.colorClass"
          >
            <component :is="stat.icon" :size="24" />
          </div>
          <span
            class="tw:flex tw:items-center tw:gap-0.5 tw:text-xs tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full"
            :class="stat.trend > 0 ? 'tw:bg-good/10 tw:text-good' : 'tw:bg-bad/10 tw:text-bad'"
          >
            <component :is="stat.trend > 0 ? IconTrendingUp : IconTrendingDown" :size="12" />
            {{ Math.abs(stat.trend) }}%
          </span>
        </div>
        <div class="tw:text-3xl tw:font-bold tw:mb-1 tw:text-on-main">{{ stat.value }}</div>
        <div class="tw:text-sm tw:text-secondary">{{ stat.title }}</div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="tw:grid tw:grid-cols-1 lg:tw:grid-cols-3 tw:gap-4">
      <!-- Recent Audits -->
      <div class="lg:tw:col-span-2">
        <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar">
          <div class="tw:flex tw:items-center tw:px-5 tw:py-4 tw:border-b tw:border-divider">
            <div class="tw:text-lg tw:font-medium tw:text-on-main">Recent Audits</div>
            <div class="tw:flex-1" />
            <button
              class="tw:text-sm tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
            >
              View All
            </button>
          </div>
          <div class="tw:divide-y tw:divide-divider">
            <div
              v-for="audit in recentAudits"
              :key="audit.id"
              class="tw:flex tw:items-center tw:gap-3 tw:p-4 tw:cursor-pointer tw:hover:bg-main-hover tw:transition-colors"
            >
              <div
                class="tw:size-12 tw:rounded-xl tw:flex tw:items-center tw:justify-center tw:shrink-0"
                :class="getStatusBgIcon(audit.status)"
              >
                <component :is="getStatusIcon(audit.status)" :size="24" />
              </div>
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:font-medium tw:text-on-main tw:truncate">{{ audit.title }}</div>
                <div
                  class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:mt-0.5"
                >
                  <IconBuilding :size="12" />
                  {{ audit.department }}
                  <span class="tw:mx-1">•</span>
                  <IconCalendar :size="12" />
                  {{ audit.date }}
                </div>
              </div>
              <span
                class="tw:text-xs tw:font-medium tw:px-2.5 tw:py-1 tw:rounded-full tw:border"
                :class="getStatusColor(audit.status)"
              >
                {{ audit.status }}
              </span>
              <button
                class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover"
              >
                <IconDotsVertical :size="18" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="tw:flex tw:flex-col tw:gap-4">
        <!-- Compliance Score -->
        <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-5">
          <div class="tw:text-lg tw:font-medium tw:text-on-main tw:mb-4">Compliance Score</div>
          <div class="tw:flex tw:justify-center tw:py-2">
            <div class="tw:relative tw:size-40">
              <svg class="tw:size-full tw:-rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="var(--divider)"
                  stroke-width="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="var(--good)"
                  stroke-width="8"
                  stroke-dasharray="276.46"
                  :stroke-dashoffset="276.46 * (1 - complianceScore / 100)"
                  stroke-linecap="round"
                  class="tw:transition-all tw:duration-500"
                />
              </svg>
              <div
                class="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center"
              >
                <div class="tw:text-4xl tw:font-bold tw:text-good">{{ complianceScore }}%</div>
                <div class="tw:text-xs tw:text-secondary">Excellent</div>
              </div>
            </div>
          </div>
          <div class="tw:grid tw:grid-cols-3 tw:gap-2 tw:mt-3">
            <div class="tw:text-center">
              <div class="tw:text-xl tw:font-bold tw:text-good">98</div>
              <div class="tw:text-xs tw:text-secondary">Passed</div>
            </div>
            <div class="tw:text-center">
              <div class="tw:text-xl tw:font-bold tw:text-warn">14</div>
              <div class="tw:text-xs tw:text-secondary">Pending</div>
            </div>
            <div class="tw:text-center">
              <div class="tw:text-xl tw:font-bold tw:text-bad">2</div>
              <div class="tw:text-xs tw:text-secondary">Failed</div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-5">
          <div class="tw:text-lg tw:font-medium tw:text-on-main tw:mb-3">Quick Actions</div>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <button
              v-for="action in quickActions"
              :key="action.label"
              class="tw:flex tw:items-center tw:gap-3 tw:w-full tw:px-4 tw:py-3 tw:text-sm tw:font-medium tw:rounded-lg tw:cursor-pointer tw:transition-colors tw:border-0"
              :class="action.colorClass"
            >
              <component :is="action.icon" :size="18" />
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending Tasks Table -->
    <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:mt-4">
      <div class="tw:flex tw:items-center tw:px-5 tw:py-4 tw:border-b tw:border-divider">
        <div class="tw:text-lg tw:font-medium tw:text-on-main">Pending Tasks</div>
        <div class="tw:flex-1" />
        <span
          class="tw:text-xs tw:font-bold tw:px-3 tw:py-1 tw:rounded-full tw:bg-warn/10 tw:text-warn"
        >
          {{ pendingTasks.length }} pending
        </span>
      </div>
      <div class="tw:overflow-x-auto">
        <table class="tw:w-full tw:text-sm">
          <thead>
            <tr class="tw:border-b tw:border-divider">
              <th
                class="tw:text-left tw:px-4 tw:py-3 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase"
              >
                Task
              </th>
              <th
                class="tw:text-left tw:px-4 tw:py-3 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase"
              >
                Assignee
              </th>
              <th
                class="tw:text-left tw:px-4 tw:py-3 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase"
              >
                Due Date
              </th>
              <th
                class="tw:text-center tw:px-4 tw:py-3 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase"
              >
                Priority
              </th>
              <th
                class="tw:text-center tw:px-4 tw:py-3 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="tw:divide-y tw:divide-divider">
            <tr
              v-for="task in pendingTasks"
              :key="task.id"
              class="tw:hover:bg-main-hover tw:transition-colors"
            >
              <td class="tw:px-4 tw:py-4">
                <div class="tw:font-medium tw:text-on-main">{{ task.task }}</div>
              </td>
              <td class="tw:px-4 tw:py-4">
                <div class="tw:flex tw:items-center tw:gap-2">
                  <div
                    class="tw:size-7 tw:rounded-full tw:bg-primary/10 tw:text-primary tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-bold tw:shrink-0"
                  >
                    {{ task.assignee.charAt(0) }}
                  </div>
                  {{ task.assignee }}
                </div>
              </td>
              <td class="tw:px-4 tw:py-4 tw:text-secondary">{{ task.dueDate }}</td>
              <td class="tw:px-4 tw:py-4 tw:text-center">
                <span
                  class="tw:text-xs tw:font-bold tw:px-2.5 tw:py-1 tw:rounded-full"
                  :class="getPriorityColor(task.priority)"
                >
                  {{ task.priority }}
                </span>
              </td>
              <td class="tw:px-4 tw:py-4">
                <div class="tw:flex tw:items-center tw:justify-center tw:gap-1">
                  <button
                    class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-primary/10"
                    title="View Details"
                  >
                    <IconEye :size="16" />
                  </button>
                  <button
                    class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-sidebar"
                    title="Edit Task"
                  >
                    <IconPencil :size="16" />
                  </button>
                  <button
                    class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:text-good tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-good/10"
                    title="Mark Complete"
                  >
                    <IconCircleCheck :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <iframe
      src="https://docs.google.com/document/d/1PSpwVmyuA8feXB8ZwCbPMH5yoxRhMK0m9Lt8sFJzkI4/edit?tab=t.0"
      height="100vh"
      weidth="100%"
    />
  </div>

  <!-- Onboarding Dialog -->
  <OnboardingDialog v-model="showOnboarding" />
</template>
