import {createApp} from "./app";import {env} from "./config/env";import {log} from "./utils/logger";
const app=createApp();const server=app.listen(env.PORT,()=>log("info",`VYBE API listening on port ${env.PORT}`,{environment:env.NODE_ENV}));
const shutdown=(signal:string)=>{log("info",`Received ${signal}; closing server`);server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref()};process.on("SIGTERM",()=>shutdown("SIGTERM"));process.on("SIGINT",()=>shutdown("SIGINT"));
