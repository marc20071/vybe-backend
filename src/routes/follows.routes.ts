import {Router} from "express";import * as c from "../controllers/follows.controller";import {authenticate} from "../middleware/authenticate";import {optionalAuth} from "../middleware/optional-auth";
const r=Router();r.get("/:username/follow-status",optionalAuth,c.followStatus);r.put("/:username/follow",authenticate,c.follow);r.delete("/:username/follow",authenticate,c.unfollow);export default r;
