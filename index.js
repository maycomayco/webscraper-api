import express from "express";
import sitesRoutes from "./v1/routes/sitesRoutes.js";

const PORT = process.env.port || 3001;
const app = express();

app.use(express.json());
app.use("/api/v1", sitesRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
