import type { Request } from "express";

export function routeParam(req: Request, name: string): string {
  const value = req.params[name];

  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];

  throw Object.assign(new Error(`Missing or invalid route parameter: ${name}`), {
    statusCode: 400,
    code: "INVALID_ROUTE_PARAMETER",
  });
}
