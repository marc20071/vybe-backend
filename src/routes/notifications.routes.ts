import {Router} from "express";import * as c from "../controllers/notifications.controller";import {authenticate} from "../middleware/authenticate";
const r=Router();r.get("/",authenticate,c.list);r.delete("/",authenticate,c.clear);r.put("/:id/read",authenticate,c.markRead);export default r;
