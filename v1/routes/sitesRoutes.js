import express from "express";
import { getNewBalanceShoes } from "../../controllers/newbalanceController.js";
import { getSauconyShoes } from "../../controllers/sauconyController.js";

const router = express.Router();

router.get("/newbalance", getNewBalanceShoes);
router.get("/saucony", getSauconyShoes);

export default router;
