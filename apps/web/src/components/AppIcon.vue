<template><view class="icon" :class="'icon-'+name"><text>{{symbols[name]||'↗'}}</text></view></template>
<script setup lang="ts">defineProps<{name:string}>();const symbols:Record<string,string>={home:'⌂',plans:'▤',stats:'▥',learn:'◈',profile:'○',run:'↗',strength:'＋',yoga:'⌁',walk:'↟',cycle:'◎',check:'✓',arrow:'↗',brand:'↗'};</script>
<style scoped>.icon{display:flex;align-items:center;justify-content:center;width:24px;height:24px;font-size:24px;font-weight:500;line-height:1}.icon-brand{font-size:29px;font-weight:800}.icon-check{font-size:18px}</style>
