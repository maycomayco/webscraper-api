import express from "express";
import { getNewBalanceShoes } from "../../controllers/newbalanceController.js";
import { getSauconyShoes } from "../../controllers/sauconyController.js";
import { getIndieHoyMusic } from "../../controllers/musicArticleController.js";

const router = express.Router();

router.get("/newbalance", getNewBalanceShoes);
router.get("/saucony", getSauconyShoes);
router.get("/music/indiehoy", getIndieHoyMusic);

export default router;
