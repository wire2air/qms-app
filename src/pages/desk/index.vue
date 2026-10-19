<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

// /desk → the agent's own inbox.
const router = useRouter()
router.replace(getCompanyPath('/desk/mine'))
</script>

<template><span /></template>
