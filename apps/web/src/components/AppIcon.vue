<template><view aria-hidden="true" class="icon" :class="'icon-'+name"><image class="icon-image" :src="`/static/icons/${resolved}-${tone}.png`" mode="aspectFit"/></view></template>
<script setup lang="ts">
import {computed} from 'vue';
const props=withDefaults(defineProps<{name:string;tone?:'forest'|'muted'|'white'|'lime'}>(),{tone:'forest'});
const names=['home','plans','stats','learn','profile','run','strength','yoga','walk','cycle','check','arrow','right','back','plus','close','clock','flame','play','pause','grid','brand'];
const resolved=computed(()=>names.includes(props.name)?props.name:'arrow');
</script>
<style scoped>.icon{display:inline-flex;align-items:center;justify-content:center;width:1em;height:1em;font-size:24px;line-height:1;flex-shrink:0;vertical-align:middle}.icon-image{display:block;width:100%;height:100%}.icon-brand{font-size:29px}.icon-check{font-size:18px}</style>
