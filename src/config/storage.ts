import { getUserSupabase } from "./database";
export const MEDIA_BUCKET="vybe-media";
export async function createUploadUrl(accessToken:string,path:string){
 const {data,error}=await getUserSupabase(accessToken).storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
 if(error) throw Object.assign(new Error(error.message),{statusCode:400,code:"UPLOAD_URL_FAILED"});
 return data;
}
