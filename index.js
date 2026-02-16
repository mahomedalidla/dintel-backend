const express = require('express');
const axios = require('axios');
const app = express();

// 1. CONFIGURACIÓN ESTRUCTURAL
const PORT = process.env.PORT || 3000;

// 2. BASE DE DATOS DE EDICIONES DE LEYENDA (LEGACY)
// Aquí registramos identidades fijas que no dependen de la telemetría actual
const legacyDrivers = {
    "senna-12": {
        name: "AYRTON SENNA",
        stats: "3 TITLES | 41 WINS",
        years: "1984 - 1994",
        color: "#FCD116"
    },
    "schumacher-5": {
        name: "M. SCHUMACHER",
        stats: "7 TITLES | 91 WINS",
        years: "1991 - 2012",
        color: "#FF0000"
    },
    "lauda-12": {
        name: "NIKI LAUDA",
        stats: "3 TITLES | 25 WINS",
        years: "1971 - 1985",
        color: "#E10600"
    }
};

// 3. ENDPOINT PRINCIPAL
app.get('/f1/dashboard/:id', async (req, res) => {
    const { id } = req.params;
    const now = new Date();

    // --- RUTA A: VALIDACIÓN DE EDICIÓN DE LEYENDA ---
    // Si el ID existe en nuestra base de datos Legacy, devolvemos sus stats de inmediato
    if (legacyDrivers[id]) {
        const legacy = legacyDrivers[id];
        return res.json({
            mode: "LEGACY",
            gp: legacy.name,
            val: legacy.stats,
            msg: legacy.years,
            color: legacy.color
        });
    }

    // --- RUTA B: PILOTOS ACTIVOS (Telemetría en Tiempo Real) ---
    try {
        const response = await axios.get('https://api.openf1.org/v1/sessions');
        const sessions = response.data;

        const lastSession = sessions.filter(s => new Date(s.date_end) < now).pop();
        const nextSession = sessions.find(s => new Date(s.date_start) > now);
        const activeSession = sessions.find(s => now >= new Date(s.date_start) && now <= new Date(s.date_end));

        const daysSinceLast = lastSession ? (now - new Date(lastSession.date_end)) / (1000 * 60 * 60 * 24) : 999;

        // CASO 1: SESIÓN EN VIVO (Uso de driverNum como ID para telemetría)
        if (activeSession) {
            const posRes = await axios.get(`https://api.openf1.org/v1/position?driver_number=${id}&session_key=latest`);
            const pos = posRes.data.slice(-1)[0]?.position || "--";
            
            return res.json({
                mode: "LIVE",
                gp: activeSession.location.toUpperCase(),
                val: `P${pos}`,
                msg: "SESSION ACTIVE"
            });
        }

        // CASO 2: POST-EVENTO (Hasta 3 días después)
        if (daysSinceLast <= 3) {
            const lastPosRes = await axios.get(`https://api.openf1.org/v1/position?driver_number=${id}&session_key=${lastSession.session_key}`);
            const finalPos = lastPosRes.data.slice(-1)[0]?.position || "DNF";

            return res.json({
                mode: "POST",
                gp: lastSession.location.toUpperCase(),
                val: `P${finalPos}`,
                msg: "FINAL STANDING"
            });
        }

        // CASO 3: PRÓXIMA CARRERA (Modo Anticipación)
        if (nextSession) {
            const fecha = new Date(nextSession.date_start).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
            return res.json({
                mode: "NEXT",
                gp: nextSession.location.toUpperCase(),
                val: fecha.toUpperCase(),
                msg: "UPCOMING EVENT"
            });
        }

        // ESTADO POR DEFECTO (SILENCIOSO / IDLE)
        res.json({ 
            mode: "IDLE", 
            gp: "DINTEL STUDIO", 
            val: "", 
            msg: "" 
        });

    } catch (error) {
        console.error("Error en Dintel Engine:", error.message);
        res.status(500).json({ mode: "ERROR", val: "!!" });
    }
});

// 4. ACTIVACIÓN DEL SERVIDOR
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dintel Studio: Engine Running on port ${PORT}`);
});