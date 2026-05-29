import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import sitesRoutes from "./v1/routes/sitesRoutes.js";

const PORT = process.env.PORT || 3001;
const app = express();

// Render uses a single-hop reverse proxy — "1" tells Express to trust
// the first X-Forwarded-For header so rate-limit sees the real client IP.
app.set("trust proxy", 1);

app.use(express.json());
app.use(helmet());
app.use(rateLimit({
    windowMs: 60 * 1000,  // 1 minute window
    max: 30,              // 30 requests per window per IP
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,  // Disable deprecated X-RateLimit-* headers
}));

app.use("/api/v1", sitesRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
