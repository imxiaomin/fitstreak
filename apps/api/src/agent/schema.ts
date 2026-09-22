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
export class AgentError extends Error{constructor(public code:string,public statusCode=400){super(code);}}
const ajv=new Ajv({allErrors:true,coerceTypes:false,removeAdditional:false});
export const checkHealth=ajv.compile(healthSchema),checkProposal=ajv.compile(proposalSchema);
export function validateHealth(h:Health){if(!checkHealth(h))throw new AgentError('VALIDATION_ERROR');}
export function ensureEligible(h:Health){if(h.has_limitations||h.limitations.trim())throw new AgentError('HEALTH_REVIEW_REQUIRED');}
export function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function validateProposal(value:unknown,h:Health,start:string,today:string):asserts value is Proposal{
 if(!checkProposal(value))throw new AgentError('AI_INVALID_PLAN',422);
 const p=value as Proposal;ensureEligible(h);
 if(!p.summary.trim()||p.sessions.length>h.weekly_days)throw new AgentError('AI_INVALID_PLAN',422);
 const dates=new Set<string>();
 for(const s of p.sessions){
  if(!s.title.trim()||!validDate(s.date)||s.date<start||s.date>shiftDay(start,6)||s.date<today||dates.has(s.date))throw new AgentError('AI_INVALID_PLAN',422);
  dates.add(s.date);
  if(s.target_minutes>Math.min(h.session_minutes,h.experience==='beginner'?30:60))throw new AgentError('AI_INVALID_PLAN',422);
  let seconds=0;const slugs=new Set<string>();
  for(const m of s.exercises){
   const e=catalog.find(e=>e.slug===m.slug);
   if(!e||slugs.has(m.slug)||e.activity!==s.activity||(e.equipment&&!h.equipment.includes(e.equipment))||(m.reps===null)===(m.duration_seconds===null))throw new AgentError('AI_INVALID_PLAN',422);
   if((e.dose==='reps')!==(m.reps!==null))throw new AgentError('AI_INVALID_PLAN',422);
   if(h.experience==='beginner'&&(m.sets>3||(m.reps??0)>12||(s.activity==='strength'&&(m.duration_seconds??0)>60)))throw new AgentError('AI_INVALID_PLAN',422);
   slugs.add(m.slug);seconds+=m.sets*(m.duration_seconds??(m.reps!*4))+Math.max(0,m.sets-1)*m.rest_seconds;
  }
  if(seconds>s.target_minutes*60)throw new AgentError('AI_INVALID_PLAN',422);
 }
}
