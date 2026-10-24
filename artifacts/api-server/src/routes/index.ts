import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userStateRouter from "./user-state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(userStateRouter);

export default router;
