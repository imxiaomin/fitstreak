<template><view class="exercise-art"><image v-if="!failed" class="exercise-image" :src="frameUrl(exercise.slug,frame)" mode="aspectFit" :alt="exerciseName(exercise)+' · '+et('frame')+' '+frame" :aria-label="exerciseName(exercise)+' · '+et('frame')+' '+frame" @error="failed=true"/><view v-else class="exercise-fallback"><AppIcon :name="exercise.activity" tone="white"/><text>{{et('loadError')}}</text></view></view></template>
<script setup lang="ts">
import {ref,watch} from 'vue';
import AppIcon from './AppIcon.vue';
import {type Exercise,frameUrl,exerciseName,et} from '../lib/exercises';
const props=withDefaults(defineProps<{exercise:Exercise;frame?:number}>(),{frame:1});
const failed=ref(false);watch(()=>[props.exercise.slug,props.frame],()=>failed.value=false);
</script>
<style scoped>.exercise-art{width:100%;height:100%;min-height:0}.exercise-image{display:block;width:100%;height:100%}.exercise-fallback{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#e0e9dc;font-size:11px}</style>
