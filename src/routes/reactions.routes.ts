import {Router} from "express";import * as c from "../controllers/reactions.controller";import {authenticate} from "../middleware/authenticate";
const r=Router();r.put("/posts/:id/like",authenticate,c.like);r.delete("/posts/:id/like",authenticate,c.like);r.put("/posts/:id/save",authenticate,c.save);r.delete("/posts/:id/save",authenticate,c.save);export default r;
