export function parsePagination(query:Record<string,unknown>){const l=Number(query.limit??20),o=Number(query.offset??0);return{limit:Number.isFinite(l)?Math.min(Math.max(Math.trunc(l),1),50):20,offset:Number.isFinite(o)?Math.max(Math.trunc(o),0):0}}
export function cursorFrom(rows:unknown[],limit:number){return rows.length===limit?String((rows[rows.length-1] as {id?:string})?.id??"")||null:null}
