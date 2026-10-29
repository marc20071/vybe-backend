import { Router } from "express";
import { z } from "zod";
import * as c from "../controllers/auth.controller";
import { authRateLimit } from "../middleware/rate-limit";
import { validateBody } from "../middleware/validate";
import { loginSchema, signupSchema } from "../validators/auth.schemas";

const r = Router();
r.get("/me", c.me);
r.post("/signup", authRateLimit, validateBody(signupSchema), c.signup);
r.post("/login", authRateLimit, validateBody(loginSchema), c.login);
r.post("/resend-confirmation", authRateLimit, validateBody(z.object({ email: z.email() })), c.resendConfirmation);
r.post("/logout", c.logout);
r.post("/forgot-password", authRateLimit, validateBody(z.object({ email: z.email() })), c.forgotPassword);
r.post("/reset-password", authRateLimit, validateBody(z.object({ accessToken: z.string().min(1), password: z.string().min(8).max(128) })), c.resetPassword);
export default r;
