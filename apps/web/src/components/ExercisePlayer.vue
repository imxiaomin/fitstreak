<template>
 <view class="movement-player" :class="{compact}">
  <view class="movement-stage"><view class="movement-stage-top"><text>{{et('frames')}}</text><text>0{{frame}} / 03</text></view><view class="movement-figure"><ExerciseArt :exercise="exercise" :frame="frame"/></view><view class="movement-stage-bottom"><text class="movement-stage-name">{{exerciseName(exercise)}}</text><button class="movement-play" role="button" tabindex="0" :aria-label="et(playing?'pause':'play')" @click="togglePlay"><AppIcon :name="playing?'pause':'play'" tone="white"/></button></view></view>
  <view class="movement-controls"><button role="button" tabindex="0" class="movement-step" :aria-label="et('previous')" @click="step(-1)"><AppIcon name="back"/></button><view class="movement-frame-tabs"><button class="movement-frame-tab" v-for="n in 3" :key="n" role="button" tabindex="0" :aria-label="et('frame')+' '+n" :aria-pressed="frame===n" :class="{selected:frame===n}" @click="selectFrame(n)">0{{n}}</button></view><button role="button" tabindex="0" class="movement-step" :aria-label="et('next')" @click="step(1)"><AppIcon name="right"/></button></view>
 </view>
</template>
<script setup lang="ts">
import {ref,watch,onUnmounted} from 'vue';
import ExerciseArt from './ExerciseArt.vue';
import AppIcon from './AppIcon.vue';
import {type Exercise,exerciseName,et} from '../lib/exercises';
const props=defineProps<{exercise:Exercise;compact?:boolean}>();
const frame=ref(1),playing=ref(false);let timer:ReturnType<typeof setInterval>|undefined;
function stop(){if(timer)clearInterval(timer);timer=undefined;playing.value=false;}
function togglePlay(){if(playing.value){stop();return;}playing.value=true;timer=setInterval(()=>frame.value=frame.value%3+1,1000);}
function selectFrame(n:number){stop();frame.value=n;}
function step(delta:number){selectFrame((frame.value-1+delta+3)%3+1);}
watch(()=>props.exercise.slug,()=>{stop();frame.value=1;});onUnmounted(stop);
</script>
<style scoped>
.movement-player{width:100%;min-width:0}.movement-stage{background:#214638;border-radius:15px;overflow:hidden;position:relative;padding:18px 20px;color:#fff}.movement-stage-top,.movement-stage-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px}.movement-stage-top{color:#c3d6bb;font-size:10px;letter-spacing:1px}.movement-figure{height:245px;margin:6px auto;max-width:340px}.movement-stage-name{font-size:17px;font-weight:600}.movement-play{display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border-radius:50%;background:#ffffff20;border:1px solid #ffffff38;flex-shrink:0}.movement-play .icon{font-size:18px}.movement-controls{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px}.movement-step{display:flex;padding:9px;background:#f0f4eb;border-radius:9px}.movement-step .icon{font-size:17px}.movement-frame-tabs{display:flex;gap:6px}.movement-frame-tab{font-size:11px;line-height:28px;min-width:40px;background:#f0f4eb;color:#84917b;border-radius:7px;padding:2px 8px}.movement-frame-tab.selected{background:#dceacb;color:#284e36;font-weight:700}.compact .movement-figure{height:140px;margin:0 auto}.compact .movement-stage{padding:12px 14px}.compact .movement-stage-name{font-size:13px}.compact .movement-play{width:32px;height:32px}.compact .movement-controls{margin-top:8px}
@media(max-width:760px){.movement-figure{height:215px}.movement-stage{padding:16px}.movement-stage-name{font-size:15px}}
</style>
