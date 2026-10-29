import {Router} from "express";import * as c from "../controllers/search.controller";import {optionalAuth} from "../middleware/optional-auth";
const r=Router();r.get("/",optionalAuth,c.run);export default r;
