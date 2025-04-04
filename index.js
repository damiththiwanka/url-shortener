const express = require("express");
const mongoose = require("mongoose");
const shortid = require("shortid");
const UAParser = require("ua-parser-js");
const cors = require("cors");

require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const UrlSchema = new mongoose.Schema({
    shortUrl: String,
    longUrl: String,
    token: String,
    dynamicLinkInfo: Object,
    createdAt: { type: Date, default: Date.now, expires: 604800 }, // 7 days
    clickCount: { type: Number, default: 0 },
});

const Url = mongoose.model("Url", UrlSchema);

// Create short link
app.post("/shorten", async (req, res) => {
    const { dynamicLinkInfo, suffix } = req.body;
    if (!dynamicLinkInfo || !dynamicLinkInfo.link)
        return res.status(400).json({ error: "Missing dynamicLinkInfo.link" });

    const shortUrl = suffix?.option === "SHORT" ? shortid.generate() : shortid.generate();
    await Url.create({
        shortUrl,
        longUrl: dynamicLinkInfo.link,
        token: shortUrl,
        dynamicLinkInfo,
    });

    const domain = dynamicLinkInfo.domainUriPrefix || "https://yourdomain.com";
    res.json({ shortUrl: `${domain}/open-app/${shortUrl}` });
});

// Redirect logic
app.get("/:shortUrl", async (req, res) => {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (!url) return res.status(404).send("Not found");

    url.clickCount++;
    await url.save();

    const parser = new UAParser(req.headers["user-agent"]);
    const os = parser.getOS().name.toLowerCase();

    const androidPackage = url.dynamicLinkInfo?.androidInfo?.androidPackageName;
    const iosBundleId = url.dynamicLinkInfo?.iosInfo?.iosBundleId;

    if (os.includes("android") && androidPackage) {
        res.redirect(`intent://#Intent;package=${androidPackage};scheme=https;end`);
    } else if (os.includes("ios") && iosBundleId) {
        res.redirect(`yourapp://paymentToken=${url.token}`);
    } else {
        res.redirect(url.longUrl);
    }
});

// Social Meta Redirect Page
app.get("/open-app/:shortUrl", async (req, res) => {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (!url) return res.status(404).send("Not found");

    const meta = url.dynamicLinkInfo?.socialMetaTagInfo || {};
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    res.send(`
        <html>
        <head>
            <meta property="og:title" content="${meta.socialTitle || 'Fundshare'}" />
            <meta property="og:description" content="${meta.socialDescription || 'Open this link in app'}" />
            <meta property="og:image" content="${meta.socialImageLink || 'https://url-shortener-e34c.onrender.com/default.png'}" />
            <meta property="og:url" content="${fullUrl}" />

            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content="${meta.socialTitle || 'Fundshare'}" />
            <meta name="twitter:description" content="${meta.socialDescription || 'Open this link in app'}" />
            <meta name="twitter:image" content="${meta.socialImageLink || 'https://url-shortener-e34c.onrender.com/default.png'}" />

            <!-- Delay gives bots time to parse -->
            <meta http-equiv="refresh" content="3; url=${url.longUrl}" />
            <title>Redirecting...</title>
        </head>
        <body>
            <p>Redirecting to the app...</p>
        </body>
        </html>
    `);
});

// Analytics
app.get("/stats/:shortUrl", async (req, res) => {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (!url) return res.status(404).json({ error: "Not found" });

    res.json({
        shortUrl: url.shortUrl,
        clickCount: url.clickCount,
        originalUrl: url.longUrl,
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
