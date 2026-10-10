import { handle } from "hono/vercel";
import { app } from "../app";

export const DELETE = handle(app);
export const OPTIONS = handle(app);
