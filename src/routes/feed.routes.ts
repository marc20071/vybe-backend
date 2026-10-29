import {Router} from "express";import * as c from "../controllers/feed.controller";import {authenticate} from "../middleware/authenticate";import {optionalAuth} from "../middleware/optional-auth";
const r=Router();r.get("/",optionalAuth,c.feed);r.get("/following",authenticate,c.following);export default r;
