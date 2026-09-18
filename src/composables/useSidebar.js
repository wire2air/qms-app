import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'

/**
 * Main-navigation visibility, responsive.
 *
 * Desktop (xl+, 1280px): the sidebar sits inline in the layout and its
 * open/closed state is the persisted `sidebar-drawer` preference.
 *
 * iPad / phone (< 1280px — iPad landscape included, per the auditor-on-iPad
 * requirement 2026-08-24): the sidebar is collapsed by default and opens as an
 * overlay (so it never squishes the page content). That open state is the
 * NON-persisted module-level `mobileOpen` ref — it resets to closed on every
 * load and on navigation, which is what you want on a small screen.
 *
 * `useMediaQuery` re-evaluates `isDesktop` live, so rotating an iPad or
 * resizing flips behavior without a reload.
 */
// Module-level so MainHeader (the hamburger) and MainSidebar (the panel)
// share the same instance without persisting to localStorage.
const mobileOpen = ref(false)

export function useSidebar() {
  const drawer = useCompanyLocalStorage('sidebar-drawer', true)
  const isDesktop = useMediaQuery('(min-width: 1280px)')

  const visible = computed(() => (isDesktop.value ? drawer.value : mobileOpen.value))

  function toggle() {
    if (isDesktop.value) drawer.value = !drawer.value
    else mobileOpen.value = !mobileOpen.value
  }
  function closeMobile() {
    mobileOpen.value = false
  }

  return { drawer, mobileOpen, isDesktop, visible, toggle, closeMobile }
}
