import {Ajv} from 'ajv';
import {shiftDay} from '../domain.js';
export const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const integer=(min:number,max:number)=>({type:'integer',minimum:min,maximum:max});
const text=(max:number,min=1)=>({type:'string',minLength:min,maxLength:max});
export const healthSchema=obj({age:integer(18,100),height_cm:integer(100,230),weight_kg:{type:'number',minimum:30,maximum:250},goal:{type:'string',enum:['fitness','strength','weight_management']},experience:{type:'string',enum:['beginner','regular']},weekly_days:integer(1,5),session_minutes:integer(10,60),equipment:{type:'array',uniqueItems:true,maxItems:2,items:{type:'string',enum:['treadmill','bike']}},has_limitations:{type:'boolean'},limitations:text(500,0),ai_consent:{type:'boolean'}});
export type Health={age:number;height_cm:number;weight_kg:number;goal:string;experience:'beginner'|'regular';weekly_days:number;session_minutes:number;equipment:string[];has_limitations:boolean;limitations:string;ai_consent:boolean};
export const catalog=[
 {slug:'walking',zh:'步行',en:'Walking',activity:'walk',equipment:null,dose:'duration'},
 {slug:'running',zh:'跑步机跑步',en:'Treadmill running',activity:'run',equipment:'treadmill',dose:'duration'},
 {slug:'cycling',zh:'骑行',en:'Cycling',activity:'cycle',equipment:'bike',dose:'duration'},
 {slug:'push-up',zh:'俯卧撑',en:'Push-up',activity:'strength',equipment:null,dose:'reps'},
 {slug:'bodyweight-squat',zh:'徒手深蹲',en:'Bodyweight squat',activity:'strength',equipment:null,dose:'reps'},
 {slug:'plank',zh:'平板支撑',en:'Plank',activity:'strength',equipment:null,dose:'duration'},
 {slug:'forward-lunge',zh:'前弓步',en:'Forward lunge',activity:'strength',equipment:null,dose:'reps'},
 {slug:'cat-cow-stretch',zh:'猫牛式伸展',en:'Cat-cow stretch',activity:'yoga',equipment:null,dose:'reps'},
 {slug:'childs-pose',zh:'婴儿式',en:'Child’s pose',activity:'yoga',equipment:null,dose:'duration'},
 {slug:'cross-body-shoulder-stretch',zh:'肩部交叉伸展',en:'Cross-body shoulder stretch',activity:'yoga',equipment:null,dose:'duration'},
];
export const exerciseSchema=obj({slug:{type:'string',enum:catalog.map(e=>e.slug)},sets:integer(1,4),reps:{anyOf:[integer(1,20),{type:'null'}]},duration_seconds:{anyOf:[integer(10,1800),{type:'null'}]},rest_seconds:integer(0,120)});
export const proposalSchema=obj({summary:text(1200),sessions:{type:'array',minItems:1,maxItems:5,items:obj({title:text(80),date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},activity:{type:'string',enum:['run','walk','cycle','strength','yoga']},target_minutes:integer(10,60),exercises:{type:'array',minItems:1,maxItems:6,items:exerciseSchema}})}});
export type Move={slug:string;sets:number;reps:number|null;duration_seconds:number|null;rest_seconds:number};
export type Proposal={summary:string;sessions:{title:string;date:string;activity:string;target_minutes:number;exercises:Move[]}[]};
export type PlanIssue={zh:string;en:string};
export class AgentError extends Error{constructor(public code:string,public statusCode=400,public issues:PlanIssue[]=[]){super(code);}}
const ajv=new Ajv({allErrors:true,coerceTypes:false,removeAdditional:false});
export const checkHealth=ajv.compile(healthSchema),checkProposal=ajv.compile(proposalSchema);
export function validateHealth(h:Health){if(!checkHealth(h))throw new AgentError('VALIDATION_ERROR');}
export function ensureEligible(h:Health){if(h.has_limitations||h.limitations.trim())throw new AgentError('HEALTH_REVIEW_REQUIRED');}
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function validateProposal(value:unknown,h:Health,start:string,today:string):asserts value is Proposal{
 if(!checkProposal(value))throw new AgentError('AI_INVALID_PLAN',422,(checkProposal.errors??[]).slice(0,8).map(e=>({zh:`草稿字段 ${e.instancePath||'/'} 不符合格式要求（${e.keyword}）：${JSON.stringify(e.params)}`,en:`Draft field ${e.instancePath||'/'}: ${e.message}; ${JSON.stringify(e.params)}`})));
 const p=value as Proposal;ensureEligible(h);const issues:PlanIssue[]=[];
 const add=(zh:string,en:string)=>issues.push({zh,en});
 if(!p.summary.trim())add('缺少计划说明。','Plan summary is empty.');
 if(p.sessions.length>h.weekly_days)add(`训练次数超过每周 ${h.weekly_days} 次。`,`At most ${h.weekly_days} sessions are allowed.`);
 const dates=new Set<string>();
 for(const [i,s] of p.sessions.entries()){
  const z=`第 ${i+1} 次训练：`,e=`Session ${i+1}: `;
  if(!s.title.trim())add(z+'缺少名称。',e+'title is empty.');
  if(!validDate(s.date)||s.date<start||s.date>shiftDay(start,6)||s.date<today)add(z+`日期应在 ${start} 至 ${shiftDay(start,6)} 内，且不能早于今天。`,e+`date must be within ${start} through ${shiftDay(start,6)} and not before today.`);
  if(dates.has(s.date))add(z+'同一天只能安排一次训练。',e+'only one session per date is supported.');dates.add(s.date);
  const budget=Math.min(h.session_minutes,h.experience==='beginner'?30:60);
  if(s.target_minutes>budget)add(z+`超过每日 ${budget} 分钟上限（初学者最多 30 分钟）。`,e+`daily limit is ${budget} minutes (beginner cap: 30).`);
  let seconds=0;const slugs=new Set<string>();
  for(const [j,m] of s.exercises.entries()){
   const exercise=catalog.find(e=>e.slug===m.slug)!;const zm=z+`动作 ${j+1}：`,em=e+`exercise ${j+1}: `;
   if(slugs.has(m.slug))add(zm+'动作重复，请合并组数。',em+'duplicate movement; combine sets.');
   if(exercise.activity!==s.activity)add(zm+'动作类别与当天训练类别不一致。力量与有氧请安排在不同训练日。',em+`activity must be ${exercise.activity}; alternate strength and cardio on different dates.`);
   if(exercise.equipment&&!h.equipment.includes(exercise.equipment))add(zm+'所需器械不在档案中。',em+`equipment ${exercise.equipment} is unavailable.`);
   if((m.reps===null)===(m.duration_seconds===null)||(exercise.dose==='reps')!==(m.reps!==null))add(zm+`应使用${exercise.dose==='reps'?'次数，时长填 null':'秒数，次数填 null'}。`,em+`use ${exercise.dose==='reps'?'reps and duration_seconds=null':'duration_seconds and reps=null'}.`);
   if(h.experience==='beginner'&&(m.sets>3||(m.reps??0)>12||(s.activity==='strength'&&(m.duration_seconds??0)>60)))add(zm+'初学者最多 3 组、每组 12 次；力量保持每组最多 60 秒。',em+'beginner limits: 3 sets, 12 reps, 60 seconds per strength hold.');
   slugs.add(m.slug);seconds+=m.sets*(m.duration_seconds??(m.reps!*4))+Math.max(0,m.sets-1)*m.rest_seconds;
  }
  if(seconds>s.target_minutes*60)add(z+`动作与休息合计约 ${seconds} 秒，超过 ${s.target_minutes*60} 秒预算。`,e+`exercise and rest estimate ${seconds}s exceeds ${s.target_minutes*60}s budget.`);
 }
 if(issues.length)throw new AgentError('AI_INVALID_PLAN',422,issues.slice(0,12));
}
