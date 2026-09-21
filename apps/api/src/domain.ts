export function localDate(now: Date = new Date(), timezone = 'Asia/Shanghai'): string {
 return new Intl.DateTimeFormat('en-CA', {timeZone:timezone, year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function shiftDay(date: string, days: number) { const d=new Date(date+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function weekday(date: string) { return new Date(date+'T00:00:00Z').getUTCDay() || 7; }
export function streak(dates: string[], today: string) {
 const set=new Set(dates); let cursor=set.has(today)?today:shiftDay(today,-1); let n=0;
 while(set.has(cursor)) { n++; cursor=shiftDay(cursor,-1); } return n;
}
export function isScheduled(plan: any, date: string) {
 return !plan.archived_at && date>=plan.start_date && (!plan.end_date || date<=plan.end_date) && plan.weekdays.includes(weekday(date));
}
