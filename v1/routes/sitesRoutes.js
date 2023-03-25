import express from "express";
import { getTrailRunningShoes } from "../../controllers/newbalanceController.js";

const router = express.Router();

router.get("/newbalance", getTrailRunningShoes);

export default router;
