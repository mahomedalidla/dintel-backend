const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// 1. BASE DE DATOS DE LEYENDAS (LEGACY)
const legacyDrivers = {
    "senna-12": { name: "SENNA", stats: "3 TITLES", years: "84 - 94", color: "#FCD116" },
    "schumacher-5": { name: "SCHUMY", stats: "7 TITLES", years: "91 - 12", color: "#FF0000" },
    "lauda-12": { name: "LAUDA", stats: "3 TITLES", years: "71 - 85", color: "#E10600" }
};

// 2. UTILIDADES DE FORMATEO
const simplifySession = (name) => {
    if (name.includes("Practice 1")) return "FP1";
    if (name.includes("Practice 2")) return "FP2";
    if (name.includes("Practice 3")) return "FP3";
    if (name.includes("Qualifying")) return "QUALY";
    if (name.includes("Sprint")) return "SPRINT";
    if (name.includes("Race")) return "RACE";
    return "";
};

async function getDriverLabel(driverNumber) {
    try {
        const res = await axios.get(`https://api.openf1.org/v1/drivers?driver_number=${driverNumber}&session_key=latest`, { timeout: 3000 });
        if (res.data && res.data.length > 0) {
            return `${res.data[0].name_acronym} ${res.data[0].driver_number}`.toUpperCase();
        }
    } catch (e) {
        console.error("Driver Info Error:", e.message);
    }
    return `F1 ${driverNumber}`;
}

// 3. ENDPOINT PRINCIPAL
app.get('/f1/dashboard/:id', async (req, res) => {
    const { id } = req.params;
    const now = new Date();

    // RUTA A: EDICIÓN LEYENDA
    if (legacyDrivers[id]) {
        const legacy = legacyDrivers[id];
        return res.json({
            mode: "LEGACY",
            gp: legacy.name.substring(0, 8),
            val: legacy.stats,
            msg: legacy.years,
            driver: legacy.name.substring(0, 8),
            color: legacy.color
        });
    }

    // RUTA B: PILOTOS ACTIVOS
    try {
        const driverLabel = await getDriverLabel(id);
        const sessionsRes = await axios.get('https://api.openf1.org/v1/sessions');
        const sessions = sessionsRes.data;

        const activeSession = sessions.find(s => now >= new Date(s.date_start) && now <= new Date(s.date_end));
        const lastSession = sessions.filter(s => new Date(s.date_end) < now).pop();
        const nextSession = sessions.find(s => new Date(s.date_start) > now);

        // --- LÓGICA DE DECISIÓN DINTEL ---

        // CASO 1: SESIÓN EN VIVO
        if (activeSession) {
            const sName = simplifySession(activeSession.session_name);
            try {
                const posRes = await axios.get(`https://api.openf1.org/v1/position?driver_number=${id}&session_key=latest`);
                const pos = posRes.data.slice(-1)[0]?.position || "--";
                return res.json({
                    mode: "LIVE",
                    gp: activeSession.location.substring(0, 8).toUpperCase(),
                    val: `P${pos}`,
                    msg: sName,
                    driver: driverLabel,
                    color: "#FFFFFF"
                });
            } catch (err) {
                // Fallback si la telemetría falla o está bloqueada
                return res.json({
                    mode: "LIVE",
                    gp: activeSession.location.substring(0, 8).toUpperCase(),
                    val: "LIVE",
                    msg: sName,
                    driver: driverLabel,
                    color: "#FF1801"
                });
            }
        }

        // CASO 2: POST-EVENTO (Diferenciado por importancia)
        if (lastSession) {
            const hoursSinceLast = (now - new Date(lastSession.date_end)) / (1000 * 60 * 60);
            const isRace = lastSession.session_name.includes("Race");
            const limit = isRace ? 72 : 4; // 3 días para carrera, 4h para el resto

            if (hoursSinceLast <= limit) {
                const lastPosRes = await axios.get(`https://api.openf1.org/v1/position?driver_number=${id}&session_key=${lastSession.session_key}`);
                const finalPos = lastPosRes.data.slice(-1)[0]?.position || "DNF";
                return res.json({
                    mode: "POST",
                    gp: lastSession.location.substring(0, 8).toUpperCase(),
                    val: `P${finalPos}`,
                    msg: isRace ? "FINAL" : `${simplifySession(lastSession.session_name)}END`,
                    driver: driverLabel,
                    color: "#FFFFFF"
                });
            }
        }

        // CASO 3: TIMER (Solo si falta menos de 24h para el inicio del GP o entre sesiones)
        if (nextSession) {
            const hoursToNext = (new Date(nextSession.date_start) - now) / (1000 * 60 * 60);
            
            if (hoursToNext <= 24) {
                const days = Math.floor(hoursToNext / 24);
                const hours = Math.floor(hoursToNext % 24);
                return res.json({
                    mode: "NEXT",
                    gp: nextSession.location.substring(0, 8).toUpperCase(),
                    val: `${days}D ${hours}H`,
                    msg: simplifySession(nextSession.session_name),
                    driver: driverLabel,
                    color: "#FFFFFF"
                });
            }
        }

        // CASO 4: IDLE (Fuera de temporada o entre GPs largos)
        res.json({ 
            mode: "IDLE", 
            gp: "DINTEL", 
            val: "F1", 
            msg: "STUDIO", 
            driver: "DNTL",
            color: "#FFFFFF" 
        });

    } catch (error) {
        console.error("Engine Error:", error.message);
        res.status(500).json({ mode: "ERROR", val: "!!", driver: "ERR", color: "#FF0000" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dintel Studio: Engine Running on port ${PORT}`);
});