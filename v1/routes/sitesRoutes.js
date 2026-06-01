import express from "express";
import { getNewBalanceShoes } from "../../controllers/newbalanceController.js";
import { getSauconyShoes } from "../../controllers/sauconyController.js";
import { getMusicDiscovery } from "../../controllers/musicDiscoveryController.js";

const router = express.Router();

router.get("/newbalance", getNewBalanceShoes);
router.get("/saucony", getSauconyShoes);
router.get("/music/discovery", getMusicDiscovery);

export default router;
