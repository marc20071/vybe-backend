import {Router} from "express";import multer from "multer";import * as c from "../controllers/uploads.controller";import {authenticate} from "../middleware/authenticate";
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1}});const r=Router();r.post("/",authenticate,upload.single("file"),c.create);export default r;
