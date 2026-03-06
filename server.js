        // 3. Apply updates safely, preventing overwrites of critical fields like slug, _id, history
});
        // 3. Apply updates safely, preventing overwrites of critical fields like slug, _id, history
        for (const field of allowedTopLevelFields) {
            if (incoming[field] !== undefined) { 
                client[field] = incoming[field];
            }
        }

        if (incoming.socialLinks && typeof incoming.socialLinks === 'object') {
            Object.keys(incoming.socialLinks).forEach(key => {
                if (key in client.socialLinks.toObject()) {
                    client.socialLinks[key] = incoming.socialLinks[key];
                }
            });
        }
        if (incoming.workingHours && typeof incoming.workingHours === 'object') {
            Object.keys(incoming.workingHours).forEach(key => {
                if (key in client.workingHours.toObject()) {
                    client.workingHours[key] = incoming.workingHours[key];
                }
            });
        }
        
        if (incoming.photoUrl) { client.photoUrl = incoming.photoUrl; }
        if (incoming.themeColor) { client.themeColor = incoming.themeColor; }
        
        client.history.push({ action: "CLIENT_UPDATED", notes: "Admin updated client data.", actor: "admin" });

        await client.save();
        return respSuccess(res, { recordId: client._id }, "Client data saved successfully.");
    } catch (err) {
        logger.error({ err }, "❌ PUT /api/clients/:id error");
        return respError(res, "Server error saving client info.", 500, null, err);
    }
});

app.put("/api/clients/:id/status/:newStatus", publicLimiter, async (req, res) => {
    try {
        const id = req.params.id;
        const newStatus = req.params.newStatus; 
        const dbStatus = newStatus === 'Disabled' ? 'Suspended' : newStatus; 
        const client = await Client.findById(id);
        if (!client) return respError(res, "Client not found.", 404);
        client.status = dbStatus;
        client.history.push({ action: `STATUS_CHANGED_TO_${dbStatus.toUpperCase()}`, actor: "admin" });
        await client.save();
        return respSuccess(res, { recordId: client._id, newStatus: client.status }, `Status updated to ${newStatus}.`);
    } catch (err) {
        return respError(res, "Error updating status", 500, null, err);
    }
});

app.delete("/api/clients/:id", publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, "Not found", 404);
        client.status = "Deleted"; 
        await client.save();
        return respSuccess(res, null, "Deleted");
    } catch (err) {
        return respError(res, "Error deleting", 500);
    }
});

app.post("/api/clients/:id/vcard", publicLimiter, async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return respError(res, "Not found", 404);
        const vcfContent = generateVcardContent(client);
        const publicVcardPage = `${VCARD_BASE_URL.replace(/\/$/, "")}/?slug=${client.slug}`;
        client.vcardUrl = publicVcardPage; 
        client.status = "Active";
        await client.save();
        return respSuccess(res, { publicVcardPage, slug: client.slug }, "vCard created.");
    } catch (err) {
        return respError(res, "vCard failed", 500);
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'UP' : 'DOWN' });
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server live on port ${PORT}`);
});
