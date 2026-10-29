import type {Response} from "express";
export function ok<T>(res:Response,data:T,status=200,meta?:Record<string,unknown>){return res.status(status).json({success:true,data,...(meta?{meta}:{})})}
export function fail(res:Response,status:number,code:string,message:string,details?:unknown){return res.status(status).json({success:false,error:{code,message,...(details===undefined?{}:{details})},message})}
