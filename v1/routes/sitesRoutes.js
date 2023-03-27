import express from "express";
import { getHierroShoes } from "../../controllers/newbalanceController.js";

const router = express.Router();

router.get("/newbalance", getHierroShoes);

export default router;
