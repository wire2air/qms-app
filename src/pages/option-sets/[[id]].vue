<script setup>
const route = useRoute()
</script>

<template>
  <OptionSetsIndex :id="route.params.id" />
</template>
