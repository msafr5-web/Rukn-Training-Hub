import { Router, type IRouter } from "express";
import healthRouter from "./health";
import coursesRouter from "./courses";
import portalRouter from "./portal";
import certificatesRouter from "./certificates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(coursesRouter);
router.use(portalRouter);
router.use(certificatesRouter);

export default router;
