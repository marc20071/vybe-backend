export interface ApiSuccess<T>{success:true;data:T;meta?:Record<string,unknown>}
export interface ApiError{success:false;error:{code:string;message:string;details?:unknown}}
export interface Profile{ id:string; username:string; display_name:string; bio?:string; avatar_url?:string|null }
export interface PublicPost{ id:string; userId:string; username:string; displayName:string; caption:string; mediaUrl:string; mediaType:string; createdAt:string; likeCount:number; commentCount:number; liked:boolean; saved:boolean }
