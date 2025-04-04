const express = require("express");
const mongoose = require("mongoose");
const shortid = require("shortid");
const UAParser = require("ua-parser-js");
const path = require("path");

const app = express();
app.use(express.json());

mongoose.connect("mongodb://localhost:27017/shortlinks", { useNewUrlParser: true, useUnifiedTopology: true });

const UrlSchema = new mongoose.Schema({
    shortUrl: String,
    longUrl: String,
    token: String,
    dynamicLinkInfo: Object,
    createdAt: { type: Date, default: Date.now, expires: 604800 }, // 7-day expiry
    clickCount: { type: Number, default: 0 }
});

const Url = mongoose.model("Url", UrlSchema);

// Create a short URL with Firebase Dynamic Links-style parameters
app.post("/shorten", async (req, res) => {
    const { dynamicLinkInfo, suffix } = req.body;
    if (!dynamicLinkInfo || !dynamicLinkInfo.link || !dynamicLinkInfo.domainUriPrefix) {
        return res.status(400).json({ error: "Invalid request payload" });
    }

    const shortUrl = shortid.generate();
    
    await Url.create({
        shortUrl,
        longUrl: dynamicLinkInfo.link,
        token: shortUrl,
        dynamicLinkInfo
    });

    res.json({ shortUrl: `${dynamicLinkInfo.domainUriPrefix}/open-app/${shortUrl}` });
});

// Redirect handling
app.get("/:shortUrl", async (req, res) => {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (!url) return res.status(404).send("Not found");

    // Update click count
    url.clickCount += 1;
    await url.save();

    const parser = new UAParser(req.headers["user-agent"]);
    const os = parser.getOS().name.toLowerCase();

    // Redirect logic
    if (os.includes("ios")) {
        res.redirect(url.dynamicLinkInfo.iosInfo?.iosBundleId || "https://apps.apple.com/app/idYOUR_APP_ID");
    } else if (os.includes("android")) {
        res.redirect(url.dynamicLinkInfo.androidInfo?.androidPackageName || "https://play.google.com/store/apps/details?id=YOUR_PACKAGE_NAME");
    } else {
        res.redirect(url.longUrl);
    }
});

// Get analytics for a short link
app.get("/stats/:shortUrl", async (req, res) => {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (!url) return res.status(404).json({ error: "Short link not found" });
    res.json({ shortUrl: url.shortUrl, clickCount: url.clickCount });
});

// Serve open-app.html dynamically with meta tags
app.get("/open-app/:shortUrl", async (req, res) => {
    const url = await Url.findOne({ shortUrl: req.params.shortUrl });
    if (!url) return res.status(404).send("Not found");

    const metaTags = `
    <html>
    <head>
        <meta property="og:title" content="${url.dynamicLinkInfo.socialMetaTagInfo?.socialTitle || "Default Title"}">
        <meta property="og:description" content="${url.dynamicLinkInfo.socialMetaTagInfo?.socialDescription || "Default Description"}">
        <meta property="og:image" content="${url.dynamicLinkInfo.socialMetaTagInfo?.socialImageLink || "default-image.png"}">
        <meta http-equiv="refresh" content="0; url=${url.longUrl}">
    </head>
    <body>
        <p>Redirecting...</p>
    </body>
    </html>`;

    res.send(metaTags);
});

app.listen(3000, () => console.log("Server running on port 3000"));