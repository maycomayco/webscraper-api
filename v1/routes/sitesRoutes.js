import express from "express";
import { getNewBalanceShoes } from "../../controllers/newbalanceController.js";

const router = express.Router();

router.get("/newbalance", getNewBalanceShoes);

export default router;
