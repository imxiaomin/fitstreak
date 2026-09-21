import {locale} from './i18n';
export type Activity='run'|'walk'|'cycle'|'strength'|'yoga';
export type Exercise={slug:string;zh:string;en:string;activity:Activity;equipmentZh:string;equipmentEn:string;muscleZh:string;muscleEn:string};
export const exercises:Exercise[]=[
 {slug:'running',zh:'跑步机跑步',en:'Running',activity:'run',equipmentZh:'跑步机',equipmentEn:'Treadmill',muscleZh:'腿部',muscleEn:'Legs'},
 {slug:'walking',zh:'步行',en:'Walking',activity:'walk',equipmentZh:'徒步 / 步行器械',equipmentEn:'Walking / cardio',muscleZh:'腿部',muscleEn:'Legs'},
 {slug:'cycling',zh:'骑行',en:'Cycling',activity:'cycle',equipmentZh:'自行车 / 健身车',equipmentEn:'Bicycle / exercise bike',muscleZh:'腿部',muscleEn:'Legs'},
 {slug:'push-up',zh:'俯卧撑',en:'Push-up',activity:'strength',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'胸部',muscleEn:'Chest'},
 {slug:'bodyweight-squat',zh:'徒手深蹲',en:'Bodyweight squat',activity:'strength',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'股四头肌',muscleEn:'Quads'},
 {slug:'plank',zh:'平板支撑',en:'Plank',activity:'strength',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'核心',muscleEn:'Core'},
 {slug:'forward-lunge',zh:'前弓步',en:'Forward lunge',activity:'strength',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'股四头肌',muscleEn:'Quads'},
 {slug:'cat-cow-stretch',zh:'猫牛式伸展',en:'Cat-cow stretch',activity:'yoga',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'灵活性',muscleEn:'Mobility'},
 {slug:'childs-pose',zh:'婴儿式',en:'Child’s pose',activity:'yoga',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'背部',muscleEn:'Back'},
 {slug:'cross-body-shoulder-stretch',zh:'肩部交叉伸展',en:'Cross-body shoulder stretch',activity:'yoga',equipmentZh:'自重',equipmentEn:'Bodyweight',muscleZh:'肩部',muscleEn:'Shoulders'},
];
export const exerciseName=(e:Exercise)=>locale.value==='en'?e.en:e.zh;
export const exerciseMeta=(e:Exercise)=>locale.value==='en'?`${e.equipmentEn} · ${e.muscleEn}`:`${e.equipmentZh} · ${e.muscleZh}`;
export const frameUrl=(slug:string,frame=1)=>`/static/exercises/${slug}/frame-${frame}.png`;
export const referenceFor=(activity:string)=>exercises.find(e=>e.activity===activity)||exercises[3];
const zh={library:'动作指南',subtitle:'看清每一步，再开始训练。',reference:'项目动作参考',referenceHint:'同类动作示例，具体训练内容以你的计划为准。',frames:'三帧示意',frame:'帧',play:'播放示意',pause:'暂停',previous:'上一帧',next:'下一帧',all:'全部动作',strength:'力量',mobility:'伸展',cardio:'有氧',source:'素材：Workout Guide · Bryl Lim / Everkinetic · CC BY-SA 4.0',sourceDetail:'动作素材来自开源 Workout Guide；图片未经修改。',copySource:'复制素材与授权链接',copied:'素材链接已复制',loadError:'示意图暂不可用',browse:'浏览动作指南',articles:'知识阅读',count:'个精选动作',hero:'从一个动作开始',heroHint:'循序练习 · 持续记录',view:'查看动作'};
const en:Record<keyof typeof zh,string>={library:'Movement library',subtitle:'See each movement. Find your rhythm.',reference:'Activity reference',referenceHint:'An example in this category. Follow the details of your own plan.',frames:'Three-frame guide',frame:'Frame',play:'Play frames',pause:'Pause',previous:'Previous frame',next:'Next frame',all:'All movements',strength:'Strength',mobility:'Mobility',cardio:'Cardio',source:'Art: Workout Guide · Bryl Lim / Everkinetic · CC BY-SA 4.0',sourceDetail:'Open artwork from Workout Guide. Images are unmodified.',copySource:'Copy source & license links',copied:'Source links copied',loadError:'Illustration unavailable',browse:'Explore movements',articles:'Reading corner',count:'selected movements',hero:'Start with one movement',heroHint:'Practice gradually · Keep a record',view:'View movement'};
export function et(key:keyof typeof zh){return (locale.value==='en'?en:zh)[key];}
export function copyExerciseSource(){uni.setClipboardData({data:'Workout Guide — Bryl Lim / Everkinetic\nhttps://github.com/bryllim/workout-guide\nCC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/',success:()=>uni.showToast({title:et('copied'),icon:'none'})});}
