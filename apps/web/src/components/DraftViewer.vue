<template>
 <view class="draft-overlay"><view class="draft-dialog" role="dialog" :aria-label="ct('viewDraft')">
  <view class="draft-heading"><text class="draft-title">{{ct('viewDraft')}}</text><button class="draft-close" role="button" @click="$emit('close')">{{ct('closeDraft')}}</button></view>
  <text class="draft-notice">{{ct(run.proposal?'draftReviewNotice':'unverifiedDraft')}}</text>
  <scroll-view scroll-y class="draft-scroll">
   <view v-if="run.validation_issues?.length" class="draft-issues"><text class="draft-title">{{ct('validationReasons')}}</text><text v-for="(issue,i) in run.validation_issues" :key="i" class="draft-issue">{{i+1}}. {{locale==='en'?issue.en:issue.zh}}</text></view>
   <text v-if="parsed?.summary" class="draft-summary" selectable>{{safe(parsed.summary)}}</text>
   <view v-for="(s,i) in sessions" :key="i" class="draft-session"><text class="draft-title">{{safe(s.title)}}</text><text class="draft-meta">{{safe(s.date)}} · {{safe(s.target_minutes)}} {{ct('minutesUnit')}}</text>
    <PlanExercises v-if="run.proposal" :items="s.exercises"/>
    <view v-else v-for="(m,j) in moves(s)" :key="j" class="draft-move"><text>{{movement(m.slug)}} · {{safe(m.sets)}} {{ct('sets')}} × {{safe(m.reps??m.duration_seconds)}} {{ct(m.reps!=null?'reps':'seconds')}}</text><text>{{ct('rest')}} {{safe(m.rest_seconds)}} {{ct('seconds')}}</text></view>
   </view>
   <text v-if="!sessions.length" class="draft-raw" selectable>{{run.candidate_text}}</text>
  </scroll-view>
 </view></view>
</template>
<script setup lang="ts">
import {computed} from 'vue';import {ct} from '../lib/coach-i18n';import {locale} from '../lib/i18n';import {exercises,exerciseName} from '../lib/exercises';import PlanExercises from './PlanExercises.vue';
const props=defineProps<{run:any}>();defineEmits(['close']);
const parsed=computed(()=>{if(props.run.proposal)return props.run.proposal;try{return JSON.parse(props.run.candidate_text);}catch{return null;}});
const sessions=computed(()=>Array.isArray(parsed.value?.sessions)?parsed.value.sessions.filter((s:any)=>s&&typeof s==='object').slice(0,8):[]);
function moves(s:any){return Array.isArray(s.exercises)?s.exercises.filter((m:any)=>m&&typeof m==='object').slice(0,8):[];}
function safe(v:any){return ['string','number'].includes(typeof v)?String(v).slice(0,1200):'—';}
function movement(slug:any){const e=exercises.find(e=>e.slug===slug);return e?exerciseName(e):safe(slug);}
</script>
<style scoped>
.draft-overlay{position:fixed;inset:0;z-index:160;background:#152b2270;display:flex;align-items:center;justify-content:center;padding:18px}.draft-dialog{width:640px;max-width:100%;box-sizing:border-box;background:white;border-radius:18px;padding:22px;color:#284d39}.draft-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.draft-title{display:block;font-size:16px;font-weight:600;line-height:1.6}.draft-close{background:#edf3e5;color:#46663b;padding:8px 13px;line-height:22px;font-size:12px;border-radius:8px;margin:0}.draft-notice{display:block;background:#fff4e4;color:#8a623d;font-size:12px;line-height:1.8;padding:12px;border-radius:8px;margin:16px 0}.draft-scroll{height:55vh}.draft-issues{padding:12px;background:#fff0e9;border-radius:9px}.draft-issue{display:block;font-size:12px;line-height:1.8;margin-top:8px;overflow-wrap:anywhere}.draft-summary,.draft-raw{display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.9;margin:16px 0}.draft-session{border:1px solid #e1e8da;border-radius:10px;margin:14px 0;padding:14px}.draft-meta{display:block;font-size:12px;color:#819074;margin:8px 0}.draft-move{font-size:12px;line-height:1.8;padding:8px 0;border-top:1px solid #edf0e7}.draft-move>text{display:block}
</style>
