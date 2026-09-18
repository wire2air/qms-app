/**
 * THE lookup component maps — one per registry entry in LOOKUP_ENTITIES.
 *
 * Every surface that renders a lookup FIELD (DynamicForm), a lookup CELL
 * (BaseChecklist via LookupSelectByEntity) or a readonly lookup VALUE
 * (FormSchemaReadonlyView) imports these maps instead of keeping its own —
 * so adding an entity to LOOKUP_ENTITIES plus one line here reaches every
 * form surface at once (user request 2026-08-27, when Unit of Measure had to
 * be added and three hand-rolled copies were found).
 *
 * lookupMaps.spec.js asserts these maps cover LOOKUP_ENTITIES exactly, so a
 * new registry entry without its components fails a test instead of
 * rendering "Unknown lookup source" in a customer's form.
 */
import ProductSelectMenu from '@/components/menus/ProductSelectMenu.vue'
import SupplierSelectMenu from '@/components/menus/SupplierSelectMenu.vue'
import SiteSelectMenu from '@/components/menus/SiteSelectMenu.vue'
import DepartmentSelectMenu from '@/components/menus/DepartmentSelectMenu.vue'
import UserSelectMenu from '@/components/menus/UserSelectMenu.vue'
import EquipmentSelectMenu from '@/components/menus/EquipmentSelectMenu.vue'
import CountrySelectMenu from '@/components/menus/CountrySelectMenu.vue'
import RegionSelectMenu from '@/components/menus/RegionSelectMenu.vue'
import UomSelectMenu from '@/components/menus/UomSelectMenu.vue'
import ShiftSelectMenu from '@/components/menus/ShiftSelectMenu.vue'
import ProductionLineSelectMenu from '@/components/menus/ProductionLineSelectMenu.vue'
import EmployeeTitleSelectMenu from '@/components/menus/EmployeeTitleSelectMenu.vue'
import ProductBadgeById from '@/components/badges/ProductBadgeById.vue'
import SupplierBadgeById from '@/components/badges/SupplierBadgeById.vue'
import SiteBadgeById from '@/components/badges/SiteBadgeById.vue'
import DepartmentBadgeById from '@/components/badges/DepartmentBadgeById.vue'
import UserBadgeById from '@/components/badges/UserBadgeById.vue'
import EquipmentBadgeById from '@/components/badges/EquipmentBadgeById.vue'
import CountryBadgeById from '@/components/badges/CountryBadgeById.vue'
import RegionBadgeById from '@/components/badges/RegionBadgeById.vue'
import UomBadgeById from '@/components/badges/UomBadgeById.vue'
import ShiftBadgeById from '@/components/badges/ShiftBadgeById.vue'
import ProductionLineBadgeById from '@/components/badges/ProductionLineBadgeById.vue'
import EmployeeTitleBadgeById from '@/components/badges/EmployeeTitleBadgeById.vue'

/** entity value → select-menu component (the edit control). */
export const LOOKUP_MENUS = {
  product: ProductSelectMenu,
  supplier: SupplierSelectMenu,
  site: SiteSelectMenu,
  department: DepartmentSelectMenu,
  user: UserSelectMenu,
  equipment: EquipmentSelectMenu,
  country: CountrySelectMenu,
  region: RegionSelectMenu,
  uom: UomSelectMenu,
  shift: ShiftSelectMenu,
  productionLine: ProductionLineSelectMenu,
  employeeTitle: EmployeeTitleSelectMenu,
}

/** entity value → BadgeById component (the readonly value). */
export const LOOKUP_BADGES = {
  product: ProductBadgeById,
  supplier: SupplierBadgeById,
  site: SiteBadgeById,
  department: DepartmentBadgeById,
  user: UserBadgeById,
  equipment: EquipmentBadgeById,
  country: CountryBadgeById,
  region: RegionBadgeById,
  uom: UomBadgeById,
  shift: ShiftBadgeById,
  productionLine: ProductionLineBadgeById,
  employeeTitle: EmployeeTitleBadgeById,
}

/** entity value → the BadgeById's id prop name. */
export const LOOKUP_ID_PROPS = {
  product: 'productId',
  supplier: 'supplierId',
  site: 'siteId',
  department: 'departmentId',
  user: 'userId',
  equipment: 'equipmentId',
  country: 'countryId',
  region: 'regionId',
  uom: 'uomId',
  shift: 'shiftId',
  productionLine: 'productionLineId',
  employeeTitle: 'employeeTitleId',
}

// Dev-time drift guard: the registry declares, these maps must bind. (The
// vitest side can't import this module — the .vue imports drag the decorator
// graph past the test transform — so the check lives here.)
if (import.meta.env?.DEV) {
  import('@/constants/formBuilderConfig').then(({ LOOKUP_ENTITIES }) => {
    for (const e of LOOKUP_ENTITIES) {
      if (!LOOKUP_MENUS[e.value] || !LOOKUP_BADGES[e.value] || !LOOKUP_ID_PROPS[e.value]) {
        console.warn(`[lookupMenus] registry entity "${e.value}" is missing a component binding`)
      }
    }
  })
}
