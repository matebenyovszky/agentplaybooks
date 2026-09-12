import { handle } from "hono/vercel";
import { app } from "../app";

export const POST = handle(app);
export const OPTIONS = handle(app);
