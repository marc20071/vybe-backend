type Level="info"|"warn"|"error";
export function log(level:Level,message:string,extra?:unknown){const entry={timestamp:new Date().toISOString(),level,message,...(extra?{extra}:{})};const line=JSON.stringify(entry);if(level==="error")console.error(line);else if(level==="warn")console.warn(line);else console.log(line)}
